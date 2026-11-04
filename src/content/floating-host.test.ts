// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountFloatingMap } from "./floating-host";
import { setLanguage } from "../i18n";

describe("overlay startup lifecycle", () => {
  afterEach(() => { vi.unstubAllGlobals(); document.getElementById("tab-flow-map-host")?.remove(); });
  it("handles a language change while overlay settings are still loading", async () => {
    let resolve!: (stored: Record<string, unknown>) => void;
    const pending = new Promise<Record<string, unknown>>((done) => { resolve = done; });
    const removeListener = vi.fn();
    vi.stubGlobal("browser", {
      i18n: { getUILanguage: () => "en" },
      storage: {
        local: { get: () => pending, set: vi.fn(async () => {}) },
        onChanged: { addListener: vi.fn(), removeListener },
      },
    });
    const mounting = mountFloatingMap();
    await expect(setLanguage("en")).resolves.toBeUndefined();
    resolve({});
    const dispose = await mounting;
    const host = document.getElementById("tab-flow-map-host")!;
    expect(host.shadowRoot?.querySelector(".bar span")?.textContent).toContain("Drag the title bar");
    dispose();
    expect(document.getElementById("tab-flow-map-host")).toBeNull();
    expect(removeListener).toHaveBeenCalledOnce();
  });
});
