import { canSetParent, mapUrl, setParent } from "../../core/graph";
import { mapPositionKeys } from "../../storage/positions";
import type { MapNode, MapRuntime, MapState } from "../../types/map";
import type { Browser } from "wxt/browser";

const key = "tab-flow-map-closed-tabs.v1";
const limit = 25;
type Entry = { node: MapNode; closedAt: number; browserSessionId?: string; consumedAt?: number;
  children: MapNode[]; positions: Record<string, unknown>; restored?: boolean };

// Native browser restoration has no dedicated tabs event. Correlate a consumed
// Chrome closed-session ID with a newly created tab, never with its URL alone.
export function createClosedTabRecovery() {
  let entries: Entry[] = [];
  let saved: string | undefined;
  const created = new Map<number, number>();
  async function save() {
    const next = JSON.stringify(entries);
    if (next === saved) return;
    await browser.storage.session.set({ [key]: entries }); saved = next;
  }
  async function refresh() {
    if (!entries.length || !browser.sessions?.getRecentlyClosed) return;
    const recent = await browser.sessions.getRecentlyClosed({ maxResults: limit }).catch(() => undefined);
    if (!recent) return;
    const tabs = recent.flatMap((session) => session.tab ? [{ tab: session.tab, at: session.lastModified }]
      : (session.window?.tabs ?? []).map((tab) => ({ tab, at: session.lastModified })));
    const ids = new Set(tabs.map(({ tab }) => tab.sessionId).filter(Boolean));
    const reserved = new Set(entries.map((entry) => entry.browserSessionId).filter(Boolean));
    for (const entry of entries) {
      if (entry.restored) continue;
      if (!entry.browserSessionId) {
        const match = tabs.find(({ tab, at }) => !tab.incognito && tab.sessionId && !reserved.has(tab.sessionId) &&
          mapUrl(tab.url ?? "") === entry.node.url && Math.abs(at * 1000 - entry.closedAt) < 3000);
        if (match) { entry.browserSessionId = match.tab.sessionId; reserved.add(match.tab.sessionId); }
      } else if (!ids.has(entry.browserSessionId)) {
        // At the API's cap, disappearance can mean eviction by another close.
        if (recent.length >= limit) continue;
        entry.consumedAt ??= Date.now();
      }
    }
    await save();
  }
  return {
    async load() {
      const stored = (await browser.storage.session.get(key))[key];
      if (Array.isArray(stored)) { entries = stored.slice(-limit); saved = JSON.stringify(entries); }
    },
    async clear(sessionId?: string | null) {
      entries = sessionId === undefined ? [] : entries.filter((entry) => entry.node.sessionId !== sessionId);
      created.clear(); await save();
    },
    created(tabId: number) {
      created.set(tabId, Date.now());
      for (const [id, at] of created) if (Date.now() - at > 10000) created.delete(id);
    },
    async remember(node: MapNode, state: MapState) {
      if (!browser.sessions?.getRecentlyClosed) return;
      const positions = await browser.storage.local.get(mapPositionKeys(node.id)).catch(() => ({}));
      entries = entries.filter((entry) => entry.node.id !== node.id);
      entries.push({ node: structuredClone(node), children: structuredClone(state.nodes.filter((child) => child.parentId === node.id)),
        positions, closedAt: Date.now() });
      entries = entries.slice(-limit);
      await refresh(); await save();
    },
    forget(tabId: number) { created.delete(tabId); },
    async recover(tab: Browser.tabs.Tab, state: MapState, runtime: MapRuntime) {
      if (tab.id === undefined || tab.incognito || !created.has(tab.id)) return false;
      await refresh();
      const at = created.get(tab.id)!;
      const url = mapUrl(tab.pendingUrl || tab.url || "");
      const candidates = entries.filter((entry) => !entry.restored && entry.consumedAt && at >= entry.closedAt &&
        Math.abs(at - entry.consumedAt) < 5000 && entry.node.url === url &&
        state.sessions.some((session) => session.id === entry.node.sessionId));
      if (candidates.length !== 1) return false;
      const entry = candidates[0];
      if (state.nodes.some((node) => node.id === entry.node.id)) return false;
      const currentId = runtime.bindings[tab.id];
      const current = state.nodes.find((node) => node.id === currentId);
      if (current && (current.parentId || current.kind !== "root" || runtime.fixedSources[tab.id] === current.id)) return false;
      const node = structuredClone(entry.node);
      if (node.parentId && !state.nodes.some((parent) => parent.id === node.parentId)) { node.parentId = null; node.kind = "root"; }
      if (currentId) {
        for (const child of state.nodes.filter((child) => child.parentId === currentId)) child.parentId = node.id;
        state.nodes = state.nodes.filter((item) => item.id !== currentId);
        await browser.storage.local.remove(mapPositionKeys(currentId));
      }
      state.nodes.push(node);
      runtime.bindings[tab.id] = node.id;
      runtime.histories[tab.id] = { nodeIds: [node.id], index: 0 };
      runtime.fixedSources[tab.id] = node.id;
      delete runtime.pasteWindows[tab.id];
      delete runtime.pendingParents[tab.id];
      if (tab.active) runtime.activeNodeId = node.id;
      entry.restored = true;
      for (const restored of entries.filter((item) => item.restored)) {
        const parent = state.nodes.find((item) => item.id === restored.node.id);
        if (!parent) continue;
        if (!parent.parentId && parent.kind === "root" && restored.node.parentId &&
            state.nodes.some((item) => item.id === restored.node.parentId) && canSetParent(state.nodes, parent.id, restored.node.parentId)) {
          setParent(state.nodes, parent.id, restored.node.parentId); parent.kind = restored.node.kind;
        }
        for (const saved of restored.children) {
          const child = state.nodes.find((item) => item.id === saved.id);
          if (child && child.parentId === restored.node.parentId && child.kind === (restored.node.parentId ? "manual" : "root") &&
              canSetParent(state.nodes, child.id, parent.id)) {
            setParent(state.nodes, child.id, parent.id); child.kind = saved.kind; child.pendingSource = saved.pendingSource;
          }
        }
      }
      if (Object.keys(entry.positions).length) await browser.storage.local.set(entry.positions);
      entries = entries.filter((item) => !item.restored || (item.node.parentId && !state.nodes.some((parent) => parent.id === item.node.parentId)));
      created.delete(tab.id); await save();
      return true;
    },
    refresh,
  };
}
