import { t, getLocale } from "../i18n";
import { useEffect, useMemo, useState } from "react";
import { GitBranch, Plus, X } from "lucide-react";
import { CompactMapMenu } from "./CompactMapMenu";
import { MapControls } from "./MapControls";
import { MapTree } from "./tree/MapTree";
import type { MapDisplayMode } from "../core/view-options";
import { MapCanvas } from "./MapCanvas";
import { NodeDetails } from "./NodeDetails";
import { useTabMap } from "../hooks/useTabMap";
import { useMapDisplayMode } from "../hooks/useMapDisplayMode";
import { useMapMinimap } from "../hooks/useMapMinimap";
import { useMapLayoutDirection } from "../hooks/useMapLayoutDirection";
import { usePinnedTabs } from "../hooks/usePinnedTabs";
import { PinnedTabs } from "./pinned/PinnedTabs";
import { pinnedTabDragType, pinnedTabFromDrop } from "./pinned/drag";
import type { MapPlacement } from "../types/map";
import { defaultMapZoom } from "../core/window-geometry";
import { MapContextMenu } from "./context-menu/MapContextMenu";
import { useMapContextMenu } from "../hooks/useMapContextMenu";
import { mapContextActions, type CreateContextTab } from "./context-menu/actions";
import { useMapUndoShortcut } from "../hooks/useMapUndoShortcut";
import "./styles.css";
type Dialog = {
    kind: "start" | "add";
    parentId: string | null;
} | null;
export function MapApp({ mode = "sidepanel" }: {
    mode?: "sidepanel" | "embedded" | "window";
}) {
    const { view, run, error, busy, loading } = useTabMap();
    const undo = () => run({ action: "undo" });
    useMapUndoShortcut(Boolean(view.canUndo) && !busy && !loading, undo);
    const context = useMapContextMenu();
    const { tabs: pinnedTabs } = usePinnedTabs();
    const pinnedNodeIds = new Set(pinnedTabs.map((tab) => view.runtime.bindings[tab.id]).filter(Boolean));
    const togglePin = (nodeId: string) => run({ action: "pin-node", nodeId, pinned: !pinnedNodeIds.has(nodeId) });
    const unpinTab = (tabId: number) => run({ action: "unpin", tabId });
    const reorderPinned = (tabId: number, targetTabId: number, side: "before" | "after") => run({ action: "reorder-pinned", tabId, targetTabId, side });
    const { displayMode, setDisplayMode } = useMapDisplayMode();
    const { showMinimap, toggleMinimap } = useMapMinimap();
    const { direction, toggleDirection } = useMapLayoutDirection();
    const [locateRequest, setLocateRequest] = useState<{
        nodeId: string;
        requestId: number;
    } | null>(null);
    const [compactTools, setCompactTools] = useState<HTMLDivElement | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showDetails, setShowDetails] = useState(false);
    const [dialog, setDialog] = useState<Dialog>(null);
    const [draft, setDraft] = useState("");
    const nodes = useMemo(() => view.nodes.filter((node) => node.sessionId === view.sessionId), [view.nodes, view.sessionId]);
    const selected = nodes.find((node) => node.id === selectedId) ?? nodes.find((node) => node.id === view.runtime.activeNodeId);
    const session = view.sessions.find((item) => item.id === view.sessionId);
    const openIds = new Set(Object.values(view.runtime.bindings));
    useEffect(() => {
        if (selectedId && !nodes.some((node) => node.id === selectedId))
            setSelectedId(null);
        if (dialog?.parentId && !nodes.some((node) => node.id === dialog.parentId))
            setDialog(null);
    }, [view.sessionId, selectedId, nodes]);
    function openDialog(kind: "start" | "add", parentId: string | null = null) {
        setDraft(kind === "start" ? t("m002", new Date().toLocaleDateString(getLocale())) : "");
        setDialog({ kind, parentId });
        if (parentId) {
            setSelectedId(parentId);
            setShowDetails(false);
        }
    }
    const parent = dialog?.parentId ? nodes.find((node) => node.id === dialog.parentId) : undefined;
    const inlineDraft = displayMode !== "tree" && dialog?.kind === "add" && parent;
    function submitDialog() {
        if (!dialog || busy || !draft.trim())
            return;
        void run(dialog.kind === "start" ? { action: "start", name: draft } : { action: "add", text: draft, parentId: dialog.parentId })
            .then((ok) => { if (ok)
            setDialog(null); });
    }
    function cancelDraft() {
        if (busy)
            return;
        setDialog(null);
        requestAnimationFrame(() => {
            if (parent)
                document.querySelector<HTMLButtonElement>(`[data-id="${parent.id}"] .tm-branch-add`)?.focus();
        });
    }
    function openNewTab(parentId: string) {
        if (busy)
            return;
        setSelectedId(parentId);
        setShowDetails(false);
        void run({ action: "new-tab", parentId });
    }
    function changeDisplayMode(next: MapDisplayMode) {
        setShowDetails(false);
        setDisplayMode(next);
    }
    function openPinned(tabId: number, newTask = false, placement?: MapPlacement) {
        if (busy)
            return;
        setShowDetails(false);
        void run({ action: "pinned", tabId, newTask, placement }, (latest) => {
            if (!newTask)
                return;
            const nodeId = latest.runtime.activeNodeId;
            setSelectedId(nodeId);
            if (nodeId && !placement)
                setLocateRequest({ nodeId, requestId: performance.now() });
        });
    }
    const createContextTab: CreateContextTab = async (parentId, text, placement) => {
        if (busy)
            return false;
        setShowDetails(false);
        return run(text === undefined ? { action: "new-tab", parentId, placement } : { action: "add", text, parentId, placement }, (latest) => {
            const nodeId = latest.runtime.activeNodeId;
            setSelectedId(nodeId);
            if (nodeId && !placement)
                setLocateRequest({ nodeId, requestId: performance.now() });
        });
    };
    const deletePinned = (tabId: number) => { void run({ action: "delete-pinned", tabId }); };
    const controls = <MapControls view={view} count={nodes.length} busy={busy} loading={loading} run={run} onStart={() => openDialog("start")} onSession={(sessionId) => { setSelectedId(null); void run({ action: "session", sessionId }); }}/>;
    return <div className={`tm-app tm-mode-${mode} ${displayMode !== "detailed" ? "tm-app-compact" : ""}`}>
    {displayMode === "detailed" && controls}
    <CompactMapMenu toolsRef={setCompactTools} mode={mode} displayMode={displayMode} onDisplayMode={changeDisplayMode} showMinimap={showMinimap} onToggleMinimap={toggleMinimap} canClear={!busy && Boolean(nodes.length)} busy={busy} run={run} onAdd={() => openDialog("add")} canAdd={Boolean(session) && !busy}>{displayMode !== "detailed" && controls}</CompactMapMenu>
    {error && <div className="tm-error" role="alert">{error}<button onClick={() => void run({ action: "get" })}>{t("m071")}</button></div>}
    {loading ? <div className="tm-empty" role="status">{t("m072")}</div> : !nodes.length ? <div className="tm-empty tm-empty-with-pins" tabIndex={-1} onContextMenu={(event) => { if (!busy && !(event.target as Element).closest("button,input,.tm-pinned-tabs"))
            context.show(event); }} onDoubleClick={(event) => { if (!busy && !(event.target as Element).closest("button,input,.tm-pinned-tabs"))
            context.show(event); }} onDragOver={(event) => { if (!busy && event.dataTransfer.types.includes(pinnedTabDragType))
            event.preventDefault(); }} onDrop={(event) => { const tabId = pinnedTabFromDrop(event.dataTransfer); if (!busy && tabId !== null) {
            event.preventDefault();
            openPinned(tabId, true);
        } }}>
      <PinnedTabs direction={direction} busy={busy} canDrag={displayMode !== "tree"} onOpen={openPinned} onDelete={deletePinned} onUnpin={unpinTab} onReorder={reorderPinned}/>
      <GitBranch size={42} strokeWidth={1.2}/><h3>{session ? t("m073") : t("m074")}</h3>
      <p>{session ? t("m075") : t("m076")}</p>
      {!session && <button className="tm-button tm-primary" disabled={busy} onClick={() => openDialog("start")}><Plus size={15}/>{t("m077")}</button>}
      <span>{t("m078")}</span>
    </div> : <div className={`tm-workspace ${displayMode !== "detailed" ? "is-compact" : ""} ${displayMode === "detailed" && showDetails ? "has-details" : ""}`}>
      {displayMode === "tree" ? <MapTree key={`${view.sessionId}:tree`} nodes={nodes} runtime={view.runtime} selectedId={selected?.id ?? null} busy={busy} controlsContainer={compactTools} direction={direction} onPinnedOpen={openPinned} onPinnedDelete={deletePinned} onPinnedUnpin={unpinTab} onPinnedReorder={reorderPinned} pinnedNodeIds={pinnedNodeIds} onTogglePin={togglePin} canUndo={Boolean(view.canUndo)} onUndo={undo} locateRequest={locateRequest} onCreateContextTab={createContextTab} onReparent={(nodeId, parentId) => run({ action: "parent", nodeId, parentId })} onSelect={setSelectedId} onFocus={(nodeId) => void run({ action: "focus", nodeId })} onAdd={openNewTab} onDelete={(nodeId) => void run({ action: "delete", nodeId })} onDeleteMany={(nodeIds) => run({ action: "delete-many", nodeIds })}/> : <MapCanvas showMinimap={showMinimap} initialZoom={mode !== "sidepanel" && displayMode === "compact" ? defaultMapZoom : undefined} key={`${view.sessionId}:${displayMode}`} displayMode={displayMode} onDisplayMode={changeDisplayMode} controlsContainer={compactTools} nodes={nodes} runtime={view.runtime} selectedId={selected?.id ?? null} busy={busy} direction={direction} onDirection={() => { setLocateRequest(null); toggleDirection(); }} locateRequest={locateRequest} onPinnedOpen={openPinned} onPinnedDelete={deletePinned} onPinnedUnpin={unpinTab} onPinnedReorder={reorderPinned} pinnedNodeIds={pinnedNodeIds} onTogglePin={togglePin} canUndo={Boolean(view.canUndo)} onUndo={undo} onCreateContextTab={createContextTab} onPositionsChange={(items) => run({ action: "positions", displayMode: displayMode === "detailed" ? "detailed" : "compact", direction, items })} onPinnedDrop={(tabId, placement) => openPinned(tabId, true, placement)} addDraft={inlineDraft ? { parentId: parent.id, parentTitle: parent.title, text: draft, busy, error, onChange: setDraft, onSubmit: submitDialog, onCancel: cancelDraft } : null} onSelect={setSelectedId} onFocus={(nodeId) => void run({ action: "focus", nodeId })} onReparent={(nodeId, parentId) => run({ action: "parent", nodeId, parentId })} onInspect={(id) => { if (displayMode === "detailed") {
                setSelectedId(id);
                setShowDetails(true);
            } }} onAdd={openNewTab} onClose={(nodeId) => void run({ action: "close", nodeId })} onDelete={(nodeId) => void run({ action: "delete", nodeId })} onDeleteMany={(nodeIds) => run({ action: "delete-many", nodeIds })}/>}
      {displayMode === "detailed" && <NodeDetails node={selected} nodes={nodes} open={Boolean(selected && openIds.has(selected.id))} busy={busy} run={run} onAdd={openNewTab} onDismiss={() => setShowDetails(false)}/>}
    </div>}
    {context.anchor && !nodes.length && <MapContextMenu key={context.anchor.requestId} anchor={context.anchor} title={t("m045")} busy={busy} onClose={context.close} actions={mapContextActions({ create: createContextTab, focus: () => { if (view.runtime.activeNodeId)
                void run({ action: "focus", nodeId: view.runtime.activeNodeId }); } })}/>}
    {dialog && !inlineDraft && <div className="tm-modal-backdrop" onKeyDown={(event) => { if (event.key === "Escape" && !busy)
            setDialog(null); }}>
      <form className="tm-modal" role="dialog" aria-modal="true" aria-labelledby="tm-dialog-title" onSubmit={(event) => {
                event.preventDefault();
                submitDialog();
            }}>
        <div className="tm-modal-heading"><h3 id="tm-dialog-title">{dialog.kind === "start" ? t("m079") : parent ? t("m080") : t("m081")}</h3><button type="button" aria-label={t("m082")} disabled={busy} onClick={() => setDialog(null)}><X size={16}/></button></div>
        <p>{dialog.kind === "start" ? t("m083") : parent ? t("m084", parent.title) : t("m085")}</p>
        <label className="tm-field-label" htmlFor="tm-draft">{dialog.kind === "start" ? t("m086") : t("m067")}</label>
        <input id="tm-draft" autoFocus value={draft} maxLength={dialog.kind === "start" ? 100 : 2000} placeholder={dialog.kind === "start" ? t("m087") : t("m088")} onChange={(event) => setDraft(event.target.value)}/>
        {error && <p className="tm-dialog-error" role="alert">{error}</p>}
        <div className="tm-modal-actions"><button type="button" className="tm-button" disabled={busy} onClick={() => setDialog(null)}>{t("m089")}</button><button className="tm-button tm-primary" disabled={busy || !draft.trim()}>{busy ? t("m090") : dialog.kind === "start" ? t("m091") : t("m092")}</button></div>
      </form>
    </div>}
  </div>;
}
