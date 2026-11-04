import { describe, expect, it } from "vitest";
import { planGraphMotion, sampleGraphMotion, type MotionNode } from "./graph-motion";
import { placeDraftNode } from "../DraftTabNode";

const node = (id: string, parentId: string | null, x: number, type = "tab"): MotionNode => ({
  id, type, data: { parentId }, position: { x, y: 40 }, width: 190, height: 86,
});
const root = node("root", null, 36), child = node("child", "root", 266), grandchild = node("grandchild", "child", 496);

describe("tab map spatial transitions", () => {
  it("grows new descendants from their nearest visible ancestor", () => {
    const steps = planGraphMotion([root], [root, child, grandchild]);
    expect(steps.find((step) => step.node.id === "grandchild")?.from).toEqual(root.position);
    const start = sampleGraphMotion(steps, 0).find((item) => item.id === "child")!;
    expect(start.position).toEqual(root.position);
    expect(start.data.motion?.opacity).toBe(0);
    expect(sampleGraphMotion(steps, 320).find((item) => item.id === "child")?.position).toEqual(child.position);
  });
  it("retracts the whole branch toward its remaining root without moving the root", () => {
    const steps = planGraphMotion([root, child, grandchild], [root]);
    expect(steps.find((step) => step.node.id === "grandchild")?.to).toEqual(root.position);
    const middle = sampleGraphMotion(steps, 100);
    expect(middle.find((item) => item.id === "child")?.draggable).toBe(false);
    expect(middle.find((item) => item.id === "root")?.position).toEqual(root.position);
    expect(sampleGraphMotion(steps, 200).map((item) => item.id)).toEqual(["root"]);
  });
  it("reverses from the current frame instead of jumping back to the endpoint", () => {
    const retracting = sampleGraphMotion(planGraphMotion([root, child], [root]), 80);
    const steps = planGraphMotion(retracting, [root, child]);
    expect(sampleGraphMotion(steps, 0).find((item) => item.id === "child")?.position)
      .toEqual(retracting.find((item) => item.id === "child")?.position);
    expect(sampleGraphMotion(steps, 320).find((item) => item.id === "child")?.position).toEqual(child.position);
  });
  it("replaces the draft with the actual child without duplicating its old ghost", () => {
    const draft = node("draft", "root", 360, "draft");
    const steps = planGraphMotion([root, draft], [root, child]);
    expect(steps.map((step) => step.node.id)).toEqual(["root", "child"]);
    expect(steps.find((step) => step.node.id === "child")?.from).toEqual(draft.position);
    expect(steps.find((step) => step.node.id === "child")?.opacity).toBe(1);
  });
  it("fades a cancelled draft back into its parent", () => {
    const draft = node("draft", "root", 360, "draft");
    expect(planGraphMotion([root, draft], [root]).find((step) => step.node.id === "draft")?.to).toEqual(root.position);
    expect(sampleGraphMotion(planGraphMotion([root, draft], [root]), 200).map((item) => item.id)).toEqual(["root"]);
  });
  it("bounds broken ancestor cycles and tolerates a removed root", () => {
    const a = node("a", "b", 10), b = node("b", "a", 20);
    expect(planGraphMotion([a, b], []).length).toBe(2);
    expect(planGraphMotion([root, child], []).find((step) => step.node.id === "child")?.to).toEqual(child.position);
  });
  it("places an input node away from occupied cards and keeps the source untouched", () => {
    const position = placeDraftNode(root, [root, child, grandchild]);
    expect(position.x).toBe(266);
    expect(position.y).toBeGreaterThan(child.position.y + child.height!);
    expect(root.position).toEqual({ x: 36, y: 40 });
  });
});
