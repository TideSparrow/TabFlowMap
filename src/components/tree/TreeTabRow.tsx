import { t } from "../../i18n";
import { ChevronRight, Plus, X } from "lucide-react";
import type { MouseEvent } from "react";
import { SiteIcon } from "../SiteIcon";
import type { TreeRow } from "./tree-model";
type Props = {
    row: TreeRow;
    expanded: boolean;
    selected: boolean;
    current: boolean;
    open: boolean;
    busy: boolean;
    tabIndex: number;
    onSelect: (event: MouseEvent, id: string) => void;
    onToggle: (id: string) => void;
    onFocus: (id: string) => void;
    onAdd: (id: string) => void;
    onDelete: (id: string) => void;
};
export function TreeTabRow({ row, expanded, selected, current, open, busy, tabIndex, onSelect, onToggle, onFocus, onAdd, onDelete }: Props) {
    const { node, depth, children, position, siblings } = row;
    const domain = /^(chrome|edge):/.test(node.url) || node.url === "about:blank" ? t("m020") : new URL(node.url).hostname;
    return <div className={`tm-tree-row ${selected ? "is-selected" : ""} ${current ? "is-current" : ""}`} role="treeitem" data-id={node.id} aria-label={node.title} aria-level={depth + 1} aria-posinset={position} aria-setsize={siblings} aria-expanded={children ? expanded : undefined} aria-selected={selected} aria-current={current ? "page" : undefined} tabIndex={tabIndex} style={{ marginLeft: depth * 20 }} onClick={(event) => { onSelect(event, node.id); event.currentTarget.focus(); }}>
    {children ? <button className={`tm-tree-toggle ${expanded ? "is-expanded" : ""}`} aria-label={t("m140", expanded ? t("m139") : t("m138"), node.title)} aria-expanded={expanded} onClick={(event) => { event.stopPropagation(); onToggle(node.id); }}><ChevronRight size={14}/></button> : <span className="tm-tree-toggle-space"/>}
    <span className="tm-tree-site"><SiteIcon key={node.url} url={node.url}/>{open && <i aria-label={t("m054")}/>}</span>
    <button className="tm-tree-title" disabled={busy} aria-label={t("m249", node.title)} title={node.url} onClick={(event) => {
            event.stopPropagation();
            onSelect(event, node.id);
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey)
                onFocus(node.id);
        }}><strong>{node.title}</strong><small>{domain}{node.keyword ? ` · ${node.keyword}` : ""}</small></button>
    {children > 0 && <span className="tm-tree-count" title={t("m250", children)}>{children}</span>}
    {current && <span className="tm-tree-current">{t("m047")}</span>}
    <div className="tm-tree-actions">
      <button aria-label={t("m143", node.title)} title={t("m251")} disabled={busy} onClick={(event) => { event.stopPropagation(); onAdd(node.id); }}><Plus size={14}/></button>
      <button aria-label={t("m059", node.title)} title={t("m060")} disabled={busy} onClick={(event) => { event.stopPropagation(); onDelete(node.id); }}><X size={14}/></button>
    </div>
  </div>;
}
