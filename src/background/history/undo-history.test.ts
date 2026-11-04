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

describe("map action undo", () => {
  let fake: ReturnType<typeof createBrowser>, manager: ReturnType<typeof initializeTabMapManager>;
  const sender = { url: "chrome-extension://map/tab-map.html?mode=window" };
  async function command(message: MapCommand) {
    return await manager.handleMessage({ type: tabMapMessageType, ...message }, sender) as { ok: boolean; error?: string; view: MapView };
  }
  const view = async () => (await command({ action: "get" })).view;
  const start = async () => (await command({ action: "start", name: "撤销测试" })).view.nodes[0];
  const positions = (items: Array<{ nodeId: string; position: { x: number; y: number } | null }>) => command({ action: "positions", displayMode: "compact", direction: "vertical", items });
  const key = (id: string) => mapPositionPrefix("compact", "vertical") + id;
  beforeEach(() => { persisted.graph = emptyMapState(); fake = createBrowser(); vi.stubGlobal("browser", fake.api); manager = initializeTabMapManager(); });

  it("restores a deleted branch with its IDs, links, pins, notes and stored positions", async () => {
    const root = await start();
    const child = (await command({ action: "add", text: "child.example", parentId: root.id })).view.nodes[1];
    await command({ action: "edit", nodeId: child.id, note: "保留备注" });
    await command({ action: "pin-node", nodeId: child.id, pinned: true });
    await positions([{ nodeId: root.id, position: { x: 12, y: 34 } }, { nodeId: child.id, position: { x: 56, y: 78 } }]);
    const before = await view();
    await command({ action: "delete", nodeId: root.id });
    expect(fake.tabs.size).toBe(1);
    expect(fake.tabs.get(2)?.pinned).toBe(true);
    expect((await command({ action: "undo" })).ok).toBe(true);
    const restored = await view();
    expect(restored.nodes).toEqual(before.nodes);
    expect(fake.tabs.size).toBe(2);
    const childTab = Number(Object.entries(restored.runtime.bindings).find(([, id]) => id === child.id)![0]);
    expect(fake.tabs.get(childTab)).toMatchObject({ url: child.url, pinned: true });
    expect(restored.runtime.restores[childTab]).toBe(child.id);
    expect(fake.local[key(root.id)]).toEqual({ x: 12, y: 34 });
    expect(fake.local[key(child.id)]).toEqual({ x: 56, y: 78 });
  });
  it("undoes a group move in one step and removes positions that originally used automatic layout", async () => {
    const root = await start(), child = (await command({ action: "new-tab", parentId: root.id })).view.nodes[1];
    fake.local[key(root.id)] = { x: 10, y: 20 };
    await positions([{ nodeId: root.id, position: { x: 100, y: 200 } }, { nodeId: child.id, position: { x: 300, y: 400 } }]);
    await command({ action: "undo" });
    expect(fake.local[key(root.id)]).toEqual({ x: 10, y: 20 });
    expect(fake.local[key(child.id)]).toBeUndefined();
    expect((await view()).nodes).toHaveLength(2);
  });
  it("undoes reparenting without overwriting later navigation", async () => {
    const root = await start(), child = (await command({ action: "add", text: "child.example", parentId: root.id })).view.nodes[1];
    await command({ action: "parent", nodeId: child.id, parentId: null });
    fake.tabs.get(2).url = "https://later.example/";
    fake.api.webNavigation.onCommitted.emit({ tabId: 2, url: "https://later.example/", frameId: 0, transitionQualifiers: [] });
    await view();
    await command({ action: "undo" });
    expect((await view()).nodes.find((node) => node.id === child.id)).toMatchObject({ parentId: root.id, url: "https://later.example/" });
  });
  it("undoes pinning after restoring a deleted node onto its retained fixed tab", async () => {
    const root = await start(), child = (await command({ action: "add", text: "child.example", parentId: root.id })).view.nodes[1];
    await command({ action: "pin-node", nodeId: child.id, pinned: true });
    await command({ action: "delete", nodeId: child.id });
    await command({ action: "undo" });
    const tabId = Number(Object.entries((await view()).runtime.bindings).find(([, id]) => id === child.id)![0]);
    expect(tabId).toBe(2);
    await command({ action: "undo" });
    expect(fake.tabs.get(tabId).pinned).toBe(false);
    expect((await view()).nodes.find((node) => node.id === child.id)?.parentId).toBe(root.id);
  });
  it("undoes clear and restores recording, while undoing creation closes its whole branch", async () => {
    const root = await start();
    await command({ action: "new-tab", parentId: root.id });
    await command({ action: "clear" });
    expect((await view()).recording).toBe(false);
    await command({ action: "undo" });
    expect((await view()).recording).toBe(true);
    expect((await view()).nodes).toHaveLength(2);
    await command({ action: "undo" });
    expect((await view()).nodes.map((node) => node.id)).toEqual([root.id]);
    expect(fake.tabs.size).toBe(1);
  });
  it("restores an untracked pin without introducing an extra workflow node", async () => {
    const root = await start();
    fake.tabs.set(2, { id: 2, url: "https://pin.example/", pinned: true, windowId: 10, index: 1 });
    await command({ action: "delete-pinned", tabId: 2 });
    await command({ action: "undo" });
    expect((await view()).nodes.map((node) => node.id)).toEqual([root.id]);
    expect([...fake.tabs.values()].some((tab) => tab.url === "https://pin.example/" && tab.pinned)).toBe(true);
  });
  it.each(["delete", "close", "delete-many", "clear"] as const)("retains fixed tabs during canvas %s and reuses them on undo", async (action) => {
    const root = await start();
    fake.tabs.get(1).pinned = true;
    const child = (await command({ action: "add", text: "child.example", parentId: root.id })).view.nodes[1];
    const result = await command(action === "clear" ? { action } : action === "delete-many" ? { action, nodeIds: [root.id, child.id] } : { action, nodeId: root.id });
    expect(result.ok).toBe(true); expect(result.view.nodes).toHaveLength(0);
    expect([...fake.tabs.keys()]).toEqual([1]); expect(fake.tabs.get(1).pinned).toBe(true);
    expect(result.view.runtime.bindings[1]).toBeUndefined();
    // A delayed URL notification must not resurrect the deleted canvas root.
    fake.api.tabs.onUpdated.emit(1, { url: root.url }, fake.tabs.get(1));
    expect((await view()).nodes).toHaveLength(0);
    await command({ action: "undo" });
    expect((await view()).nodes).toEqual([root, child]);
    expect((await view()).runtime.bindings[1]).toBe(root.id);
    expect(fake.tabs.size).toBe(2); expect(fake.api.tabs.create).toHaveBeenCalledTimes(2);
  });
  it("closes an independent task created from a pin while retaining its source", async () => {
    fake.tabs.get(1).pinned = true;
    const root = (await command({ action: "pinned", tabId: 1, newTask: true })).view.nodes[0];
    await command({ action: "delete", nodeId: root.id });
    expect((await view()).nodes).toHaveLength(0);
    expect([...fake.tabs.keys()]).toEqual([1]); expect(fake.tabs.get(1).pinned).toBe(true);
  });
  it("still closes a pin explicitly and restores it with its branch on undo", async () => {
    const root = await start();
    fake.tabs.get(1).pinned = true;
    await command({ action: "new-tab", parentId: root.id });
    await command({ action: "delete-pinned", tabId: 1 });
    expect(fake.tabs.size).toBe(0);
    await command({ action: "undo" });
    expect((await view()).nodes).toHaveLength(2);
    expect([...fake.tabs.values()].filter((tab) => tab.pinned)).toHaveLength(1);
  });
  it("records partial deletion and permits retrying a failed restore without duplicating tabs", async () => {
    const root = await start(), child = (await command({ action: "new-tab", parentId: root.id })).view.nodes[1];
    fake.api.tabs.remove.mockImplementation(async (id) => { if (id === 1) throw new Error("关闭失败"); fake.tabs.delete(id); fake.api.tabs.onRemoved.emit(id); });
    expect((await command({ action: "delete", nodeId: root.id })).ok).toBe(false);
    fake.api.tabs.create.mockRejectedValueOnce(new Error("恢复失败")).mockRejectedValueOnce(new Error("恢复失败"));
    expect((await command({ action: "undo" })).ok).toBe(false);
    expect((await view()).canUndo).toBe(true);
    await command({ action: "undo" });
    expect((await view()).nodes.find((node) => node.id === child.id)?.parentId).toBe(root.id);
    expect(fake.tabs.size).toBe(2);
  });
  it("retries after restoring only part of a branch without reopening the successful tab twice", async () => {
    const root = await start(), child = (await command({ action: "new-tab", parentId: root.id })).view.nodes[1];
    await command({ action: "delete", nodeId: root.id });
    const create = fake.api.tabs.create.getMockImplementation()!;
    fake.api.tabs.create.mockImplementation(async (options) => { if (options.url === child.url) throw new Error("恢复子标签失败"); return create(options); });
    expect((await command({ action: "undo" })).ok).toBe(false);
    expect(fake.tabs.size).toBe(1);
    fake.api.tabs.create.mockImplementation(create);
    expect((await command({ action: "undo" })).ok).toBe(true);
    expect(fake.tabs.size).toBe(2);
    expect((await view()).nodes).toHaveLength(2);
  });
  it("does not undo another workflow or overwrite a tab opened after deletion", async () => {
    const root = await start(), sessionId = (await view()).sessionId!;
    await positions([{ nodeId: root.id, position: { x: 10, y: 20 } }]);
    fake.tabs.forEach((tab) => { tab.active = false; });
    fake.tabs.set(9, { id: 9, windowId: 10, active: true, url: "https://other.example/", index: 1 });
    const other = (await command({ action: "start", name: "另一个工作流" })).view.nodes.at(-1)!;
    expect((await view()).canUndo).toBe(false);
    await command({ action: "undo" });
    expect(fake.local[key(root.id)]).toEqual({ x: 10, y: 20 });
    await command({ action: "session", sessionId });
    await command({ action: "delete", nodeId: root.id });
    fake.tabs.set(10, { id: 10, windowId: 10, url: "https://later.example/", index: 2 });
    await command({ action: "undo" });
    expect(fake.tabs.has(10)).toBe(true);
    expect((await view()).nodes.some((node) => node.id === other.id)).toBe(true);
  });

  it("retains history after the extension service worker restarts", async () => {
    const root = await start(); await command({ action: "delete", nodeId: root.id });
    const old = fake; fake = createBrowser(); fake.tabs.clear();
    old.tabs.forEach((tab, id) => fake.tabs.set(id, structuredClone(tab)));
    Object.assign(fake.session, structuredClone(old.session)); Object.assign(fake.local, structuredClone(old.local));
    vi.stubGlobal("browser", fake.api); manager = initializeTabMapManager();
    expect((await view()).canUndo).toBe(true);
    await command({ action: "undo" });
    expect((await view()).nodes[0].id).toBe(root.id);
    expect(fake.tabs.size).toBe(1);
  });
  it("caps history at 50 actions and does not record no-op position updates", async () => {
    const root = await start();
    for (let i = 1; i <= 60; i++) await command({ action: "edit", nodeId: root.id, note: String(i) });
    for (let i = 0; i < 50; i++) await command({ action: "undo" });
    expect((await view()).nodes[0].note).toBe("10"); expect((await view()).canUndo).toBe(false);
    await positions([{ nodeId: root.id, position: null }]);
    expect((await view()).canUndo).toBe(false);
  });
});
