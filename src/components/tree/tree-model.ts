import type { MapNode } from "../../types/map";

export type TreeRow = { node: MapNode; depth: number; children: number; position: number; siblings: number };

export function buildTreeRows(nodes: MapNode[], collapsed: Set<string>, query = ""): TreeRow[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string | null, MapNode[]>();
  for (const node of nodes) {
    const parent = node.parentId && byId.has(node.parentId) ? node.parentId : null;
    const siblings = children.get(parent) ?? [];
    siblings.push(node); children.set(parent, siblings);
  }
  const text = query.trim().toLowerCase();
  const included = new Set<string>();
  if (text) {
    for (const node of nodes) {
      if (!`${node.title} ${node.url} ${node.keyword ?? ""} ${node.note}`.toLowerCase().includes(text)) continue;
      let ancestor: MapNode | undefined = node;
      while (ancestor && !included.has(ancestor.id)) {
        included.add(ancestor.id);
        ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined;
      }
    }
  }
  const rows: TreeRow[] = [], visited = new Set<string>();
  const stack: { node: MapNode; depth: number; position: number; siblings: number }[] = [];
  function pushSiblings(items: MapNode[], depth: number) {
    const visible = text ? items.filter((node) => included.has(node.id)) : items;
    for (let index = visible.length - 1; index >= 0; index--) {
      stack.push({ node: visible[index], depth, position: index + 1, siblings: visible.length });
    }
  }
  pushSiblings(children.get(null) ?? [], 0);
  while (stack.length) {
    const entry = stack.pop()!;
    if (visited.has(entry.node.id)) continue;
    visited.add(entry.node.id);
    const descendants = children.get(entry.node.id) ?? [];
    rows.push({ ...entry, children: descendants.length });
    if (text || !collapsed.has(entry.node.id)) pushSiblings(descendants, entry.depth + 1);
  }
  return rows;
}
