import type { BackgroundMimeType, BackgroundValidationIssue } from "./types";

/** 5 MiB. Rejected, never downscaled: resizing needs canvas re-encoding, which is its own task. */
export const BACKGROUND_MAX_BYTES = 5 * 1024 * 1024;
export const BACKGROUND_MAX_MEGABYTES_LABEL = "5 MB";
export const BACKGROUND_FILE_NAME_MAX_LENGTH = 120;

/** In the order the picker should list them. SVG and GIF are deliberately absent. */
export const BACKGROUND_ACCEPTED_TYPES: readonly BackgroundMimeType[] = ["image/png", "image/jpeg", "image/webp"];

/** The value for `<input accept>`. A hint only; `validateBackgroundBytes` is the check. */
export const BACKGROUND_ACCEPT_ATTRIBUTE = BACKGROUND_ACCEPTED_TYPES.join(",");

export const BACKGROUND_TYPES_LABEL = "PNG, JPEG or WebP";

const TYPE_MESSAGE = `Use a still ${BACKGROUND_TYPES_LABEL} image.`;

function issue(code: BackgroundValidationIssue["code"], message: string): { value: null; issue: BackgroundValidationIssue } {
  return { value: null, issue: { code, message } };
}

/** Size check that needs no bytes, so an oversize file is refused before it is read into memory. */
export function validateBackgroundSize(size: number): { value: number; issue: null } | { value: null; issue: BackgroundValidationIssue } {
  if (!Number.isFinite(size) || size <= 0) {
    return issue("empty", "That file is empty.");
  }
  if (size > BACKGROUND_MAX_BYTES) {
    return issue("too-large", `That image is too large. The limit is ${BACKGROUND_MAX_MEGABYTES_LABEL}.`);
  }
  return { value: size, issue: null };
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = offset; i < offset + length && i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

function readUint32(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, littleEndian);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;

type Checked = { value: BackgroundMimeType; issue: null } | { value: null; issue: BackgroundValidationIssue };

/** Walks PNG chunks: an `acTL` before the image data is APNG (animated); a missing `IEND` is truncation. */
function checkPng(bytes: Uint8Array): Checked {
  let offset: number = PNG_SIGNATURE.length;
  let sawIend = false;
  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset, false);
    const type = ascii(bytes, offset + 4, 4);
    if (type === "acTL") {
      return issue("animated", `Animated images are not supported. ${TYPE_MESSAGE}`);
    }
    const next = offset + 12 + length;
    if (next > bytes.length) break;
    if (type === "IEND") {
      sawIend = true;
      break;
    }
    offset = next;
  }
  if (!sawIend) return issue("corrupt", "That file looks damaged or cut short, so it cannot be used.");
  return { value: "image/png", issue: null };
}

function checkJpeg(bytes: Uint8Array): Checked {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end -= 1;
  if (end < 4 || bytes[end - 2] !== 0xff || bytes[end - 1] !== 0xd9) {
    return issue("corrupt", "That file looks damaged or cut short, so it cannot be used.");
  }
  return { value: "image/jpeg", issue: null };
}

function checkWebp(bytes: Uint8Array): Checked {
  const corrupt = () => issue("corrupt", "That file looks damaged or cut short, so it cannot be used.");
  if (bytes.length < 20) return corrupt();
  const riffSize = readUint32(bytes, 4, true);
  if (riffSize + 8 > bytes.length) return corrupt();
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X") {
    if (bytes.length < 21) return corrupt();
    // Feature flags byte: bit 1 (0x02) is the animation flag.
    if ((bytes[20] & 0x02) !== 0) {
      return issue("animated", `Animated images are not supported. ${TYPE_MESSAGE}`);
    }
  } else if (chunk !== "VP8 " && chunk !== "VP8L") {
    return corrupt();
  }
  return { value: "image/webp", issue: null };
}

/**
 * Decides the type from the file's own bytes, never its name or declared MIME,
 * and rejects files that are not whole, still images. A renamed `.exe`, an SVG,
 * a GIF, an animated PNG or WebP, a truncated file and an empty one each return
 * a typed issue; nothing here throws. This is a structural check, not a decode:
 * the caller still has to treat a failed decode on load as "no background".
 */
export function validateBackgroundBytes(bytes: Uint8Array): Checked {
  const sized = validateBackgroundSize(bytes.length);
  if (sized.issue) return sized;
  if (startsWith(bytes, PNG_SIGNATURE)) return checkPng(bytes);
  if (startsWith(bytes, JPEG_SIGNATURE)) return checkJpeg(bytes);
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return checkWebp(bytes);
  return issue("unsupported-type", `That file type is not supported. ${TYPE_MESSAGE}`);
}

/** Display-only name: control characters dropped, trimmed, cut to a safe length. */
export function sanitizeBackgroundFileName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return Array.from(cleaned).slice(0, BACKGROUND_FILE_NAME_MAX_LENGTH).join("");
}
