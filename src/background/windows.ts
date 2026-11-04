import { t } from "../i18n";
import { tabMapOverlayKey } from "../types/map";
import { restoredMapSize, tabMapWindowBoundsKey as boundsKey } from "../core/window-geometry";
export function initializeMapWindows(openSidePanel?: (windowId: number) => Promise<void>, closeSidePanel?: () => Promise<void>) {
    let popupId: number | undefined;
    const url = browser.runtime.getURL("/tab-map.html?mode=window");
    browser.windows.onBoundsChanged.addListener((window) => {
        void (async () => {
            if (window.id !== popupId) {
                const tabs = await browser.tabs.query({ windowId: window.id });
                if (!tabs.some((tab) => tab.url === url))
                    return;
                popupId = window.id;
            }
            await browser.storage.local.set({ [boundsKey]: {
                    width: window.width, height: window.height, left: window.left, top: window.top,
                } });
        })().catch(() => undefined);
    });
    browser.windows.onRemoved.addListener((id) => { if (id === popupId)
        popupId = undefined; });
    return async (mode: "overlay" | "window" | "sidepanel", targetWindowId?: number) => {
        if (mode === "sidepanel") {
            const windowId = targetWindowId ?? (await browser.windows.getLastFocused({ windowTypes: ["normal"] })).id;
            if (!openSidePanel || windowId === undefined)
                throw new Error(t("m253"));
            await openSidePanel(windowId);
            await browser.storage.local.set({ [tabMapOverlayKey]: false });
            const popup = (await browser.tabs.query({})).find((tab) => tab.url === url)?.windowId;
            if (popup !== undefined)
                await browser.windows.remove(popup).catch(() => undefined);
            return;
        }
        await closeSidePanel?.();
        if (mode === "overlay") {
            await browser.storage.local.set({ [tabMapOverlayKey]: true });
            popupId = (await browser.tabs.query({})).find((tab) => tab.url === url)?.windowId;
            if (popupId !== undefined)
                await browser.windows.remove(popupId).catch(() => undefined);
            return;
        }
        const existing = (await browser.tabs.query({})).find((tab) => tab.url === url);
        if (existing?.windowId !== undefined) {
            popupId = existing.windowId;
            await browser.windows.update(popupId, { focused: true });
        }
        else {
            const saved = (await browser.storage.local.get(boundsKey))[boundsKey] as Record<string, number> | undefined;
            const created = await browser.windows.create({
                type: "popup", url, focused: true,
                ...restoredMapSize(saved),
                left: Number.isFinite(saved?.left) ? saved?.left : undefined,
                top: Number.isFinite(saved?.top) ? saved?.top : undefined,
            });
            popupId = created?.id;
        }
        await browser.storage.local.set({ [tabMapOverlayKey]: false });
    };
}
