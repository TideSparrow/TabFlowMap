import { t } from "../i18n";
import { X } from "lucide-react";
import type { TabNodeData } from "./TabMapNode";
export function TabNodeActions({ data }: {
    data: TabNodeData;
}) {
    const { node, busy, open } = data;
    return <div className="tm-node-actions nodrag nopan">
    {data.displayMode === "detailed" && <button aria-label={t("m179", node.title)} onClick={() => data.onInspect(node.id)}>{t("m178", node.note ? t("m177") : "")}</button>}
    <span className="tm-spacer"/>
    <button aria-label={t("m180", node.title)} title={open ? t("m060") : t("m055")} onClick={() => data.onClose(node.id)} disabled={!open || busy}><X size={14}/></button>
  </div>;
}
