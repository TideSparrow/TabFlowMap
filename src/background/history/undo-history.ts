import { t } from "../../i18n";
import { canSetParent, setParent } from "../../core/graph";
import { branchDeletionOrder, removeMapNode } from "../../core/node-deletion";
import { mapPositionKeys, mapPositionPrefix } from "../../storage/positions";
import type { MapCommand, MapNode, MapRuntime, MapState } from "../../types/map";
import type { Browser } from "wxt/browser";
const historyKey = "tab-flow-map-undo.v1";
const tracked = new Set(["add", "new-tab", "pinned", "pin-node", "unpin", "close", "delete", "delete-many", "delete-pinned", "clear", "parent", "edit", "positions"]);
type SavedTab = {
    tabId: number;
    nodeId?: string;
    url: string;
    pinned: boolean;
    index: number;
    windowId: number;
    restoredTabId?: number;
};
type Fields = Pick<MapNode, "parentId" | "kind" | "note"> & {
    pendingSource: boolean | null;
};
type Entry = {
    sessionId: string | null;
    added: {
        id: string;
        close: boolean;
    }[];
    removed: MapNode[];
    changed: {
        id: string;
        before: Fields;
        after: Fields;
    }[];
    closed: SavedTab[];
    pins: SavedTab[];
    positions: Record<string, {
        x: number;
        y: number;
    } | null>;
    focusId?: string;
    recording?: {
        before: boolean;
        after: boolean;
    };
};
type Snapshot = {
    state: MapState;
    runtime: MapRuntime;
    tabs: Browser.tabs.Tab[];
    positions: Entry["positions"];
    affectedTabIds: number[];
};
const storedPosition = (value: unknown) => {
    const item = value as {
        x?: number;
        y?: number;
    } | null;
    return item && Number.isFinite(item.x) && Number.isFinite(item.y) ? { x: item.x!, y: item.y! } : null;
};
const fields = (node: MapNode): Fields => ({ parentId: node.parentId, kind: node.kind, note: node.note, pendingSource: node.pendingSource ?? null });
const tabSnapshot = (tab: Browser.tabs.Tab, runtime: MapRuntime): SavedTab => ({ tabId: tab.id!, nodeId: runtime.bindings[tab.id!],
    url: tab.url || tab.pendingUrl || "chrome://newtab/", pinned: Boolean(tab.pinned), index: tab.index, windowId: tab.windowId });
export function createUndoHistory() {
    let entries: Entry[] = [];
    async function save() { await browser.storage.session.set({ [historyKey]: entries }); }
    return {
        async load() {
            const saved = (await browser.storage.session.get(historyKey))[historyKey];
            if (Array.isArray(saved))
                entries = saved.slice(-50);
        },
        clear() { entries = []; return save(); },
        available(sessionId: string | null) { return entries.some((entry) => entry.sessionId === sessionId); },
        async capture(command: MapCommand, state: MapState, runtime: MapRuntime): Promise<Snapshot | null> {
            if (!tracked.has(command.action) || (command.action === "pinned" && !command.newTask))
                return null;
            const selectedIds = command.action === "clear" ? state.nodes.filter((node) => node.sessionId === state.sessionId).map((node) => node.id)
                : command.action === "delete-many" ? command.nodeIds : ["close", "delete"].includes(command.action) && "nodeId" in command ? [command.nodeId] : [];
            const affectedNodes = new Set(branchDeletionOrder(state, selectedIds));
            if (command.action === "pin-node")
                affectedNodes.add(command.nodeId);
            if (command.action === "delete-pinned") {
                const node = state.nodes.find((node) => node.id === runtime.bindings[command.tabId]);
                if (node)
                    branchDeletionOrder({ ...state, sessionId: node.sessionId }, [node.id]).forEach((id) => affectedNodes.add(id));
            }
            const affectedTabIds = Object.entries(runtime.bindings).filter(([, id]) => affectedNodes.has(id)).map(([id]) => Number(id));
            if (command.action === "unpin" || command.action === "delete-pinned")
                affectedTabIds.push(command.tabId);
            const keys = command.action === "positions" ? command.items.map((item) => mapPositionPrefix(command.displayMode, command.direction) + item.nodeId)
                : ["delete", "delete-many", "delete-pinned", "clear", "close"].includes(command.action)
                    ? state.nodes.filter((node) => affectedNodes.has(node.id)).flatMap((node) => mapPositionKeys(node.id)) : [];
            const [tabs, stored] = await Promise.all([browser.tabs.query({}), browser.storage.local.get(keys)]);
            return { state: structuredClone(state), runtime: structuredClone(runtime), tabs: tabs.filter((tab) => !tab.incognito),
                affectedTabIds, positions: Object.fromEntries(keys.map((key) => [key, storedPosition(stored[key])])) };
        },
        async record(before: Snapshot | null, state: MapState, runtime: MapRuntime) {
            if (!before)
                return;
            const [tabs, stored] = await Promise.all([browser.tabs.query({}), browser.storage.local.get(Object.keys(before.positions))]);
            const previous = new Map(before.state.nodes.map((node) => [node.id, node])), current = new Map(state.nodes.map((node) => [node.id, node]));
            const oldTabs = new Map(before.tabs.map((tab) => [tab.id, tab])), liveTabs = new Map(tabs.map((tab) => [tab.id, tab]));
            const entry: Entry = { sessionId: state.sessionId, added: [], removed: [], changed: [], closed: [], pins: [], positions: {} };
            for (const node of state.nodes) {
                const old = previous.get(node.id);
                if (!old)
                    entry.added.push({ id: node.id, close: Object.entries(runtime.bindings).some(([tabId, id]) => id === node.id && !oldTabs.has(Number(tabId))) });
                else if (JSON.stringify(fields(old)) !== JSON.stringify(fields(node)))
                    entry.changed.push({ id: node.id, before: fields(old), after: fields(node) });
            }
            entry.removed = before.state.nodes.filter((node) => !current.has(node.id));
            if (before.runtime.activeNodeId && (entry.added.length || entry.removed.some((node) => node.id === before.runtime.activeNodeId)))
                entry.focusId = before.runtime.activeNodeId;
            for (const tab of before.tabs) {
                const live = liveTabs.get(tab.id);
                if ((!live && before.affectedTabIds.includes(tab.id!)) || entry.removed.some((node) => node.id === before.runtime.bindings[tab.id!]))
                    entry.closed.push(tabSnapshot(tab, before.runtime));
                else if (live && before.affectedTabIds.includes(tab.id!) && Boolean(tab.pinned) !== Boolean(live.pinned))
                    entry.pins.push(tabSnapshot(tab, before.runtime));
            }
            for (const [key, value] of Object.entries(before.positions)) {
                if (JSON.stringify(value) !== JSON.stringify(stored[key] ?? null))
                    entry.positions[key] = value;
            }
            if (before.state.recording !== state.recording)
                entry.recording = { before: before.state.recording, after: state.recording };
            if (!entry.added.length && !entry.removed.length && !entry.changed.length && !entry.closed.length && !entry.pins.length && !Object.keys(entry.positions).length && !entry.recording)
                return;
            entries.push(entry);
            entries = entries.slice(-50);
            await save();
        },
        async undo(state: MapState, runtime: MapRuntime, closeNodes: (ids: string[]) => Promise<void>, onUntrackedRestore: (tabId: number, url: string) => void) {
            const index = entries.findLastIndex((entry) => entry.sessionId === state.sessionId), entry = entries[index];
            if (!entry)
                return;
            // The inverse applies only to this action's nodes; later browsing and other workflows stay intact.
            await closeNodes(entry.added.filter((item) => item.close && state.nodes.some((node) => node.id === item.id)).map((item) => item.id));
            for (const item of entry.added.filter((item) => !item.close))
                removeMapNode(state, runtime, item.id);
            const normal = await browser.windows.getLastFocused({ windowTypes: ["normal"] }).catch(() => undefined);
            for (const saved of entry.closed) {
                const bound = saved.nodeId && Object.entries(runtime.bindings).find(([, id]) => id === saved.nodeId)?.[0];
                let tab = await browser.tabs.get(Number(bound ?? saved.restoredTabId ?? saved.tabId)).catch(() => undefined);
                if (!tab || tab.incognito || tab.url !== saved.url) {
                    const options = { url: saved.url, pinned: saved.pinned, index: saved.index, active: false };
                    tab = await browser.tabs.create({ ...options, windowId: saved.windowId }).catch(() => browser.tabs.create({ ...options, windowId: normal?.id }));
                    if (tab.id === undefined)
                        throw new Error(t("m026"));
                    saved.restoredTabId = tab.id;
                    await save();
                }
                if (!saved.nodeId)
                    onUntrackedRestore(tab.id!, saved.url);
                const node = entry.removed.find((item) => item.id === saved.nodeId);
                if (node && !state.nodes.some((item) => item.id === node.id))
                    state.nodes.push(structuredClone(node));
                if (saved.nodeId && state.nodes.some((item) => item.id === saved.nodeId)) {
                    runtime.bindings[tab.id!] = saved.nodeId;
                    runtime.restores[tab.id!] = saved.nodeId;
                    runtime.fixedSources[tab.id!] = saved.nodeId;
                    runtime.histories[tab.id!] = { nodeIds: [saved.nodeId], index: 0 };
                    delete runtime.pasteWindows[tab.id!];
                }
            }
            for (const item of entry.changed) {
                const node = state.nodes.find((node) => node.id === item.id);
                if (!node)
                    continue;
                if (node.parentId === item.after.parentId && node.kind === item.after.kind) {
                    const parentId = state.nodes.some((parent) => parent.id === item.before.parentId) && canSetParent(state.nodes, node.id, item.before.parentId) ? item.before.parentId : null;
                    setParent(state.nodes, node.id, parentId);
                    node.kind = item.before.kind;
                    if (item.before.pendingSource === null)
                        delete node.pendingSource;
                    else
                        node.pendingSource = item.before.pendingSource;
                    for (const [tabId, id] of Object.entries(runtime.bindings))
                        if (id === node.id) {
                            runtime.fixedSources[tabId] = id;
                            delete runtime.pasteWindows[tabId];
                        }
                }
                if (node.note === item.after.note)
                    node.note = item.before.note;
            }
            for (const saved of entry.pins) {
                const bound = saved.nodeId && Object.entries(runtime.bindings).find(([, id]) => id === saved.nodeId)?.[0];
                const tabId = Number(bound || saved.tabId), tab = await browser.tabs.get(tabId).catch(() => undefined);
                if (tab && !tab.incognito && tab.url === saved.url)
                    await browser.tabs.update(tabId, { pinned: saved.pinned });
            }
            const restore: Record<string, unknown> = {}, remove: string[] = [];
            for (const [key, value] of Object.entries(entry.positions))
                value ? restore[key] = value : remove.push(key);
            if (Object.keys(restore).length)
                await browser.storage.local.set(restore);
            if (remove.length)
                await browser.storage.local.remove(remove);
            if (entry.recording && state.recording === entry.recording.after)
                state.recording = entry.recording.before;
            // A source may have been closed independently since the original deletion.
            for (const node of state.nodes)
                if (node.parentId && !state.nodes.some((parent) => parent.id === node.parentId))
                    node.parentId = null;
            if (entry.focusId) {
                const binding = Object.entries(runtime.bindings).find(([, id]) => id === entry.focusId);
                if (binding) {
                    await browser.tabs.update(Number(binding[0]), { active: true });
                    runtime.activeNodeId = entry.focusId;
                }
            }
            entries.splice(index, 1);
            await save();
        },
    };
}
