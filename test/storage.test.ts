import { beforeEach, describe, expect, it, vi } from "vitest";
import { graphStorageKey, readTabMap, saveTabMap } from "../src/storage/graph";
import { emptyMapState, type MapState } from "../src/types/map";

describe("standalone graph storage", () => {
  let values: Record<string, unknown>;
  beforeEach(() => {
    values = {};
    vi.stubGlobal("browser", { storage: { local: {
      get: vi.fn(async (key: string) => ({ [key]: structuredClone(values[key]) })),
      set: vi.fn(async (patch: Record<string, unknown>) => { Object.assign(values, structuredClone(patch)); }),
    } } });
  });
  it("starts empty without reading or creating an SEO database", async () => {
    expect(await readTabMap()).toEqual(emptyMapState());
    expect(values).toEqual({});
  });
  it("round-trips lineage, notes and scroll positions without overwriting settings", async () => {
    values["tab-flow-map-language.v1"] = "ja";
    const state: MapState = { ...emptyMapState(), sessionId: "s", recording: true,
      sessions: [{ id: "s", name: "Research", createdAt: 1 }], nodes: [
        { id: "a", sessionId: "s", parentId: null, kind: "root", url: "https://example.com/", title: "Example", note: "Next step", createdAt: 1, scrollX: 0, scrollY: 820, anchor: "Discussion" },
        { id: "b", sessionId: "s", parentId: "a", kind: "link", url: "https://example.org/", title: "Child", note: "", createdAt: 2, scrollX: 0, scrollY: 0, anchor: "" },
      ] };
    await saveTabMap(state);
    expect(await readTabMap()).toEqual(state);
    expect(values["tab-flow-map-language.v1"]).toBe("ja");
  });
  it("reports corrupt storage without replacing it with an empty graph", async () => {
    values[graphStorageKey] = { version: 999 };
    await expect(readTabMap()).rejects.toThrow();
    expect(values[graphStorageKey]).toEqual({ version: 999 });
  });
  it("propagates storage failures so the background does not claim a successful save", async () => {
    vi.mocked(browser.storage.local.set).mockRejectedValueOnce(new Error("Quota exceeded"));
    await expect(saveTabMap(emptyMapState())).rejects.toThrow("Quota exceeded");
  });
});
