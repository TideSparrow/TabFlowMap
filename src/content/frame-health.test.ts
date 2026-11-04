// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { monitorMapFrame, type FrameStatus } from "./frame-health";
import { mapFrameReadyType } from "../core/frame-status";

describe("overlay frame recovery", () => {
  const url = "chrome-extension://test-extension/tab-map.html?mode=embedded";
  let frame: HTMLIFrameElement;
  let health: ReturnType<typeof monitorMapFrame>;
  let status = vi.fn<(status: FrameStatus) => void>();
  const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));
  beforeEach(() => {
    vi.useFakeTimers();
    frame = document.createElement("iframe");
    frame.src = url;
    // Chromium's browsing-context identity is supplied separately; the real DOM
    // observer still sees srcdoc mutations without attempting extension URLs in Node.
    vi.spyOn(frame, "contentWindow", "get").mockReturnValue({} as Window);
    status = vi.fn();
    health = monitorMapFrame(frame, url, status);
  });
  afterEach(() => {
    health.dispose(); frame.remove(); vi.restoreAllMocks(); vi.useRealTimers();
  });
  it("removes an injected empty srcdoc that would override the extension document", async () => {
    frame.setAttribute("srcdoc", "");
    await flush();
    expect(frame.hasAttribute("srcdoc")).toBe(false);
    expect(frame.src).toBe(url);
    expect(status).toHaveBeenLastCalledWith("loading");
  });
  it("leaves unrelated frames and sandbox policies untouched", async () => {
    const other = document.createElement("iframe");
    other.setAttribute("srcdoc", "");
    frame.setAttribute("sandbox", "allow-scripts");
    await flush();
    expect(other.hasAttribute("srcdoc")).toBe(true);
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    other.remove();
  });
  it("stops automatic repair when a host repeatedly replaces its document", async () => {
    for (let i = 0; i < 4; i++) {
      frame.setAttribute("srcdoc", "");
      await flush();
    }
    expect(frame.hasAttribute("srcdoc")).toBe(true);
    expect(status).toHaveBeenLastCalledWith("failed");
    health.retry();
    expect(frame.hasAttribute("srcdoc")).toBe(false);
    expect(status).toHaveBeenLastCalledWith("loading");
  });
  it("requires a readiness signal from this frame and the extension origin", () => {
    const signal = { type: mapFrameReadyType };
    window.dispatchEvent(new MessageEvent("message", { data: signal, origin: "https://host.example", source: frame.contentWindow }));
    window.dispatchEvent(new MessageEvent("message", { data: signal, origin: "chrome-extension://test-extension", source: window }));
    expect(status).not.toHaveBeenCalledWith("ready");
    window.dispatchEvent(new MessageEvent("message", { data: signal, origin: "chrome-extension://test-extension", source: frame.contentWindow }));
    expect(status).toHaveBeenLastCalledWith("ready");
    vi.advanceTimersByTime(10000);
    expect(status).not.toHaveBeenCalledWith("failed");
  });
  it("shows a failure after a load timeout and lets the user retry", () => {
    vi.advanceTimersByTime(8000);
    expect(status).toHaveBeenLastCalledWith("failed");
    health.retry();
    expect(frame.src).toBe(url);
    expect(status).toHaveBeenLastCalledWith("loading");
  });
  it("cleans up timers and the attribute observer on disposal", async () => {
    health.dispose(); status.mockClear();
    frame.setAttribute("srcdoc", "");
    await flush(); vi.advanceTimersByTime(10000);
    expect(frame.hasAttribute("srcdoc")).toBe(true);
    expect(status).not.toHaveBeenCalled();
  });
});
