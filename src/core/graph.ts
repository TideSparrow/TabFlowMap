import { t } from "../i18n";
import { emptyMapState, type MapNode, type MapState } from "../types/map";
export function httpUrl(value: string): string | null {
    try {
        const url = new URL(value);
        return /^https?:$/.test(url.protocol) ? url.href : null;
    }
    catch {
        return null;
    }
}
export function mapUrl(value: string): string | null {
    if (/^(chrome|edge):\/\/newtab\/?$/.test(value))
        return new URL(value).href;
    return value === "about:blank" ? value : httpUrl(value);
}
export function tabTitle(url: string, title?: string) {
    return /^(chrome|edge):\/\/newtab\/?$/.test(url) || url === "about:blank"
        ? t("m020") : title || new URL(url).hostname;
}
export function destination(value: string): string {
    const text = value.trim();
    if (!text || text.length > 2000)
        throw new Error(t("m021"));
    const direct = httpUrl(text);
    if (direct)
        return direct;
    if (/^[\w-]+(?:\.[\w-]+)+(?:[/:?#]|$)/.test(text)) {
        const url = httpUrl(`https://${text}`);
        if (url)
            return url;
    }
    if (/^[a-z]+:\/\//i.test(text))
        throw new Error(t("m022"));
    return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
}
function parentChangeError(nodes: MapNode[], nodeId: string, parentId: string | null) {
    const node = nodes.find((item) => item.id === nodeId);
    const parent = nodes.find((item) => item.id === parentId);
    if (!node || (parentId && (!parent || parent.sessionId !== node.sessionId))) {
        return t("m023");
    }
    const visited = new Set([nodeId]);
    let ancestor = parent;
    while (ancestor) {
        if (visited.has(ancestor.id))
            return t("m024");
        visited.add(ancestor.id);
        ancestor = nodes.find((item) => item.id === ancestor?.parentId);
    }
    return null;
}
export function canSetParent(nodes: MapNode[], nodeId: string, parentId: string | null) {
    return parentChangeError(nodes, nodeId, parentId) === null;
}
export function setParent(nodes: MapNode[], nodeId: string, parentId: string | null) {
    const error = parentChangeError(nodes, nodeId, parentId);
    if (error)
        throw new Error(error);
    const node = nodes.find((item) => item.id === nodeId)!;
    const previousParent = node.parentId;
    node.parentId = parentId;
    node.pendingSource = false;
    if (!parentId)
        node.kind = "root";
    else if (parentId !== previousParent)
        node.kind = "manual";
}
export function parseMapState(json: string): MapState {
    const value = JSON.parse(json) as MapState;
    if (value.version !== 1 || !Array.isArray(value.sessions) || !Array.isArray(value.nodes)) {
        throw new Error(t("m025"));
    }
    const state = emptyMapState();
    state.sessions = value.sessions.filter((session) => typeof session.id === "string" && typeof session.name === "string");
    const sessions = new Set(state.sessions.map((session) => session.id));
    const ids = new Set<string>();
    state.nodes = value.nodes.filter((node) => {
        if (!node || typeof node.id !== "string" || ids.has(node.id) || !sessions.has(node.sessionId) || !mapUrl(node.url))
            return false;
        ids.add(node.id);
        return true;
    }).map((node) => ({ ...node, note: String(node.note ?? ""), anchor: String(node.anchor ?? ""),
        scrollX: Number.isFinite(node.scrollX) ? node.scrollX : 0, scrollY: Number.isFinite(node.scrollY) ? node.scrollY : 0 }));
    state.nodes.forEach((node) => {
        const parentId = node.parentId;
        try {
            setParent(state.nodes.map((item) => ({ ...item })), node.id, parentId);
        }
        catch {
            node.parentId = null;
            node.pendingSource = false;
        }
    });
    state.sessionId = sessions.has(value.sessionId ?? "") ? value.sessionId : state.sessions.at(-1)?.id ?? null;
    state.recording = value.recording === true && state.sessionId !== null;
    return state;
}
export function breadcrumbs(nodes: MapNode[], nodeId: string | null) {
    const path: MapNode[] = [];
    const visited = new Set<string>();
    let node = nodes.find((item) => item.id === nodeId);
    while (node && !visited.has(node.id)) {
        path.unshift(node);
        visited.add(node.id);
        node = nodes.find((item) => item.id === node?.parentId);
    }
    return path;
}
