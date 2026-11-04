import { t } from "../../i18n";
import { Copy, ExternalLink, GitBranch, Pin, PinOff, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { MapTooltip } from "../MapTooltip";
import type { MapLayoutDirection } from "../../core/view-options";
import { usePinnedTabs } from "../../hooks/usePinnedTabs";
import { PinnedTabItem } from "./PinnedTabItem";
import { MapContextMenu } from "../context-menu/MapContextMenu";
import { useMapContextMenu } from "../../hooks/useMapContextMenu";
import { mapUrl } from "../../core/graph";
import { usePinnedSorting, type ReorderPinned } from "../../hooks/usePinnedSorting";
import "./styles.css";
export function PinnedTabs({ direction, busy, canDrag, onOpen, onDelete, onUnpin, onReorder }: {
    direction: MapLayoutDirection;
    busy: boolean;
    canDrag: boolean;
    onOpen: (tabId: number, newTask?: boolean) => void;
    onDelete: (tabId: number) => void;
    onUnpin: (tabId: number) => Promise<boolean>;
    onReorder: ReorderPinned;
}) {
    const { tabs, error } = usePinnedTabs();
    const sorting = usePinnedSorting(tabs, busy, direction, onReorder);
    const context = useMapContextMenu();
    const contextTab = tabs.find((tab) => tab.id === context.anchor?.tabId);
    useEffect(() => { if (context.anchor && !contextTab)
        context.close(); }, [context.anchor, contextTab, context.close]);
    const [expanded, setExpanded] = useState(true);
    const [previewId, setPreviewId] = useState<number | null>(null);
    return <aside className={`tm-pinned-tabs tm-pinned-${direction} ${expanded ? "is-expanded" : ""}`} aria-label={t("m229")}>
    <MapTooltip label={error || (expanded ? t("m222", tabs.length) : t("m223", tabs.length))}>
      <button className="tm-pinned-toggle" type="button" aria-label={t("m221")} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <Pin size={16}/><span>{tabs.length}</span>
      </button>
    </MapTooltip>
    {expanded && <div className="tm-pinned-list" aria-label={t("m225")} onDragOver={sorting.over} onDrop={sorting.drop} onDragLeave={sorting.leave}>
      {!tabs.length && <span className="tm-pinned-empty">{error || t("m224")}</span>}
      {tabs.map((tab) => <PinnedTabItem key={tab.id} tab={tab} busy={busy} canDrag={canDrag} onOpen={onOpen} onDelete={onDelete} dragging={sorting.draggedId === tab.id} sortSide={sorting.hint?.tabId === tab.id ? sorting.hint.side : undefined} onSortStart={(tabId) => { context.close(); setPreviewId(null); sorting.start(tabId); }} onSortEnd={sorting.end} onContextMenu={(event) => { if (!busy)
                context.show(event, { tabId: tab.id }); }} previewActive={sorting.draggedId === null && !context.anchor && previewId === tab.id} onPreview={(open) => setPreviewId((previous) => open ? tab.id : previous === tab.id ? null : previous)}/>)}
    </div>}
    {context.anchor && contextTab && <MapContextMenu key={context.anchor.requestId} anchor={context.anchor} title={contextTab.title || contextTab.url} busy={busy} onClose={context.close} actions={[
                { label: t("m226"), icon: ExternalLink, run: () => onOpen(contextTab.id) },
                ...(mapUrl(contextTab.url) ? [{ label: t("m227"), icon: GitBranch, run: () => onOpen(contextTab.id, true) }] : []),
                { label: t("m192"), icon: PinOff, run: () => onUnpin(contextTab.id) },
                { label: t("m194"), icon: Copy, run: () => navigator.clipboard.writeText(contextTab.url) },
                { label: t("m228"), icon: Trash2, danger: true, run: () => onDelete(contextTab.id) },
            ]}/>}
  </aside>;
}
