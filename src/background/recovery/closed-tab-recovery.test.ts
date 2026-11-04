import { beforeEach, describe, expect, it, vi } from "vitest";
import { initializeTabMapManager } from "../manager";
import { createBrowser } from "../../testing/browser-fixture";
import { emptyMapState, tabMapMessageType, type MapCommand, type MapView } from "../../types/map";
import { mapPositionPrefix } from "../../storage/positions";

const persisted = vi.hoisted(() => ({ graph: {} as ReturnType<typeof emptyMapState> }));
vi.mock("../../storage/graph", () => ({
  readTabMap: async () => structuredClone(persisted.graph),
  saveTabMap: async (state: ReturnType<typeof emptyMapState>) => { persisted.graph = structuredClone(state); },
}));

describe("native and workflow closed-tab recovery", () => {
  let fake: ReturnType<typeof createBrowser>, manager: ReturnType<typeof initializeTabMapManager>;
  let a: string, b: string, c: string;
  async function command(message: MapCommand) {
    return await manager.handleMessage({ type: tabMapMessageType, ...message },
      { url: "chrome-extension://map/tab-map.html?mode=window" }) as { ok: boolean; view: MapView };
  }
  const view = async () => (await command({ action: "get" })).view;
  function open(id: number, url: string) {
    fake.tabs.set(id, { id, windowId: 10, url, active: true, incognito: false });
    fake.api.tabs.onCreated.emit(fake.tabs.get(id));
  }
  async function restore(oldTabId: number, id = 9, lateSessionEvent = false) {
    const index = fake.closedSessions.findIndex((session) => session.tab.id === oldTabId);
    const saved = fake.closedSessions[index];
    if (!lateSessionEvent) fake.closedSessions.splice(index, 1);
    open(id, saved.tab.url); await view();
    if (lateSessionEvent) fake.closedSessions.splice(index, 1);
    fake.api.sessions.onChanged.emit();
    return view();
  }
  beforeEach(async () => {
    persisted.graph = emptyMapState(); fake = createBrowser(); vi.stubGlobal("browser", fake.api);
    manager = initializeTabMapManager();
    a = (await command({ action: "start", name: "A-B-C" })).view.nodes[0].id;
    b = (await command({ action: "add", text: "b.example", parentId: a })).view.nodes[1].id;
    c = (await command({ action: "add", text: "c.example", parentId: b })).view.nodes[2].id;
    await command({ action: "edit", nodeId: b, note: "原备注" });
    await command({ action: "positions", displayMode: "compact", direction: "vertical", items: [{ nodeId: b, position: { x: 101, y: 202 } }] });
  });

  it.each([false, true])("restores A-B-C, IDs, note and position with reordered Chrome events (%s)", async (late) => {
    await fake.api.tabs.remove(2);
    const closed = await view();
    expect(closed.nodes.map((node) => node.id)).toEqual([a, c]);
    expect(closed.nodes.find((node) => node.id === c)?.parentId).toBe(a);
    const restored = await restore(2, 9, late);
    expect(restored.nodes).toHaveLength(3);
    expect(restored.nodes.find((node) => node.id === b)).toMatchObject({ parentId: a, note: "原备注" });
    expect(restored.nodes.find((node) => node.id === c)?.parentId).toBe(b);
    expect(restored.runtime.bindings[9]).toBe(b);
    expect(restored.runtime.activeNodeId).toBe(b);
    expect(fake.local[mapPositionPrefix("compact", "vertical") + b]).toEqual({ x: 101, y: 202 });
  });

  it("lets workflow undo restore a tab closed from the Chrome tab bar", async () => {
    await fake.api.tabs.remove(2); await view();
    const restored = (await command({ action: "undo" })).view;
    expect(restored.nodes).toHaveLength(3);
    expect(restored.nodes.find((node) => node.id === b)?.parentId).toBe(a);
    expect(restored.nodes.find((node) => node.id === c)?.parentId).toBe(b);
    expect(Object.values(restored.runtime.bindings)).toContain(b);
  });

  it("does not mistake an ordinary same-URL tab for native session restoration", async () => {
    await fake.api.tabs.remove(2); await view();
    open(9, "https://b.example/");
    const graph = await view();
    expect(graph.nodes.some((node) => node.id === b)).toBe(false);
    expect(graph.nodes.find((node) => node.id === graph.runtime.bindings[9])?.parentId).toBeNull();
  });

  it("preserves a child's manual reassignment while its original parent was closed", async () => {
    await fake.api.tabs.remove(2); await view();
    const d = (await command({ action: "add", text: "d.example", parentId: null })).view.nodes.find((node) => node.url === "https://d.example/")!;
    await command({ action: "parent", nodeId: c, parentId: d.id });
    const graph = await restore(2);
    expect(graph.nodes.find((node) => node.id === c)?.parentId).toBe(d.id);
  });

  it("survives a service worker restart and still restores while recording is paused", async () => {
    await fake.api.tabs.remove(2); await view(); await command({ action: "pause" });
    const oldTabs = [...fake.tabs], oldStorage = structuredClone(fake.session), oldClosed = structuredClone(fake.closedSessions);
    fake = createBrowser(); fake.tabs.clear(); oldTabs.forEach(([id, tab]) => fake.tabs.set(id, tab));
    Object.assign(fake.session, oldStorage); fake.closedSessions.push(...oldClosed);
    vi.stubGlobal("browser", fake.api); manager = initializeTabMapManager(); await view();
    const graph = await restore(2);
    expect(graph.recording).toBe(false);
    expect(graph.nodes.find((node) => node.id === b)?.parentId).toBe(a);
    expect(graph.nodes.find((node) => node.id === c)?.parentId).toBe(b);
  });

  it("reconnects children restored before a branch's parent after canvas deletion", async () => {
    await command({ action: "delete", nodeId: b });
    expect((await view()).nodes).toHaveLength(1);
    await restore(3, 9);
    const graph = await restore(2, 10);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.nodes.find((node) => node.id === b)?.parentId).toBe(a);
    expect(graph.nodes.find((node) => node.id === c)?.parentId).toBe(b);
  });

  it("uses a root safely when the original parent no longer exists", async () => {
    await fake.api.tabs.remove(2); await view();
    await command({ action: "delete", nodeId: a });
    const graph = await restore(2);
    expect(graph.nodes.find((node) => node.id === b)?.parentId).toBeNull();
    expect(graph.nodes.some((node) => node.id === a)).toBe(false);
  });

  it("distinguishes closed nodes with the same URL by the consumed Chrome session", async () => {
    fake.tabs.get(3).url = "https://b.example/";
    fake.api.webNavigation.onCommitted.emit({ tabId: 3, frameId: 0, url: "https://b.example/", transitionQualifiers: [] });
    await view();
    await fake.api.tabs.remove(2); await view(); await fake.api.tabs.remove(3); await view();
    await restore(3, 9);
    const graph = await restore(2, 10);
    expect(graph.runtime.bindings[9]).toBe(c); expect(graph.runtime.bindings[10]).toBe(b);
    expect(graph.nodes.find((node) => node.id === c)?.parentId).toBe(b);
  });

  it("recognizes restoration when the new tab's URL arrives after its creation event", async () => {
    await fake.api.tabs.remove(2); await view(); fake.closedSessions.splice(0, 1);
    open(9, "chrome://newtab/"); await view();
    fake.tabs.get(9).url = "https://b.example/";
    fake.api.webNavigation.onCommitted.emit({ tabId: 9, frameId: 0, url: "https://b.example/", transitionQualifiers: [] });
    const graph = await view();
    expect(graph.nodes).toHaveLength(3); expect(graph.runtime.bindings[9]).toBe(b);
    expect(graph.nodes.find((node) => node.id === c)?.parentId).toBe(b);
  });
});
