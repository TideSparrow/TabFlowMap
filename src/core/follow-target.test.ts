import { describe, expect, it } from "vitest";
import { followTargetKey } from "./follow-target";
import type { MapNode } from "../types/map";

const node = (id: string, parentId: string | null = null): MapNode => ({
  id, parentId, sessionId: "s", url: `https://${id}.example/`, title: id, kind: "root", note: "",
  createdAt: 1, scrollX: 0, scrollY: 0, anchor: "",
});

describe("active tab follow target", () => {
  it("changes when the active root becomes a child without changing its ID", () => {
    const roots = [node("a"), node("b")];
    expect(followTargetKey(roots, "b")).not.toBe(followTargetKey([roots[0], node("b", "a")], "b"));
  });
  it("changes when an ancestor moves to a different branch", () => {
    const nodes = [node("a"), node("b"), node("parent", "a"), node("active", "parent")];
    const moved = nodes.map((item) => item.id === "parent" ? { ...item, parentId: "b" } : item);
    expect(followTargetKey(nodes, "active")).not.toBe(followTargetKey(moved, "active"));
  });
  it("does not retrigger following for metadata updates or node order changes", () => {
    const nodes = [node("a"), node("b", "a")];
    const updated = nodes.map((item) => ({ ...item, title: "updated", url: "https://other.example/" })).reverse();
    expect(followTargetKey(nodes, "b")).toBe(followTargetKey(updated, "b"));
  });
  it("clears the target when the active tab has no node", () => {
    expect(followTargetKey([node("a")], null)).toBeNull();
    expect(followTargetKey([node("a")], "missing")).toBeNull();
  });
});
