import { describe, expect, it } from "vitest";
import { breadcrumbs, destination, parseMapState, setParent } from "./graph";
import { emptyMapState, type MapNode } from "../types/map";
import { layoutMap } from "./layout";

const node = (id: string, parentId: string | null = null): MapNode => ({
  id, parentId, sessionId: "s", url: `https://${id}.example/`, title: id, kind: "link",
  note: "", createdAt: 1, scrollX: 0, scrollY: 0, anchor: "",
});

describe("tab map provenance", () => {
  const nodes = [node("a"), node("b", "a"), node("c", "b")];
  it("prevents cycles and cross-lineage reassignment while allowing correction", () => {
    const graph = nodes.map((item) => ({ ...item }));
    expect(() => setParent(graph, "a", "c")).toThrow();
    expect(() => setParent([...graph, { ...node("other"), sessionId: "t" }], "a", "other")).toThrow();
    setParent(graph, "c", "a");
    expect(breadcrumbs(graph, "c").map((item) => item.id)).toEqual(["a", "c"]);
  });
  it("retains the copy provenance label when its suggested source is confirmed", () => {
    const copied = { ...node("b", "a"), kind: "copied" as const, pendingSource: true };
    setParent([node("a"), copied], copied.id, "a");
    expect(copied.pendingSource).toBe(false);
    expect(copied.kind).toBe("copied");
  });
  it("keeps imported malformed parent chains finite", () => {
    const state = { ...emptyMapState(), sessions: [{ id: "s", name: "test", createdAt: 1 }], nodes: [node("a", "b"), node("b", "a")] };
    const parsed = parseMapState(JSON.stringify(state));
    expect(breadcrumbs(parsed.nodes, "a").length).toBeLessThanOrEqual(2);
    expect(layoutMap(parsed.nodes, new Set()).positions).toHaveLength(2);
  });
  it("persists live native blank tabs while rejecting arbitrary internal URLs", () => {
    const state = { ...emptyMapState(), sessions: [{ id: "s", name: "test", createdAt: 1 }],
      nodes: [{ ...node("blank"), url: "chrome://newtab/" }, { ...node("unsafe"), url: "javascript:alert(1)" }] };
    expect(parseMapState(JSON.stringify(state)).nodes.map((node) => node.id)).toEqual(["blank"]);
  });
  it("keeps multiple roots and hides only the collapsed branch", () => {
    const layout = layoutMap([...nodes, node("d")], new Set(["b"]));
    expect(layout.positions.map((item) => item.node.id).sort()).toEqual(["a", "b", "d"]);
  });
  it("opens domains and encodes search words while rejecting unsafe protocols", () => {
    expect(destination("example.com/path")).toBe("https://example.com/path");
    expect(destination("image editor & free")).toBe("https://www.google.com/search?q=image%20editor%20%26%20free");
    expect(() => destination("file:///secret")).toThrow();
  });
});
