import { useCallback, useEffect, useState } from "react";

export const followActiveTabKey = "tab-flow-map-follow-active-tab.v1";

export function useMapFollowActiveTab() {
  const [followActiveTab, setEnabled] = useState(false);
  useEffect(() => {
    let active = true, changed = false;
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "local" || !changes[followActiveTabKey]) return;
      changed = true;
      setEnabled(changes[followActiveTabKey].newValue === true);
    };
    browser.storage.onChanged.addListener(listener);
    void browser.storage.local.get(followActiveTabKey).then((saved) => {
      if (active && !changed) setEnabled(saved[followActiveTabKey] === true);
    }).catch(() => {});
    return () => { active = false; browser.storage.onChanged.removeListener(listener); };
  }, []);
  const toggleFollowActiveTab = useCallback(() => {
    const next = !followActiveTab;
    setEnabled(next);
    void browser.storage.local.set({ [followActiveTabKey]: next }).catch(() => {});
  }, [followActiveTab]);
  return { followActiveTab, toggleFollowActiveTab };
}
