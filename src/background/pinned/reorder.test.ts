import { beforeEach, describe, expect, it, vi } from "vitest";
import { initializeTabMapManager } from "../manager";
import { createBrowser } from "../../testing/browser-fixture";
import { emptyMapState, isMapMessage, tabMapMessageType, type MapCommand, type MapView } from "../../types/map";

vi.mock("../../storage/graph", () => ({
  readTabMap: async () => emptyMapState(), saveTabMap: vi.fn(async () => undefined),
}));

describe("pinned tab order", () => {
  let fake: ReturnType<typeof createBrowser>, manager: ReturnType<typeof initializeTabMapManager>;
  async function command(message: MapCommand) {
    return await manager.handleMessage({ type: tabMapMessageType, ...message },
      { url: "chrome-extension://map/tab-map.html" }) as { ok: boolean; view: MapView };
  }
  const order = () => [...fake.tabs.values()].filter((tab) => tab.windowId === 10).sort((a, b) => a.index - b.index).map((tab) => tab.id);
  beforeEach(() => {
    fake = createBrowser();
    for (let id = 1; id <= 4; id++) fake.tabs.set(id, { id, windowId: 10, index: id - 1,
      pinned: id < 4, url: `https://site${id}.example/`, incognito: false });
    vi.stubGlobal("browser", fake.api); manager = initializeTabMapManager();
  });
  it.each([
    [1, 3, "after", [2, 3, 1, 4]], [3, 1, "before", [3, 1, 2, 4]],
    [1, 3, "before", [2, 1, 3, 4]], [3, 1, "after", [1, 3, 2, 4]],
  ] as const)("moves %s %s %s without creating tasks or moving ordinary tabs", async (tabId, targetTabId, side, expected) => {
    const result = await command({ action: "reorder-pinned", tabId, targetTabId, side });
    expect(result.ok).toBe(true); expect(order()).toEqual(expected);
    expect(result.view.nodes).toHaveLength(0); expect(result.view.sessions).toHaveLength(0);
    expect(result.view.canUndo).toBe(false);
    expect(fake.api.tabs.create).not.toHaveBeenCalled(); expect(fake.api.tabs.update).not.toHaveBeenCalled();
    expect(fake.api.tabs.remove).not.toHaveBeenCalled();
  });
  it.each([[1, 1, "after"], [1, 2, "before"], [2, 1, "after"]] as const)("ignores an unchanged order %s %s %s", async (tabId, targetTabId, side) => {
    expect((await command({ action: "reorder-pinned", tabId, targetTabId, side })).ok).toBe(true);
    expect(fake.api.tabs.move).not.toHaveBeenCalled(); expect(order()).toEqual([1, 2, 3, 4]);
  });
  it.each(["closed", "unpinned", "private", "other-window"])("rejects a %s target", async (scenario) => {
    if (scenario === "closed") fake.tabs.delete(3);
    else Object.assign(fake.tabs.get(3), scenario === "unpinned" ? { pinned: false }
      : scenario === "private" ? { incognito: true } : { windowId: 20 });
    expect((await command({ action: "reorder-pinned", tabId: 1, targetTabId: 3, side: "before" })).ok).toBe(false);
    expect(fake.api.tabs.move).not.toHaveBeenCalled();
  });
  it("rejects a web page asking to rearrange browser tabs", async () => {
    const result = await manager.handleMessage({ type: tabMapMessageType, action: "reorder-pinned", tabId: 1, targetTabId: 3, side: "after" }, { url: "https://site1.example/" }) as { ok: boolean };
    expect(result.ok).toBe(false); expect(fake.api.tabs.move).not.toHaveBeenCalled();
  });
  it.each([{ tabId: 0 }, { tabId: "1" }, { targetTabId: 0 }, { targetTabId: 1.5 }, { side: "left" }, { side: ["before"] }, { side: null }])("rejects malformed reorder commands %j", (patch) => {
    expect(isMapMessage({ type: tabMapMessageType, action: "reorder-pinned", tabId: 1, targetTabId: 3, side: "after", ...patch })).toBe(false);
  });
});
