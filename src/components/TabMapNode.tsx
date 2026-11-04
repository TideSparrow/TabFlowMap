import { t, type MessageKey } from "../i18n";
import type { Node, NodeProps } from "@xyflow/react";
import { NodeParentHandle } from "./NodeParentHandle";
import { CompactTabNode } from "./CompactTabNode";
import { TabNodeActions } from "./TabNodeActions";
import { NodeBranchControls } from "./NodeBranchControls";
import type { GraphMotion } from "./motion/graph-motion";
import type { CanvasDisplayMode, MapLayoutDirection } from "../core/view-options";
import type { MapNode } from "../types/map";
const kindLabel: Record<MapNode["kind"], MessageKey> = {
    root: "m168", link: "m169", navigation: "m170", copied: "m171", manual: "m172", unknown: "m173",
};
export type TabNodeData = {
    parentId: string | null;
    motion?: GraphMotion;
    displayMode: CanvasDisplayMode;
    direction: MapLayoutDirection;
    node: MapNode;
    children: number;
    collapsed: boolean;
    open: boolean;
    current: boolean;
    match: boolean;
    busy: boolean;
    onSelect: (id: string) => void;
    onInspect: (id: string) => void;
    onFocus: (id: string) => void;
    onAdd: (id: string) => void;
    onClose: (id: string) => void;
    onDelete: (id: string) => void;
    onToggle: (id: string) => void;
};
export type TabFlowNode = Node<TabNodeData, "tab">;
export function TabMapNode({ data, selected }: NodeProps<TabFlowNode>) {
    if (data.displayMode === "compact")
        return <CompactTabNode data={data} selected={selected}/>;
    const { node, open, current, match, busy } = data;
    return <article className={`tm-node ${selected ? "is-selected" : ""} ${current ? "is-current" : ""} ${match ? "is-match" : ""}`} inert={data.motion?.phase === "exit"} style={{ opacity: data.motion?.opacity, transform: `scale(${data.motion?.scale ?? 1})` }}>
    <NodeParentHandle data={data}/>
    <div className="tm-node-meta"><span>{t(kindLabel[node.kind])}{node.pendingSource ? t("m174") : ""}</span><span className={open ? "tm-open" : ""}>{current && open ? t("m047") : open ? t("m175") : t("m176")}</span></div>
    <button className="tm-node-title nodrag nopan" title={node.title} onClick={() => { data.onSelect(node.id); data.onFocus(node.id); }} disabled={busy}>{node.title}</button>
    <div className="tm-node-domain" title={node.url}>{new URL(node.url).hostname}{node.keyword ? ` · ${node.keyword}` : ""}</div>
    <TabNodeActions data={data}/>
    <NodeBranchControls data={data}/>
  </article>;
}
