import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeMapWindows } from "./windows";
import { tabMapOverlayKey } from "../types/map";

const mapUrl = "chrome-extension://map/tab-map.html?mode=window";
function fakeBrowser() {
  const api = {
    runtime: { getURL: (path: string) => `chrome-extension://map${path}` },
    storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => undefined) } },
    tabs: { query: vi.fn(async () => [{ windowId: 20, url: mapUrl }, { windowId: 30, url: "https://user.example/" }]) },
    windows: {
      onBoundsChanged: { addListener: vi.fn() }, onRemoved: { addListener: vi.fn() },
      getLastFocused: vi.fn(async () => ({ id: 10 })),
      remove: vi.fn(async () => undefined), update: vi.fn(async () => undefined),
      create: vi.fn(async () => ({ id: 40 })),
    },
  };
  return api;
}

describe("tab map display transitions", () => {
  let api: ReturnType<typeof fakeBrowser>;
  beforeEach(() => { api = fakeBrowser(); vi.stubGlobal("browser", api); });
  afterEach(() => vi.unstubAllGlobals());

  it("opens the sidebar in a normal browser window before closing the map popup", async () => {
    const open = vi.fn(async () => { expect(api.windows.remove).not.toHaveBeenCalled(); });
    await initializeMapWindows(open)("sidepanel");
    expect(open).toHaveBeenCalledWith(10);
    expect(api.storage.local.set).toHaveBeenCalledWith({ [tabMapOverlayKey]: false });
    expect(api.windows.remove).toHaveBeenCalledExactlyOnceWith(20);
  });

  it("starts the sidebar immediately when the window was resolved before clicking", async () => {
    const open = vi.fn(async () => {});
    const pending = initializeMapWindows(open)("sidepanel", 10);
    expect(open).toHaveBeenCalledWith(10);
    expect(api.windows.getLastFocused).not.toHaveBeenCalled();
    await pending;
  });

  it("preserves the current display if opening the sidebar fails", async () => {
    await expect(initializeMapWindows(async () => { throw new Error("No user gesture"); })("sidepanel")).rejects.toThrow("No user gesture");
    expect(api.storage.local.set).not.toHaveBeenCalled();
    expect(api.windows.remove).not.toHaveBeenCalled();
  });

  it("reports an unavailable sidebar without hiding the current map", async () => {
    await expect(initializeMapWindows()("sidepanel")).rejects.toThrow("侧边栏");
    expect(api.windows.remove).not.toHaveBeenCalled();
  });

  it("creates a compact popup when no dimensions have been saved", async () => {
    api.tabs.query.mockResolvedValue([]);
    await initializeMapWindows()("window");
    expect(api.windows.create).toHaveBeenCalledWith(expect.objectContaining({ type: "popup", width: 480, height: 320 }));
  });
});
