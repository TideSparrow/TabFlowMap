import type { XYPosition } from "@xyflow/react";
import type { MapNode } from "../../types/map";
import type { MapLayoutDirection } from "../../core/view-options";

export function mainTaskNavigation(nodes: MapNode[], currentId: string | null,
  positions: Map<string, XYPosition>, direction: MapLayoutDirection) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const axis = direction === "vertical" ? "x" : "y";
  // Arrows follow the visible order, including manually moved root nodes.
  const roots = nodes.filter((node) => !node.parentId || !byId.has(node.parentId))
    .sort((a, b) => (positions.get(a.id)?.[axis] ?? 0) - (positions.get(b.id)?.[axis] ?? 0));
  let current = currentId ? byId.get(currentId) : undefined;
  const visited = new Set<string>();
  while (current?.parentId && byId.has(current.parentId) && !visited.has(current.id)) {
    visited.add(current.id);
    current = byId.get(current.parentId);
  }
  const index = Math.max(0, roots.findIndex((root) => root.id === current?.id));
  return {
    roots, index,
    previous: roots.length ? roots[(index + roots.length - 1) % roots.length] : undefined,
    next: roots.length ? roots[(index + 1) % roots.length] : undefined,
  };
}
