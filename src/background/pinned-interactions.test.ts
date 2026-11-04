import { beforeEach, describe, expect, it, vi } from "vitest";
import { initializeTabMapManager } from "./manager";
import { createBrowser } from "../testing/browser-fixture";
import { emptyMapState, tabMapMessageType, type MapCommand, type MapView } from "../types/map";
import type { Browser } from "wxt/browser";

const persisted = vi.hoisted(() => ({ graph: {} as ReturnType<typeof emptyMapState> }));
vi.mock("../storage/graph", () => ({
  readTabMap: async () => structuredClone(persisted.graph),
  saveTabMap: async (state: ReturnType<typeof emptyMapState>) => { persisted.graph = structuredClone(state); },
}));

describe("pinned tab opening and explicit task creation", () => {
  let fake: ReturnType<typeof createBrowser>, manager: ReturnType<typeof initializeTabMapManager>;
  async function command(message: MapCommand) {
    return await manager.handleMessage({ type: tabMapMessageType, ...message },
      { url: "chrome-extension://map/tab-map.html" } as Browser.runtime.MessageSender) as { ok: boolean; view: MapView };
  }
  beforeEach(() => {
    persisted.graph = emptyMapState(); fake = createBrowser();
    vi.stubGlobal("browser", fake.api); manager = initializeTabMapManager();
  });

  it("preserves a paused workflow when opening an untracked pin and does not replace the last undo action", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0];
    await command({ action: "add", text: "child.example", parentId: root.id });
    await command({ action: "pause" });
    const before = (await command({ action: "get" })).view;
    fake.tabs.set(40, { id: 40, windowId: 10, pinned: true, url: "https://pin.example/", incognito: false });
    const result = await command({ action: "pinned", tabId: 40 });
    expect(result.ok).toBe(true);
    expect(result.view.nodes).toEqual(before.nodes);
    expect(result.view.sessions).toEqual(before.sessions);
    expect(result.view.recording).toBe(false);
    expect(result.view.runtime.bindings[40]).toBeUndefined();
    expect(result.view.runtime.activeNodeId).toBeNull();
    expect(fake.api.tabs.update).toHaveBeenCalledWith(40, { active: true });
    const undone = await command({ action: "undo" });
    expect(undone.view.nodes.map((node) => node.id)).toEqual([root.id]);
    expect(fake.tabs.has(40)).toBe(true);
  });

  it("only creates an independent unpinned task on the explicit plus action and undo keeps the source pin", async () => {
    fake.tabs.get(1).pinned = true;
    await command({ action: "pinned", tabId: 1 });
    const created = await command({ action: "pinned", tabId: 1, newTask: true });
    expect(created.view.nodes).toHaveLength(1);
    expect(created.view.nodes[0]).toMatchObject({ parentId: null, kind: "root" });
    expect(created.view.runtime.bindings[1]).toBeUndefined();
    expect(fake.api.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: "https://a.example/", active: true, windowId: 10 });
    expect(fake.tabs.get(2).pinned).not.toBe(true);
    await command({ action: "pinned", tabId: 1 });
    const undone = await command({ action: "undo" });
    expect(undone.view.nodes).toHaveLength(0);
    expect(fake.tabs.has(1)).toBe(true);
    expect(fake.tabs.has(2)).toBe(false);
  });

  it("does not adopt an untracked pin after activation, reload, or opening an outgoing link", async () => {
    await command({ action: "start", name: "需求" });
    fake.tabs.set(40, { id: 40, windowId: 10, pinned: true, url: "https://pin.example/", incognito: false });
    await command({ action: "pinned", tabId: 40 });
    fake.api.tabs.onUpdated.emit(40, { url: "https://pin.example/" }, fake.tabs.get(40));
    fake.api.webNavigation.onCommitted.emit({ tabId: 40, url: "https://pin.example/next", frameId: 0, transitionQualifiers: [] });
    const child = { id: 41, windowId: 10, url: "https://child.example/", incognito: false };
    fake.tabs.set(41, child); fake.api.tabs.onCreated.emit(child);
    fake.api.webNavigation.onCreatedNavigationTarget.emit({ sourceTabId: 40, tabId: 41, url: child.url });
    const result = await command({ action: "get" });
    expect(result.view.runtime.bindings[40]).toBeUndefined();
    expect(result.view.nodes.map((node) => node.url)).toEqual(["https://a.example/", child.url]);
    expect(result.view.nodes[1].parentId).toBeNull();
  });
});
