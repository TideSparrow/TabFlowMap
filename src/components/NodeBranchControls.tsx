import { t } from "../i18n";
import { ChevronRight, Plus } from "lucide-react";
import { useRef } from "react";
import { Handle, Position } from "@xyflow/react";
import type { TabNodeData } from "./TabMapNode";
export function NodeBranchControls({ data }: {
    data: TabNodeData;
}) {
    const { node, children, collapsed, busy } = data;
    const enabled = !busy && data.motion?.phase !== "exit";
    const gesture = useRef<{
        x: number;
        y: number;
        dragged: boolean;
    } | null>(null);
    return <>
    {children > 0 && <button className={`tm-branch-toggle nodrag nopan ${collapsed ? "is-collapsed" : ""}`} aria-label={t("m140", collapsed ? t("m138") : t("m139"), node.title)} aria-expanded={!collapsed} title={collapsed ? t("m141") : t("m142")} onClick={() => data.onToggle(node.id)}>
      <ChevronRight size={12}/><span>{children}</span>
    </button>}
    <Handle id="branch" type="source" position={data.direction === "vertical" ? Position.Bottom : Position.Right} className="tm-branch-add nodrag nopan" isConnectable={enabled} isConnectableStart={enabled} isConnectableEnd={false} onPointerDownCapture={(event) => { gesture.current = { x: event.clientX, y: event.clientY, dragged: false }; }} onPointerMoveCapture={(event) => {
            const start = gesture.current;
            if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5)
                start.dragged = true;
        }} onPointerLeave={(event) => { if (gesture.current && event.buttons)
        gesture.current.dragged = true; }} onPointerCancel={() => { if (gesture.current)
        gesture.current.dragged = true; }}>
      <button aria-label={t("m143", node.title)} title={t("m144")} disabled={!enabled} onClick={(event) => {
            event.stopPropagation();
            if (event.detail === 0 || !gesture.current?.dragged)
                data.onAdd(node.id);
        }}><Plus size={14}/></button>
    </Handle>
  </>;
}
