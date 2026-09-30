import assert from "node:assert/strict";
import { test } from "node:test";
import { BLACK, contrast, over, parseColor, toHex, toHsl, toRgb, WHITE } from "../src/color.ts";

test("every form the history calls a colour is read", () => {
  const blue = { r: 55, g: 138, b: 221, a: 1 };
  assert.deepEqual(parseColor("#378ADD"), blue);
  assert.deepEqual(parseColor("#fff"), { ...WHITE });
  assert.deepEqual(parseColor("#0008"), { r: 0, g: 0, b: 0, a: 0x88 / 255 });
  assert.deepEqual(parseColor("#378ADD80"), { ...blue, a: 128 / 255 });
  assert.deepEqual(parseColor("rgb(55, 138, 221)"), blue);
  assert.deepEqual(parseColor("rgba(55,138,221,0.5)"), { ...blue, a: 0.5 });
  assert.deepEqual(parseColor("RGB(55 138 221 / 50%)"), { ...blue, a: 0.5 });
  assert.deepEqual(parseColor("rgb(100% 0% 0%)"), { r: 255, g: 0, b: 0, a: 1 });
  assert.equal(toHex(parseColor("hsl(210, 71%, 54%)")!), "#368ADD");
  assert.equal(toHex(parseColor("hsl(0.5turn 100% 50%)")!), "#00FFFF");
  assert.equal(toHex(parseColor("hsla(-120deg, 100%, 50%, .25)")!), "#0000FF40");
});

test("what is not a colour is not read", () => {
  for (const no of ["#12345", "red", "rgb(1, 2)", "rgb(1 2 3 4)", "rgb(1deg 2 3)", "hsl(1, 2%, 3%) x", "rgb(1 2 3 / 4 / 5)"]) {
    assert.equal(parseColor(no), null, no);
  }
});

test("formats are written the way CSS reads them", () => {
  const c = parseColor("#378ADD80")!;
  assert.equal(toHex(c), "#378ADD80");
  assert.equal(toRgb(c), "rgb(55 138 221 / 0.5)");
  assert.equal(toHsl(c), "hsl(210 71% 54% / 0.5)");
  assert.equal(toRgb(parseColor("#378ADD")!), "rgb(55 138 221)");
});

test("contrast is WCAG's, taken over what shows through", () => {
  assert.equal(Math.round(contrast(WHITE, BLACK)), 21);
  assert.equal(contrast(WHITE, WHITE), 1);
  const half = parseColor("#00000080")!;
  assert.equal(toHex(over(half, WHITE)), "#7F7F7F");
});
