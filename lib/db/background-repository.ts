import { openDatabase } from "./database";
import {
  sanitizeBackgroundFileName,
  validateBackgroundBytes,
  validateBackgroundSize,
} from "./background-validation";
import type {
  BackgroundInfo,
  BackgroundRecord,
  LoadBackgroundResult,
  StoreBackgroundResult,
} from "./types";
import { isBackgroundId } from "../preferences/schema";

function toInfo(record: BackgroundRecord): BackgroundInfo {
  return { id: record.id, mimeType: record.mimeType, fileName: record.fileName, size: record.size };
}

async function readBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("Could not read the file."));
    };
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Validates `file` (size first, without reading it, then type and shape from
 * its bytes) and, only if it passes, replaces the stored background with it in
 * one transaction. Exactly one row exists afterwards. A rejection returns the
 * typed issue and writes nothing, so the previous background (or none) is
 * exactly as it was. The caller then sets the `background` preference to
 * `result.background.id`. Rejects only on a storage failure
 * (`DatabaseUnavailableError`, `DatabaseBlockedError`, or Dexie's own).
 */
export async function storeBackground(file: Blob & { name?: string }): Promise<StoreBackgroundResult> {
  const sized = validateBackgroundSize(file.size);
  if (sized.issue) return { ok: false, issue: sized.issue };

  const bytes = await readBytes(file);
  const checked = validateBackgroundBytes(new Uint8Array(bytes));
  if (checked.issue) return { ok: false, issue: checked.issue };

  const record: BackgroundRecord = {
    id: crypto.randomUUID(),
    mimeType: checked.value,
    bytes,
    fileName: sanitizeBackgroundFileName(file.name),
    size: bytes.byteLength,
    storedAt: Date.now(),
  };
  const db = await openDatabase();
  await db.transaction("rw", db.backgrounds, async () => {
    await db.backgrounds.clear();
    await db.backgrounds.add(record);
  });
  return { ok: true, background: toInfo(record) };
}

/** Deletes the stored background. Idempotent. The caller then sets the `background` preference to `null`. */
export async function removeBackground(): Promise<void> {
  const db = await openDatabase();
  await db.backgrounds.clear();
}

/**
 * Resolves the preference's reference to something paintable. Never rejects:
 * every way the reference can fail to resolve (null or malformed id, no row, a
 * different row, bytes that no longer validate) is `missing`, and an absent or
 * blocked IndexedDB is `unavailable`. Both mean "paint no background". Reads
 * the bytes once per call; the caller owns the object URL it makes from `blob`.
 */
export async function loadBackground(id: string | null): Promise<LoadBackgroundResult> {
  if (!isBackgroundId(id)) return { status: "missing" };
  try {
    const db = await openDatabase();
    const record = await db.backgrounds.get(id);
    if (!record || record.id !== id || typeof record.bytes?.byteLength !== "number") return { status: "missing" };
    const checked = validateBackgroundBytes(new Uint8Array(record.bytes));
    if (checked.issue || checked.value !== record.mimeType) return { status: "missing" };
    return {
      status: "found",
      background: { ...toInfo(record), blob: new Blob([record.bytes], { type: record.mimeType }) },
    };
  } catch {
    // DatabaseUnavailableError, DatabaseBlockedError or any Dexie failure: no background.
    return { status: "unavailable" };
  }
}
