import assert from "node:assert/strict";
import { test } from "node:test";

import { placePanel, type Rect } from "../lib/panel-placement.ts";

const SIZE = 62;
const button = (left: number, top: number): Rect => ({ left, top, right: left + SIZE, bottom: top + SIZE, width: SIZE });

/** The panel's box in viewport coordinates. */
function box(p: ReturnType<typeof placePanel>, vh: number) {
  const top = p.up ? vh - (p.bottom ?? 0) - p.height : (p.top ?? 0);
  return { top, bottom: top + p.height, left: p.left, right: p.left + p.width };
}

const SCREENS = [
  { name: "desktop", vw: 1440, vh: 900 },
  { name: "laptop", vw: 1280, vh: 640 },
  { name: "phone", vw: 390, vh: 760 },
  { name: "short phone", vw: 375, vh: 560 },
];

test("the panel stays fully on screen and never covers the button, wherever the button is", () => {
  for (const { name, vw, vh } of SCREENS) {
    for (const x of [16, vw / 2 - SIZE / 2, vw - SIZE - 16]) {
      for (const y of [16, vh / 2 - SIZE / 2, vh - SIZE - 16]) {
        const b = button(x, y);
        const p = placePanel(b, vw, vh);
        const r = box(p, vh);
        const at = `${name} button at (${Math.round(x)}, ${Math.round(y)})`;
        assert.ok(r.top >= 12 - 0.01 && r.bottom <= vh - 12 + 0.01, `${at}: vertical ${r.top}-${r.bottom} in ${vh}`);
        assert.ok(r.left >= 12 - 0.01 && r.right <= vw - 12 + 0.01, `${at}: horizontal ${r.left}-${r.right} in ${vw}`);
        assert.ok(p.height >= Math.min(240, vh - 32), `${at}: usable height ${p.height}`);
        const overlaps = r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
        // Only allowed when the screen is too short to fit both (then it still stays on screen).
        if (vh >= 640) assert.ok(!overlaps, `${at}: panel covers the button`);
      }
    }
  }
});

test("opens toward the side with more room", () => {
  const nearTop = placePanel(button(1300, 40), 1440, 900);
  assert.equal(nearTop.up, false, "button near the top opens downwards");
  const nearBottom = placePanel(button(1300, 820), 1440, 900);
  assert.equal(nearBottom.up, true, "button near the bottom opens upwards");
});

test("lines up with the button's side", () => {
  const right = placePanel(button(1360, 820), 1440, 900);
  assert.equal(right.alignLeft, false);
  assert.equal(right.left + right.width, 1360 + SIZE, "right edges line up");
  const left = placePanel(button(16, 820), 1440, 900);
  assert.equal(left.alignLeft, true);
  assert.equal(left.left, 16, "left edges line up");
});
