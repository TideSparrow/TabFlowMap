import { breadcrumbs } from "./graph";
import type { MapNode } from "../types/map";

// URL、标题和手动位置变化不打断浏览；活动节点的来源路径变化需要重新跟随。
export function followTargetKey(nodes: MapNode[], activeNodeId: string | null) {
  if (!activeNodeId) return null;
  const path = breadcrumbs(nodes, activeNodeId);
  return path.length ? JSON.stringify(path.map((node) => node.id)) : null;
}
