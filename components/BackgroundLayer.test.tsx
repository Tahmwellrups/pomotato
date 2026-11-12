import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useBackgroundImage } from "@/hooks/use-background-image";
import { BackgroundLayer } from "./BackgroundLayer";

vi.mock("@/hooks/use-background-image", () => ({ useBackgroundImage: vi.fn() }));

beforeEach(() => {
  vi.mocked(useBackgroundImage).mockReset();
});

// 010 criteria 22 and 26 said the loaded layer paints at opacity 100. Owner re-pointed
// the active opacity to 50 on 2026-11-12 (commit 06404a4); the state machine the criteria
// describe is unchanged, only the value it lands on. See DECISIONS.md 2026-11-12.
describe("task 010 criteria 22 and 26: the layer's markup maps the image state onto data-background", () => {
  it("renders nothing with no background, so there is no dim without an image", () => {
    vi.mocked(useBackgroundImage).mockReturnValue(null);
    const { container } = render(<BackgroundLayer />);
    expect(container.innerHTML).toBe("");
  });

  it("is pending (opacity 0) from mount until the image has loaded", () => {
    vi.mocked(useBackgroundImage).mockReturnValue("blob:qa-1");
    const { container } = render(<BackgroundLayer />);
    const layer = container.firstElementChild as HTMLElement;
    expect(layer).toHaveAttribute("data-background", "pending");
    expect(layer.className).toContain("opacity-0");
    expect(layer.className).not.toContain("opacity-50");
  });

  it("becomes active (opacity 50) only once the <img> fires load", () => {
    vi.mocked(useBackgroundImage).mockReturnValue("blob:qa-1");
    const { container } = render(<BackgroundLayer />);
    const layer = container.firstElementChild as HTMLElement;
    const img = layer.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("blob:qa-1");
    fireEvent.load(img);
    expect(layer).toHaveAttribute("data-background", "active");
    expect(layer.className).toContain("opacity-50");
  });

  it("is inert and hidden from assistive tech, with no alt text to read", () => {
    vi.mocked(useBackgroundImage).mockReturnValue("blob:qa-1");
    const { container } = render(<BackgroundLayer />);
    const layer = container.firstElementChild as HTMLElement;
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer.className).toContain("pointer-events-none");
    expect(layer.className).toContain("-z-20");
    expect(layer.className).toContain("fixed");
    expect(layer.className).toContain("inset-0");
    expect(layer.className).toContain("forced-colors:hidden");
    expect(layer.className).toContain("motion-reduce:transition-none");
    expect(layer.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(layer.querySelector("img")?.className).toContain("object-cover");
  });

  // Task 012 criterion 26: the 97% scrim assertion is replaced, not deleted. The
  // element it pinned is gone; the new truth is that the image layer has exactly
  // one child, the <img>, with no overlay painted over it.
  it("the image paints with no overlay: the only child is the img, and no bg-background or opacity tint sits over it (criterion 3)", () => {
    vi.mocked(useBackgroundImage).mockReturnValue("blob:qa-1");
    const { container } = render(<BackgroundLayer />);
    const layer = container.firstElementChild as HTMLElement;
    expect(layer.children).toHaveLength(1);
    expect(layer.children[0].tagName).toBe("IMG");
    expect(layer.className).not.toMatch(/bg-background/);
    expect(layer.innerHTML).not.toMatch(/bg-background|\/97|bg-black|bg-white/);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|oklch\(/);
  });
});
