import { useCallback, useEffect, useState } from "react";
import type { MapDisplayMode } from "../core/view-options";

const key = "tab-flow-map-display-mode.v1";
export function useMapDisplayMode() {
  const [displayMode, setMode] = useState<MapDisplayMode>("detailed");
  useEffect(() => {
    let active = true;
    let changed = false;
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      const value = changes[key]?.newValue;
      if (area !== "local" || (value !== "detailed" && value !== "compact" && value !== "tree")) return;
      changed = true;
      setMode(value);
    };
    browser.storage.onChanged.addListener(listener);
    void browser.storage.local.get(key).then((stored) => {
      if (active && !changed && (stored[key] === "compact" || stored[key] === "detailed" || stored[key] === "tree")) setMode(stored[key]);
    }).catch(() => {});
    return () => { active = false; browser.storage.onChanged.removeListener(listener); };
  }, []);
  const setDisplayMode = useCallback((mode: MapDisplayMode) => {
    setMode(mode);
    void browser.storage.local.set({ [key]: mode }).catch(() => {});
  }, []);
  return { displayMode, setDisplayMode };
}
