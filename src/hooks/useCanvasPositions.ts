import { useCallback, useEffect, useMemo, useState } from "react";
import type { XYPosition } from "@xyflow/react";
import type { MapNode, MapPositionChange } from "../types/map";
import type { CanvasDisplayMode, MapLayoutDirection } from "../core/view-options";
import { mapPositionPrefix } from "../storage/positions";

function position(value: unknown): value is XYPosition {
  if (!value || typeof value !== "object") return false;
  const item = value as XYPosition;
  return Number.isFinite(item.x) && Number.isFinite(item.y);
}

// Store each node independently so simultaneous windows cannot overwrite other nodes.
export function useCanvasPositions(nodes: MapNode[], displayMode: CanvasDisplayMode = "detailed", direction: MapLayoutDirection = "horizontal", onSave?: (items: MapPositionChange[]) => Promise<boolean>) {
  const prefix = mapPositionPrefix(displayMode, direction);
  const signature = nodes.map((node) => node.id).sort().join(",");
  const ids = useMemo(() => signature.split(",").filter(Boolean), [signature]);
  const [positions, setPositions] = useState<Record<string, XYPosition>>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    const keys = ids.map((id) => prefix + id);
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "local" || !keys.some((key) => key in changes)) return;
      setPositions((previous) => {
        const next = { ...previous };
        for (const id of ids) {
          const change = changes[prefix + id];
          if (!change) continue;
          if (position(change.newValue)) next[id] = change.newValue;
          else delete next[id];
        }
        return next;
      });
    };
    browser.storage.onChanged.addListener(listener);
    void browser.storage.local.get(keys).then((stored) => {
      if (!active) return;
      setPositions((previous) => {
        const next = { ...previous };
        for (const id of ids) {
          const value = stored[prefix + id];
          if (position(value)) next[id] = value;
        }
        return next;
      });
    }).catch(() => { /* Position storage must not prevent browsing the map. */ }).finally(() => { if (active) setReady(true); });
    return () => { active = false; browser.storage.onChanged.removeListener(listener); };
  }, [ids, prefix]);
  const move = useCallback((id: string, value: XYPosition, persist: boolean) => {
    if (!position(value)) return;
    setPositions((previous) => ({ ...previous, [id]: value }));
    if (persist) void browser.storage.local.set({ [prefix + id]: value }).catch(() => {});
  }, [prefix]);
  const commit = useCallback((items: MapPositionChange[]) => {
    if (onSave) void onSave(items);
    else void browser.storage.local.set(Object.fromEntries(items.filter((item) => item.position).map((item) => [prefix + item.nodeId, item.position])));
  }, [onSave, prefix]);
  const reset = useCallback(() => {
    setPositions({});
    if (onSave) void onSave(ids.map((nodeId) => ({ nodeId, position: null })));
    else void browser.storage.local.remove(ids.map((id) => prefix + id)).catch(() => {});
  }, [ids, prefix, onSave]);
  return { positions, ready, move, reset, commit };
}
