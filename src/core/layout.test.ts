import { describe, expect, it } from "vitest";
import type { MapNode } from "../types/map";
import { layoutMap } from "./layout";
import { nodeSizes, type CanvasDisplayMode } from "./view-options";
import { placeDraftNode } from "../components/DraftTabNode";

function node(id: string, parentId: string | null = null): MapNode {
  return { id, parentId, sessionId: "s", url: `https://${id}.example/`, title: id,
    kind: "link", note: "", createdAt: 1, scrollX: 0, scrollY: 0, anchor: "" };
}

describe.each<CanvasDisplayMode>(["compact", "detailed"])("%s workflow directions", (mode) => {
  const nodes = [node("a"), node("b", "a"), node("c", "b"), node("d", "a"), node("e")];
  const size = nodeSizes[mode];
  it("arranges a vertical branch below its parent, siblings side by side, without overlap", () => {
    const { positions, width, height } = layoutMap(nodes, new Set(), mode, "vertical");
    const get = (id: string) => positions.find((item) => item.node.id === id)!;
    expect(get("b").y).toBeGreaterThan(get("a").y + size.height);
    expect(get("c").y).toBeGreaterThan(get("b").y + size.height);
    expect(get("d").y).toBe(get("b").y);
    expect(Math.abs(get("d").x - get("b").x)).toBeGreaterThan(size.width);
    expect(get("a").x).toBe((get("b").x + get("d").x) / 2);
    for (const item of positions) {
      expect(item.x + size.width).toBeLessThan(width);
      expect(item.y + size.height).toBeLessThan(height);
      for (const other of positions) {
        if (item === other) continue;
        expect(Math.abs(item.x - other.x) >= size.width || Math.abs(item.y - other.y) >= size.height).toBe(true);
      }
    }
  });
  it("preserves the horizontal default and collapsed branch semantics", () => {
    expect(layoutMap(nodes, new Set(), mode)).toEqual(layoutMap(nodes, new Set(), mode, "horizontal"));
    const positions = layoutMap(nodes, new Set(["b"]), mode, "vertical").positions;
    expect(positions.map((item) => item.node.id).sort()).toEqual(["a", "b", "d", "e"]);
    expect(positions.find((item) => item.node.id === "b")?.children).toBe(1);
  });
  it("places a vertical draft below its parent and moves sideways around occupied nodes", () => {
    const parent = { position: { x: 50, y: 40 }, ...size };
    const child = { position: { x: 50, y: 40 + size.height + 60 }, ...size };
    const draft = placeDraftNode(parent, [parent, child], "vertical");
    expect(draft.y).toBeGreaterThan(parent.position.y + size.height);
    expect(draft.x).toBeGreaterThan(child.position.x + size.width);
  });
});
