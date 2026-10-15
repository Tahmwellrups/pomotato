/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The popup's surfaces must draw colour only from semantic tokens so that the
// milestone 4 dark palette can be one `.dark` block. These checks read the
// source files; they guard against a hex literal or raw palette utility being
// added to the new surfaces.
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const NEW_SURFACE_FILES = ["./TaskListDialog.tsx", "./ui/dialog.tsx", "./ui/button.tsx"];
const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/;
const RAW_PALETTE_UTILITY = /\b(?:amber|stone|red|yellow|green|blue|gray|slate|zinc|neutral|orange|rose|sky)-\d{2,3}\b/;

describe("task list dialog colour tokens", () => {
  for (const file of NEW_SURFACE_FILES) {
    it(`${file} contains no hex colour literal`, () => {
      expect(read(file)).not.toMatch(HEX_LITERAL);
    });

    it(`${file} contains no raw palette utility (amber-*, stone-*, red-*, ...)`, () => {
      expect(read(file)).not.toMatch(RAW_PALETTE_UTILITY);
    });
  }

  it("the dialog surface, overlay and border use the semantic tokens", () => {
    const dialog = read("./ui/dialog.tsx");
    expect(dialog).toContain("bg-popover");
    expect(dialog).toContain("bg-scrim");
    expect(dialog).toContain("border-border");
  });
});
