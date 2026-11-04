import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeTabMapManager } from "../manager";
import { createBrowser } from "../../testing/browser-fixture";
import { emptyMapState, tabMapMessageType, type MapCommand, type MapView } from "../../types/map";
import { browserRestartKey } from "./browser-restart";
import { mapPositionPrefix } from "../../storage/positions";

const persisted = vi.hoisted(() => ({ graph: {} as ReturnType<typeof emptyMapState> }));
vi.mock("../../storage/graph", () => ({
  readTabMap: async () => structuredClone(persisted.graph),
  saveTabMap: async (state: ReturnType<typeof emptyMapState>) => { persisted.graph = structuredClone(state); },
}));

describe("full browser restart recovery", () => {
  let fake: ReturnType<typeof createBrowser>, manager: ReturnType<typeof initializeTabMapManager>;
  let ids: string[], originalTabs: any[];
  async function command(message: MapCommand) {
    return await manager.handleMessage({ type: tabMapMessageType, ...message },
      { url: "chrome-extension://map/tab-map.html?mode=window" }) as { ok: boolean; view: MapView };
  }
  const view = async () => (await command({ action: "get" })).view;
  async function restart(tabs = originalTabs.map((tab, index) => ({ ...tab, id: 101 + index, windowId: 88 }))) {
    const local = structuredClone(fake.local);
    fake = createBrowser(); fake.tabs.clear(); Object.assign(fake.local, local);
    tabs.forEach((tab) => fake.tabs.set(tab.id, tab));
    vi.stubGlobal("browser", fake.api); manager = initializeTabMapManager(); return view();
  }
  beforeEach(async () => {
    vi.useFakeTimers(); persisted.graph = emptyMapState(); fake = createBrowser(); fake.tabs.get(1).index = 0;
    vi.stubGlobal("browser", fake.api); manager = initializeTabMapManager();
    const a = (await command({ action: "start", name: "重启工作流" })).view.nodes[0];
    const b = (await command({ action: "add", text: "b.example", parentId: a.id })).view.nodes[1];
    const c = (await command({ action: "add", text: "c.example", parentId: b.id })).view.nodes[2];
    ids = [a.id, b.id, c.id];
    await command({ action: "edit", nodeId: b.id, note: "保留备注" });
    await command({ action: "positions", displayMode: "compact", direction: "vertical", items: [{ nodeId: b.id, position: { x: 123, y: 456 } }] });
    originalTabs = [...fake.tabs.values()].map((tab, index) => ({ ...tab, index }));
    originalTabs.forEach((tab) => fake.tabs.set(tab.id, tab));
    // Commit the slot metadata with the graph.
    fake.api.tabs.onUpdated.emit(2, { title: "B" }, fake.tabs.get(2)); await view();
  });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  function expectChain(graph: MapView) {
    expect(graph.nodes).toHaveLength(3);
    expect(graph.nodes.find((node) => node.id === ids[1])).toMatchObject({ parentId: ids[0], note: "保留备注" });
    expect(graph.nodes.find((node) => node.id === ids[2])?.parentId).toBe(ids[1]);
    expect(new Set(Object.values(graph.runtime.bindings))).toEqual(new Set(ids));
  }

  it("restores new Chrome IDs without depending on volatile session storage", async () => {
    const graph = await restart(); expectChain(graph);
    expect(fake.local[mapPositionPrefix("compact", "vertical") + ids[1]]).toEqual({ x: 123, y: 456 });
    expect(graph.runtime.copies).toEqual([]);
  });

  it("preserves the graph through window-closing events and reconnects on the next launch", async () => {
    for (const id of [3, 2, 1]) {
      fake.tabs.delete(id); fake.api.tabs.onRemoved.emit(id, { windowId: 10, isWindowClosing: true }); await view();
    }
    expect((await view()).nodes).toHaveLength(0);
    expect((fake.local[browserRestartKey] as any).graph.nodes).toHaveLength(3);
    expectChain(await restart());
  });

  it("handles an initially empty tab query and out-of-order pending URLs", async () => {
    await restart([]);
    for (const index of [2, 0, 1]) {
      const tab = { ...originalTabs[index], id: 101 + index, windowId: 88, url: "", pendingUrl: originalTabs[index].url };
      fake.tabs.set(tab.id, tab); fake.api.tabs.onCreated.emit(tab); await view();
    }
    expectChain(await view());
  });

  it("replaces provisional blank roots when startup URLs arrive later", async () => {
    await restart([]);
    for (const [index, saved] of originalTabs.entries()) {
      const id = 101 + index, tab = { ...saved, id, windowId: 88, url: "chrome://newtab/" };
      fake.tabs.set(id, tab); fake.api.tabs.onCreated.emit(tab); await view();
      tab.url = saved.url; fake.api.webNavigation.onCommitted.emit({ tabId: id, frameId: 0, url: tab.url, transitionQualifiers: [] }); await view();
    }
    expectChain(await view());
  });

  it("keeps ordinary single-tab closure deleted across restart", async () => {
    await fake.api.tabs.remove(2); await view();
    const graph = await restart([originalTabs[0], originalTabs[2]].map((tab, index) => ({ ...tab, id: 101 + index, windowId: 88 })));
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes.some((node) => node.id === ids[1])).toBe(false);
    expect(graph.nodes.find((node) => node.id === ids[2])?.parentId).toBe(ids[0]);
  });

  it("keeps duplicate URLs distinct by restored window and tab position", async () => {
    fake.tabs.get(2).url = originalTabs[0].url;
    fake.api.webNavigation.onCommitted.emit({ tabId: 2, frameId: 0, url: fake.tabs.get(2).url, transitionQualifiers: [] });
    await view(); originalTabs[1].url = originalTabs[0].url;
    const graph = await restart(); expectChain(graph);
    expect(graph.runtime.bindings[101]).toBe(ids[0]); expect(graph.runtime.bindings[102]).toBe(ids[1]);
  });

  it("does not keep absent nodes visible or attach newly opened tasks after startup settles", async () => {
    await restart([originalTabs[0]].map((tab) => ({ ...tab, id: 101, windowId: 88 })));
    await vi.advanceTimersByTimeAsync(3001); await view();
    expect((await view()).nodes).toHaveLength(1);
    const tab = { ...originalTabs[1], id: 200, windowId: 88 }; fake.tabs.set(200, tab); fake.api.tabs.onCreated.emit(tab);
    const graph = await view();
    expect(graph.nodes.find((node) => node.id === graph.runtime.bindings[200])?.parentId).toBeNull();
    expect(graph.nodes.some((node) => node.id === ids[1])).toBe(false);
  });

  it("retains a closing window checkpoint across a service worker restart before the browser exits", async () => {
    for (const id of [3, 2, 1]) {
      fake.tabs.delete(id); fake.api.tabs.onRemoved.emit(id, { windowId: 10, isWindowClosing: true }); await view();
    }
    const local = structuredClone(fake.local), session = structuredClone(fake.session);
    fake = createBrowser(); fake.tabs.clear(); Object.assign(fake.local, local); Object.assign(fake.session, session);
    vi.stubGlobal("browser", fake.api); manager = initializeTabMapManager(); await view();
    expectChain(await restart());
  });

  it("matches multi-window duplicates after identifying each window from its unique pages", async () => {
    const d = (await command({ action: "add", text: "d.example", parentId: null })).view.nodes[3];
    for (const [id, windowId, index] of [[1, 10, 0], [2, 20, 0], [3, 20, 1], [4, 10, 1]]) {
      Object.assign(fake.tabs.get(id), { windowId, index, title: `标签 ${id}` });
      if (id === 2) fake.tabs.get(id).url = "https://a.example/";
      fake.api.tabs.onUpdated.emit(id, { url: fake.tabs.get(id).url }, fake.tabs.get(id));
    }
    await view();
    const tabs = [...fake.tabs.values()].map((tab, index) => ({ ...tab, id: 101 + index, windowId: tab.windowId === 10 ? 88 : 99 }));
    const graph = await restart(tabs);
    expect(graph.nodes).toHaveLength(4);
    expect(graph.runtime.bindings[101]).toBe(ids[0]); expect(graph.runtime.bindings[102]).toBe(ids[1]);
    expect(graph.runtime.bindings[104]).toBe(d.id);
    expect(graph.nodes.find((node) => node.id === ids[1])?.parentId).toBe(ids[0]);
    expect(graph.nodes.find((node) => node.id === ids[2])?.parentId).toBe(ids[1]);
  });

  it("persists native tab sorting so repeated URLs reconnect to their correct nodes", async () => {
    fake.tabs.get(2).url = originalTabs[0].url;
    fake.api.webNavigation.onCommitted.emit({ tabId: 2, frameId: 0, url: fake.tabs.get(2).url, transitionQualifiers: [] });
    await view(); await fake.api.tabs.move(2, { index: 0 }); await view();
    const slots = (fake.local[browserRestartKey] as any).slots;
    expect(slots.find((slot: any) => slot.nodeId === ids[1]).index).toBe(0);
    expect(slots.find((slot: any) => slot.nodeId === ids[0]).index).toBe(1);
    originalTabs = [...fake.tabs.values()]; const graph = await restart(); expectChain(graph);
    expect(graph.runtime.bindings[101]).toBe(ids[0]); expect(graph.runtime.bindings[102]).toBe(ids[1]);
  });

  it("retains original links when a known startup tab receives its URL after startup settles", async () => {
    const tabs = originalTabs.map((tab, index) => ({ ...tab, id: 101 + index, windowId: 88,
      url: index === 1 ? "chrome://newtab/" : tab.url }));
    await restart(tabs); await vi.advanceTimersByTimeAsync(3001); await view();
    const checkpoint = (fake.local[browserRestartKey] as any).graph;
    expect(checkpoint.nodes.find((node: any) => node.id === ids[2]).parentId).toBe(ids[1]);
    fake.tabs.get(102).url = originalTabs[1].url;
    fake.api.webNavigation.onCommitted.emit({ tabId: 102, frameId: 0, url: originalTabs[1].url, transitionQualifiers: [] });
    expectChain(await view());
  });
});
