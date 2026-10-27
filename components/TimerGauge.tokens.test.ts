/// <reference types="node" />
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Static guards for the surfaces added by task 005. They read source text, so
// they catch a hex literal, a raw palette utility or a new timer source being
// added to these files, whatever the runtime behaviour.
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const HEX_LITERAL = /#[0-9a-fA-F]{3,8}\b/;
const RGB_LITERAL = /\b(?:rgba?|hsla?)\(/;
const TIMER_SOURCE = /\b(?:setInterval|setTimeout|requestAnimationFrame|performance\.now)\b/;

// Files this task adds or fully owns. None may carry a colour literal.
const NEW_SURFACE_FILES = [
  "./TimerGauge.tsx",
  "./HoldButton.tsx",
  "./SloshGauge.tsx",
  "../hooks/use-resolved-tokens.ts",
  // Task 008: the settings surface and its entry point.
  "./SettingsPanel.tsx",
  "./SettingsButton.tsx",
  "../app/settings/page.tsx",
];

// Files whose lines this task edits. Raw palette utilities in them are guarded by
// components/palette.tokens.test.ts (task 009 R-9 moved that check there).
const EDITED_FILES = ["./TimerControls.tsx", "./TimerDisplay.tsx"];

describe("task 005 colour tokens", () => {
  // Task 009 R-9: the blind raw-palette check is gone. Raw palette utilities are
  // guarded for these files by components/palette.tokens.test.ts (its FILES walk).
  for (const file of [...NEW_SURFACE_FILES, ...EDITED_FILES]) {
    it(`${file} contains no hex or rgb() literal`, () => {
      const source = read(file);
      expect(source).not.toMatch(HEX_LITERAL);
      expect(source).not.toMatch(RGB_LITERAL);
    });
  }
});

describe("task 005 introduces no new time source", () => {
  // Task 008 (criterion 41): every component file the task adds is guarded too.
  // SloshGauge.tsx is deliberately not listed: it holds the single rAF spring,
  // and the spring stays in that one file (criterion 36).
  for (const file of [
    "./TimerGauge.tsx",
    "./TimerDisplay.tsx",
    "./TimerControls.tsx",
    "../hooks/use-resolved-tokens.ts",
    "./SettingsPanel.tsx",
    "./SettingsButton.tsx",
    // Task 010: the background control, its layer, the hook and the decode helper.
    "./BackgroundControl.tsx",
    "./BackgroundLayer.tsx",
    "../hooks/use-background-image.ts",
    "../lib/image-decode.ts",
    "../lib/db/background-repository.ts",
    "../lib/db/background-validation.ts",
  ]) {
    it(`${file} has no setInterval, setTimeout, requestAnimationFrame or performance.now`, () => {
      expect(read(file)).not.toMatch(TIMER_SOURCE);
    });
  }
});
