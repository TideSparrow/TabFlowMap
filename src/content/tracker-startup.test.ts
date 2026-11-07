// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapCommand } from "../types/map";

vi.mock("./floating-host", () => ({ mountFloatingMap: vi.fn(async () => () => {}) }));

describe("lineage capture at document start", () => {
  const cleanup: Array<() => void> = [];
  let send: ReturnType<typeof vi.fn>;
  let loadLanguage = vi.fn<() => Promise<Record<string, unknown>>>();
  let listeners: Map<string, EventListener>;
  beforeEach(() => {
    vi.resetModules();
    send = vi.fn(async () => ({}));
    loadLanguage = vi.fn(async () => ({}));
    listeners = new Map();
    const original = document.addEventListener.bind(document);
    vi.spyOn(document, "addEventListener").mockImplementation((type, listener, options) => {
      if (typeof listener === "function") listeners.set(type, listener);
      original(type, listener, options);
    });
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    vi.stubGlobal("defineContentScript", (options: unknown) => options);
    vi.stubGlobal("browser", {
      extension: { inIncognitoContext: false },
      i18n: { getUILanguage: () => "en" },
      runtime: { sendMessage: send, onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
      storage: { local: { get: loadLanguage }, onChanged: { addListener: vi.fn() } },
    });
  });
  afterEach(() => {
    cleanup.splice(0).forEach((dispose) => dispose());
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
  async function start() {
    const script = (await import("../entrypoints/tab-map-tracker.content")).default;
    await script.main({ isInvalid: false, onInvalidated: (dispose: () => void) => cleanup.push(dispose),
      addEventListener: vi.fn() } as any);
  }
  function copyWord() {
    const paragraph = document.createElement("p");
    vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "image editor" } as Selection);
    listeners.get("copy")?.({ isTrusted: true, target: paragraph } as unknown as Event);
  }
  it("captures a source copy even when the document has no root element yet", async () => {
    vi.spyOn(document, "documentElement", "get").mockReturnValue(null as unknown as HTMLElement);
    await expect(start()).resolves.toBeUndefined();
    copyWord();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ action: "copy", text: "image editor" }));
  });
  it("captures copies before the saved language setting has finished loading", async () => {
    let release!: (value: Record<string, unknown>) => void;
    loadLanguage.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const boot = start();
    // Let the dynamic import finish, while the storage read remains pending.
    await vi.waitFor(() => expect(loadLanguage).toHaveBeenCalled());
    copyWord();
    const copies = send.mock.calls.map(([message]) => message as MapCommand).filter((message) => message.action === "copy");
    release({}); await boot;
    expect(copies).toEqual([expect.objectContaining({ action: "copy", text: "image editor" })]);
  });
});
