import { t } from "../i18n";
import { Handle, Position } from "@xyflow/react";
import type { TabNodeData } from "./TabMapNode";
export const lineageHandleId = "lineage";
export function NodeParentHandle({ data }: {
    data: TabNodeData;
}) {
    const vertical = data.direction === "vertical";
    return <><Handle type="target" position={vertical ? Position.Top : Position.Left} className="tm-link-handle" isConnectable={!data.busy && data.motion?.phase !== "exit"} isConnectableStart={false} aria-label={t("m166", data.node.title)} title={t("m167")}/>
    <Handle id={lineageHandleId} type="source" position={vertical ? Position.Bottom : Position.Right} className="tm-edge-anchor" isConnectable={false} isConnectableStart={false} isConnectableEnd={false}/>
  </>;
}
