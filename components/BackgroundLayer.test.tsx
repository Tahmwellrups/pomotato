import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useBackgroundImage } from "@/hooks/use-background-image";
import { BackgroundLayer } from "./BackgroundLayer";

vi.mock("@/hooks/use-background-image", () => ({ useBackgroundImage: vi.fn() }));

beforeEach(() => {
  vi.mocked(useBackgroundImage).mockReset();
});

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
    expect(layer.className).not.toContain("opacity-100");
  });

  it("becomes active (opacity 100) only once the <img> fires load", () => {
    vi.mocked(useBackgroundImage).mockReturnValue("blob:qa-1");
    const { container } = render(<BackgroundLayer />);
    const layer = container.firstElementChild as HTMLElement;
    const img = layer.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("blob:qa-1");
    fireEvent.load(img);
    expect(layer).toHaveAttribute("data-background", "active");
    expect(layer.className).toContain("opacity-100");
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

  it("the scrim is the page's own --background at 97 percent, not a new colour", () => {
    vi.mocked(useBackgroundImage).mockReturnValue("blob:qa-1");
    const { container } = render(<BackgroundLayer />);
    const scrim = (container.firstElementChild as HTMLElement).children[1] as HTMLElement;
    expect(scrim.className).toContain("bg-background/97");
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|oklch\(/);
  });
});
