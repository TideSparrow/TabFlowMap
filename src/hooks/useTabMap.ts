import { t } from "../i18n";
import { useCallback, useEffect, useState } from "react";
import { emptyMapRuntime, emptyMapState, tabMapMessageType, tabMapStateKey, type MapCommand, type MapView } from "../types/map";
export function useTabMap() {
    const [view, setView] = useState<MapView>({ ...emptyMapState(), runtime: emptyMapRuntime() });
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const run = useCallback(async (command: MapCommand, onSuccess?: (view: MapView) => void) => {
        setBusy(true);
        setError("");
        try {
            const response = await browser.runtime.sendMessage({ ...command, type: tabMapMessageType });
            if (response?.view)
                setView(response.view);
            if (!response?.ok)
                throw new Error(response?.error || t("m252"));
            if (response.view)
                onSuccess?.(response.view);
            return true;
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : t("m184"));
            return false;
        }
        finally {
            setBusy(false);
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        const listener = (changes: Record<string, {
            newValue?: unknown;
        }>, area: string) => {
            if (area !== "local" || !changes[tabMapStateKey]?.newValue)
                return;
            const next = changes[tabMapStateKey].newValue as MapView;
            setView(next);
            if (next.error)
                setError(next.error);
        };
        browser.storage.onChanged.addListener(listener);
        void run({ action: "get" });
        return () => browser.storage.onChanged.removeListener(listener);
    }, [run]);
    return { view, run, error, busy, loading };
}
