import { setParent } from "./graph";
import type { MapRuntime, MapState } from "../types/map";

// 先关闭最深的子标签；多个选区重叠时，每个节点只处理一次。
export function branchDeletionOrder(state: MapState, selectedIds: string[]) {
  const nodes = state.nodes.filter((node) => node.sessionId === state.sessionId);
  const ids = new Set(nodes.map((node) => node.id));
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const branch = children.get(node.parentId) ?? [];
    branch.push(node.id); children.set(node.parentId, branch);
  }
  const visited = new Set<string>(), order: string[] = [];
  function visit(id: string) {
    if (!ids.has(id) || visited.has(id)) return;
    visited.add(id);
    for (const child of children.get(id) ?? []) visit(child);
    order.push(id);
  }
  selectedIds.forEach(visit);
  return order;
}

export function removeMapNode(state: MapState, runtime: MapRuntime, nodeId: string) {
  const node = state.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  for (const child of state.nodes.filter((item) => item.parentId === nodeId)) {
    setParent(state.nodes, child.id, node.parentId);
  }
  state.nodes = state.nodes.filter((item) => item.id !== nodeId);
  for (const key of ["bindings", "restores", "fixedSources"] as const) {
    for (const [tabId, id] of Object.entries(runtime[key])) {
      if (id !== nodeId) continue;
      delete runtime[key][tabId];
      if (key === "bindings") delete runtime.histories[tabId];
    }
  }
  for (const history of Object.values(runtime.histories)) {
    history.index = history.nodeIds.slice(0, history.index + 1).filter((id) => id !== nodeId).length - 1;
    history.nodeIds = history.nodeIds.filter((id) => id !== nodeId);
  }
  for (const [tabId, parentId] of Object.entries(runtime.pendingParents)) {
    if (parentId !== nodeId) continue;
    if (node.parentId) runtime.pendingParents[tabId] = node.parentId;
    else delete runtime.pendingParents[tabId];
  }
  for (const [tabId, window] of Object.entries(runtime.pasteWindows)) {
    if (window.rootId === nodeId || window.source?.nodeId === nodeId) delete runtime.pasteWindows[tabId];
  }
  runtime.copies = runtime.copies.filter((copy) => copy.nodeId !== nodeId);
  if (runtime.activeNodeId === nodeId) runtime.activeNodeId = null;
}
