import { vi } from "vitest";

function eventBus() {
  const callbacks: Array<(...args: any[]) => unknown> = [];
  return { addListener: (callback: (...args: any[]) => unknown) => callbacks.push(callback),
    emit: (...args: any[]) => callbacks.forEach((callback) => callback(...args)) };
}
export function createBrowser() {
  const tabs = new Map<number, any>([[1, { id: 1, windowId: 10, url: "https://a.example/", title: "A", active: true, incognito: false }]]);
  let nextTabId = 2;
  const closedSessions: any[] = [];
  let nextSessionId = 1;
  const local: Record<string, unknown> = {}, session: Record<string, unknown> = {};
  const area = (values: Record<string, unknown>) => ({
    get: vi.fn(async (keys: string | string[]) => Object.fromEntries((typeof keys === "string" ? [keys] : keys).map((key) => [key, structuredClone(values[key])]))),
    set: vi.fn(async (patch: Record<string, unknown>) => { Object.assign(values, structuredClone(patch)); }),
    remove: vi.fn(async (keys: string | string[]) => { for (const key of typeof keys === "string" ? [keys] : keys) delete values[key]; }),
  });
  const api = {
    runtime: { getURL: (path: string) => `chrome-extension://map${path}`, onMessage: eventBus() },
    storage: { local: area(local), session: area(session) },
    tabs: { onCreated: eventBus(), onUpdated: eventBus(), onRemoved: eventBus(), onReplaced: eventBus(), onActivated: eventBus(), onMoved: eventBus(), onAttached: eventBus(),
      get: vi.fn(async (id: number) => { if (!tabs.has(id)) throw new Error("closed"); return tabs.get(id); }),
      query: vi.fn(async (query: { active?: boolean; windowId?: number }) => [...tabs.values()].filter((tab) => (!query.active || tab.active) && (!query.windowId || tab.windowId === query.windowId))),
      create: vi.fn(async (options: any) => {
        const id = Math.max(nextTabId, Math.max(1, ...tabs.keys()) + 1); nextTabId = id + 1;
        const url = options.url ?? "chrome://newtab/";
        const tab = { index: id - 1, ...options, url, id, windowId: options.windowId ?? 10, title: new URL(url).hostname, incognito: false };
        tabs.set(id, tab); api.tabs.onCreated.emit(tab);
        api.webNavigation.onCommitted.emit({ tabId: id, url: tab.url, frameId: 0, transitionQualifiers: [], transitionType: "link" });
        return tab;
      }),
      update: vi.fn(async (id: number, options: any) => {
        const tab = { ...tabs.get(id), ...options };
        if ("pinned" in options) { tabs.set(id, tab); api.tabs.onUpdated.emit(id, { pinned: options.pinned }, tab); }
        return tab;
      }),
      remove: vi.fn(async (id: number) => {
        const tab = tabs.get(id);
        if (tab) closedSessions.unshift({ lastModified: Math.floor(Date.now() / 1000), tab: { ...tab, sessionId: `closed-${nextSessionId++}` } });
        closedSessions.splice(25); tabs.delete(id); api.tabs.onRemoved.emit(id); api.sessions.onChanged.emit();
      }),
      sendMessage: vi.fn(async (_tabId: number, _message: any, _options?: { frameId?: number }): Promise<any> => undefined),
      move: vi.fn(async (id: number, { index }: { index: number }) => {
        const tab = tabs.get(id); if (!tab) throw new Error("closed");
        const ordered = [...tabs.values()].filter((item) => item.windowId === tab.windowId).sort((a, b) => a.index - b.index);
        const fromIndex = ordered.findIndex((item) => item.id === id);
        ordered.splice(fromIndex, 1); ordered.splice(index, 0, tab);
        ordered.forEach((item, position) => { item.index = position; });
        api.tabs.onMoved.emit(id, { windowId: tab.windowId, fromIndex, toIndex: index });
        return tab;
      }),
    },
    windows: { onBoundsChanged: eventBus(), onRemoved: eventBus(),
      getLastFocused: vi.fn(async () => ({ id: 10 })), update: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined), create: vi.fn(async (options: any) => {
        tabs.set(50, { id: 50, windowId: 20, url: options.url, active: false }); return { id: 20 };
      }),
    },
    webNavigation: { onCreatedNavigationTarget: eventBus(), onBeforeNavigate: eventBus(), onCommitted: eventBus(), onHistoryStateUpdated: eventBus(), onReferenceFragmentUpdated: eventBus() },
    sessions: { onChanged: eventBus(), getRecentlyClosed: vi.fn(async () => structuredClone(closedSessions)) },
  };
  return { api, tabs, local, session, closedSessions };
}
