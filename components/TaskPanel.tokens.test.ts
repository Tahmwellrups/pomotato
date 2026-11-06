/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Task 015 criterion 43: re-pointed from TaskListDialog.tokens.test.ts. The dialog is deleted, so its
// colour checks now run on the panel's surfaces (the widget and the components that render its rows,
// the add form and the cluster toggle), and on the shadcn primitives the panel still uses.
// The checks read source text: no hex literal, and the semantic tokens are used where a surface is
// drawn. Raw palette utilities and colour functions are covered by palette.tokens.test.ts.
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const PANEL_SURFACE_FILES = [
  "../widgets/TaskPanel.tsx",
  "./TaskChecklist.tsx",
  "./TaskChecklistRow.tsx",
  "./TaskPanelToggle.tsx",
  "./TaskForm.tsx",
  "./task-row-styles.ts",
  "./ui/dialog.tsx",
  "./ui/button.tsx",
];
const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/;

describe("task panel colour tokens (task 015 criterion 43, re-pointed from the deleted dialog)", () => {
  for (const file of PANEL_SURFACE_FILES) {
    it(`${file} contains no hex colour literal`, () => {
      expect(read(file)).not.toMatch(HEX_LITERAL);
    });
  }

  it("the shadcn dialog primitive keeps its semantic surface, overlay and border tokens", () => {
    const dialog = read("./ui/dialog.tsx");
    expect(dialog).toContain("bg-popover");
    expect(dialog).toContain("bg-scrim");
    // Task 009 criterion 15: the dialog edge is its own token.
    expect(dialog).toContain("border-dialog-edge");
  });

  it("the panel toggle draws its edge from the control-edge class, not a literal colour", () => {
    expect(read("./TaskPanelToggle.tsx")).toContain("control-edge");
  });
});
