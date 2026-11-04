import { beforeEach, describe, expect, it, vi } from "vitest";
import { initializeTabMapManager } from "./manager";
import { emptyMapState, tabMapMessageType, tabMapOverlayKey, tabMapRuntimeKey, type MapCommand, type MapRuntime, type MapView } from "../types/map";
import { createBrowser } from "../testing/browser-fixture";
import type { Browser } from "wxt/browser";

const persisted = vi.hoisted(() => ({ graph: {} as ReturnType<typeof emptyMapState> }));
vi.mock("../storage/graph", () => ({
  readTabMap: async () => structuredClone(persisted.graph),
  saveTabMap: async (state: ReturnType<typeof emptyMapState>) => { persisted.graph = structuredClone(state); },
}));


describe("tab map background lifecycle", () => {
  let fake: ReturnType<typeof createBrowser>;
  let manager: ReturnType<typeof initializeTabMapManager>;
  const extension: Browser.runtime.MessageSender = { url: "chrome-extension://map/tab-map.html" };
  async function command(message: MapCommand, sender = extension) {
    return await manager.handleMessage({ type: tabMapMessageType, ...message }, sender) as { ok: boolean; error?: string; view: MapView; restore?: unknown };
  }
  const view = async () => (await command({ action: "get" })).view;
  function navigate(tabId: number, url: string, qualifiers: string[] = []) {
    fake.tabs.set(tabId, { ...fake.tabs.get(tabId), url });
    fake.api.webNavigation.onCommitted.emit({ tabId, url, frameId: 0, transitionQualifiers: qualifiers });
  }
  function openTab(tabId: number, url = "https://search.example/", openerTabId?: number) {
    fake.tabs.set(tabId, { id: tabId, windowId: 10, active: true, incognito: false, url: "chrome://newtab/", openerTabId });
    fake.api.tabs.onCreated.emit(fake.tabs.get(tabId));
    navigate(tabId, url);
  }
  const content = (tabId: number) => ({ tab: fake.tabs.get(tabId), frameId: 0, url: fake.tabs.get(tabId).url });
  const paste = (tabId: number, text = "image editor") => command({ action: "paste", text, url: fake.tabs.get(tabId).url }, content(tabId));
  const step = (tabId: number) => command({ action: "step", url: fake.tabs.get(tabId).url }, content(tabId));
  const copy = () => command({ action: "copy", text: "image editor", url: fake.tabs.get(1).url }, content(1));
  beforeEach(() => {
    persisted.graph = emptyMapState(); fake = createBrowser();
    vi.stubGlobal("browser", fake.api); manager = initializeTabMapManager();
  });

  it("creates a positioned root from an empty canvas and keeps it independent after later paste", async () => {
    const result = await command({ action: "new-tab", parentId: null,
      placement: { x: 120, y: -44, displayMode: "compact", direction: "vertical" } });
    expect(result.ok).toBe(true);
    const root = result.view.nodes[0], tabId = Number(Object.keys(result.view.runtime.bindings)[0]);
    expect(root).toMatchObject({ parentId: null, url: "chrome://newtab/" });
    expect(result.view.runtime.activeNodeId).toBe(root.id);
    expect(fake.local[`tab-flow-map-position.v1:compact:vertical:${root.id}`]).toEqual({ x: 120, y: -44 });
    navigate(tabId, "https://www.google.com/search?q=image+editor");
    await paste(tabId);
    expect((await view()).nodes.find((node) => node.id === root.id)?.parentId).toBeNull();
  });

  it("opens pasted words as an explicit child and rejects invalid placement without creating tabs", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0];
    const result = await command({ action: "add", parentId: root.id, text: "image editor" });
    expect(result.ok).toBe(true);
    expect(result.view.nodes.find((node) => node.id === result.view.runtime.activeNodeId)).toMatchObject({ parentId: root.id, keyword: "image editor" });
    const before = fake.api.tabs.create.mock.calls.length;
    await manager.handleMessage({ type: tabMapMessageType, action: "new-tab", parentId: null,
      placement: { x: Infinity, y: 0, displayMode: "compact", direction: "vertical" } }, extension);
    expect(fake.api.tabs.create).toHaveBeenCalledTimes(before);
  });

  it("keeps one stable node when the same tab navigates, returns and changes its URL while paused", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0];
    navigate(1, "https://b.example/"); navigate(1, "https://c.example/");
    let graph = await view();
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({ id: root.id, url: "https://c.example/", parentId: null });
    navigate(1, "https://b.example/", ["forward_back"]);
    await command({ action: "pause" }); navigate(1, "https://d.example/");
    graph = await view();
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({ id: root.id, url: "https://d.example/" });
    expect(graph.runtime.histories[1]).toEqual({ nodeIds: [root.id], index: 0 });
  });
  it("freezes a new tab's source before the opener navigates again", async () => {
    await command({ action: "start", name: "需求" });
    fake.tabs.set(2, { id: 2, url: "about:blank", windowId: 10, active: false, incognito: false });
    fake.api.tabs.onCreated.emit({ ...fake.tabs.get(2), openerTabId: 1 });
    fake.api.webNavigation.onCreatedNavigationTarget.emit({ sourceTabId: 1, tabId: 2, url: "about:blank" });
    navigate(1, "https://a.example/next"); navigate(2, "https://b.example/");
    const graph = await view();
    expect(graph.nodes.find((node) => node.url === "https://b.example/")?.parentId).toBe(graph.nodes[0].id);
  });
  it("uses the returning tab's own history when another branch visited the same URL", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0];
    navigate(1, "https://b.example/");
    fake.tabs.set(2, { id: 2, windowId: 10, active: false, incognito: false });
    navigate(2, "https://a.example/");
    navigate(1, "https://a.example/", ["forward_back"]);
    expect((await view()).runtime.bindings[1]).toBe(root.id);
  });
  it("keeps anchor jumps on the same page and can still close the corresponding tab", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0];
    fake.tabs.get(1).url = "https://a.example/#discussion";
    fake.api.webNavigation.onReferenceFragmentUpdated.emit({ tabId: 1, frameId: 0, url: "https://a.example/#discussion" });
    const graph = await view();
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].title).toBe("A");
    await command({ action: "close", nodeId: root.id });
    expect(fake.api.tabs.remove).toHaveBeenCalledWith(1);
  });
  it("keeps durable nodes across worker and browser restarts without reusing stale tab IDs", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0];
    await command({ action: "edit", nodeId: root.id, note: "继续看评论" });
    const saved = structuredClone(fake.session);
    fake = createBrowser(); Object.assign(fake.session, saved); vi.stubGlobal("browser", fake.api);
    manager = initializeTabMapManager();
    expect((await view()).runtime.bindings[1]).toBe(root.id);
    fake = createBrowser();
    fake.tabs.set(9, { ...fake.tabs.get(1), id: 9 });
    fake.tabs.get(1).url = "https://unrelated.example/";
    vi.stubGlobal("browser", fake.api); manager = initializeTabMapManager();
    const restarted = await view();
    expect(restarted.nodes[0].note).toBe("继续看评论");
    expect(restarted.runtime.bindings).toEqual({ 9: root.id });
  });
  it("does not overwrite an imported map while its database is suspended", async () => {
    await command({ action: "start", name: "需求" });
    await command({ action: "suspend" });
    expect((await command({ action: "start", name: "不应覆盖导入" })).ok).toBe(false);
    persisted.graph = emptyMapState();
    navigate(1, "https://b.example/");
    await view();
    expect(persisted.graph.nodes).toHaveLength(0);
    await command({ action: "reload" });
    expect((await view()).nodes).toHaveLength(0);
  });
  it("closes and removes a child once, including when a delayed close event arrives", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0];
    await command({ action: "add", text: "b.example", parentId: root.id });
    const child = (await view()).nodes[1];
    await command({ action: "close", nodeId: child.id });
    const graph = await view();
    expect(graph.nodes.map((node) => node.id)).toEqual([root.id]);
    expect(Object.values(graph.runtime.bindings)).not.toContain(child.id);
    expect(fake.tabs.has(2)).toBe(false);
    expect((await command({ action: "focus", nodeId: child.id })).ok).toBe(false);
  });
  it("opens a native blank tab without a draft node and records its chosen source on the first visit while paused", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0];
    await copy();
    await command({ action: "pause" });
    await command({ action: "new-tab", parentId: root.id });
    let graph = await view();
    expect(fake.api.tabs.create).toHaveBeenCalledWith({ active: true, windowId: 10, openerTabId: 1 });
    expect(fake.tabs.get(2).url).toBe("chrome://newtab/");
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[1]).toMatchObject({ url: "chrome://newtab/", title: "新标签页", parentId: root.id });
    expect(graph.runtime.bindings[2]).toBe(graph.nodes[1].id);
    expect(graph.runtime.pasteWindows[2]).toBeUndefined();
    navigate(1, "https://a.example/changed");
    navigate(2, "https://new.example/");
    graph = await view();
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[1].parentId).toBe(root.id);
    expect(graph.runtime.pendingParents[2]).toBeUndefined();
    expect(graph.recording).toBe(false);
  });
  it.each([false, true])("keeps plus-created tabs under the chosen node with or without copying from another task (%s)", async (copied) => {
    const a = (await command({ action: "start", name: "需求" })).view.nodes[0];
    await command({ action: "add", text: "https://b.example/", parentId: null });
    const b = (await view()).nodes[1];
    if (copied) await command({ action: "copy", text: "image editor", url: fake.tabs.get(2).url }, content(2));
    fake.api.tabs.create.mockImplementationOnce(async (options: any) => {
      const tab = { ...options, id: 3, windowId: 10, url: "", pendingUrl: "chrome://newtab/", incognito: false };
      fake.tabs.set(3, tab); fake.api.tabs.onCreated.emit(tab);
      return tab;
    });
    await command({ action: "new-tab", parentId: a.id });
    const child = (await view()).nodes[2];
    expect(child).toMatchObject({ parentId: a.id, kind: "manual", url: "chrome://newtab/" });
    expect((await view()).runtime.fixedSources[3]).toBe(child.id);
    expect((await view()).runtime.pasteWindows[3]).toBeUndefined();
    navigate(3, "https://direct.example/"); await step(3); await step(3); await paste(3);
    expect((await view()).nodes[2]).toMatchObject({ id: child.id, parentId: a.id, kind: "manual" });
    // Even stale automatic-lineage state restored by a worker must respect the explicit source.
    const savedTabs = [...fake.tabs.entries()], savedRuntime = structuredClone(fake.session);
    (savedRuntime[tabMapRuntimeKey] as MapRuntime).pasteWindows[3] = { steps: 0, rootId: child.id,
      source: { nodeId: b.id, text: "image editor", at: Date.now() } };
    fake = createBrowser(); fake.tabs.clear(); savedTabs.forEach(([id, tab]) => fake.tabs.set(id, tab));
    Object.assign(fake.session, savedRuntime); vi.stubGlobal("browser", fake.api); manager = initializeTabMapManager();
    await paste(3);
    fake.api.webNavigation.onCreatedNavigationTarget.emit({ sourceTabId: 2, tabId: 3, url: fake.tabs.get(3).url });
    const result = await view();
    expect(result.nodes[2]).toMatchObject({ id: child.id, parentId: a.id, kind: "manual" });
    expect(result.runtime.pasteWindows[3]).toBeUndefined();
  });
  it("switches tabs from the independent map without transferring window focus", async () => {
    const a = (await command({ action: "start", name: "需求" })).view.nodes[0];
    await command({ action: "focus", nodeId: a.id }, { url: "chrome-extension://map/tab-map.html?mode=window" });
    expect(fake.api.tabs.update).toHaveBeenCalledWith(1, { active: true });
    expect(fake.api.windows.update).not.toHaveBeenCalled();
    await command({ action: "focus", nodeId: a.id });
    expect(fake.api.windows.update).toHaveBeenCalledWith(10, { focused: true });
  });
  it("pins and unpins a live child without changing its lineage or creating another tab", async () => {
    const root = (await command({ action: "start", name: "固定" })).view.nodes[0];
    const before = (await command({ action: "add", text: "child.example", parentId: root.id })).view;
    const child = before.nodes[1];
    expect((await command({ action: "pin-node", nodeId: child.id, pinned: true })).ok).toBe(true);
    expect(fake.tabs.get(2).pinned).toBe(true);
    expect((await view()).nodes).toEqual(before.nodes);
    expect((await command({ action: "pin-node", nodeId: child.id, pinned: false })).ok).toBe(true);
    expect(fake.tabs.get(2).pinned).toBe(false);
    expect((await view()).nodes).toEqual(before.nodes);
    expect(fake.api.tabs.create).toHaveBeenCalledTimes(1);
    expect(fake.api.tabs.remove).not.toHaveBeenCalled();
  });
  it("unpins an untracked internal tab without closing it or starting a workflow", async () => {
    fake.tabs.set(2, { id: 2, windowId: 10, url: "chrome://extensions/", pinned: true, incognito: false });
    const result = await command({ action: "unpin", tabId: 2 });
    expect(result.ok).toBe(true);
    expect(fake.tabs.get(2).pinned).toBe(false);
    expect(result.view.sessions).toHaveLength(0);
    expect(fake.api.tabs.remove).not.toHaveBeenCalled();
    fake.api.tabs.update.mockRejectedValueOnce(new Error("无法取消固定"));
    expect((await command({ action: "unpin", tabId: 2 })).ok).toBe(false);
  });
  it("rejects pinning stale or private bindings and unpinning private or closed tabs", async () => {
    const root = (await command({ action: "start", name: "固定" })).view.nodes[0];
    Object.assign(fake.tabs.get(1), { url: "https://changed.example/" });
    expect((await command({ action: "pin-node", nodeId: root.id, pinned: true })).ok).toBe(false);
    Object.assign(fake.tabs.get(1), { url: root.url, incognito: true });
    expect((await command({ action: "pin-node", nodeId: root.id, pinned: true })).ok).toBe(false);
    expect((await command({ action: "unpin", tabId: 1 })).ok).toBe(false);
    fake.tabs.delete(1);
    expect((await command({ action: "unpin", tabId: 1 })).ok).toBe(false);
    expect(fake.api.tabs.update).not.toHaveBeenCalled();
  });

  it("closes an untracked pinned internal tab without starting a workflow", async () => {
    fake.tabs.set(2, { id: 2, windowId: 10, url: "chrome://extensions/", pinned: true, incognito: false });
    expect((await command({ action: "delete-pinned", tabId: 2 })).ok).toBe(true);
    expect(fake.tabs.has(2)).toBe(false);
    expect((await view()).sessions).toHaveLength(0);
    expect((await command({ action: "delete-pinned", tabId: 2 })).ok).toBe(true);
  });
  it("deletes a pinned branch in its original workflow without switching the current workflow", async () => {
    const root = (await command({ action: "start", name: "固定任务" })).view.nodes[0];
    fake.tabs.get(1).pinned = true;
    await command({ action: "add", text: "child.example", parentId: root.id });
    fake.tabs.forEach((tab) => { tab.active = false; });
    fake.tabs.set(3, { id: 3, windowId: 10, url: "https://other.example/", active: true, incognito: false });
    const current = (await command({ action: "start", name: "当前任务" })).view;
    const result = await command({ action: "delete-pinned", tabId: 1 });
    expect(result.ok).toBe(true);
    expect(result.view.sessionId).toBe(current.sessionId);
    expect(result.view.nodes.map((node) => node.url)).toEqual(["https://other.example/"]);
    expect(fake.api.tabs.remove.mock.calls.map(([id]) => id)).toEqual([2, 1]);
    expect([...fake.tabs.keys()]).toEqual([3]);
  });
  it("retains the fixed root and its child when closing the child fails, then retries", async () => {
    const root = (await command({ action: "start", name: "固定任务" })).view.nodes[0];
    fake.tabs.get(1).pinned = true;
    await command({ action: "add", text: "child.example", parentId: root.id });
    fake.api.tabs.remove.mockRejectedValueOnce(new Error("无法关闭子标签"));
    const failed = await command({ action: "delete-pinned", tabId: 1 });
    expect(failed.ok).toBe(false);
    expect(failed.view.nodes).toHaveLength(2);
    expect(fake.tabs.has(1)).toBe(true);
    expect((await command({ action: "delete-pinned", tabId: 1 })).ok).toBe(true);
    expect((await view()).nodes).toHaveLength(0);
  });
  it("keeps an untracked pin visible when Chrome rejects closure", async () => {
    fake.tabs.get(1).pinned = true;
    fake.api.tabs.remove.mockRejectedValueOnce(new Error("无法关闭"));
    expect((await command({ action: "delete-pinned", tabId: 1 })).ok).toBe(false);
    expect(fake.tabs.has(1)).toBe(true);
  });
  it("rejects closing a pin that was unpinned or is private", async () => {
    expect((await command({ action: "delete-pinned", tabId: 1 })).ok).toBe(false);
    Object.assign(fake.tabs.get(1), { pinned: true, incognito: true });
    expect((await command({ action: "delete-pinned", tabId: 1 })).ok).toBe(false);
    expect(fake.api.tabs.remove).not.toHaveBeenCalled();
  });
  it("opens an existing pinned tab without creating a workflow or node", async () => {
    fake.tabs.set(2, { id: 2, windowId: 10, url: "https://pinned.example/", title: "固定页面", pinned: true, incognito: false });
    expect((await view()).nodes).toHaveLength(0);
    const first = await command({ action: "pinned", tabId: 2 });
    expect(first.view.nodes).toHaveLength(0);
    expect(first.view.sessions).toHaveLength(0);
    expect(first.view.recording).toBe(false);
    expect(first.view.canUndo).toBe(false);
    await command({ action: "pinned", tabId: 2 });
    expect((await view()).nodes).toHaveLength(0);
    expect(fake.api.tabs.create).not.toHaveBeenCalled();
    expect(fake.api.tabs.update).toHaveBeenCalledWith(2, { active: true });
  });
  it("opens a pinned child without promoting it or raising the map's browser window", async () => {
    await command({ action: "start", name: "需求" });
    await command({ action: "add", text: "https://child.example/", parentId: (await view()).nodes[0].id });
    const child = (await view()).nodes[1];
    await command({ action: "add", text: "https://grandchild.example/", parentId: child.id });
    fake.tabs.get(2).pinned = true;
    fake.api.windows.update.mockClear();
    const result = await command({ action: "pinned", tabId: 2 }, { url: "chrome-extension://map/tab-map.html?mode=window" });
    expect(result.view.nodes.find((node) => node.id === child.id)).toMatchObject({ parentId: child.parentId, kind: child.kind });
    expect(result.view.runtime.activeNodeId).toBe(child.id);
    expect(result.view.nodes[2].parentId).toBe(child.id);
    expect(result.view.nodes).toHaveLength(3);
    expect(fake.api.windows.update).not.toHaveBeenCalled();
  });
  it("creates an unpinned independent copy at the drop position and protects it from late source inference", async () => {
    const source = (await command({ action: "start", name: "需求" })).view.nodes[0];
    fake.tabs.get(1).pinned = true;
    const result = await command({ action: "pinned", tabId: 1, newTask: true,
      placement: { x: 244, y: 122, displayMode: "compact", direction: "vertical" } });
    const root = result.view.nodes[1];
    expect(root).toMatchObject({ parentId: null, kind: "root", url: source.url });
    expect(fake.tabs.get(1).pinned).toBe(true);
    expect(fake.tabs.get(2).pinned).not.toBe(true);
    expect(fake.api.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: source.url, active: true, windowId: 10 });
    expect(fake.local[`tab-flow-map-position.v1:compact:vertical:${root.id}`]).toEqual({ x: 244, y: 122 });
    fake.api.webNavigation.onCreatedNavigationTarget.emit({ sourceTabId: 1, tabId: 2, url: source.url });
    expect((await view()).nodes.find((node) => node.id === root.id)?.parentId).toBeNull();
    expect((await view()).runtime.bindings[1]).toBe(source.id);
  });
  it("does not create a second copy when Chrome initially returns only a pending URL", async () => {
    fake.tabs.get(1).pinned = true;
    fake.api.tabs.create.mockImplementationOnce(async (options) => {
      const tab = { ...options, id: 30, url: "", pendingUrl: options.url, incognito: false };
      fake.tabs.set(30, tab); return tab;
    });
    const result = await command({ action: "pinned", tabId: 1, newTask: true });
    expect(result.ok).toBe(true);
    expect(result.view.nodes).toHaveLength(1);
    expect(result.view.runtime.bindings[30]).toBe(result.view.nodes[0].id);
    expect(fake.api.tabs.create).toHaveBeenCalledTimes(1);
  });
  it.each(["closed", "unpinned", "incognito"])("rejects a %s pinned target without creating a task", async (scenario) => {
    if (scenario === "closed") fake.tabs.delete(1);
    else Object.assign(fake.tabs.get(1), { pinned: scenario !== "unpinned", incognito: scenario === "incognito" });
    expect((await command({ action: "pinned", tabId: 1 })).ok).toBe(false);
    expect((await view()).nodes).toHaveLength(0);
    expect(fake.api.tabs.create).not.toHaveBeenCalled();
  });
  it("opens a pinned internal browser page while rejecting a workflow copy of it", async () => {
    Object.assign(fake.tabs.get(1), { pinned: true, url: "chrome://extensions/" });
    expect((await command({ action: "pinned", tabId: 1 })).ok).toBe(true);
    expect(fake.api.tabs.update).toHaveBeenCalledWith(1, { active: true });
    expect((await command({ action: "pinned", tabId: 1, newTask: true })).ok).toBe(false);
    expect((await view()).nodes).toHaveLength(0);
  });
  it("deletes the selected node and its entire branch, and can retry an already deleted node", async () => {
    const a = (await command({ action: "start", name: "需求" })).view.nodes[0];
    await command({ action: "add", text: "https://b.example/", parentId: a.id });
    const b = (await view()).nodes[1];
    await command({ action: "add", text: "https://c.example/", parentId: b.id });
    const c = (await view()).nodes[2];
    expect((await command({ action: "delete", nodeId: b.id })).ok).toBe(true);
    let graph = await view();
    expect(fake.tabs.has(2)).toBe(false);
    expect(fake.tabs.has(1)).toBe(true);
    expect(fake.tabs.has(3)).toBe(false);
    expect(graph.nodes.map((node) => node.id)).toEqual([a.id]);
    expect(graph.runtime.bindings[2]).toBeUndefined();
    expect(graph.runtime.histories[2]).toBeUndefined();
    expect(fake.api.storage.local.remove).toHaveBeenCalledWith(expect.arrayContaining([
      `tab-flow-map-position.v1:${c.id}`, `tab-flow-map-position.v1:compact:${c.id}`,
      `tab-flow-map-position.v1:${b.id}`, `tab-flow-map-position.v1:compact:${b.id}`,
      `tab-flow-map-position.v1:compact:vertical:${c.id}`, `tab-flow-map-position.v1:vertical:${b.id}`,
    ]));
    await command({ action: "delete", nodeId: b.id });
    expect(fake.api.tabs.remove).toHaveBeenCalledTimes(2);
    await command({ action: "delete", nodeId: a.id });
    graph = await view();
    expect(graph.nodes).toHaveLength(0);
    await command({ action: "close", nodeId: c.id });
    await command({ action: "delete", nodeId: c.id });
    manager = initializeTabMapManager();
    expect((await view()).nodes).toHaveLength(0);
  });
  it("deletes the live tab after navigation and removes stale copy and history references", async () => {
    const a = (await command({ action: "start", name: "需求" })).view.nodes[0];
    await copy();
    openTab(2, "https://separate.example/");
    await command({ action: "new-tab", parentId: a.id });
    navigate(1, "https://b.example/");
    const b = (await view()).nodes.find((node) => node.url === "https://b.example/")!;
    await command({ action: "delete", nodeId: a.id });
    const graph = await view();
    expect(b.id).toBe(a.id);
    expect(fake.api.tabs.remove).toHaveBeenCalledWith(1);
    expect(graph.runtime.bindings[1]).toBeUndefined();
    expect(graph.runtime.histories[1]).toBeUndefined();
    expect(graph.runtime.pasteWindows[2]).toBeUndefined();
    expect(graph.runtime.copies).toHaveLength(0);
    expect(graph.runtime.pendingParents[3]).toBeUndefined();
    expect(graph.nodes.find((node) => node.id === b.id)).toBeUndefined();
  });
  it("keeps the node if closing its corresponding tab fails, so deletion can be retried", async () => {
    const a = (await command({ action: "start", name: "需求" })).view.nodes[0];
    fake.api.tabs.remove.mockRejectedValueOnce(new Error("暂时无法关闭"));
    expect((await command({ action: "delete", nodeId: a.id })).ok).toBe(false);
    expect((await view()).nodes[0].id).toBe(a.id);
    expect(fake.tabs.has(1)).toBe(true);
    expect((await command({ action: "delete", nodeId: a.id })).ok).toBe(true);
    expect((await view()).nodes).toHaveLength(0);
  });
  it("keeps a blank tab's source across tab replacement and worker restart, and cleans up unused tabs", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0];
    await command({ action: "new-tab", parentId: root.id });
    fake.tabs.set(9, { ...fake.tabs.get(2), id: 9 });
    fake.tabs.delete(2);
    fake.api.tabs.onReplaced.emit(9, 2);
    expect((await view()).nodes[1].parentId).toBe(root.id);
    expect((await view()).runtime.bindings[9]).toBe((await view()).nodes[1].id);
    manager = initializeTabMapManager();
    expect((await view()).nodes[1].parentId).toBe(root.id);
    expect((await view()).runtime.bindings[9]).toBe((await view()).nodes[1].id);
    navigate(9, "https://new.example/");
    expect((await view()).nodes[1].parentId).toBe(root.id);
    await command({ action: "new-tab", parentId: root.id });
    await fake.api.tabs.remove(10);
    expect((await view()).runtime.pendingParents[10]).toBeUndefined();
    expect((await view()).nodes).toHaveLength(2);
    expect((await command({ action: "new-tab", parentId: "missing" })).ok).toBe(false);
    expect(fake.api.tabs.create).toHaveBeenCalledTimes(2);
  });
  it("preserves the new page as the next parent after extension-created tabs settle", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0];
    await command({ action: "add", text: "https://b.example/", parentId: root.id });
    const child = (await view()).nodes[1];
    const tabId = Number(Object.entries((await view()).runtime.bindings).find(([, id]) => id === child.id)![0]);
    navigate(tabId, "https://c.example/");
    const updated = (await view()).nodes[1];
    expect(updated).toMatchObject({ id: child.id, parentId: root.id, url: "https://c.example/" });
    expect((await view()).nodes).toHaveLength(2);
  });
  it("attaches an independent root with its branch, replaces its parent, and persists without cycles", async () => {
    const a = (await command({ action: "start", name: "需求" })).view.nodes[0];
    openTab(2, "https://b.example/");
    await command({ action: "add", text: "https://c.example/", parentId: (await view()).nodes[1].id });
    const graph = await view();
    const b = graph.nodes[1], c = graph.nodes[2];
    expect(b.parentId).toBeNull();
    await command({ action: "parent", nodeId: b.id, parentId: a.id });
    expect(persisted.graph.nodes.find((node) => node.id === b.id)?.parentId).toBe(a.id);
    expect(persisted.graph.nodes.find((node) => node.id === c.id)?.parentId).toBe(b.id);
    expect((await command({ action: "parent", nodeId: a.id, parentId: c.id })).ok).toBe(false);
    expect((await view()).nodes.find((node) => node.id === a.id)?.parentId).toBeNull();
    openTab(4, "https://d.example/");
    const d = (await view()).nodes[3];
    await command({ action: "parent", nodeId: b.id, parentId: d.id });
    manager = initializeTabMapManager();
    const restored = await view();
    expect(restored.nodes).toHaveLength(4);
    expect(restored.nodes.find((node) => node.id === b.id)?.parentId).toBe(d.id);
    expect(restored.nodes.find((node) => node.id === c.id)?.parentId).toBe(b.id);
  });
  it("connects an actual matching paste on the third action and rejects untrusted commands", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0];
    const sender = { tab: fake.tabs.get(1), frameId: 0, url: "https://a.example/" };
    await command({ action: "copy", text: "image editor", url: "https://a.example/" }, sender);
    openTab(2);
    await step(2);
    await paste(2);
    const copied = (await view()).nodes[1];
    expect(copied.parentId).toBe(root.id); expect(copied.pendingSource).toBe(false);
    expect(copied.kind).toBe("copied");
    expect((await view()).runtime.pasteWindows[2]).toBeUndefined();
    expect((await command({ action: "close", nodeId: root.id }, sender)).ok).toBe(false);
    expect(fake.api.tabs.remove).not.toHaveBeenCalled();
  });
  it("keeps a manually reparented root when a later paste occurs after navigation", async () => {
    await command({ action: "start", name: "需求" });
    await copy();
    openTab(2, "https://b.example/");
    navigate(2, "https://c.example/");
    openTab(3, "https://d.example/");
    const graph = await view();
    const b = graph.nodes[1], d = graph.nodes[2];
    await command({ action: "parent", nodeId: b.id, parentId: d.id });
    await paste(2);
    const result = await view();
    expect(result.nodes.find((node) => node.id === b.id)?.parentId).toBe(d.id);
    expect(result.nodes.find((node) => node.id === b.id)?.url).toBe("https://c.example/");
    expect(result.runtime.pasteWindows[2]).toBeUndefined();
  });
  it("records a manually opened tab as a root even after exploring a child", async () => {
    await command({ action: "start", name: "需求" });
    navigate(1, "https://b.example/");
    fake.tabs.set(2, { id: 2, windowId: 10, active: true, incognito: false, url: "chrome://newtab/" });
    fake.api.tabs.onCreated.emit(fake.tabs.get(2));
    navigate(2, "https://independent.example/");
    const root = (await view()).nodes[1];
    expect(root.parentId).toBeNull();
    expect(root.kind).toBe("root");
  });
  it("does not guess paste from equal search queries but allows repeated actual pastes", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0];
    const sender = { tab: fake.tabs.get(1), frameId: 0, url: "https://a.example/" };
    await command({ action: "copy", text: "image editor", url: sender.url }, sender);
    openTab(2, "https://www.google.com/search?q=image+editor");
    expect((await view()).nodes[1].parentId).toBeNull();
    await paste(2);
    expect((await view()).nodes[1].parentId).toBe(root.id);
    openTab(3, "https://www.google.com/search?q=image+editor");
    expect((await view()).nodes[2].parentId).toBeNull();
    await paste(3);
    expect((await view()).nodes[2].parentId).toBe(root.id);
  });
  it("keeps a fourth-action paste independent, including when a new tab carries an opener ID", async () => {
    await command({ action: "start", name: "需求" }); await copy();
    openTab(2, "https://search.example/", 1);
    await step(2); await step(2); await paste(2);
    const graph = await view();
    expect(graph.nodes[1].parentId).toBeNull();
    expect(graph.runtime.pasteWindows[2]).toBeUndefined();
  });
  it("keeps a direct external-style tab independent even if Chrome supplies the active tab as opener", async () => {
    await command({ action: "start", name: "需求" }); await copy();
    const tab = { id: 2, windowId: 10, active: true, incognito: false, openerTabId: 1, url: "https://external.example/" };
    fake.tabs.set(2, tab); fake.api.tabs.onCreated.emit(tab);
    navigate(2, tab.url);
    const child = (await view()).nodes[1];
    expect(child).toMatchObject({ parentId: null, kind: "root" });
  });
  it("associates matching searches and URLs initiated from the native address bar", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0]; await copy();
    openTab(2, "https://www.google.com/search?q=image+editor", 1);
    navigate(2, "https://www.google.com/search?q=image+editor", ["from_address_bar"]);
    expect((await view()).nodes[1]).toMatchObject({ parentId: root.id, kind: "copied" });
    await command({ action: "copy", text: "https://destination.example/path", url: fake.tabs.get(1).url }, content(1));
    openTab(3, "https://destination.example/path");
    navigate(3, "https://destination.example/path", ["from_address_bar"]);
    expect((await view()).nodes[2]).toMatchObject({ parentId: root.id, kind: "copied" });
  });
  it("keeps mismatching and fourth-action address-bar searches independent", async () => {
    await command({ action: "start", name: "需求" }); await copy();
    openTab(2); navigate(2, "https://www.google.com/search?q=other", ["from_address_bar"]);
    expect((await view()).nodes[1].parentId).toBeNull();
    openTab(3); await step(3); await step(3);
    navigate(3, "https://www.google.com/search?q=image+editor", ["from_address_bar"]);
    expect((await view()).nodes[2].parentId).toBeNull();
  });
  it("preserves the source through an extension replacing the native new-tab page", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0]; await copy();
    openTab(2, "chrome-extension://new-tab/newtab.html");
    expect((await view()).runtime.pasteWindows[2]).toMatchObject({ steps: 0, source: { nodeId: root.id } });
    navigate(2, "https://www.google.com/"); await step(2); await paste(2);
    expect((await view()).nodes[1]).toMatchObject({ parentId: root.id, kind: "copied" });
  });
  it("preserves a pending source when the worker restarts on a replaced new-tab page", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0]; await copy();
    openTab(2, "chrome://newtab/"); await view();
    fake.tabs.get(2).url = "chrome-extension://new-tab/newtab.html";
    manager = initializeTabMapManager();
    expect((await view()).runtime.pasteWindows[2].source?.nodeId).toBe(root.id);
    navigate(2, "https://www.google.com/search?q=image+editor", ["from_address_bar"]);
    expect((await view()).nodes[1]).toMatchObject({ parentId: root.id, kind: "copied" });
  });
  it("counts a committed visit once when URL update notifications and redirects arrive first", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0]; await copy();
    const tab = { id: 2, windowId: 10, active: true, incognito: false, url: "chrome://newtab/" };
    fake.tabs.set(2, tab); fake.api.tabs.onCreated.emit(tab);
    for (const url of ["https://google.example/", "https://www.google.example/", "https://www.google.example/?redirect=1"]) {
      tab.url = url; fake.api.tabs.onUpdated.emit(2, { url }, tab);
    }
    navigate(2, tab.url, ["server_redirect"]);
    expect((await view()).runtime.pasteWindows[2].steps).toBe(1);
    await step(2); await paste(2);
    expect((await view()).nodes[1]).toMatchObject({ parentId: root.id, kind: "copied" });
  });
  it("does not count automatic history updates as extra user actions before pasting", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0]; await copy(); openTab(2);
    for (const url of ["https://search.example/?state=1", "https://search.example/?state=2"]) {
      fake.tabs.get(2).url = url;
      fake.api.webNavigation.onHistoryStateUpdated.emit({ tabId: 2, url, frameId: 0 });
    }
    expect((await view()).runtime.pasteWindows[2].steps).toBe(1);
    await step(2); await paste(2);
    expect((await view()).nodes[1].parentId).toBe(root.id);
  });
  it("does not discard a paste window for a source event from an unsupported browser page", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0]; await copy(); openTab(2);
    fake.tabs.set(9, { id: 9, windowId: 10, url: "chrome://extensions/", incognito: false });
    fake.api.webNavigation.onCreatedNavigationTarget.emit({ sourceTabId: 9, tabId: 2, url: "https://search.example/" });
    await paste(2);
    expect((await view()).nodes.find((node) => node.id !== root.id)?.parentId).toBe(root.id);
  });
  it("does not associate a different pasted word", async () => {
    await command({ action: "start", name: "需求" }); await copy(); openTab(2);
    await paste(2, "unrelated word");
    expect((await view()).nodes[1].parentId).toBeNull();
  });
  it("attaches the same live node after navigation inside the three-step window", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0];
    await copy(); openTab(2); navigate(2, "https://search.example/next"); await paste(2);
    const graph = await view();
    expect(graph.nodes[1].parentId).toBe(root.id);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[1].url).toBe("https://search.example/next");
  });
  it("preserves a pending paste window and its action count across worker restarts", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0];
    await copy(); openTab(2); await step(2);
    const savedTabs = [...fake.tabs.entries()], savedRuntime = structuredClone(fake.session);
    fake = createBrowser(); fake.tabs.clear(); savedTabs.forEach(([id, tab]) => fake.tabs.set(id, tab));
    Object.assign(fake.session, savedRuntime); vi.stubGlobal("browser", fake.api); manager = initializeTabMapManager();
    await paste(2);
    expect((await view()).nodes[1].parentId).toBe(root.id);
  });
  it("freezes the copy source when a tab opens and ignores later copies", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0];
    await copy(); openTab(2); navigate(1, "https://b.example/"); await copy(); await paste(2);
    expect((await view()).nodes[1].parentId).toBe(root.id);
    openTab(3); await paste(3);
    expect((await view()).nodes[2].parentId).toBe(root.id);
  });
  it("does not use a copy made after a new tab was already opened", async () => {
    await command({ action: "start", name: "需求" }); openTab(2); await copy(); await paste(2);
    expect((await view()).nodes[1].parentId).toBeNull();
  });
  it("clears pending paste lineage when recording pauses or a task is manually detached", async () => {
    await command({ action: "start", name: "需求" }); await copy(); openTab(2);
    const node = (await view()).nodes[1];
    await command({ action: "parent", nodeId: node.id, parentId: null }); await paste(2);
    expect((await view()).nodes[1].parentId).toBeNull();
    openTab(3); await command({ action: "pause" }); await paste(3);
    expect((await view()).nodes[2].parentId).toBeNull();
    expect((await view()).runtime.pasteWindows).toEqual({});
  });
  it("still connects real link tabs when the source event arrives after the navigation", async () => {
    const root = (await command({ action: "start", name: "需求" })).view.nodes[0];
    fake.tabs.set(2, { id: 2, windowId: 10, active: true, incognito: false });
    navigate(2, "https://b.example/");
    fake.api.webNavigation.onCreatedNavigationTarget.emit({ sourceTabId: 1, tabId: 2, url: "https://b.example/" });
    const child = (await view()).nodes[1];
    expect(child.parentId).toBe(root.id);
    expect(child.kind).toBe("link");
  });
  it("keeps an explicit new root independent of copied words and delayed source events", async () => {
    await command({ action: "start", name: "需求" });
    await command({ action: "copy", text: "image editor", url: "https://a.example/" },
      { tab: fake.tabs.get(1), frameId: 0, url: "https://a.example/" });
    await command({ action: "add", text: "image editor", parentId: null });
    fake.api.webNavigation.onCreatedNavigationTarget.emit({ sourceTabId: 1, tabId: 2, url: fake.tabs.get(2).url });
    const graph = await view();
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[1].parentId).toBeNull();
    expect(graph.nodes[1].kind).toBe("root");
  });
  it("detaches a branch into a new root without losing its descendants or accepting delayed sources", async () => {
    await command({ action: "start", name: "需求" });
    await command({ action: "add", text: "https://b.example/", parentId: (await view()).nodes[0].id });
    const branch = (await view()).nodes[1];
    await command({ action: "add", text: "https://c.example/", parentId: branch.id });
    await command({ action: "parent", nodeId: branch.id, parentId: null });
    fake.api.webNavigation.onCreatedNavigationTarget.emit({ sourceTabId: 3, tabId: 2, url: "https://b.example/" });
    const graph = await view();
    expect(graph.nodes[1].parentId).toBeNull();
    expect(graph.nodes[1].kind).toBe("root");
    expect(graph.nodes[2].parentId).toBe(branch.id);
  });
  it("does not record while paused and ignores subframes and private tabs", async () => {
    await command({ action: "start", name: "需求" });
    await command({ action: "pause" }); navigate(1, "https://b.example/");
    expect((await view()).nodes).toHaveLength(1);
    await command({ action: "resume" });
    const count = (await view()).nodes.length;
    fake.api.webNavigation.onCommitted.emit({ tabId: 1, url: "https://frame.example/", frameId: 5, transitionQualifiers: [] });
    fake.tabs.set(3, { id: 3, windowId: 10, incognito: true }); navigate(3, "https://private.example/");
    expect((await view()).nodes).toHaveLength(count);
  });
  it("synchronizes native tab-bar closure while paused and retains unclosed descendants", async () => {
    const a = (await command({ action: "start", name: "需求" })).view.nodes[0];
    await command({ action: "add", text: "https://b.example/", parentId: a.id });
    const b = (await view()).nodes[1];
    await command({ action: "add", text: "https://c.example/", parentId: b.id });
    await command({ action: "pause" });
    await fake.api.tabs.remove(2);
    const graph = await view();
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[1].parentId).toBe(a.id);
    expect(Object.keys(graph.runtime.bindings)).toHaveLength(2);
    expect(persisted.graph.nodes).toHaveLength(2);
  });
  it("batch deletes whole selected branches once and preserves sibling branches", async () => {
    const a = (await command({ action: "start", name: "需求" })).view.nodes[0];
    await command({ action: "add", text: "b.example", parentId: a.id });
    const b = (await view()).nodes[1];
    await command({ action: "add", text: "c.example", parentId: b.id });
    const c = (await view()).nodes[2];
    await command({ action: "add", text: "d.example", parentId: c.id });
    await command({ action: "add", text: "e.example", parentId: a.id });
    await command({ action: "delete-many", nodeIds: [c.id, b.id, b.id, "missing"] });
    const graph = await view();
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[1].parentId).toBe(a.id);
    expect([...fake.tabs.keys()]).toEqual([1, 5]);
    expect(fake.api.tabs.remove).toHaveBeenCalledTimes(3);
  });
  it("retains the ancestors of a failed child closure and allows retrying the same branch", async () => {
    const a = (await command({ action: "start", name: "需求" })).view.nodes[0];
    await command({ action: "add", text: "b.example", parentId: a.id });
    const b = (await view()).nodes[1];
    await command({ action: "add", text: "c.example", parentId: b.id });
    const c = (await view()).nodes[2];
    await command({ action: "add", text: "d.example", parentId: b.id });
    fake.api.tabs.remove.mockRejectedValueOnce(new Error("无法关闭子标签"));
    const failed = await command({ action: "delete", nodeId: a.id });
    expect(failed.ok).toBe(false);
    expect(failed.view.nodes.map((node) => [node.id, node.parentId])).toEqual([[a.id, null], [b.id, a.id], [c.id, b.id]]);
    expect([...fake.tabs.keys()]).toEqual([1, 2, 3]);
    expect(fake.api.tabs.remove.mock.calls.map(([id]) => id)).toEqual([3, 4]);
    expect((await command({ action: "delete", nodeId: a.id })).ok).toBe(true);
    expect((await view()).nodes).toHaveLength(0);
    expect(fake.tabs.size).toBe(0);
  });
  it("persists successful batch closures and keeps failed nodes for retry", async () => {
    const a = (await command({ action: "start", name: "需求" })).view.nodes[0];
    openTab(2); const b = (await view()).nodes[1];
    fake.api.tabs.remove.mockRejectedValueOnce(new Error("无法关闭"));
    const result = await command({ action: "delete-many", nodeIds: [a.id, b.id] });
    expect(result.ok).toBe(false);
    expect(result.view.nodes.map((node) => node.id)).toEqual([a.id]);
    expect(persisted.graph.nodes.map((node) => node.id)).toEqual([a.id]);
    expect([...fake.tabs.keys()]).toEqual([1]);
    expect((await command({ action: "delete-many", nodeIds: [a.id, b.id] })).ok).toBe(true);
    expect((await view()).nodes).toHaveLength(0);
  });
  it("clears only current-lineage tabs, pauses recording and keeps other tabs intact", async () => {
    const a = (await command({ action: "start", name: "第一条" })).view.nodes[0];
    const firstSession = (await view()).sessionId!;
    await command({ action: "pause" });
    fake.tabs.get(1).active = false;
    fake.tabs.set(2, { id: 2, windowId: 10, active: true, url: "https://b.example/", incognito: false });
    await command({ action: "start", name: "第二条" });
    await command({ action: "add", text: "c.example", parentId: null });
    fake.tabs.set(8, { id: 8, url: "https://untracked.example/", incognito: false });
    expect((await command({ action: "delete-many", nodeIds: [a.id] })).view.nodes).toHaveLength(3);
    const cleared = (await command({ action: "clear" })).view;
    expect(cleared.nodes.map((node) => node.id)).toEqual([a.id]);
    expect(cleared.recording).toBe(false);
    expect([...fake.tabs.keys()]).toEqual([1, 8]);
    await command({ action: "session", sessionId: firstSession });
    expect((await view()).nodes.map((node) => node.id)).toEqual([a.id]);
  });
  it("does not leave a transient blank node when a new tab becomes a map window", async () => {
    await command({ action: "start", name: "需求" }); await copy();
    openTab(2, "chrome-extension://map/tab-map.html");
    const graph = await view();
    expect(graph.nodes).toHaveLength(1);
    expect(graph.runtime.bindings[2]).toBeUndefined();
    expect(graph.runtime.pasteWindows[2]).toBeUndefined();
    expect(graph.runtime.histories[2]).toBeUndefined();
  });
  it("acquires a native blank tab when Chrome supplies its URL after the creation event", async () => {
    await command({ action: "start", name: "需求" });
    fake.tabs.set(2, { id: 2, windowId: 10, active: false, incognito: false });
    fake.api.tabs.onCreated.emit({ ...fake.tabs.get(2) });
    await view();
    fake.tabs.get(2).url = "chrome://newtab/";
    fake.api.tabs.onUpdated.emit(2, { url: "chrome://newtab/" }, fake.tabs.get(2));
    const graph = await view();
    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[1]).toMatchObject({ url: "chrome://newtab/", title: "新标签页", parentId: null });
    expect(graph.runtime.pasteWindows[2].rootId).toBe(graph.nodes[1].id);
  });
  it("prunes closed legacy nodes at startup and retains distinct tabs with the same URL", async () => {
    const a = (await command({ action: "start", name: "需求" })).view.nodes[0];
    openTab(2, a.url); await view();
    persisted.graph.nodes.push({ ...a, id: "legacy-closed", parentId: a.id });
    manager = initializeTabMapManager();
    const graph = await view();
    expect(graph.nodes).toHaveLength(2);
    expect(new Set(Object.values(graph.runtime.bindings)).size).toBe(2);
    expect(persisted.graph.nodes.some((node) => node.id === "legacy-closed")).toBe(false);
  });
  it("reuses the independent window and toggles the shared floating mode", async () => {
    await command({ action: "window" }); await command({ action: "window" });
    expect(fake.api.windows.create).toHaveBeenCalledTimes(1);
    expect(fake.local[tabMapOverlayKey]).toBe(false);
    await command({ action: "overlay" });
    expect(fake.local[tabMapOverlayKey]).toBe(true);
    expect(fake.api.windows.remove).toHaveBeenCalledWith(20);
  });
});
