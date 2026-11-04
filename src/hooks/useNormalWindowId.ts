import { useEffect, useState } from "react";

// Resolve the target before clicking; sidePanel.open must run without preceding awaits.
export function useNormalWindowId() {
  const [windowId, setWindowId] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => { void browser.windows.getLastFocused({ windowTypes: ["normal"] })
      .then((target) => { if (active) setWindowId(target.id ?? null); }).catch(() => {}); };
    refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, []);
  return windowId;
}
