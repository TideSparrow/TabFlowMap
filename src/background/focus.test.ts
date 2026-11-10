import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeTabMapManager } from "./manager";
import { createBrowser } from "../testing/browser-fixture";
import { emptyMapState, tabMapMessageType, type MapCommand, type MapView } from "../types/map";

vi.mock("../storage/graph", () => ({
  readTabMap: async () => emptyMapState(),
  saveTabMap: async () => {},
}));

describe("tab switching with unresponsive pages", () => {
  let fake: ReturnType<typeof createBrowser>;
  let manager: ReturnType<typeof initializeTabMapManager>;
  let rootId: string, childId: string;
  const sender = { url: "chrome-extension://map/tab-map.html?mode=window" };
  async function command(message: MapCommand) {
    return await manager.handleMessage({ type: tabMapMessageType, ...message }, sender) as { ok: boolean; view: MapView };
  }
  beforeEach(async () => {
    vi.useFakeTimers();
    fake = createBrowser(); vi.stubGlobal("browser", fake.api);
    manager = initializeTabMapManager();
    rootId = (await command({ action: "start", name: "Switching" })).view.nodes[0].id;
    childId = (await command({ action: "add", text: "https://b.example/", parentId: rootId })).view.nodes[1].id;
    vi.clearAllMocks();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("switches and releases the shared queue when the source page never answers", async () => {
    fake.api.tabs.sendMessage.mockImplementation(() => new Promise(() => {}));
    let switched = false, queueReleased = false;
    const switching = command({ action: "focus", nodeId: childId }).then((result) => { switched = result.ok; });
    const next = command({ action: "get" }).then((result) => { queueReleased = result.ok; });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.api.tabs.update).toHaveBeenCalledWith(2, { active: true });
    expect(switched).toBe(true);
    expect(queueReleased).toBe(true);
    expect(fake.api.windows.update).not.toHaveBeenCalled();
    expect(fake.api.tabs.create).not.toHaveBeenCalled();
    await Promise.all([switching, next]);
  });

  it("does not wait for a restore acknowledgement from the target page", async () => {
    fake.api.tabs.sendMessage.mockImplementation((_tabId: number, message: any) =>
      message.type === "tab-flow-map-restore" ? new Promise(() => {}) : Promise.resolve(undefined));
    let completed = false;
    const switching = command({ action: "focus", nodeId: childId }).then((result) => { completed = result.ok; });
    await vi.advanceTimersByTimeAsync(0);
    expect(completed).toBe(true);
    expect((await command({ action: "focus", nodeId: rootId })).ok).toBe(true);
    await switching;
  });

  it("preserves a responsive page's position before switching", async () => {
    fake.api.tabs.sendMessage.mockResolvedValueOnce({ url: "https://a.example/", scrollX: 12, scrollY: 345, anchor: "Saved position" });
    const result = await command({ action: "focus", nodeId: childId });
    expect(result.ok).toBe(true);
    expect(result.view.nodes.find((node) => node.id === rootId)).toMatchObject({ scrollX: 12, scrollY: 345, anchor: "Saved position" });
    expect(fake.api.tabs.sendMessage).toHaveBeenCalledWith(1, { type: "tab-flow-map-snapshot" }, { frameId: 0 });
    expect(fake.api.tabs.sendMessage).toHaveBeenCalledWith(2, expect.objectContaining({ type: "tab-flow-map-restore" }), { frameId: 0 });
  });

  it("ignores a snapshot that arrives after the switch instead of overwriting newer state", async () => {
    let respond!: (value: unknown) => void;
    fake.api.tabs.sendMessage.mockImplementationOnce(() => new Promise((resolve) => { respond = resolve; }));
    const switching = command({ action: "focus", nodeId: childId });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fake.api.tabs.update).toHaveBeenCalledWith(2, { active: true });
    respond({ url: "https://a.example/", scrollX: 99, scrollY: 999, anchor: "Late" });
    await switching;
    const result = await command({ action: "get" });
    expect(result.view.nodes.find((node) => node.id === rootId)).toMatchObject({ scrollX: 0, scrollY: 0, anchor: "" });
  });

  it("still switches when either page has no content script", async () => {
    fake.api.tabs.sendMessage.mockRejectedValue(new Error("Receiving end does not exist"));
    const result = await command({ action: "focus", nodeId: childId });
    expect(result.ok).toBe(true);
    expect(fake.api.tabs.update).toHaveBeenCalledWith(2, { active: true });
    expect((await command({ action: "get" })).ok).toBe(true);
  });
});
