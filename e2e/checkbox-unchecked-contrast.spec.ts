import { expect, test } from "@playwright/test";
import { DESKTOP, openThemed, pixelsAt, ratio, record, settle } from "./helpers/dark";

// Task 014 criterion 50, unchecked checkbox edge, DARK theme only. Measurement spec (cost rule 4).
// Ground: the painted pixel 6 CSS px left of the checkbox's own 24 px box, inside its 44 px label
// cell, i.e. the panel's solid surface. Edge: the painted pixels across the box's left and top
// borders, all read from the SAME single screenshot (cost rule 2). Viewport 1280 x 800, DPR 1.
const TITLE = "Measure unchecked edge";

test("dark theme: unchecked checkbox edge is >= 3:1 against the panel surface", async ({ page }, testInfo) => {
  await openThemed(page, { stored: "dark", osDark: true, viewport: DESKTOP });
  await page.evaluate(async (title) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("pomotato");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("tasks", "readwrite");
      tx.objectStore("tasks").put({ id: "qa-014-50", title, emoji: "\u{1F954}", colorId: "terracotta", eta: 1, completed: 0, done: false, position: 0 });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, TITLE);
  await page.reload();
  await settle(page);

  const checkbox = page.getByRole("checkbox", { name: TITLE });
  await expect(checkbox).toBeVisible();
  await expect(checkbox).not.toBeChecked();
  const box = await checkbox.boundingBox();
  if (!box) throw new Error("checkbox has no box");

  const cx = Math.round(box.x + box.width / 2);
  const cy = Math.round(box.y + box.height / 2);
  const left = Math.round(box.x);
  const top = Math.round(box.y);
  const ground: [number, number] = [left - 6, cy];
  const rowPts: [number, number][] = [];
  for (let x = left - 2; x <= left + 4; x += 1) rowPts.push([x, cy]);
  const colPts: [number, number][] = [];
  for (let y = top - 2; y <= top + 4; y += 1) colPts.push([cx, y]);

  const points = [ground, ...rowPts, ...colPts];
  const [g, ...rest] = await pixelsAt(page, points);
  const row = rest.slice(0, rowPts.length);
  const col = rest.slice(rowPts.length);
  const fmt = (p: [number, number], rgb: number[]) => `(${p[0]},${p[1]})=${rgb.join(",")}`;
  testInfo.annotations.push({
    type: "measure",
    description: `box x=${box.x} y=${box.y} w=${box.width} h=${box.height} | ground ${fmt(ground, g)}`,
  });
  rowPts.forEach((p, i) => testInfo.annotations.push({ type: "row", description: fmt(p, row[i]) }));
  colPts.forEach((p, i) => testInfo.annotations.push({ type: "col", description: fmt(p, col[i]) }));

  // The border is the first painted column (x = box.x) and the first painted row (y = box.y).
  // At these integer coordinates both are fully covered: the value is identical across the
  // whole side (checked at the midpoints below), so no antialiasing fringe is measured.
  const leftBorder = row[rowPts.findIndex((p) => p[0] === left)];
  const topBorder = col[colPts.findIndex((p) => p[1] === top)];
  const leftRatio = ratio(leftBorder as [number, number, number], g as [number, number, number]);
  const topRatio = ratio(topBorder as [number, number, number], g as [number, number, number]);
  const fill = row[rowPts.findIndex((p) => p[0] === left + 2)];
  const fillRatio = ratio(fill as [number, number, number], g as [number, number, number]);
  record(testInfo, `dark unchecked checkbox edge, left border (${left},${cy}) = ${leftBorder.join(",")} vs ground (${ground[0]},${ground[1]}) = ${g.join(",")}`, leftRatio, 3);
  record(testInfo, `dark unchecked checkbox edge, top border (${cx},${top}) = ${topBorder.join(",")} vs ground (${ground[0]},${ground[1]}) = ${g.join(",")}`, topRatio, 3);
  testInfo.annotations.push({ type: "info", description: `box interior fill (${left + 2},${cy}) = ${fill.join(",")}, ${fillRatio.toFixed(2)}:1 vs ground (not the criterion; the edge is)` });
  expect(leftRatio, "left unchecked border vs panel surface").toBeGreaterThanOrEqual(3);
  expect(topRatio, "top unchecked border vs panel surface").toBeGreaterThanOrEqual(3);
});
