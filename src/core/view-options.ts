export type CanvasDisplayMode = "detailed" | "compact";
export type MapDisplayMode = CanvasDisplayMode | "tree";
export type MapLayoutDirection = "horizontal" | "vertical";
export const nodeSizes = {
  detailed: { width: 250, height: 110, columnGap: 50, rowGap: 30 },
  compact: { width: 190, height: 86, columnGap: 40, rowGap: 20 },
} satisfies Record<CanvasDisplayMode, { width: number; height: number; columnGap: number; rowGap: number }>;
