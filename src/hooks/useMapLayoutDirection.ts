import { useCallback, useEffect, useState } from "react";
import type { MapLayoutDirection } from "../core/view-options";

const key = "tab-flow-map-layout-direction.v1";
export function useMapLayoutDirection() {
  const [direction, setDirection] = useState<MapLayoutDirection>("horizontal");
  useEffect(() => {
    let active = true;
    let changed = false;
    const valid = (value: unknown): value is MapLayoutDirection => value === "horizontal" || value === "vertical";
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      const value = changes[key]?.newValue;
      if (area !== "local" || !valid(value)) return;
      changed = true;
      setDirection(value);
    };
    browser.storage.onChanged.addListener(listener);
    void browser.storage.local.get(key).then((stored) => {
      if (active && !changed && valid(stored[key])) setDirection(stored[key]);
    }).catch(() => {});
    return () => { active = false; browser.storage.onChanged.removeListener(listener); };
  }, []);
  const toggleDirection = useCallback(() => {
    const next = direction === "horizontal" ? "vertical" : "horizontal";
    setDirection(next);
    void browser.storage.local.set({ [key]: next }).catch(() => {});
  }, [direction]);
  return { direction, toggleDirection };
}
