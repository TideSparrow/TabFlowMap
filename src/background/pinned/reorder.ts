import { t } from "../../i18n";
export async function reorderPinnedTabs(tabId: number, targetTabId: number, side: "before" | "after") {
    const [source, target] = await Promise.all([
        browser.tabs.get(tabId).catch(() => undefined),
        browser.tabs.get(targetTabId).catch(() => undefined),
    ]);
    if (!source?.pinned || !target?.pinned || source.incognito || target.incognito) {
        throw new Error(t("m028"));
    }
    if (source.windowId !== target.windowId)
        throw new Error(t("m029"));
    if (tabId === targetTabId)
        return;
    const index = target.index + (side === "after" ? 1 : 0) - (source.index < target.index ? 1 : 0);
    if (index !== source.index)
        await browser.tabs.move(tabId, { index });
}
