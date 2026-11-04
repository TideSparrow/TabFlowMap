import { t } from "../i18n";
import { Handle, Position, type Node, type NodeProps, type XYPosition } from "@xyflow/react";
import { ArrowUpRight, X } from "lucide-react";
import type { GraphMotion } from "./motion/graph-motion";
import type { MapLayoutDirection } from "../core/view-options";
export type AddNodeDraft = {
    parentId: string;
    parentTitle: string;
    text: string;
    busy: boolean;
    error: string;
    onChange: (text: string) => void;
    onSubmit: () => void;
    onCancel: () => void;
};
export type DraftFlowNode = Node<AddNodeDraft & {
    motion?: GraphMotion;
    direction?: MapLayoutDirection;
}, "draft">;
export const draftNodeId = "tab-map-add-draft";
export const draftNodeSize = { width: 250, height: 170 };
export function placeDraftNode(parent: {
    position: XYPosition;
    width?: number;
    height?: number;
}, occupied: {
    position: XYPosition;
    width?: number;
    height?: number;
}[], direction: MapLayoutDirection = "horizontal"): XYPosition {
    const vertical = direction === "vertical";
    let x = parent.position.x + (vertical ? 0 : (parent.width ?? 190) + 40);
    let y = parent.position.y + (vertical ? (parent.height ?? 86) + 60 : 0);
    const overlaps = () => occupied.some((node) => x < node.position.x + (node.width ?? 190) + 12 &&
        x + draftNodeSize.width + 12 > node.position.x && y < node.position.y + (node.height ?? 86) + 12 &&
        y + draftNodeSize.height + 12 > node.position.y);
    while (overlaps()) {
        if (vertical)
            x += draftNodeSize.width + 40;
        else
            y += 106;
    }
    return { x, y };
}
export function DraftTabNode({ data }: NodeProps<DraftFlowNode>) {
    const exiting = data.motion?.phase === "exit";
    return <form className="tm-draft-node nodrag nopan nowheel" inert={exiting} aria-label={t("m070", data.parentTitle)} style={{ opacity: data.motion?.opacity, transform: `scale(${data.motion?.scale ?? 1})` }} onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); if (!data.busy && data.text.trim())
        data.onSubmit(); }} onKeyDown={(event) => { if (event.key === "Escape" && !data.busy) {
        event.stopPropagation();
        data.onCancel();
    } }}>
    <Handle type="target" position={data.direction === "vertical" ? Position.Top : Position.Left} isConnectable={false}/>
    <div className="tm-draft-heading"><strong>{t("m063")}</strong><button type="button" aria-label={t("m064")} disabled={data.busy} onClick={data.onCancel}><X size={14}/></button></div>
    <p title={data.parentTitle}>{t("m065", data.parentTitle)}</p>
    <label><span className="tm-sr-only">{t("m066")}</span><input autoFocus aria-label={t("m066")} value={data.text} maxLength={2000} disabled={data.busy} placeholder={t("m067")} onChange={(event) => data.onChange(event.target.value)}/></label>
    {data.error && <span className="tm-draft-error" role="alert">{data.error}</span>}
    <button className="tm-button tm-primary tm-draft-submit" disabled={data.busy || !data.text.trim()}>{data.busy ? t("m068") : t("m069")}<ArrowUpRight size={13}/></button>
  </form>;
}
