import { beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "./database";
import { BACKGROUND_MAX_BYTES, validateBackgroundBytes } from "./background-validation";
import { loadBackground, removeBackground, storeBackground } from "./background-repository";
import { resetDatabaseForTests, seedVersion1DatabaseForTests } from "./test-utils";
import { createTask, getCurrentTask, listTasks, pinTask } from "./task-repository";

function bytesOf(...parts: (number[] | string)[]): Uint8Array {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === "string") for (const ch of part) out.push(ch.charCodeAt(0));
    else out.push(...part);
  }
  return Uint8Array.from(out);
}

const u32be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u32le = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const png = () => bytesOf(PNG_SIG, u32be(0), "IHDR", [0, 0, 0, 0], u32be(0), "IDAT", [0, 0, 0, 0], u32be(0), "IEND", [0, 0, 0, 0]);
const apng = () => bytesOf(PNG_SIG, u32be(0), "IHDR", [0, 0, 0, 0], u32be(0), "acTL", [0, 0, 0, 0], u32be(0), "IEND", [0, 0, 0, 0]);
const truncatedPng = () => bytesOf(PNG_SIG, u32be(0), "IHDR", [0, 0, 0, 0]);
const jpeg = () => bytesOf([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
const truncatedJpeg = () => bytesOf([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const webp = (flags?: number) =>
  flags === undefined
    ? bytesOf("RIFF", u32le(16), "WEBP", "VP8L", u32le(4), [0, 0, 0, 0])
    : bytesOf("RIFF", u32le(22), "WEBP", "VP8X", u32le(10), [flags, 0, 0, 0], [0, 0, 0, 0, 0, 0]);
const svg = () => bytesOf('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const gif = () => bytesOf("GIF89a", [1, 0, 1, 0, 0, 0, 0, 0x3b]);

function fileOf(data: Uint8Array, name = "pic.png"): File {
  return new File([data as BlobPart], name, { type: "image/png" });
}

async function rowCount(): Promise<number> {
  const db = await openDatabase();
  return db.backgrounds.count();
}

describe("validateBackgroundBytes: type decided from the bytes", () => {
  const accepted: [string, Uint8Array, string][] = [
    ["png", png(), "image/png"],
    ["jpeg", jpeg(), "image/jpeg"],
    ["jpeg with trailing padding", bytesOf([0xff, 0xd8, 0xff, 0xe0, 1, 0xff, 0xd9, 0, 0]), "image/jpeg"],
    ["still webp (lossless)", webp(), "image/webp"],
    ["still webp (extended)", webp(0), "image/webp"],
  ];
  it.each(accepted)("accepts %s", (_name, data, mime) => {
    const result = validateBackgroundBytes(data);
    expect(result.issue).toBeNull();
    expect(result.value).toBe(mime);
  });

  const rejected: [string, Uint8Array, string][] = [
    ["svg", svg(), "unsupported-type"],
    ["gif", gif(), "unsupported-type"],
    ["text renamed to .png", bytesOf("not an image at all"), "unsupported-type"],
    ["empty", new Uint8Array(0), "empty"],
    ["animated png", apng(), "animated"],
    ["animated webp", webp(0x02), "animated"],
    ["truncated png", truncatedPng(), "corrupt"],
    ["truncated jpeg", truncatedJpeg(), "corrupt"],
    ["webp cut short", bytesOf("RIFF", u32le(500), "WEBP", "VP8L", u32le(4), [0, 0, 0, 0]), "corrupt"],
  ];
  it.each(rejected)("rejects %s with a typed issue", (_name, data, code) => {
    const result = validateBackgroundBytes(data);
    expect(result.value).toBeNull();
    expect(result.issue?.code).toBe(code);
    expect(result.issue?.message.length).toBeGreaterThan(0);
  });

  it("names the limit in the oversize message", () => {
    const result = validateBackgroundBytes(new Uint8Array(BACKGROUND_MAX_BYTES + 1));
    expect(result.issue?.code).toBe("too-large");
    expect(result.issue?.message).toContain("5 MB");
  });
});

describe("background-repository", () => {
  beforeEach(async () => {
    await resetDatabaseForTests();
  });

  it("stores one image and loads it back by id", async () => {
    const stored = await storeBackground(fileOf(png(), "kitchen.png"));
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    expect(stored.background.fileName).toBe("kitchen.png");
    expect(stored.background.mimeType).toBe("image/png");
    const loaded = await loadBackground(stored.background.id);
    expect(loaded.status).toBe("found");
    if (loaded.status !== "found") return;
    expect(loaded.background.blob.type).toBe("image/png");
    expect(loaded.background.blob.size).toBe(png().length);
  });

  it("replacing leaves exactly one row, and the old id stops resolving", async () => {
    const first = await storeBackground(fileOf(png()));
    const second = await storeBackground(fileOf(jpeg(), "b.jpg"));
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(await rowCount()).toBe(1);
    expect((await loadBackground(first.background.id)).status).toBe("missing");
    expect((await loadBackground(second.background.id)).status).toBe("found");
  });

  it("removing leaves zero rows, and is idempotent", async () => {
    const stored = await storeBackground(fileOf(png()));
    if (!stored.ok) throw new Error("expected stored");
    await removeBackground();
    await removeBackground();
    expect(await rowCount()).toBe(0);
    expect((await loadBackground(stored.background.id)).status).toBe("missing");
  });

  const rejections: [string, () => File][] = [
    ["oversize", () => fileOf(new Uint8Array(BACKGROUND_MAX_BYTES + 1))],
    ["svg", () => fileOf(svg(), "x.png")],
    ["gif", () => fileOf(gif(), "x.png")],
    ["truncated", () => fileOf(truncatedPng())],
    ["empty", () => fileOf(new Uint8Array(0))],
    ["animated", () => fileOf(apng())],
  ];
  it.each(rejections)("a rejected %s file leaves the previous background exactly as it was", async (_name, make) => {
    const before = await storeBackground(fileOf(png(), "keep.png"));
    if (!before.ok) throw new Error("expected stored");
    const result = await storeBackground(make());
    expect(result.ok).toBe(false);
    expect(await rowCount()).toBe(1);
    const still = await loadBackground(before.background.id);
    expect(still.status).toBe("found");
  });

  it("a rejection with nothing stored leaves zero rows", async () => {
    await storeBackground(fileOf(svg()));
    expect(await rowCount()).toBe(0);
  });

  describe("a reference that cannot resolve degrades to missing, never throws", () => {
    const refs: [string, string | null][] = [
      ["null", null],
      ["unknown id", "00000000-0000-4000-8000-000000000000"],
      ["malformed id", "../../etc/passwd"],
      ["empty string", ""],
    ];
    it.each(refs)("%s", async (_name, ref) => {
      await storeBackground(fileOf(png()));
      expect((await loadBackground(ref)).status).toBe("missing");
    });

    it("a row whose bytes are not an image", async () => {
      const db = await openDatabase();
      await db.backgrounds.add({
        id: "bad-row",
        mimeType: "image/png",
        bytes: bytesOf("garbage garbage").buffer as ArrayBuffer,
        fileName: "",
        size: 15,
        storedAt: 0,
      });
      expect((await loadBackground("bad-row")).status).toBe("missing");
    });

    it("no IndexedDB at all is unavailable", async () => {
      const saved = globalThis.indexedDB;
      // @ts-expect-error simulating a browser with IndexedDB disabled
      delete globalThis.indexedDB;
      try {
        expect((await loadBackground("some-id")).status).toBe("unavailable");
      } finally {
        globalThis.indexedDB = saved;
      }
    });
  });
});

describe("schema version 3 is additive", () => {
  it("upgrading a version-1 database keeps tasks and the pin and adds an empty backgrounds table", async () => {
    await resetDatabaseForTests();
    const task = await createTask({ title: "keep me" });
    await pinTask(task.id);
    await seedVersion1DatabaseForTests({ tasks: await listTasks(), pinnedTaskId: task.id });
    expect((await listTasks()).map((t) => t.title)).toEqual(["keep me"]);
    expect((await getCurrentTask())?.id).toBe(task.id);
    expect(await rowCount()).toBe(0);
    const db = await openDatabase();
    expect(db.verno).toBe(3);
  });
});
