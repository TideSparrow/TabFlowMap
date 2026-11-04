import { describe, expect, it } from "vitest";
import type { MapNode } from "../../types/map";
import { buildTreeRows } from "./tree-model";

const node = (id: string, parentId: string | null = null): MapNode => ({
  id, parentId, sessionId: "s", url: `https://${id}.example/`, title: id, kind: "link", note: "", createdAt: 1, scrollX: 0, scrollY: 0, anchor: "",
});
const nodes = [node("a"), node("b", "a"), node("c", "b"), node("d", "a"), node("e"), node("orphan", "missing")];

describe("tree view", () => {
  it("keeps parent-child order and displays independent and orphaned tabs as roots", () => {
    expect(buildTreeRows(nodes, new Set()).map(({ node, depth }) => [node.id, depth])).toEqual([
      ["a", 0], ["b", 1], ["c", 2], ["d", 1], ["e", 0], ["orphan", 0],
    ]);
  });
  it("hides an entire collapsed branch without hiding other roots or siblings", () => {
    expect(buildTreeRows(nodes, new Set(["b"])).map(({ node }) => node.id)).toEqual(["a", "b", "d", "e", "orphan"]);
    expect(buildTreeRows(nodes, new Set(["a"])).map(({ node }) => node.id)).toEqual(["a", "e", "orphan"]);
  });
  it("finds a hidden descendant with its full source path without changing collapsed state", () => {
    const collapsed = new Set(["a", "b"]);
    expect(buildTreeRows(nodes, collapsed, "C.EXAMPLE").map(({ node }) => node.id)).toEqual(["a", "b", "c"]);
    expect([...collapsed]).toEqual(["a", "b"]);
    expect(buildTreeRows(nodes, collapsed, "no-match")).toEqual([]);
  });
});
