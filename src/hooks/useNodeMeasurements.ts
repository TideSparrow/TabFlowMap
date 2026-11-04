import { useCallback, useState } from "react";
import type { Node, NodeChange } from "@xyflow/react";

// Controlled nodes must retain React Flow's measurements, otherwise each new
// node object clears its handle bounds even when the DOM size hasn't changed.
export function useNodeMeasurements<T extends Node>() {
  const [measurements, setMeasurements] = useState<Record<string, { width: number; height: number }>>({});
  const measure = useCallback((changes: NodeChange<T>[]) => {
    const dimensions = changes.filter((change) => change.type === "dimensions" && change.dimensions);
    if (!dimensions.length) return;
    setMeasurements((previous) => {
      let next = previous;
      for (const change of dimensions) {
        if (change.type !== "dimensions" || !change.dimensions) continue;
        const { width, height } = change.dimensions;
        if (previous[change.id]?.width === width && previous[change.id]?.height === height) continue;
        if (next === previous) next = { ...previous };
        next[change.id] = { width, height };
      }
      return next;
    });
  }, []);
  return { measurements, measure };
}
