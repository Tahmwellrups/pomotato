import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKGROUND_MAX_BYTES, removeBackground, storeBackground } from "@/lib/db";
import { canDecodeFile } from "@/lib/image-decode";
import { usePreferencesStore } from "@/lib/preferences/store";
import { BackgroundControl } from "./BackgroundControl";

vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db")>()),
  storeBackground: vi.fn(),
  removeBackground: vi.fn(),
}));
vi.mock("@/lib/image-decode", () => ({ canDecodeFile: vi.fn() }));

const ID = "123e4567-e89b-42d3-a456-426614174000";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);

function pick(input: HTMLElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

function statusText(): string {
  return screen.getByRole("status").textContent ?? "";
}

beforeEach(() => {
  vi.mocked(storeBackground).mockReset();
  vi.mocked(removeBackground).mockReset();
  vi.mocked(canDecodeFile).mockReset();
  vi.mocked(canDecodeFile).mockResolvedValue(true);
  usePreferencesStore.setState({ theme: "system", gaugeStyle: "vessel", background: null, hasHydrated: true });
});

afterEach(() => {
  usePreferencesStore.setState({ background: null });
});

describe("task 010 criterion 9: one native file input, named by value, in a fieldset", () => {
  it("is a fieldset with a legend, and the picker is a real input[type=file] named by its label", () => {
    render(<BackgroundControl />);
    expect(screen.getByRole("group", { name: "Background image" }).tagName).toBe("FIELDSET");
    const input = screen.getByLabelText("Choose an image");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
  });

  it("the input is described by the copy, which names the types, the limit, the device-only promise and the dim", () => {
    render(<BackgroundControl />);
    const help = document.getElementById("background-help")?.textContent ?? "";
    expect(help).toContain("PNG, JPEG or WebP");
    expect(help).toContain("5 MB");
    expect(help).toContain("stays on this device and is never uploaded anywhere");
    expect(help).toMatch(/dimmed/);
    expect(screen.getByLabelText("Choose an image")).toHaveAccessibleDescription(help);
  });
});

describe("task 010 criterion 11: rejections are announced with the reason and the limit, and nothing is written", () => {
  it("an oversize file names the limit and writes nothing", async () => {
    render(<BackgroundControl />);
    pick(screen.getByLabelText("Choose an image"), new File([new Uint8Array(BACKGROUND_MAX_BYTES + 1) as BlobPart], "huge.png", { type: "image/png" }));
    await waitFor(() => expect(statusText()).toContain("5 MB"));
    expect(storeBackground).not.toHaveBeenCalled();
    expect(usePreferencesStore.getState().background).toBeNull();
  });

  it("a text file renamed .png names the type rule and writes nothing", async () => {
    render(<BackgroundControl />);
    pick(screen.getByLabelText("Choose an image"), new File(["not an image at all"], "notes.png", { type: "image/png" }));
    await waitFor(() => expect(statusText()).toContain("not supported"));
    expect(statusText()).toContain("PNG, JPEG or WebP");
    expect(storeBackground).not.toHaveBeenCalled();
  });

  it("an SVG renamed .png is refused from its bytes", async () => {
    render(<BackgroundControl />);
    pick(screen.getByLabelText("Choose an image"), new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], "vector.png", { type: "image/png" }));
    await waitFor(() => expect(statusText()).toContain("not supported"));
    expect(storeBackground).not.toHaveBeenCalled();
  });

  it("a junk JPEG that passes the structural check but fails to decode is refused before anything is stored", async () => {
    vi.mocked(canDecodeFile).mockResolvedValueOnce(false);
    render(<BackgroundControl />);
    pick(screen.getByLabelText("Choose an image"), new File([JPEG as BlobPart], "junk.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(statusText()).toContain("could not be read as an image"));
    expect(canDecodeFile).toHaveBeenCalledTimes(1);
    expect(storeBackground).not.toHaveBeenCalled();
    expect(usePreferencesStore.getState().background).toBeNull();
  });

  it("a store-level rejection (for example an animated file) shows its message and leaves the reference alone", async () => {
    usePreferencesStore.setState({ background: ID });
    vi.mocked(storeBackground).mockResolvedValueOnce({ ok: false, issue: { code: "animated", message: "Animated images are not supported. Use a still PNG, JPEG or WebP image." } });
    render(<BackgroundControl />);
    pick(screen.getByLabelText("Choose a different image"), new File([PNG as BlobPart], "anim.png", { type: "image/png" }));
    await waitFor(() => expect(statusText()).toContain("Animated images are not supported"));
    expect(usePreferencesStore.getState().background).toBe(ID);
  });

  it("a storage failure is announced as a message, not an unhandled rejection", async () => {
    vi.mocked(storeBackground).mockRejectedValueOnce(new Error("QuotaExceededError"));
    render(<BackgroundControl />);
    pick(screen.getByLabelText("Choose an image"), new File([PNG as BlobPart], "ok.png", { type: "image/png" }));
    await waitFor(() => expect(statusText()).toContain("Could not save the image"));
    expect(usePreferencesStore.getState().background).toBeNull();
  });

  it("a valid pick stores, sets the reference, and names the file in the live region", async () => {
    vi.mocked(storeBackground).mockResolvedValueOnce({ ok: true, background: { id: ID, mimeType: "image/png", fileName: "kitchen.png", size: PNG.length } });
    render(<BackgroundControl />);
    pick(screen.getByLabelText("Choose an image"), new File([PNG as BlobPart], "kitchen.png", { type: "image/png" }));
    await waitFor(() => expect(usePreferencesStore.getState().background).toBe(ID));
    expect(statusText()).toContain("kitchen.png");
    expect(statusText()).toContain("is now your background");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("task 010 criterion 11: remove appears only when a background is set, returns to the plain ground, and keeps focus", () => {
  it("no Remove control while no background is set", () => {
    render(<BackgroundControl />);
    expect(screen.queryByRole("button", { name: "Remove background" })).toBeNull();
    expect(statusText()).toBe("No background image.");
  });

  it("Remove appears when a background is set, and clicking it clears the reference and moves focus to the picker", async () => {
    usePreferencesStore.setState({ background: ID });
    vi.mocked(removeBackground).mockResolvedValueOnce(undefined);
    render(<BackgroundControl />);
    const remove = screen.getByRole("button", { name: "Remove background" });
    await act(async () => {
      fireEvent.click(remove);
    });
    await waitFor(() => expect(usePreferencesStore.getState().background).toBeNull());
    expect(removeBackground).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Choose an image")).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Remove background" })).toBeNull();
    expect(statusText()).toContain("plain ground");
  });

  it("the picker's label changes to 'a different image' once one is set", () => {
    usePreferencesStore.setState({ background: ID });
    render(<BackgroundControl />);
    expect(screen.getByLabelText("Choose a different image")).toBeInTheDocument();
    expect(screen.getByText("A background image is set.")).toBeInTheDocument();
  });
});
