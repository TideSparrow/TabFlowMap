import { t } from "../i18n";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, MiniMap, SelectionMode, ReactFlow, ReactFlowProvider, useNodesInitialized, useReactFlow, useStore, type Connection, type Edge, type NodeChange } from "@xyflow/react";
import { ArrowDown, ArrowRight, Crosshair, Focus, Hand, Maximize, Minus, MousePointer2, Plus, RotateCcw, Undo2, Search, Trash2 } from "lucide-react";
import { layoutMap } from "../core/layout";
import { MapDisplaySwitch } from "./MapDisplaySwitch";
import { MapTooltip } from "./MapTooltip";
import { MapZoomReset } from "./controls/MapZoomReset";
import { TabMapNode, type TabFlowNode } from "./TabMapNode";
import { lineageHandleId } from "./NodeParentHandle";
import { useCanvasPositions } from "../hooks/useCanvasPositions";
import { useNodeMeasurements } from "../hooks/useNodeMeasurements";
import { useMapInteraction } from "../hooks/useMapInteraction";
import { useMapDeleteShortcut } from "../hooks/useMapDeleteShortcut";
import { useMapFollowActiveTab } from "../hooks/useMapFollowActiveTab";
import { followTargetKey } from "../core/follow-target";
import { MainTaskNavigation } from "./navigation/MainTaskNavigation";
import { mainTaskNavigation } from "./navigation/main-tasks";
import { pinnedTabDragType, pinnedTabFromDrop } from "./pinned/drag";
import { PinnedTabs } from "./pinned/PinnedTabs";
import { MapSearch } from "./search/MapSearch";
import { nodeSizes, type CanvasDisplayMode, type MapDisplayMode, type MapLayoutDirection } from "../core/view-options";
import { DraftTabNode, draftNodeId, draftNodeSize, placeDraftNode, type AddNodeDraft, type DraftFlowNode } from "./DraftTabNode";
import { useGraphMotion, useReducedMapMotion } from "../hooks/useGraphMotion";
import type { MapNode, MapRuntime, MapPlacement, MapPositionChange } from "../types/map";
import { breadcrumbs, canSetParent } from "../core/graph";
import { MapContextMenu } from "./context-menu/MapContextMenu";
import { useMapContextMenu } from "../hooks/useMapContextMenu";
import { mapContextActions, type CreateContextTab } from "./context-menu/actions";
import "@xyflow/react/dist/style.css";
const nodeTypes = { tab: TabMapNode, draft: DraftTabNode };
const easeCenter = (progress: number) => progress < 0.5
    ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
type FlowNode = TabFlowNode | DraftFlowNode;
type Props = {
    direction: MapLayoutDirection;
    onDirection: () => void;
    locateRequest?: {
        nodeId: string;
        requestId: number;
    } | null;
    onPinnedDrop?: (tabId: number, placement: MapPlacement) => void;
    onPinnedDelete: (tabId: number) => void;
    canUndo: boolean;
    onUndo: () => Promise<boolean>;
    onPositionsChange: (items: MapPositionChange[]) => Promise<boolean>;
    onPinnedUnpin: (tabId: number) => Promise<boolean>;
    onPinnedReorder: (tabId: number, targetTabId: number, side: "before" | "after") => Promise<boolean>;
    pinnedNodeIds: Set<string>;
    onTogglePin: (nodeId: string) => Promise<boolean>;
    onPinnedOpen: (tabId: number, newTask?: boolean) => void;
    addDraft: AddNodeDraft | null;
    initialZoom?: number;
    showMinimap: boolean;
    controlsContainer?: HTMLElement | null;
    displayMode: CanvasDisplayMode;
    onDisplayMode: (mode: MapDisplayMode) => void;
    nodes: MapNode[];
    runtime: MapRuntime;
    selectedId: string | null;
    busy: boolean;
    onSelect: (id: string) => void;
    onInspect: (id: string) => void;
    onFocus: (id: string) => void;
    onAdd: (id: string) => void;
    onClose: (id: string) => void;
    onDelete: (id: string) => void;
    onDeleteMany: (ids: string[]) => Promise<boolean>;
    onCreateContextTab: CreateContextTab;
    onReparent: (nodeId: string, parentId: string | null) => Promise<boolean>;
};
export function MapCanvas(props: Props) {
    // Remount the flow when ports change sides, so XYFlow measures their new
    // anchors and restores the saved positions for this direction before fitting.
    return <ReactFlowProvider key={props.direction}><FlowCanvas {...props}/></ReactFlowProvider>;
}
function FlowCanvas({ direction, onDirection, locateRequest, onPinnedDrop, onPinnedOpen, onPinnedDelete, onPinnedUnpin, onPinnedReorder, canUndo, onUndo, onPositionsChange, pinnedNodeIds, onTogglePin, showMinimap, initialZoom, controlsContainer, addDraft, displayMode, onDisplayMode, nodes, runtime, selectedId, busy, onSelect, onInspect, onFocus, onAdd, onClose, onDelete, onDeleteMany, onReparent, onCreateContextTab }: Props) {
    const context = useMapContextMenu();
    const contextNode = nodes.find((node) => node.id === context.anchor?.nodeId);
    useEffect(() => { if (context.anchor?.nodeId && !contextNode)
        context.close(); }, [context.anchor, contextNode, context.close]);
    const [selectedIds, setSelectedIds] = useState(new Set(selectedId ? [selectedId] : []));
    const [collapsed, setCollapsed] = useState(new Set<string>());
    const [query, setQuery] = useState("");
    const { interactionMode, toggleInteractionMode } = useMapInteraction();
    const { followActiveTab, toggleFollowActiveTab } = useMapFollowActiveTab();
    const lastFollowedNode = useRef<string | null>(null);
    const lastLocatedRequest = useRef<number | null>(null);
    const followKey = followTargetKey(nodes, runtime.activeNodeId);
    const [dragging, setDragging] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const { positions, ready, move, reset, commit } = useCanvasPositions(nodes, displayMode, direction, onPositionsChange);
    const { measurements, measure } = useNodeMeasurements<FlowNode>();
    const size = nodeSizes[displayMode];
    const flow = useReactFlow<FlowNode>();
    const canvasWidth = useStore((state) => state.width);
    const canvasHeight = useStore((state) => state.height);
    const nodesInitialized = useNodesInitialized();
    const reducedMotion = useReducedMapMotion();
    const initialized = useRef(false);
    const layout = useMemo(() => layoutMap(nodes, new Set(), displayMode, direction), [nodes, displayMode, direction]);
    const visible = useMemo(() => new Set(layoutMap(nodes, collapsed, displayMode, direction).positions.map((item) => item.node.id)), [nodes, collapsed, displayMode, direction]);
    const openIds = new Set(Object.values(runtime.bindings));
    const matches = new Set(nodes.filter((node) => `${node.title} ${node.url} ${node.keyword ?? ""} ${node.note}`.toLowerCase().includes(query.toLowerCase())).map((node) => node.id));
    useEffect(() => {
        const ids = new Set(nodes.map((node) => node.id));
        setSelectedIds((previous) => new Set([...previous].filter((id) => ids.has(id))));
    }, [nodes]);
    function selectOne(id: string) {
        setSelectedIds((previous) => previous.size === 1 && previous.has(id) ? previous : new Set([id]));
        onSelect(id);
    }
    const deleteSelected = useCallback(async () => {
        if (busy || !selectedIds.size)
            return;
        if (await onDeleteMany([...selectedIds]))
            setSelectedIds(new Set());
    }, [busy, selectedIds, onDeleteMany]);
    useMapDeleteShortcut(!busy && !addDraft && selectedIds.size > 0, deleteSelected);
    function toggle(id: string) {
        setCollapsed((previous) => {
            const next = new Set(previous);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }
    const allNodes: TabFlowNode[] = layout.positions.map(({ node, x, y, children }) => ({
        id: node.id, type: "tab", position: positions[node.id] ?? { x, y }, selected: selectedIds.has(node.id),
        width: size.width, height: size.height,
        ariaLabel: t("m093", node.title),
        data: { node, parentId: node.parentId, displayMode, direction, children, collapsed: collapsed.has(node.id), open: openIds.has(node.id),
            current: runtime.activeNodeId === node.id, match: Boolean(query && matches.has(node.id)), busy,
            onSelect: selectOne, onInspect, onFocus, onAdd, onClose, onDelete, onToggle: toggle },
    }));
    const mainTasks = mainTaskNavigation(nodes, selectedId ?? runtime.activeNodeId, new Map(allNodes.map((node) => [node.id, node.position])), direction);
    const targets: FlowNode[] = allNodes.filter((node) => visible.has(node.id));
    const draftParent = addDraft ? allNodes.find((node) => node.id === addDraft.parentId) : undefined;
    const draftPosition = draftParent ? placeDraftNode(draftParent, allNodes, direction) : undefined;
    if (addDraft && draftPosition)
        targets.push({ id: draftNodeId, type: "draft", data: { ...addDraft, direction },
            position: draftPosition, ...draftNodeSize, draggable: false, selectable: false, zIndex: 2000 });
    // Also apply measurements to exiting nodes so branch animations keep their endpoints.
    const flowNodes = useGraphMotion(targets, !ready || dragging).map((node) => ({ ...node, measured: measurements[node.id] }));
    const visibleIds = new Set(flowNodes.map((node) => node.id));
    const edges: Edge[] = flowNodes.flatMap((node) => node.data.parentId && visibleIds.has(node.data.parentId) ? [{
            ariaLabel: t("connectionFromTo", nodes.find(item => item.id === node.data.parentId)?.title ?? "", node.type === "draft" ? node.data.parentTitle : node.data.node.title),
            id: `source-${node.id}`, source: node.data.parentId, sourceHandle: lineageHandleId, target: node.id, type: "default", selectable: false,
            style: { opacity: node.data.motion?.opacity ?? 1,
                stroke: node.type === "draft" ? "#2563eb" : node.data.node.pendingSource ? "#d97706" : "#a6b4c8", strokeWidth: 1.7,
                strokeDasharray: node.type === "draft" || node.data.node.pendingSource ? "5 4" : undefined },
        }] : []);
    useEffect(() => {
        if (!addDraft)
            return;
        const ancestors = new Set<string>();
        let id: string | null = addDraft.parentId;
        while (id && !ancestors.has(id)) {
            ancestors.add(id);
            id = nodes.find((node) => node.id === id)?.parentId ?? null;
        }
        setCollapsed((previous) => new Set([...previous].filter((item) => !ancestors.has(item))));
    }, [addDraft?.parentId]);
    useEffect(() => {
        if (!draftPosition || !draftParent || !ready || !flow.viewportInitialized || !canvasWidth || !canvasHeight)
            return;
        const x = Math.min(draftParent.position.x, draftPosition.x), y = Math.min(draftParent.position.y, draftPosition.y);
        void flow.fitBounds({ x: x - 25, y: y - 25, width: Math.max(draftParent.position.x + size.width, draftPosition.x + draftNodeSize.width) - x + 50,
            height: Math.max(draftParent.position.y + size.height, draftPosition.y + draftNodeSize.height) - y + 50 }, { duration: reducedMotion ? 0 : 320, padding: 0.2 });
    }, [addDraft?.parentId, ready, flow.viewportInitialized, canvasWidth, canvasHeight, reducedMotion]);
    useEffect(() => {
        if (!ready || !flow.viewportInitialized || !nodesInitialized || !canvasWidth || !canvasHeight || initialized.current)
            return;
        initialized.current = true;
        // 输入节点有独立的目标视野；首次挂载不能用全图定位覆盖正在进行的展开。
        if (!addDraft) {
            if (initialZoom) {
                const node = allNodes.find((item) => item.id === runtime.activeNodeId) ?? allNodes[0];
                if (node)
                    void flow.setCenter(node.position.x + size.width / 2, node.position.y + size.height / 2, { zoom: initialZoom, duration: 0 });
            }
            else
                void flow.fitView({ padding: 0.18, maxZoom: 1, duration: 0 });
        }
    }, [ready, flow, flow.viewportInitialized, nodesInitialized, canvasWidth, canvasHeight, addDraft?.parentId, initialZoom]);
    function center() {
        const node = allNodes.find((item) => item.id === runtime.activeNodeId)
            ?? allNodes.find((item) => item.id === selectedId) ?? allNodes[0];
        if (node)
            centerNode(node.id);
    }
    function centerNode(id: string) {
        const node = allNodes.find((item) => item.id === id);
        if (!node)
            return;
        const ancestors = new Set(breadcrumbs(nodes, node.id).map((item) => item.id));
        setCollapsed((previous) => {
            if (![...previous].some((id) => ancestors.has(id)))
                return previous;
            return new Set([...previous].filter((id) => !ancestors.has(id)));
        });
        selectOne(node.id);
        // 原生视口插值同时移动与缩放；连续定位从当前帧接续，不叠加动画。
        void flow.setCenter(node.position.x + size.width / 2, node.position.y + size.height / 2, { zoom: 1, duration: reducedMotion ? 0 : 600, ease: easeCenter, interpolate: "smooth" });
    }
    useEffect(() => {
        if (!locateRequest || locateRequest.requestId === lastLocatedRequest.current || !ready || !nodesInitialized ||
            !flow.viewportInitialized || !canvasWidth || !canvasHeight || !allNodes.some((node) => node.id === locateRequest.nodeId))
            return;
        lastLocatedRequest.current = locateRequest.requestId;
        lastFollowedNode.current = followKey;
        centerNode(locateRequest.nodeId);
    }, [locateRequest, ready, nodesInitialized, flow.viewportInitialized, canvasWidth, canvasHeight, allNodes]);
    useEffect(() => {
        if (!followActiveTab || !followKey) {
            lastFollowedNode.current = null;
            return;
        }
        if (!ready || !flow.viewportInitialized || !nodesInitialized || !canvasWidth || !canvasHeight ||
            busy || dragging || connecting || addDraft)
            return;
        if (lastFollowedNode.current === followKey || !allNodes.some((node) => node.id === runtime.activeNodeId))
            return;
        // 活动标签或它的来源分支变化时定位，保留用户后续的缩放、框选和拖动。
        lastFollowedNode.current = followKey;
        center();
    }, [followActiveTab, followKey, runtime.activeNodeId, ready, flow.viewportInitialized, nodesInitialized, canvasWidth, canvasHeight,
        busy, dragging, connecting, addDraft, allNodes]);
    function onNodesChange(changes: NodeChange<FlowNode>[]) {
        measure(changes);
        const selections = changes.filter((change) => change.type === "select");
        if (selections.length)
            setSelectedIds((previous) => {
                const next = new Set(previous);
                for (const change of selections)
                    change.selected ? next.add(change.id) : next.delete(change.id);
                return next;
            });
        const committed: MapPositionChange[] = [];
        for (const change of changes) {
            if (change.type === "position" && change.position && change.id !== draftNodeId) {
                move(change.id, change.position, false);
                if (!change.dragging && !dragging)
                    committed.push({ nodeId: change.id, position: change.position });
            }
        }
        if (committed.length)
            commit(committed);
    }
    function validConnection({ source, target }: Pick<Connection, "source" | "target">) {
        return !busy && !addDraft && visible.has(source) && visible.has(target) &&
            nodes.find((node) => node.id === target)?.parentId !== source && canSetParent(nodes, target, source);
    }
    async function connect(connection: Connection) {
        if (!validConnection(connection) || !await onReparent(connection.target, connection.source))
            return;
        const ancestors = new Set(breadcrumbs(nodes, connection.source).map((node) => node.id));
        setCollapsed((previous) => new Set([...previous].filter((id) => !ancestors.has(id))));
        selectOne(connection.target);
    }
    function showBlankMenu(event: React.MouseEvent | MouseEvent) {
        if (busy || addDraft)
            return;
        const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        context.show(event, { placement: { x: position.x - size.width / 2, y: position.y - size.height / 2, displayMode, direction } });
    }
    function commitDrag(dragged: FlowNode[]) {
        setDragging(false);
        commit(dragged.filter((node) => node.type === "tab").map((node) => ({ nodeId: node.id, position: node.position })));
    }
    const viewportTools = <div className={`tm-zoom ${displayMode === "compact" ? "tm-canvas-viewport-tools" : ""}`} aria-label={t("m115")}>
        <div className="tm-interaction-switch">
          <MapTooltip label={interactionMode === "pan" ? t("m096") : t("m097")}>
            <button data-tool="interaction" data-mode={interactionMode} aria-label={interactionMode === "pan" ? t("m094") : t("m095")} onClick={toggleInteractionMode}>
              {interactionMode === "pan" ? <Hand size={15}/> : <MousePointer2 size={15}/>}
            </button>
          </MapTooltip>
        </div>
        <MapTooltip label={t("m099")}><button data-tool="undo" aria-label={t("m098")} disabled={busy || !canUndo} onClick={() => void onUndo()}><Undo2 size={15}/></button></MapTooltip>
        <MapTooltip label={t("m100")}><button data-tool="zoom-out" aria-label={t("m100")} onClick={() => void flow.zoomOut({ duration: reducedMotion ? 0 : 150 })}><Minus size={14}/></button></MapTooltip>
        <MapZoomReset />
        <MapTooltip label={t("m101")}><button data-tool="zoom-in" aria-label={t("m101")} onClick={() => void flow.zoomIn({ duration: reducedMotion ? 0 : 150 })}><Plus size={14}/></button></MapTooltip>
        <MapTooltip label={t("m103")}><button data-tool="locate" aria-label={t("m102")} onClick={center}><Crosshair size={15}/></button></MapTooltip>
        <MapTooltip label={followActiveTab ? t("m105") : t("m106")}>
          <button data-tool="follow" aria-label={t("m104")} aria-pressed={followActiveTab} onClick={toggleFollowActiveTab}><Focus size={15}/></button>
        </MapTooltip>
        <MapTooltip label={t("m108")}><button data-tool="fit" aria-label={t("m107")} onClick={() => void flow.fitView({ padding: 0.18, maxZoom: 1, duration: reducedMotion ? 0 : 250 })}><Maximize size={15}/></button></MapTooltip>
        <MapTooltip label={t("m110")}><button data-tool="refresh" aria-label={t("m109")} onClick={() => { reset(); }}><RotateCcw size={15}/></button></MapTooltip>
        <MapTooltip label={direction === "horizontal" ? t("m113") : t("m114")}>
          <button data-tool="direction" data-direction={direction} aria-label={direction === "horizontal" ? t("m111") : t("m112")} onClick={onDirection}>
            {direction === "horizontal" ? <ArrowRight size={15}/> : <ArrowDown size={15}/>}
          </button>
        </MapTooltip>
      </div>;
    const tools = <div className="tm-canvas-tools">
      <label className="tm-search"><Search size={14}/><input aria-label={t("m116")} placeholder={t("m117")} value={query} onChange={(event) => setQuery(event.target.value)}/></label>
      {displayMode === "detailed" && selectedIds.size > 0 && <button className="tm-button" disabled={busy} title={t("m119")} onClick={() => void deleteSelected()}><Trash2 size={14}/>{t("m118", selectedIds.size)}</button>}
      {query && <span className="tm-muted">{t("m120", matches.size)}</span>}
      <MapDisplaySwitch mode={displayMode} onChange={onDisplayMode}/>
      {displayMode === "detailed" && viewportTools}
    </div>;
    return <div className="tm-canvas-shell">
    {displayMode === "compact" ? controlsContainer && createPortal(tools, controlsContainer) : tools}
    <div className={`tm-canvas tm-layout-${direction} tm-interaction-${interactionMode} ${connecting ? "is-connecting" : ""}`} aria-label={t("m122")} tabIndex={-1} onDoubleClick={(event) => {
            const target = event.target as Element;
            if (target.closest(".react-flow__pane") && !target.closest(".react-flow__node"))
                showBlankMenu(event);
        }} onDragOver={(event) => {
            if (busy || addDraft || !onPinnedDrop || !event.dataTransfer.types.includes(pinnedTabDragType))
                return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
        }} onDrop={(event) => {
            const tabId = pinnedTabFromDrop(event.dataTransfer);
            if (tabId === null || busy || addDraft || !onPinnedDrop)
                return;
            event.preventDefault();
            event.stopPropagation();
            const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
            onPinnedDrop(tabId, { x: position.x - size.width / 2, y: position.y - size.height / 2, displayMode, direction });
        }}>
      <MapSearch nodes={nodes} query={query} onQuery={setQuery} busy={busy} enabled={!addDraft} onNavigate={(id) => { centerNode(id); onFocus(id); }}/>
      <MainTaskNavigation model={mainTasks} direction={direction} disabled={!ready || !nodesInitialized || !flow.viewportInitialized || busy || dragging || connecting || Boolean(addDraft)} onNavigate={(id) => { centerNode(id); onFocus(id); }}>
        <PinnedTabs direction={direction} busy={busy || Boolean(addDraft)} canDrag onOpen={onPinnedOpen} onDelete={onPinnedDelete} onUnpin={onPinnedUnpin} onReorder={onPinnedReorder}/>
      </MainTaskNavigation>
      {displayMode === "compact" && viewportTools}
      {displayMode === "compact" && selectedIds.size > 1 && <div className="tm-selection-actions">
        <button className="tm-button" disabled={busy} title={t("m119")} onClick={() => void deleteSelected()}><Trash2 size={14}/>{t("m118", selectedIds.size)}</button>
      </div>}
      {context.anchor && <MapContextMenu key={context.anchor.requestId} anchor={context.anchor} title={context.anchor.selection ? t("m121", selectedIds.size) : contextNode?.title ?? t("m045")} busy={busy} onClose={context.close} actions={mapContextActions({ node: contextNode, pinned: Boolean(contextNode && pinnedNodeIds.has(contextNode.id)),
                togglePin: contextNode ? () => onTogglePin(contextNode.id) : undefined, selection: context.anchor.selection, placement: context.anchor.placement, create: onCreateContextTab,
                focus: (id) => { if (id) {
                    centerNode(id);
                    onFocus(id);
                }
                else
                    center(); },
                remove: contextNode ? () => onDelete(contextNode.id) : undefined, selectedCount: selectedIds.size, removeSelected: deleteSelected,
                toggle: contextNode && nodes.some((node) => node.parentId === contextNode.id) ? () => toggle(contextNode.id) : undefined,
                collapsed: contextNode && collapsed.has(contextNode.id), makeRoot: contextNode ? () => onReparent(contextNode.id, null) : undefined,
                fit: () => { void flow.fitView({ ...(context.anchor?.selection ? { nodes: [...selectedIds].map((id) => ({ id })) } : {}), padding: 0.18, maxZoom: 1, duration: reducedMotion ? 0 : 250 }); }, reset })}/>}
      <ReactFlow<FlowNode> ariaLabelConfig={{
        "node.a11yDescription.default": t("a11yNode"),
        "node.a11yDescription.keyboardDisabled": t("a11yNodeFixed"),
        "node.a11yDescription.ariaLiveMessage": ({ x, y }) => t("a11yNodeMove", x, y),
        "edge.a11yDescription.default": t("a11yEdge"),
        "controls.ariaLabel": t("m115"), "controls.zoomIn.ariaLabel": t("m101"),
        "controls.zoomOut.ariaLabel": t("m100"), "controls.fitView.ariaLabel": t("m107"),
        "controls.interactive.ariaLabel": t("a11yInteractive"), "minimap.ariaLabel": t("m034"),
        "handle.ariaLabel": t("a11yHandle"),
      }} nodes={flowNodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onSelectionContextMenu={(event, selectedNodes) => {
            if (busy || addDraft)
                return;
            const ids = selectedNodes.filter((node) => node.type === "tab").map((node) => node.id);
            if (!ids.length)
                return;
            setSelectedIds(new Set(ids));
            context.show(event, { selection: true });
        }} onPaneContextMenu={showBlankMenu} onNodeContextMenu={(event, node) => {
            if (busy || addDraft || node.type !== "tab")
                return;
            if (!selectedIds.has(node.id))
                selectOne(node.id);
            context.show(event, { nodeId: node.id });
        }} onNodeClick={(event, node) => {
            if (node.type === "tab" && !event.metaKey && !event.ctrlKey && !event.shiftKey)
                selectOne(node.id);
            const target = event.target;
            if (target instanceof Element && !target.closest("button,input,textarea,select,[contenteditable]")) {
                target.closest<HTMLElement>(".react-flow__node")?.focus({ preventScroll: true });
            }
        }} onNodeDragStart={(_, node) => { setDragging(true); if (!selectedIds.has(node.id))
        selectOne(node.id); }} onSelectionStart={() => setDragging(true)} onSelectionEnd={() => setDragging(false)} onNodeDragStop={(_, node, dragged) => commitDrag(dragged.length ? dragged : [node])} onSelectionDragStop={(_, dragged) => commitDrag(dragged)} nodesConnectable={!busy && !addDraft} edgesReconnectable={false} onConnect={(connection) => void connect(connection)} isValidConnection={validConnection} onConnectStart={() => setConnecting(true)} onConnectEnd={() => setConnecting(false)} connectOnClick={false} connectionLineStyle={{ stroke: "#2563eb", strokeWidth: 2 }} deleteKeyCode={null} minZoom={0.2} maxZoom={2.5} nodeDragThreshold={5} connectionDragThreshold={5}
    // Mouse-button arrays still allow touch panning. Explicitly disable drag
    // panning in selection mode so one-finger drags reach the selection box.
    selectionOnDrag={interactionMode === "select"} selectionKeyCode={interactionMode === "select" ? "Shift" : null} selectionMode={SelectionMode.Partial} panOnDrag={interactionMode === "pan" ? [0, 1] : false} panActivationKeyCode={null} multiSelectionKeyCode={["Meta", "Control"]}
    // Touchscreen dragging is handled by panOnDrag; trackpad swipes arrive
    // as wheel events. Keep both as pan in hand mode, and reserve pinch for zoom.
    panOnScroll={interactionMode === "pan"} panOnScrollSpeed={1} zoomOnScroll={false} zoomOnPinch zoomOnDoubleClick={false} preventScrolling proOptions={{ hideAttribution: true }}>
        <Background color="#d6deea" gap={20} size={1}/>
        {showMinimap && <MiniMap className="tm-minimap" style={displayMode === "compact" ? { width: 140, height: 90 } : undefined} pannable zoomable nodeColor={(node) => node.id === runtime.activeNodeId ? "#10b981" : "#cbd5e1"}/>}
      </ReactFlow>
    </div>
    {displayMode === "detailed" && <div className="tm-canvas-caption">{t("m125", interactionMode === "pan" ? t("m123") : t("m124"))}</div>}
  </div>;
}
