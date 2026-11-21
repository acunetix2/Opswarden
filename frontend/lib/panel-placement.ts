/**
 * Where to open a floating panel next to its launcher button so it always fits
 * on screen: above the button when there's more room above (or enough for the
 * full height), otherwise below; aligned to the button's edge on the side of
 * the screen the button is on; clamped inside the viewport margins.
 */
export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
}

export interface PanelPlacement {
  left: number;
  width: number;
  height: number;
  /** Set when opening upwards (distance from the viewport bottom). */
  bottom?: number;
  /** Set when opening downwards (distance from the viewport top). */
  top?: number;
  up: boolean;
  alignLeft: boolean;
}

export function placePanel(r: Rect, vw: number, vh: number): PanelPlacement {
  const gap = 12;
  const wide = vw >= 640;
  const edge = wide ? 16 : 12;
  const width = wide ? Math.min(400, vw - edge * 2) : vw - edge * 2;
  const wanted = Math.min(wide ? 600 : 560, vh * (wide ? 0.72 : 0.68));
  const above = r.top - gap - edge;
  const below = vh - r.bottom - gap - edge;
  const up = above >= wanted || above >= below;
  const room = up ? above : below;
  // Never taller than the screen allows; never so short it's unusable unless the screen is tiny.
  const height = Math.min(Math.max(Math.min(240, vh - edge * 2), Math.min(wanted, room)), vh - edge * 2);

  const alignLeft = r.left + r.width / 2 < vw / 2;
  const left = Math.min(Math.max(edge, alignLeft ? r.left : r.right - width), vw - width - edge);

  if (up) {
    const bottom = Math.max(edge, Math.min(vh - r.top + gap, vh - height - edge));
    return { left, width, height, bottom, up, alignLeft };
  }
  const top = Math.max(edge, Math.min(r.bottom + gap, vh - height - edge));
  return { left, width, height, top, up, alignLeft };
}
