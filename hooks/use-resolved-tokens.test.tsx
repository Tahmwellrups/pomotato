import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { useResolvedTokens } from "./use-resolved-tokens";

// jsdom has no matchMedia; the hook subscribes to prefers-color-scheme through it.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
});

const TOKENS = { liquid: "--gauge-liquid" } as const;

function Probe() {
  const resolved = useResolvedTokens(TOKENS);
  return <p data-testid="probe">{resolved.liquid}</p>;
}

afterEach(() => {
  document.documentElement.removeAttribute("style");
});

describe("useResolvedTokens", () => {
  it("resolves a custom property to its computed value, not the var() reference", () => {
    document.documentElement.style.setProperty("--gauge-liquid", "#111111");
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("#111111");
  });

  it("re-reads the token when its value changes at runtime, without remounting", async () => {
    document.documentElement.style.setProperty("--gauge-liquid", "#111111");
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("#111111");

    act(() => {
      document.documentElement.style.setProperty("--gauge-liquid", "#222222");
    });
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("#222222"));
  });
});
