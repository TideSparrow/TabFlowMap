import type { Node, XYPosition } from "@xyflow/react";

export type GraphMotion = { opacity: number; scale: number; phase: "enter" | "exit" | "steady" };
export type MotionNode = Node<{ parentId: string | null; motion?: GraphMotion }>;
export type MotionStep<T extends MotionNode> = { node: T; from: XYPosition; to: XYPosition; opacity: number; scale: number; exit: boolean };
// Keep node transitions at 320ms; exiting nodes retract within 200ms.
export const graphMotionDuration = 320;
function ease(progress: number, exit: boolean) {
  const [x1, y1, x2, y2] = exit ? [0.4, 0, 1, 1] : [0.2, 0.85, 0.18, 1];
  const cubic = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 16; i++) {
    const middle = (low + high) / 2;
    if (cubic(middle, x1, x2) < progress) low = middle; else high = middle;
  }
  return progress <= 0 ? 0 : progress >= 1 ? 1 : cubic((low + high) / 2, y1, y2);
}

function ancestor<T extends MotionNode>(node: T, destinations: Map<string, T>, lineage: Map<string, T>) {
  let parent = node.data.parentId;
  const visited = new Set<string>();
  while (parent && !visited.has(parent)) {
    visited.add(parent);
    const found = destinations.get(parent);
    if (found) return found;
    parent = lineage.get(parent)?.data.parentId ?? null;
  }
}

// 入场从最近可见祖先伸出，退场回到祖先；以当前帧为起点，快速反向操作不会跳变。
export function planGraphMotion<T extends MotionNode>(previous: T[], next: T[]): MotionStep<T>[] {
  const old = new Map(previous.map((node) => [node.id, node]));
  const target = new Map(next.map((node) => [node.id, node]));
  const lineage = new Map([...old, ...target]);
  const replacingDrafts = new Set<string>();
  const steps = next.map((node) => {
    let before = old.get(node.id);
    if (!before && node.type !== "draft") {
      before = previous.find((item) => item.type === "draft" && !target.has(item.id) && item.data.parentId === node.data.parentId);
      if (before) replacingDrafts.add(before.id);
    }
    const origin = before ?? ancestor(node, old, lineage);
    return { node, from: origin?.position ?? node.position, to: node.position,
      opacity: before?.data.motion?.opacity ?? (before ? 1 : 0),
      scale: before?.data.motion?.scale ?? (before ? 1 : 0.8), exit: false };
  });
  for (const node of previous) {
    if (target.has(node.id) || replacingDrafts.has(node.id)) continue;
    steps.push({ node, from: node.position, to: ancestor(node, target, lineage)?.position ?? node.position,
      opacity: node.data.motion?.opacity ?? 1, scale: node.data.motion?.scale ?? 1, exit: true });
  }
  return steps;
}

export function sampleGraphMotion<T extends MotionNode>(steps: MotionStep<T>[], elapsed: number): T[] {
  const entering = ease(Math.min(1, elapsed / graphMotionDuration), false);
  const exiting = ease(Math.min(1, elapsed / 200), true);
  return steps.filter((step) => !step.exit || elapsed < 200).map((step) => {
    const progress = step.exit ? exiting : entering;
    const mix = (a: number, b: number) => a + (b - a) * progress;
    return { ...step.node, position: { x: mix(step.from.x, step.to.x), y: mix(step.from.y, step.to.y) },
      draggable: step.exit ? false : step.node.draggable, selectable: step.exit ? false : step.node.selectable,
      data: { ...step.node.data, motion: { opacity: mix(step.opacity, step.exit ? 0 : 1),
        scale: mix(step.scale, step.exit ? 0.78 : 1), phase: step.exit ? "exit" : progress < 1 ? "enter" : "steady" } } };
  });
}
