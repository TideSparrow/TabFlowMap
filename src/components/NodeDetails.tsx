import { t } from "../i18n";
import { useEffect, useState } from "react";
import { ArrowUpLeft, ExternalLink, Plus, X } from "lucide-react";
import { breadcrumbs } from "../core/graph";
import type { MapCommand, MapNode } from "../types/map";
export function NodeDetails({ node, nodes, open, busy, run, onAdd, onDismiss }: {
    node?: MapNode;
    nodes: MapNode[];
    open: boolean;
    busy: boolean;
    run: (command: MapCommand) => Promise<boolean>;
    onAdd: (id: string) => void;
    onDismiss: () => void;
}) {
    const [note, setNote] = useState("");
    const [parentId, setParentId] = useState("");
    useEffect(() => { setNote(node?.note ?? ""); setParentId(node?.parentId ?? ""); }, [node?.id, node?.note, node?.parentId]);
    if (!node)
        return <aside className="tm-details tm-details-empty"><ArrowUpLeft size={24}/><p>{t("m145")}</p><span>{t("m146")}</span></aside>;
    const path = breadcrumbs(nodes, node.id);
    return <aside className="tm-details" aria-label={t("m165")}>
    <div className="tm-details-heading"><span>{t("m147")}</span><span className="tm-muted">{open ? t("m054") : t("m055")}</span><button className="tm-inspector-close" aria-label={t("m148")} onClick={onDismiss}><X size={14}/></button></div>
    <h3>{node.title}</h3><a className="tm-url" href={node.url} onClick={(event) => { event.preventDefault(); void run({ action: "focus", nodeId: node.id }); }}>{node.url}</a>
    <div className="tm-details-actions">
      <button className="tm-button tm-primary" disabled={busy} onClick={() => void run({ action: "focus", nodeId: node.id })}><ExternalLink size={14}/>{open ? t("m149") : t("m057")}</button>
      <button className="tm-button" disabled={busy} onClick={() => onAdd(node.id)}><Plus size={14}/>{t("m150")}</button>
      {open && <button className="tm-button" aria-label={t("m151")} disabled={busy} onClick={() => void run({ action: "close", nodeId: node.id })}><X size={14}/></button>}
    </div>
    <div className="tm-field-label">{t("m152")}</div>
    <nav className="tm-breadcrumbs" aria-label={t("m153")}>{path.map((item, index) => <span key={item.id}>{index > 0 && " › "}<button onClick={() => void run({ action: "focus", nodeId: item.id })} disabled={busy}>{item.title}</button></span>)}</nav>
    {node.parentId && <div className="tm-details-actions">
      <button className="tm-button tm-back" disabled={busy} onClick={() => void run({ action: "focus", nodeId: node.parentId! })}><ArrowUpLeft size={14}/>{t("m154")}</button>
      <button className="tm-button" disabled={busy} onClick={() => void run({ action: "parent", nodeId: node.id, parentId: null })}>{t("m155")}</button>
    </div>}
    {node.pendingSource && <div className="tm-source-hint">{t("m156", node.keyword ?? "")}<button disabled={busy} onClick={() => void run({ action: "parent", nodeId: node.id, parentId: node.parentId })}>{t("m157")}</button></div>}
    <label className="tm-field-label" htmlFor="tm-parent">{t("m158")}</label>
    <div className="tm-parent-field"><select id="tm-parent" value={parentId} onChange={(event) => setParentId(event.target.value)}>
      <option value="">{t("m159")}</option>{nodes.filter((item) => item.id !== node.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
    </select><button className="tm-button" disabled={busy} onClick={() => void run({ action: "parent", nodeId: node.id, parentId: parentId || null })}>{t("m160")}</button></div>
    <label className="tm-field-label" htmlFor="tm-note">{t("m161")}</label>
    <textarea id="tm-note" placeholder={t("m162")} value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} rows={3}/>
    <button className="tm-button tm-note-save" disabled={busy || note === node.note} onClick={() => void run({ action: "edit", nodeId: node.id, note })}>{t("m163")}</button>
    <p className="tm-muted tm-position">{t("m164", Math.round(node.scrollY))}</p>
  </aside>;
}
