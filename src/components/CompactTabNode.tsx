import { t } from "../i18n";
import { X } from "lucide-react";
import { SiteIcon } from "./SiteIcon";
import { NodeParentHandle } from "./NodeParentHandle";
import { NodeBranchControls } from "./NodeBranchControls";
import type { TabNodeData } from "./TabMapNode";
export function CompactTabNode({ data, selected }: {
    data: TabNodeData;
    selected: boolean;
}) {
    const { node, current, match, open, busy } = data;
    const status = current && open ? t("m053") : open ? t("m054") : t("m055");
    return <article className={`tm-compact-node ${selected ? "is-selected" : ""} ${current && open ? "is-current" : ""} ${match ? "is-match" : ""} ${node.pendingSource ? "is-pending" : ""}`} title={`${node.title}\n${node.url}\n${status}${node.pendingSource ? t("m062") : ""}`} inert={data.motion?.phase === "exit"} style={{ opacity: data.motion?.opacity, transform: `scale(${data.motion?.scale ?? 1})` }}>
    <NodeParentHandle data={data}/>
    <button className="tm-site-ball nopan" aria-label={`${open ? t("m056") : t("m057")} ${node.title}`} title={t("m058")} disabled={busy} onClick={() => { data.onSelect(node.id); data.onFocus(node.id); }}>
      <SiteIcon key={node.url} url={node.url}/><span className={`tm-site-status ${open ? "is-open" : ""}`} aria-label={status}/>
    </button>
    <button className="tm-site-delete nodrag nopan" aria-label={t("m059", node.title)} title={t("m060")} disabled={busy} onClick={(event) => { event.stopPropagation(); data.onDelete(node.id); }}><X size={11}/></button>
    <button className="tm-compact-title nodrag nopan" title={t("m061", node.title)} disabled={busy} onClick={() => { data.onSelect(node.id); data.onFocus(node.id); }}>{node.title}</button>
    <NodeBranchControls data={data}/>
  </article>;
}
