import { useCallback, useEffect, useState } from "react";

const key = "tab-flow-map-minimap.v1";
export function useMapMinimap() {
  const [showMinimap, setVisible] = useState(false);
  useEffect(() => {
    let active = true, changed = false;
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "local" || !changes[key]) return;
      changed = true; setVisible(changes[key].newValue === true);
    };
    browser.storage.onChanged.addListener(listener);
    void browser.storage.local.get(key).then((saved) => { if (active && !changed) setVisible(saved[key] === true); }).catch(() => {});
    return () => { active = false; browser.storage.onChanged.removeListener(listener); };
  }, []);
  const toggleMinimap = useCallback(() => {
    const next = !showMinimap;
    setVisible(next);
    void browser.storage.local.set({ [key]: next }).catch(() => {});
  }, [showMinimap]);
  return { showMinimap, toggleMinimap };
}
