import { beforeEach, describe, expect, it, vi } from "vitest";
import { initializeTabMapManager } from "./manager";
import { createBrowser } from "../testing/browser-fixture";
import { emptyMapState, tabMapMessageType, tabMapStateKey, type MapCommand, type MapView } from "../types/map";
import { browserRestartKey } from "./recovery/browser-restart";

const persisted = vi.hoisted(() => ({ graph: {} as ReturnType<typeof emptyMapState>, writes: 0 }));
vi.mock("../storage/graph", () => ({
  readTabMap: async () => structuredClone(persisted.graph),
  saveTabMap: async (state: ReturnType<typeof emptyMapState>) => { persisted.graph = structuredClone(state); persisted.writes++; },
}));

describe("map background avoids unnecessary work", () => {
  let fake: ReturnType<typeof createBrowser>, manager: ReturnType<typeof initializeTabMapManager>, rootId: string;
  const sender = { url: "chrome-extension://map/tab-map.html" };
  async function command(message: MapCommand, source = sender) {
    return await manager.handleMessage({ type: tabMapMessageType, ...message }, source) as { ok: boolean; view: MapView };
  }
  const mirrors = () => fake.api.storage.local.set.mock.calls.filter(([patch]) => tabMapStateKey in patch).length;
  beforeEach(async () => {
    persisted.graph = emptyMapState(); persisted.writes = 0;
    fake = createBrowser(); vi.stubGlobal("browser", fake.api); manager = initializeTabMapManager();
    rootId = (await command({ action: "start", name: "性能" })).view.nodes[0].id;
    persisted.writes = 0; vi.clearAllMocks();
  });

  it("does not export SQLite for 100 moves, focus changes or pin changes", async () => {
    for (let x = 0; x < 100; x++) await command({ action: "positions", displayMode: "compact", direction: "vertical", items: [{ nodeId: rootId, position: { x, y: 10 } }] });
    await command({ action: "focus", nodeId: rootId });
    expect(fake.api.storage.local.set.mock.calls.filter(([patch]) => browserRestartKey in patch)).toHaveLength(0);
    await command({ action: "pin-node", nodeId: rootId, pinned: true });
    await command({ action: "pin-node", nodeId: rootId, pinned: false });
    expect(persisted.writes).toBe(0);
    expect(mirrors()).toBe(1); // Only the first move changes undo availability.
    expect((await command({ action: "undo" })).ok).toBe(true);
  });

  it("does not query Chrome or write storage for clicks outside the paste inference window", async () => {
    const tracked = { ...sender, tab: fake.tabs.get(1), frameId: 0 };
    const unrelated = { ...sender, tab: { ...fake.tabs.get(1), id: 99 }, frameId: 0 };
    for (let i = 0; i < 100; i++) {
      await command({ action: "step", url: tracked.tab.url }, tracked);
      await command({ action: "step", url: unrelated.tab.url }, unrelated);
    }
    expect(fake.api.tabs.get).not.toHaveBeenCalled();
    expect(fake.api.storage.session.set).not.toHaveBeenCalled();
    expect(mirrors()).toBe(0); expect(persisted.writes).toBe(0);
  });

  it("persists clipboard lineage without broadcasting an unchanged graph", async () => {
    const source = { ...sender, tab: fake.tabs.get(1), frameId: 0 };
    for (let i = 0; i < 20; i++) await command({ action: "copy", text: `word ${i}`, url: source.tab.url }, source);
    expect(fake.api.storage.session.set).toHaveBeenCalledTimes(20);
    expect(mirrors()).toBe(0); expect(persisted.writes).toBe(0);
    expect((await command({ action: "get" })).view.runtime.copies[0].text).toBe("word 19");
  });

  it("skips graph copies and writes for unrelated tab loading notifications", async () => {
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      for (let i = 0; i < 100; i++) fake.api.tabs.onUpdated.emit(1, { status: "complete" }, fake.tabs.get(1));
      await command({ action: "get" });
      expect(clone).not.toHaveBeenCalled();
      expect(mirrors()).toBe(0); expect(persisted.writes).toBe(0);
    } finally { clone.mockRestore(); }
    await command({ action: "edit", nodeId: rootId, note: "必须保存的备注" });
    expect(persisted.writes).toBe(1);
    expect(persisted.graph.nodes[0].note).toBe("必须保存的备注");
  });
});
