import type { MapNode } from "../types/map";
import { nodeSizes, type CanvasDisplayMode, type MapLayoutDirection } from "./view-options";

export type PositionedNode = { node: MapNode; x: number; y: number; children: number };
export function layoutMap(nodes: MapNode[], collapsed: Set<string>, displayMode: CanvasDisplayMode = "detailed", direction: MapLayoutDirection = "horizontal") {
  const size = nodeSizes[displayMode];
  const vertical = direction === "vertical";
  const rowHeight = vertical ? size.width + size.columnGap : size.height + size.rowGap;
  const depthStep = vertical ? size.height + Math.max(60, size.rowGap) : size.width + size.columnGap;
  const byParent = new Map<string | null, MapNode[]>();
  const ids = new Set(nodes.map((node) => node.id));
  nodes.forEach((node) => {
    const parent = node.parentId && ids.has(node.parentId) ? node.parentId : null;
    const children = byParent.get(parent) ?? [];
    children.push(node); byParent.set(parent, children);
  });
  const positions: PositionedNode[] = [];
  const visited = new Set<string>();
  let row = 0;
  function walk(node: MapNode, depth: number): number {
    if (visited.has(node.id)) return row * rowHeight;
    visited.add(node.id);
    const children = byParent.get(node.id) ?? [];
    const visibleChildren = collapsed.has(node.id) ? [] : children;
    const ys = visibleChildren.map((child) => walk(child, depth + 1));
    const y = ys.length ? (ys[0] + ys.at(-1)!) / 2 : row++ * rowHeight + 40;
    positions.push({ node, x: vertical ? y : depth * depthStep + 36,
      y: vertical ? depth * depthStep + 40 : y, children: children.length });
    return y;
  }
  (byParent.get(null) ?? []).forEach((root) => { walk(root, 0); row += 0.3; });
  return {
    positions,
    width: Math.max(560, ...positions.map((item) => item.x + size.width + 42)),
    height: Math.max(320, ...positions.map((item) => item.y + size.height + size.rowGap + 10)),
  };
}
