/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Task 008 criteria 36, 42 and 50, as static guards over source text.
const ROOT = `${resolve(dirname(fileURLToPath(import.meta.url)), "..")}/`;

function read(relativePath: string): string {
  return readFileSync(`${ROOT}${relativePath}`, "utf8");
}

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) found.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) found.push(full.slice(ROOT.length));
  }
  return found.sort();
}

// Source files only: test files name the tokens on purpose, so they are not counted.
function walkSource(dir: string): string[] {
  return walk(dir).filter((file) => !/\.test\.tsx?$/.test(file));
}

const NEW_FILES = ["app/settings/page.tsx", "components/SettingsPanel.tsx", "components/SettingsButton.tsx"];

describe("criterion 42: every new file is discovered by the palette guard's directory walk", () => {
  const discovered = ["app", "components", "hooks", "widgets"].flatMap((dir) => walk(`${ROOT}${dir}`));
  for (const file of NEW_FILES) {
    it(`${file} is in the walked set`, () => {
      expect(discovered).toContain(file);
    });
  }
});

describe("criterion 36: the spring constants appear in exactly one file", () => {
  const tokens = ["TILT_GAIN", "REST_POS", "REST_VEL", "1224", "1044"];
  const sources = ["components", "hooks", "lib", "widgets", "app"].flatMap((dir) => walkSource(`${ROOT}${dir}`));
  for (const token of tokens) {
    it(`${token} occurs in exactly one source file, SloshGauge.tsx`, () => {
      const hits = sources.filter((file) => new RegExp(`\\b${token}\\b`).test(read(file)));
      expect(hits).toEqual(["components/SloshGauge.tsx"]);
    });
  }
});

describe("criterion 50: no any in the files this task adds or changes", () => {
  const files = [...NEW_FILES, "components/TimerDisplay.tsx", "components/TimerGauge.tsx", "components/SloshGauge.tsx", "lib/preferences/schema.ts", "lib/preferences/store.ts"];
  for (const file of files) {
    it(`${file} has no explicit any`, () => {
      expect(read(file)).not.toMatch(/:\s*any\b|\bas any\b|<any>/);
    });
  }
});

describe("criterion 37: SloshGauge's header lists the local edits and still names the shadcn conflict", () => {
  it("states the shadcn add conflict and lists the onPaint edit", () => {
    // Join the comment lines so a sentence broken across them still matches.
    const header = read("components/SloshGauge.tsx").split("'use client';")[0].replace(/\n \* ?/g, " ");
    // The header names the add command and says a future `shadcn add` is a conflict.
    expect(header).toMatch(/shadcn@latest add @react-bits\/SloshGauge-TS-TW/);
    expect(header).toMatch(/future\s+`shadcn add`[^.]*is a conflict/);
    expect(header).toMatch(/onPaint/);
    expect(header.match(/ {2}- /g)?.length ?? 0).toBe(7);
  });
});
