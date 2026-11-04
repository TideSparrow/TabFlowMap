import { describe, expect, it } from "vitest";
import type { MapNode } from "../../types/map";
import { mainTaskNavigation } from "./main-tasks";

function node(id: string, parentId: string | null = null): MapNode {
  return { id, parentId, sessionId: "s", url: `https://${id}.example/`, title: id,
    kind: "link", note: "", createdAt: 1, scrollX: 0, scrollY: 0, anchor: "" };
}
const nodes = [node("a"), node("b", "a"), node("c", "b"), node("d"), node("e")];
const positions = new Map([
  ["a", { x: 100, y: 300 }], ["d", { x: 200, y: 100 }], ["e", { x: 300, y: 200 }],
]);

describe("main task navigation", () => {
  it("counts roots only and resolves a selected grandchild to its main task", () => {
    const model = mainTaskNavigation(nodes, "c", positions, "vertical");
    expect(model.roots.map((root) => root.id)).toEqual(["a", "d", "e"]);
    expect(model.index).toBe(0);
    expect(model.next?.id).toBe("d");
    expect(model.previous?.id).toBe("e");
  });
  it("orders horizontal workflows from top to bottom and loops at the end", () => {
    const model = mainTaskNavigation(nodes, "a", positions, "horizontal");
    expect(model.roots.map((root) => root.id)).toEqual(["d", "e", "a"]);
    expect(model.index).toBe(2);
    expect(model.next?.id).toBe("d");
    expect(model.previous?.id).toBe("e");
  });
  it("updates the count and current task when a root becomes a child of another task", () => {
    const merged = nodes.map((item) => item.id === "a" ? { ...item, parentId: "d" } : item);
    const model = mainTaskNavigation(merged, "c", positions, "vertical");
    expect(model.roots.map((root) => root.id)).toEqual(["d", "e"]);
    expect(model.roots[model.index].id).toBe("d");
  });
  it("recovers from a deleted selection and counts nodes with a missing parent as roots", () => {
    const model = mainTaskNavigation([node("orphan", "gone"), node("root")], "deleted", new Map(), "vertical");
    expect(model.roots.map((root) => root.id)).toEqual(["orphan", "root"]);
    expect(model.index).toBe(0);
    expect(model.next?.id).toBe("root");
  });
  it("supports an empty graph, one root and malformed cycles without hanging", () => {
    const empty = mainTaskNavigation([], null, new Map(), "horizontal");
    expect(empty.roots).toEqual([]);
    expect(empty.next).toBeUndefined();
    const single = mainTaskNavigation([node("a"), node("b", "a")], "b", new Map(), "vertical");
    expect(single.roots).toHaveLength(1);
    expect(single.next?.id).toBe("a");
    const cycle = mainTaskNavigation([node("a", "b"), node("b", "a"), node("root")], "a", new Map(), "horizontal");
    expect(cycle.roots.map((root) => root.id)).toEqual(["root"]);
    expect(cycle.index).toBe(0);
  });
});
