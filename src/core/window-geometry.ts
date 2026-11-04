export const defaultMapSize = { width: 480, height: 320 };
export const defaultMapZoom = 0.86;
export const tabMapWindowBoundsKey = "tab-flow-map-window-bounds.v1";

export function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function restoredMapSize(value: unknown) {
  const saved = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    width: Math.round(Math.max(380, Math.min(1800, finiteNumber(saved.width, defaultMapSize.width)))),
    height: Math.round(Math.max(240, Math.min(1200, finiteNumber(saved.height, defaultMapSize.height)))),
  };
}
