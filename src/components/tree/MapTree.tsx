import { t } from "../../i18n";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { ChevronsDown, ChevronsUp, Crosshair, Focus, Undo2, Search, Trash2 } from "lucide-react";
import type { MapNode, MapRuntime } from "../../types/map";
import { breadcrumbs } from "../../core/graph";
import { MapTooltip } from "../MapTooltip";
import { useMapDeleteShortcut } from "../../hooks/useMapDeleteShortcut";
import { useMapFollowActiveTab } from "../../hooks/useMapFollowActiveTab";
import { followTargetKey } from "../../core/follow-target";
import { useReducedMapMotion } from "../../hooks/useGraphMotion";
import { buildTreeRows } from "./tree-model";
import { TreeTabRow } from "./TreeTabRow";
import { PinnedTabs } from "../pinned/PinnedTabs";
import { MapSearch } from "../search/MapSearch";
import type { MapLayoutDirection } from "../../core/view-options";
import { MapContextMenu } from "../context-menu/MapContextMenu";
import { useMapContextMenu } from "../../hooks/useMapContextMenu";
import { mapContextActions, type CreateContextTab } from "../context-menu/actions";
import "./styles.css";
type Props = {
    direction: MapLayoutDirection;
    onPinnedOpen: (tabId: number, newTask?: boolean) => void;
    onPinnedDelete: (tabId: number) => void;
    canUndo: boolean;
    onUndo: () => Promise<boolean>;
    onPinnedUnpin: (tabId: number) => Promise<boolean>;
    onPinnedReorder: (tabId: number, targetTabId: number, side: "before" | "after") => Promise<boolean>;
    pinnedNodeIds: Set<string>;
    onTogglePin: (nodeId: string) => Promise<boolean>;
    locateRequest?: {
        nodeId: string;
        requestId: number;
    } | null;
    nodes: MapNode[];
    runtime: MapRuntime;
    selectedId: string | null;
    busy: boolean;
    controlsContainer: HTMLElement | null;
    onSelect: (id: string) => void;
    onFocus: (id: string) => void;
    onAdd: (id: string) => void;
    onDelete: (id: string) => void;
    onCreateContextTab: CreateContextTab;
    onReparent: (nodeId: string, parentId: string | null) => Promise<boolean>;
    onDeleteMany: (ids: string[]) => Promise<boolean>;
};
export function MapTree({ direction, onPinnedOpen, onPinnedDelete, onPinnedUnpin, onPinnedReorder, canUndo, onUndo, pinnedNodeIds, onTogglePin, locateRequest, nodes, runtime, selectedId, busy, controlsContainer, onSelect, onFocus, onAdd, onDelete, onDeleteMany, onCreateContextTab, onReparent }: Props) {
    const context = useMapContextMenu();
    const contextNode = nodes.find((node) => node.id === context.anchor?.nodeId);
    useEffect(() => { if (context.anchor?.nodeId && !contextNode)
        context.close(); }, [context.anchor, contextNode, context.close]);
    const [collapsed, setCollapsed] = useState(new Set<string>());
    const [selectedIds, setSelectedIds] = useState(new Set(selectedId ? [selectedId] : []));
    const [query, setQuery] = useState("");
    const [focusedId, setFocusedId] = useState(selectedId);
    const anchor = useRef(selectedId), lastFollowed = useRef<string | null>(null), frame = useRef(0);
    const tree = useRef<HTMLDivElement>(null);
    const reducedMotion = useReducedMapMotion();
    const { followActiveTab, toggleFollowActiveTab } = useMapFollowActiveTab();
    const followKey = followTargetKey(nodes, runtime.activeNodeId);
    const rows = useMemo(() => buildTreeRows(nodes, collapsed, query), [nodes, collapsed, query]);
    const openIds = new Set(Object.values(runtime.bindings));
    const tabStop = rows.some((row) => row.node.id === focusedId) ? focusedId : rows[0]?.node.id;
    useEffect(() => {
        const ids = new Set(nodes.map((node) => node.id));
        setSelectedIds((previous) => new Set([...previous].filter((id) => ids.has(id))));
    }, [nodes]);
    useEffect(() => () => cancelAnimationFrame(frame.current), []);
    const deleteSelected = useCallback(async () => {
        if (busy || !selectedIds.size)
            return;
        if (await onDeleteMany([...selectedIds]))
            setSelectedIds(new Set());
    }, [busy, selectedIds, onDeleteMany]);
    useMapDeleteShortcut(!busy && selectedIds.size > 0, deleteSelected);
    function selectOne(id: string) {
        setSelectedIds(new Set([id]));
        setFocusedId(id);
        anchor.current = id;
        onSelect(id);
    }
    function select(event: MouseEvent, id: string) {
        if (event.shiftKey && anchor.current) {
            const start = rows.findIndex((row) => row.node.id === anchor.current), end = rows.findIndex((row) => row.node.id === id);
            if (start >= 0 && end >= 0) {
                const range = rows.slice(Math.min(start, end), Math.max(start, end) + 1).map((row) => row.node.id);
                setSelectedIds(new Set(event.metaKey || event.ctrlKey ? [...selectedIds, ...range] : range));
                setFocusedId(id);
                return;
            }
        }
        if (event.metaKey || event.ctrlKey) {
            setSelectedIds((previous) => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
            setFocusedId(id);
            anchor.current = id;
            return;
        }
        selectOne(id);
    }
    function expand(id: string) {
        setCollapsed((previous) => { if (!previous.has(id))
            return previous; const next = new Set(previous); next.delete(id); return next; });
    }
    function toggle(id: string) {
        setCollapsed((previous) => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
    }
    function reveal(id: string | null) {
        if (!id || !nodes.some((node) => node.id === id))
            return;
        const ancestors = new Set(breadcrumbs(nodes, id).map((node) => node.id));
        setCollapsed((previous) => new Set([...previous].filter((value) => !ancestors.has(value))));
        setQuery("");
        selectOne(id);
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(() => {
            tree.current?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.scrollIntoView({ block: "center", inline: "nearest", behavior: reducedMotion ? "instant" : "smooth" });
        });
    }
    useEffect(() => {
        if (locateRequest)
            reveal(locateRequest.nodeId);
    }, [locateRequest]);
    useEffect(() => {
        if (!followActiveTab || !runtime.activeNodeId || !followKey) {
            lastFollowed.current = null;
            return;
        }
        if (busy)
            return;
        if (!nodes.some((node) => node.id === runtime.activeNodeId)) {
            lastFollowed.current = null;
            return;
        }
        if (lastFollowed.current === followKey)
            return;
        lastFollowed.current = followKey;
        reveal(runtime.activeNodeId);
    }, [followActiveTab, followKey, runtime.activeNodeId, nodes, busy]);
    function focusRow(id: string) {
        selectOne(id);
        tree.current?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus();
    }
    function keyDown(event: KeyboardEvent) {
        const item = (event.target as HTMLElement).closest<HTMLElement>("[role='treeitem']");
        if (!item)
            return;
        const index = rows.findIndex((row) => row.node.id === item.dataset.id), row = rows[index];
        if (!row)
            return;
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
            event.preventDefault();
            setSelectedIds(new Set(rows.map((entry) => entry.node.id)));
            return;
        }
        const destination = event.key === "ArrowDown" ? rows[Math.min(index + 1, rows.length - 1)]
            : event.key === "ArrowUp" ? rows[Math.max(index - 1, 0)] : event.key === "Home" ? rows[0] : event.key === "End" ? rows.at(-1) : undefined;
        if (destination) {
            event.preventDefault();
            focusRow(destination.node.id);
        }
        else if (event.key === "ArrowRight") {
            event.preventDefault();
            if (row.children && collapsed.has(row.node.id))
                expand(row.node.id);
            else if (rows[index + 1]?.node.parentId === row.node.id)
                focusRow(rows[index + 1].node.id);
        }
        else if (event.key === "ArrowLeft") {
            event.preventDefault();
            if (row.children && !collapsed.has(row.node.id))
                toggle(row.node.id);
            else if (row.node.parentId && rows.some((entry) => entry.node.id === row.node.parentId))
                focusRow(row.node.parentId);
        }
        else if (event.target === item && event.key === "Enter" && !busy) {
            event.preventDefault();
            onFocus(row.node.id);
        }
        else if (event.target === item && event.code === "Space") {
            event.preventDefault();
            selectOne(row.node.id);
        }
    }
    const tools = <div className="tm-canvas-tools"><label className="tm-search"><Search size={14}/>
    <input aria-label={t("m238")} placeholder={t("m117")} value={query} onChange={(event) => setQuery(event.target.value)}/></label>
    <span className="tm-muted">{t("m239", rows.length, nodes.length)}</span></div>;
    return <div className={`tm-tree-shell tm-tree-pins-${direction}`} tabIndex={-1}>
    <MapSearch nodes={nodes} query={query} onQuery={setQuery} busy={busy} onNavigate={(id) => { reveal(id); onFocus(id); }}/>
    <PinnedTabs direction={direction} busy={busy} canDrag={false} onOpen={onPinnedOpen} onDelete={onPinnedDelete} onUnpin={onPinnedUnpin} onReorder={onPinnedReorder}/>
    {controlsContainer && createPortal(tools, controlsContainer)}
    {selectedIds.size > 1 && <div className="tm-selection-actions"><button className="tm-button" disabled={busy} title={t("m119")} onClick={() => void deleteSelected()}><Trash2 size={14}/>{t("m118", selectedIds.size)}</button></div>}
    <div className="tm-tree-scroll" role="tree" aria-label={t("m240")} aria-multiselectable="true" ref={tree} onKeyDown={keyDown} onContextMenu={(event) => {
            if (busy)
                return;
            const target = event.target as Element, id = target.closest<HTMLElement>("[role=treeitem]")?.dataset.id;
            if (id) {
                if (!selectedIds.has(id))
                    selectOne(id);
                context.show(event, { nodeId: id });
            }
            else if (!target.closest("button,input,textarea"))
                context.show(event);
        }} onDoubleClick={(event) => {
            if (!busy && !(event.target as Element).closest("[role=treeitem],button,input,textarea"))
                context.show(event);
        }}>
      {rows.map((row) => <TreeTabRow key={row.node.id} row={row} expanded={Boolean(query.trim()) || !collapsed.has(row.node.id)} selected={selectedIds.has(row.node.id)} current={runtime.activeNodeId === row.node.id && openIds.has(row.node.id)} open={openIds.has(row.node.id)} busy={busy} tabIndex={tabStop === row.node.id ? 0 : -1} onSelect={select} onToggle={toggle} onFocus={onFocus} onAdd={(id) => { expand(id); selectOne(id); onAdd(id); }} onDelete={onDelete}/>)}
      {!rows.length && <div className="tm-tree-no-results">{t("m236")}</div>}
    </div>
    {context.anchor && <MapContextMenu key={context.anchor.requestId} anchor={context.anchor} title={contextNode?.title ?? t("m045")} busy={busy} onClose={context.close} actions={mapContextActions({ node: contextNode, pinned: Boolean(contextNode && pinnedNodeIds.has(contextNode.id)),
                togglePin: contextNode ? () => onTogglePin(contextNode.id) : undefined, create: onCreateContextTab,
                focus: (id) => { reveal(id ?? runtime.activeNodeId ?? selectedId); if (id)
                    onFocus(id); },
                remove: contextNode ? () => onDelete(contextNode.id) : undefined, selectedCount: selectedIds.size, removeSelected: deleteSelected,
                toggle: contextNode && nodes.some((node) => node.parentId === contextNode.id) ? () => toggle(contextNode.id) : undefined,
                collapsed: contextNode && collapsed.has(contextNode.id), makeRoot: contextNode ? () => onReparent(contextNode.id, null) : undefined })}/>}
    <div className="tm-zoom tm-canvas-viewport-tools" aria-label={t("m248")}>
      <MapTooltip label={t("m099")}><button data-tool="undo" aria-label={t("m098")} disabled={busy || !canUndo} onClick={() => void onUndo()}><Undo2 size={15}/></button></MapTooltip>
      <MapTooltip label={t("m242")}><button data-tool="tree-expand" aria-label={t("m241")} onClick={() => setCollapsed(new Set())}><ChevronsDown size={16}/></button></MapTooltip>
      <MapTooltip label={t("m244")}><button data-tool="tree-collapse" aria-label={t("m243")} onClick={() => { setQuery(""); setCollapsed(new Set(nodes.filter((node) => nodes.some((child) => child.parentId === node.id)).map((node) => node.id))); }}><ChevronsUp size={16}/></button></MapTooltip>
      <MapTooltip label={t("m245")}><button data-tool="locate" aria-label={t("m102")} onClick={() => reveal(runtime.activeNodeId ?? selectedId)}><Crosshair size={15}/></button></MapTooltip>
      <MapTooltip label={followActiveTab ? t("m246") : t("m247")}><button data-tool="follow" aria-label={t("m104")} aria-pressed={followActiveTab} onClick={toggleFollowActiveTab}><Focus size={15}/></button></MapTooltip>
    </div>
  </div>;
}
