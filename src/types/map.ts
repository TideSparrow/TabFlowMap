export const tabMapMessageType = "tab-flow-map";
export const tabMapStateKey = "tab-flow-map-view.v1";
export const tabMapRuntimeKey = "tab-flow-map-runtime.v1";
export const tabMapOverlayKey = "tab-flow-map-overlay.v1";
export const tabMapGeometryKey = "tab-flow-map-geometry.v1";

export type MapNode = {
  id: string;
  sessionId: string;
  parentId: string | null;
  url: string;
  title: string;
  kind: "root" | "link" | "navigation" | "copied" | "manual" | "unknown";
  keyword?: string;
  pendingSource?: boolean;
  note: string;
  createdAt: number;
  scrollX: number;
  scrollY: number;
  anchor: string;
};
export type MapSession = { id: string; name: string; createdAt: number };
export type MapState = {
  version: 1;
  recording: boolean;
  sessionId: string | null;
  sessions: MapSession[];
  nodes: MapNode[];
};
export type CopySource = { nodeId: string; text: string; at: number };
export type PasteWindow = { steps: number; source?: CopySource; rootId?: string; navigationUrl?: string };
export type MapRuntime = {
  suspended?: boolean;
  bindings: Record<string, string>;
  histories: Record<string, { nodeIds: string[]; index: number }>;
  copies: CopySource[];
  pendingParents: Record<string, string>;
  fixedSources: Record<string, string>;
  pasteWindows: Record<string, PasteWindow>;
  restores: Record<string, string>;
  activeNodeId: string | null;
};
export type MapView = MapState & { runtime: MapRuntime; error?: string; canUndo?: boolean };
export type MapPositionChange = { nodeId: string; position: { x: number; y: number } | null };
export type MapPlacement = { x: number; y: number; displayMode: "compact" | "detailed"; direction: "horizontal" | "vertical" };
export type MapCommand =
  | { action: "get" | "pause" | "resume" | "reload" | "suspend" | "overlay" | "window" }
  | { action: "sidepanel"; windowId: number }
  | { action: "clear" }
  | { action: "undo" }
  | { action: "positions"; displayMode: MapPlacement["displayMode"]; direction: MapPlacement["direction"]; items: MapPositionChange[] }
  | { action: "start"; name: string }
  | { action: "session"; sessionId: string }
  | { action: "add"; text: string; parentId: string | null; placement?: MapPlacement }
  | { action: "new-tab"; parentId: string | null; placement?: MapPlacement }
  | { action: "pinned"; tabId: number; newTask?: boolean; placement?: MapPlacement }
  | { action: "delete-pinned"; tabId: number }
  | { action: "unpin"; tabId: number }
  | { action: "reorder-pinned"; tabId: number; targetTabId: number; side: "before" | "after" }
  | { action: "pin-node"; nodeId: string; pinned: boolean }
  | { action: "focus" | "close" | "delete"; nodeId: string }
  | { action: "delete-many"; nodeIds: string[] }
  | { action: "edit"; nodeId: string; note: string }
  | { action: "parent"; nodeId: string; parentId: string | null }
  | { action: "copy" | "paste"; text: string; url: string }
  | { action: "step"; url: string }
  | { action: "checkpoint"; url: string; scrollX: number; scrollY: number; anchor: string }
  | { action: "ready"; url: string };

export function emptyMapState(): MapState {
  return { version: 1, recording: false, sessionId: null, sessions: [], nodes: [] };
}
export function emptyMapRuntime(): MapRuntime {
  return { bindings: {}, histories: {}, copies: [], pendingParents: {}, fixedSources: {}, pasteWindows: {}, restores: {}, activeNodeId: null };
}

export function isMapMessage(value: unknown): value is MapCommand & { type: typeof tabMapMessageType } {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (message.type !== tabMapMessageType) return false;
  const text = (key: string) => typeof message[key] === "string";
  const parent = () => message.parentId === null || text("parentId");
  const placed = () => {
    const value = message.placement as MapPlacement | undefined;
    return value === undefined || (value !== null && Number.isFinite(value.x) && Number.isFinite(value.y) &&
      ["compact", "detailed"].includes(value.displayMode) && ["horizontal", "vertical"].includes(value.direction));
  };
  switch (message.action) {
    case "get": case "pause": case "resume": case "reload": case "suspend": case "overlay": case "window": case "clear": case "undo": return true;
    case "positions": return ["compact", "detailed"].includes(String(message.displayMode)) && ["horizontal", "vertical"].includes(String(message.direction)) &&
      Array.isArray(message.items) && message.items.length <= 10000 && message.items.every((item) => item && typeof item.nodeId === "string" &&
        (item.position === null || (item.position && Number.isFinite(item.position.x) && Number.isFinite(item.position.y))));
    case "sidepanel": return Number.isInteger(message.windowId) && (message.windowId as number) > 0;
    case "start": return text("name");
    case "session": return text("sessionId");
    case "add": return text("text") && parent() && placed();
    case "new-tab": return parent() && placed();
    case "pin-node": return text("nodeId") && typeof message.pinned === "boolean";
    case "delete-pinned": case "unpin": return Number.isSafeInteger(message.tabId) && (message.tabId as number) > 0;
    case "reorder-pinned": return Number.isSafeInteger(message.tabId) && (message.tabId as number) > 0 &&
      Number.isSafeInteger(message.targetTabId) && (message.targetTabId as number) > 0 && (message.side === "before" || message.side === "after");
    case "pinned": {
      return Number.isInteger(message.tabId) && (message.tabId as number) > 0 &&
        (message.newTask === undefined || typeof message.newTask === "boolean") &&
        (message.placement === undefined || message.newTask === true) && placed();
    }
    case "focus": case "close": case "delete": return text("nodeId");
    case "delete-many": return Array.isArray(message.nodeIds) && message.nodeIds.every((id) => typeof id === "string" && id.length > 0);
    case "edit": return text("nodeId") && text("note");
    case "parent": return text("nodeId") && parent();
    case "copy": case "paste": return text("url") && text("text") && (message.text as string).length <= 500;
    case "ready": case "step": return text("url");
    case "checkpoint": return text("url") && text("anchor") &&
      Number.isFinite(message.scrollX) && Number.isFinite(message.scrollY);
    default: return false;
  }
}
