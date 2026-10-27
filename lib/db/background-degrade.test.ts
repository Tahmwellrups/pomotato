import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "./database";
import { DatabaseBlockedError, DatabaseUnavailableError } from "./errors";
import { loadBackground, removeBackground, storeBackground } from "./background-repository";
import { BACKGROUND_MAX_BYTES } from "./background-validation";

// Task 010 criterion 5: storage failures degrade to "no background" and never throw
// out of the read path. The database module is replaced so each failure is exact.
vi.mock("./database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./database")>();
  return { ...actual, openDatabase: vi.fn(actual.openDatabase) };
});

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

describe("task 010 criterion 5: the read path never throws on storage failure", () => {
  beforeEach(() => {
    vi.mocked(openDatabase).mockReset();
  });

  const failures: [string, () => Error][] = [
    ["DatabaseUnavailableError (no IndexedDB)", () => new DatabaseUnavailableError()],
    ["DatabaseBlockedError (another tab on the old schema)", () => new DatabaseBlockedError()],
    ["a bare Dexie-style failure", () => new Error("UpgradeError: boom")],
  ];

  it.each(failures)("loadBackground resolves to unavailable on %s", async (_name, make) => {
    vi.mocked(openDatabase).mockRejectedValueOnce(make());
    await expect(loadBackground("123e4567-e89b-42d3-a456-426614174000")).resolves.toEqual({ status: "unavailable" });
  });

  it("loadBackground with no reference never opens the database", async () => {
    await expect(loadBackground(null)).resolves.toEqual({ status: "missing" });
    expect(openDatabase).not.toHaveBeenCalled();
  });

  it("storeBackground rejects with the storage error, so the caller leaves the preference alone", async () => {
    vi.mocked(openDatabase).mockRejectedValueOnce(new DatabaseBlockedError());
    const file = new File([PNG_BYTES as BlobPart], "a.png", { type: "image/png" });
    await expect(storeBackground(file)).rejects.toBeInstanceOf(DatabaseBlockedError);
  });

  it("removeBackground rejects with the storage error rather than swallowing it", async () => {
    vi.mocked(openDatabase).mockRejectedValueOnce(new DatabaseUnavailableError());
    await expect(removeBackground()).rejects.toBeInstanceOf(DatabaseUnavailableError);
  });

  it("an oversize file is refused before any database call", async () => {
    const file = new File([new Uint8Array(BACKGROUND_MAX_BYTES + 1) as BlobPart], "big.png", { type: "image/png" });
    const result = await storeBackground(file);
    expect(result).toMatchObject({ ok: false, issue: { code: "too-large" } });
    expect(openDatabase).not.toHaveBeenCalled();
  });
});
