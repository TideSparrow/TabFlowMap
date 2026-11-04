import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { graphMotionDuration, planGraphMotion, sampleGraphMotion, type MotionNode } from "../components/motion/graph-motion";

const query = "(prefers-reduced-motion: reduce)";
function subscribe(notify: () => void) {
  const media = matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
export function useReducedMapMotion() {
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches, () => false);
}

// 更新 XYFlow 的真实位置而非外层 CSS transform，保证连线与节点在每一帧对齐。
export function useGraphMotion<T extends MotionNode>(targets: T[], immediate: boolean) {
  const reduced = useReducedMapMotion();
  const [frames, setFrames] = useState(targets);
  const current = useRef(targets);
  const latest = useRef(targets);
  latest.current = targets;
  const signature = targets.map((node) => `${node.id}:${node.position.x}:${node.position.y}:${node.data.parentId}:${node.width}:${node.height}`).join("|");
  useLayoutEffect(() => {
    const next = latest.current;
    if (immediate || reduced) {
      current.current = next;
      setFrames(next);
      return;
    }
    const steps = planGraphMotion(current.current, next);
    let raf = 0;
    const started = performance.now();
    function update(elapsed: number) {
      current.current = elapsed >= graphMotionDuration ? latest.current : sampleGraphMotion(steps, elapsed);
      setFrames(current.current);
    }
    function tick(now: number) {
      const elapsed = now - started;
      update(elapsed);
      if (elapsed < graphMotionDuration) raf = requestAnimationFrame(tick);
    }
    update(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [signature, immediate, reduced]);
  const live = new Map(targets.map((node) => [node.id, node]));
  return frames.map((frame) => {
    const node = live.get(frame.id);
    return node ? { ...node, position: frame.position, data: { ...node.data, motion: frame.data.motion } } : frame;
  });
}
