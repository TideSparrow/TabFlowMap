import { t } from "../i18n";
import { useEffect, useState } from "react";
import type { Browser } from "wxt/browser";
export type PinnedTab = Browser.tabs.Tab & {
    id: number;
    url: string;
};
export function usePinnedTabs() {
    const [tabs, setTabs] = useState<PinnedTab[]>([]);
    const [error, setError] = useState("");
    useEffect(() => {
        let active = true, generation = 0, queued = false;
        async function refresh() {
            const request = ++generation;
            try {
                const [result, window] = await Promise.all([
                    browser.tabs.query({ pinned: true }),
                    browser.windows.getLastFocused({ windowTypes: ["normal"] }),
                ]);
                if (!active || request !== generation)
                    return;
                setTabs(result.filter((tab): tab is PinnedTab => Boolean(tab.pinned && !tab.incognito &&
                    tab.id !== undefined && tab.url)).map((tab) => ({ ...tab, active: tab.active && tab.windowId === window.id }))
                    .sort((a, b) => a.windowId - b.windowId || a.index - b.index));
                setError("");
            }
            catch {
                if (active && request === generation)
                    setError(t("m230"));
            }
        }
        function schedule() {
            if (queued)
                return;
            queued = true;
            void Promise.resolve().then(() => { queued = false; if (active)
                void refresh(); });
        }
        const events = [browser.tabs.onCreated, browser.tabs.onUpdated, browser.tabs.onRemoved,
            browser.tabs.onMoved, browser.tabs.onAttached, browser.tabs.onDetached, browser.tabs.onReplaced, browser.tabs.onActivated];
        events.forEach((event) => event.addListener(schedule));
        browser.windows.onFocusChanged?.addListener(schedule);
        void refresh();
        return () => {
            active = false;
            generation++;
            events.forEach((event) => event.removeListener(schedule));
            browser.windows.onFocusChanged?.removeListener(schedule);
        };
    }, []);
    return { tabs, error };
}
