import { canSetParent, mapUrl, parseMapState, setParent } from "../../core/graph";
import { removeMapNode } from "../../core/node-deletion";
import type { MapNode, MapRuntime, MapState } from "../../types/map";
import type { Browser } from "wxt/browser";

type Slot = { nodeId: string; url: string; windowId: number; index: number; pinned: boolean };
type Checkpoint = { graph: MapState; slots: Slot[]; detachedIds?: string[] };
export const browserRestartKey = "tab-flow-map-browser-restart.v1";

export function createBrowserRestartRecovery() {
  let checkpoint: Checkpoint | undefined, fingerprint: string | undefined;
  const preserved = new Map<string, MapNode>(), originals = new Map<string, MapNode>();
  const restored = new Set<string>(), windows = new Map<number, number>(), startupTabs = new Set<number>();
  let accepting = false;
  function forget(ids: string[]) {
    const removed = new Set(ids);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of preserved.values()) if (node.parentId && removed.has(node.parentId) && !removed.has(node.id)) { removed.add(node.id); changed = true; }
    }
    for (const id of removed) { preserved.delete(id); originals.delete(id); restored.delete(id); }
  }
  return {
    async load(coldStart: boolean) {
      const stored = (await browser.storage.local.get(browserRestartKey))[browserRestartKey] as Checkpoint | undefined;
      if (stored?.graph && Array.isArray(stored.slots)) {
        try { checkpoint = { graph: parseMapState(JSON.stringify(stored.graph)), slots: stored.slots, detachedIds: stored.detachedIds }; }
        catch { checkpoint = undefined; }
      }
      accepting = coldStart && Boolean(checkpoint);
      if (!accepting && checkpoint) for (const node of checkpoint.graph.nodes) {
        if (checkpoint.detachedIds?.includes(node.id)) preserved.set(node.id, structuredClone(node));
      }
      if (accepting) for (const node of checkpoint!.graph.nodes) { originals.set(node.id, structuredClone(node)); preserved.set(node.id, structuredClone(node)); }
      return accepting ? structuredClone(checkpoint!.graph) : undefined;
    },
    get accepting() { return accepting; },
    finish() { accepting = false; },
    created(tabId: number) { if (accepting) startupTabs.add(tabId); },
    forget,
    edited(id: string) { preserved.delete(id); originals.delete(id); restored.delete(id); },
    async clear() {
      checkpoint = undefined; fingerprint = undefined; accepting = false;
      preserved.clear(); originals.clear(); restored.clear(); windows.clear(); startupTabs.clear();
      await browser.storage.local.remove(browserRestartKey);
    },
    closingWindow(windowId: number) {
      if (!checkpoint) return;
      const ids = new Set(checkpoint.slots.filter((slot) => slot.windowId === windowId).map((slot) => slot.nodeId));
      let changed = true;
      while (changed) {
        changed = false;
        for (const node of checkpoint.graph.nodes) if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) { ids.add(node.id); changed = true; }
      }
      for (const node of checkpoint.graph.nodes) if (ids.has(node.id)) preserved.set(node.id, structuredClone(node));
    },
    reconnectAll(tabs: Browser.tabs.Tab[], state: MapState, runtime: MapRuntime) {
      const counts = new Map<string, number>();
      for (const tab of tabs) {
        const url = tab.pendingUrl || tab.url || ""; counts.set(url, (counts.get(url) ?? 0) + 1);
      }
      // Unique pages identify restored windows before resolving repeated URLs by slot.
      for (const tab of [...tabs].sort((a, b) => (counts.get(a.pendingUrl || a.url || "") ?? 0) - (counts.get(b.pendingUrl || b.url || "") ?? 0))) {
        this.reconnect(tab, state, runtime, true);
      }
    },
    reconnect(tab: Browser.tabs.Tab, state: MapState, runtime: MapRuntime, initial = false) {
      if (!checkpoint || tab.id === undefined || tab.incognito || (!initial && !accepting && !startupTabs.has(tab.id))) return false;
      if (initial) startupTabs.add(tab.id);
      const url = mapUrl(tab.pendingUrl || tab.url || "");
      if (!url) return false;
      const existingId = runtime.bindings[tab.id];
      const existing = state.nodes.find((node) => node.id === existingId);
      if (existing && (originals.has(existing.id) || existing.parentId || runtime.fixedSources[tab.id] === existing.id)) return false;
      const bound = new Set(Object.values(runtime.bindings));
      const slots = checkpoint.slots.filter((slot) => slot.url === url && !bound.has(slot.nodeId) && originals.has(slot.nodeId));
      const oldWindow = windows.get(tab.windowId);
      const candidates = slots.length === 1 ? slots : slots.filter((slot) => slot.index === tab.index && slot.pinned === Boolean(tab.pinned) &&
        (oldWindow === undefined ? ![...windows.values()].includes(slot.windowId) : slot.windowId === oldWindow));
      if (candidates.length !== 1) return false;
      const slot = candidates[0], original = originals.get(slot.nodeId)!;
      if (existing) removeMapNode(state, runtime, existing.id);
      if (!windows.has(tab.windowId)) windows.set(tab.windowId, slot.windowId);
      let node = state.nodes.find((item) => item.id === slot.nodeId);
      if (!node) { node = structuredClone(original); state.nodes.push(node); }
      runtime.bindings[tab.id] = node.id;
      runtime.histories[tab.id] = { nodeIds: [node.id], index: 0 };
      runtime.fixedSources[tab.id] = node.id;
      delete runtime.pasteWindows[tab.id]; delete runtime.pendingParents[tab.id];
      restored.add(node.id); preserved.delete(node.id);
      for (const id of restored) {
        const current = state.nodes.find((item) => item.id === id), saved = originals.get(id);
        if (!current || !saved) continue;
        const parent = state.nodes.some((item) => item.id === saved.parentId) ? saved.parentId : null;
        if (canSetParent(state.nodes, id, parent)) { setParent(state.nodes, id, parent); current.kind = parent ? saved.kind : "root"; }
      }
      if (tab.active) runtime.activeNodeId = node.id;
      return true;
    },
    async save(state: MapState, runtime: MapRuntime, tabs: Map<number, Browser.tabs.Tab>) {
      const live = new Map(state.nodes.map((node) => [node.id, node]));
      for (const [id, original] of preserved) {
        const current = live.get(id);
        live.set(id, current ? { ...current, parentId: original.parentId, kind: original.kind } : original);
      }
      for (const id of restored) {
        const current = live.get(id), original = originals.get(id);
        if (current && original?.parentId && preserved.has(original.parentId)) {
          live.set(id, { ...current, parentId: original.parentId, kind: original.kind });
        }
      }
      const graph = { ...state, nodes: [...live.values()] };
      const slots = new Map((checkpoint?.slots ?? []).filter((slot) => preserved.has(slot.nodeId)).map((slot) => [slot.nodeId, slot]));
      for (const [tabId, nodeId] of Object.entries(runtime.bindings)) {
        const node = live.get(nodeId), tab = tabs.get(Number(tabId));
        if (node && tab && !tab.incognito) slots.set(nodeId, { nodeId, url: node.url, windowId: tab.windowId, index: tab.index, pinned: Boolean(tab.pinned) });
      }
      const next = { graph, slots: [...slots.values()], detachedIds: [...preserved.keys()] }, text = JSON.stringify(next);
      if (text === fingerprint) return;
      await browser.storage.local.set({ [browserRestartKey]: next });
      checkpoint = structuredClone(next); fingerprint = text;
    },
  };
}
