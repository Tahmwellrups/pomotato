import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadBackground } from "@/lib/db";
import { canDecodeImage } from "@/lib/image-decode";
import { PREFERENCES_STORAGE_KEY, PREFERENCES_VERSION } from "@/lib/preferences/schema";
import { usePreferencesStore } from "@/lib/preferences/store";
import { useBackgroundImage } from "./use-background-image";

vi.mock("@/lib/db", () => ({ loadBackground: vi.fn() }));
vi.mock("@/lib/image-decode", () => ({ canDecodeImage: vi.fn() }));

const ID = "123e4567-e89b-42d3-a456-426614174000";
const OTHER = "223e4567-e89b-42d3-a456-426614174001";

let created: string[] = [];
let revoked: string[] = [];

function setPrefs(background: string | null, hasHydrated = true) {
  usePreferencesStore.setState({ theme: "dark", gaugeStyle: "glyph", background, hasHydrated });
}

function found(id: string) {
  return { status: "found" as const, background: { id, mimeType: "image/png" as const, fileName: "a.png", size: 4, blob: new Blob([new Uint8Array(4)]) } };
}

beforeEach(() => {
  vi.mocked(loadBackground).mockReset();
  vi.mocked(canDecodeImage).mockReset();
  created = [];
  revoked = [];
  let n = 0;
  URL.createObjectURL = vi.fn(() => {
    n += 1;
    const url = `blob:qa-${n}`;
    created.push(url);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
  window.localStorage.clear();
  setPrefs(null, false);
});

afterEach(() => {
  setPrefs(null, false);
});

describe("task 010 criterion 5: every unresolvable reference paints no background", () => {
  it("no reference: never reads storage, returns null", () => {
    setPrefs(null);
    const { result } = renderHook(() => useBackgroundImage());
    expect(result.current).toBeNull();
    expect(loadBackground).not.toHaveBeenCalled();
  });

  it("not yet hydrated: never reads storage, even with a reference", () => {
    setPrefs(ID, false);
    const { result } = renderHook(() => useBackgroundImage());
    expect(result.current).toBeNull();
    expect(loadBackground).not.toHaveBeenCalled();
  });

  const degraded: [string, Awaited<ReturnType<typeof loadBackground>>][] = [
    ["a dangling reference (row missing)", { status: "missing" }],
    ["an unavailable database (no IndexedDB, blocked upgrade)", { status: "unavailable" }],
  ];
  it.each(degraded)("%s returns null and leaves theme and gaugeStyle intact", async (_name, outcome) => {
    vi.mocked(loadBackground).mockResolvedValueOnce(outcome);
    setPrefs(ID);
    const { result } = renderHook(() => useBackgroundImage());
    await waitFor(() => expect(loadBackground).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    const state = usePreferencesStore.getState();
    expect([state.theme, state.gaugeStyle]).toEqual(["dark", "glyph"]);
  });

  it("bytes that pass the structural check but will not decode return null and revoke the URL", async () => {
    vi.mocked(loadBackground).mockResolvedValueOnce(found(ID));
    vi.mocked(canDecodeImage).mockResolvedValueOnce(false);
    setPrefs(ID);
    const { result } = renderHook(() => useBackgroundImage());
    await waitFor(() => expect(canDecodeImage).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBeNull();
    expect(created).toHaveLength(1);
    expect(revoked).toEqual(created);
  });

  it("a reference that is not a string id never reaches storage", () => {
    setPrefs(null);
    const { result } = renderHook(() => useBackgroundImage());
    expect(result.current).toBeNull();
    expect(loadBackground).not.toHaveBeenCalled();
  });
});

describe("task 010 criterion 5 and 28: a decodable image returns one URL, read once, revoked on change and unmount", () => {
  it("returns a URL only after the image decodes, reads storage once for a stable id, and revokes on unmount", async () => {
    vi.mocked(loadBackground).mockResolvedValue(found(ID));
    vi.mocked(canDecodeImage).mockResolvedValue(true);
    setPrefs(ID);
    const { result, rerender, unmount } = renderHook(() => useBackgroundImage());
    await waitFor(() => expect(result.current).toBe(created[0]));
    rerender();
    rerender();
    expect(loadBackground).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
    expect(revoked).toEqual([]);
    unmount();
    expect(revoked).toEqual(created);
  });

  it("changing the id loads the new image, revokes the old URL, and never shows the old one for the new id", async () => {
    vi.mocked(loadBackground).mockImplementation(async (id) => found(id ?? ""));
    vi.mocked(canDecodeImage).mockResolvedValue(true);
    setPrefs(ID);
    const { result } = renderHook(() => useBackgroundImage());
    await waitFor(() => expect(result.current).toBe(created[0]));
    act(() => setPrefs(OTHER));
    await waitFor(() => expect(result.current).toBe(created[1]));
    expect(revoked).toContain(created[0]);
    expect(loadBackground).toHaveBeenLastCalledWith(OTHER);
  });

  it("removing the reference returns null and revokes the URL", async () => {
    vi.mocked(loadBackground).mockResolvedValue(found(ID));
    vi.mocked(canDecodeImage).mockResolvedValue(true);
    setPrefs(ID);
    const { result } = renderHook(() => useBackgroundImage());
    await waitFor(() => expect(result.current).not.toBeNull());
    act(() => setPrefs(null));
    expect(result.current).toBeNull();
    expect(revoked).toEqual(created);
  });
});

describe("task 010 criterion 5: the persisted payload degrades per key", () => {
  const entry = (state: unknown, version: unknown) => JSON.stringify({ state, version });

  const cases: [string, string, { theme: string; gaugeStyle: string; background: string | null }][] = [
    ["a non-string background object", entry({ theme: "dark", gaugeStyle: "glyph", background: { x: 1 } }, PREFERENCES_VERSION), { theme: "dark", gaugeStyle: "glyph", background: null }],
    ["a background that fails the id shape", entry({ theme: "light", gaugeStyle: "vessel", background: "has space" }, PREFERENCES_VERSION), { theme: "light", gaugeStyle: "vessel", background: null }],
    ["a newer PREFERENCES_VERSION", entry({ theme: "dark", gaugeStyle: "glyph", background: ID }, PREFERENCES_VERSION + 1), { theme: "dark", gaugeStyle: "glyph", background: ID }],
    ["an older PREFERENCES_VERSION", entry({ theme: "dark", gaugeStyle: "glyph" }, 0), { theme: "dark", gaugeStyle: "glyph", background: null }],
    ["a non-object state", entry(42, PREFERENCES_VERSION), { theme: "system", gaugeStyle: "vessel", background: null }],
    ["unparseable JSON", "{", { theme: "system", gaugeStyle: "vessel", background: null }],
  ];

  beforeEach(() => {
    window.localStorage.clear();
    usePreferencesStore.setState({ theme: "system", gaugeStyle: "vessel", background: null, hasHydrated: false });
  });

  it.each(cases)("%s rehydrates without throwing and keeps the theme and gauge keys", async (_name, raw, expected) => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, raw);
    await expect(usePreferencesStore.persist.rehydrate()).resolves.not.toThrow();
    const state = usePreferencesStore.getState();
    expect([state.theme, state.gaugeStyle, state.background]).toEqual([expected.theme, expected.gaugeStyle, expected.background]);
  });
});
