import { t } from "../../i18n";
import { Plus, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { mapUrl } from "../../core/graph";
import { MapTooltip } from "../MapTooltip";
import { SiteIcon } from "../SiteIcon";
import { pinnedSortDragType, pinnedTabDragType } from "./drag";
import type { PinnedTab } from "../../hooks/usePinnedTabs";
export function PinnedTabItem({ tab, busy, canDrag, onOpen, onDelete, previewActive, onPreview, onContextMenu, sortSide, dragging, onSortStart, onSortEnd }: {
    tab: PinnedTab;
    busy: boolean;
    canDrag: boolean;
    previewActive: boolean;
    onPreview: (open: boolean) => void;
    onContextMenu: (event: MouseEvent) => void;
    onOpen: (tabId: number, newTask?: boolean) => void;
    onDelete: (tabId: number) => void;
    sortSide?: "before" | "after";
    dragging: boolean;
    onSortStart: (tabId: number) => void;
    onSortEnd: () => void;
}) {
    const title = tab.title || tab.url, supported = Boolean(mapUrl(tab.url));
    const root = useRef<HTMLDivElement>(null), preview = useRef<HTMLDivElement>(null), leave = useRef(0);
    const [host, setHost] = useState<HTMLElement | null>(null);
    const anchorHost = previewActive ? host : null;
    const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
    function cancelLeave() { window.clearTimeout(leave.current); }
    function show() { cancelLeave(); setHost(root.current?.closest<HTMLElement>(".tm-app") ?? null); onPreview(true); }
    function hide() { cancelLeave(); setHost(null); onPreview(false); }
    function scheduleHide() { cancelLeave(); leave.current = window.setTimeout(hide, 140); }
    useEffect(() => () => cancelLeave(), []);
    useEffect(() => {
        if (!anchorHost)
            return;
        const escape = (event: KeyboardEvent) => { if (event.key === "Escape")
            hide(); };
        const outside = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node) && !preview.current?.contains(event.target as Node))
                hide();
        };
        window.addEventListener("keydown", escape);
        window.addEventListener("blur", hide);
        document.addEventListener("pointerdown", outside, true);
        document.addEventListener("scroll", hide, true);
        return () => {
            window.removeEventListener("keydown", escape);
            window.removeEventListener("blur", hide);
            document.removeEventListener("pointerdown", outside, true);
            document.removeEventListener("scroll", hide, true);
        };
    }, [anchorHost]);
    useLayoutEffect(() => {
        if (!anchorHost)
            return;
        function place() {
            const bounds = anchorHost!.getBoundingClientRect(), icon = root.current!.getBoundingClientRect();
            const height = preview.current?.offsetHeight ?? 60;
            setPosition({ left: Math.max(8, Math.min(icon.left + icon.width / 2 - bounds.left - 80, bounds.width - 168)),
                top: Math.max(8, Math.min(icon.bottom + 4 - bounds.top, bounds.height - height - 8)) });
        }
        place();
        const observer = new ResizeObserver(place);
        observer.observe(anchorHost);
        if (preview.current)
            observer.observe(preview.current);
        return () => observer.disconnect();
    }, [anchorHost]);
    return <div ref={root} data-pinned-id={tab.id} data-sort-side={sortSide} className={`tm-pinned-item ${tab.active ? "is-active" : ""} ${dragging ? "is-dragging" : ""} ${anchorHost ? "is-previewing" : ""}`} draggable={!busy} onContextMenu={(event) => { hide(); onContextMenu(event); }} onPointerEnter={show} onPointerLeave={scheduleHide} onFocusCapture={show} onBlurCapture={(event) => {
            if (!root.current?.contains(event.relatedTarget as Node) && !preview.current?.contains(event.relatedTarget as Node))
                scheduleHide();
        }} onDragStart={(event) => {
            hide();
            onSortStart(tab.id);
            event.dataTransfer.setData(pinnedSortDragType, String(tab.id));
            if (canDrag && supported)
                event.dataTransfer.setData(pinnedTabDragType, String(tab.id));
            event.dataTransfer.effectAllowed = canDrag && supported ? "copyMove" : "move";
        }} onDragEnd={onSortEnd}>
    <button className="tm-pinned-open" type="button" aria-label={t("m213", title)} aria-current={tab.active ? "page" : undefined} disabled={busy} onClick={() => { hide(); onOpen(tab.id); }}><SiteIcon url={tab.url}/></button>
    <MapTooltip label={t("m215", title)}>
      <button className="tm-pinned-delete" type="button" aria-label={t("m214", title)} disabled={busy} draggable={false} onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { event.stopPropagation(); hide(); onDelete(tab.id); }}><X size={11}/></button>
    </MapTooltip>
    {anchorHost && createPortal(<div ref={preview} className="tm-pinned-preview" style={position} role="group" aria-label={t("m220", title)} onPointerEnter={cancelLeave} onPointerLeave={scheduleHide} onFocusCapture={cancelLeave}>
      <button className="tm-pinned-title" type="button" title={title} aria-label={t("m216", title)} disabled={busy} onClick={() => { hide(); onOpen(tab.id); }}>{title}</button>
      <MapTooltip label={supported ? t("m218", title) : t("m219")}>
        <button className="tm-pinned-new" type="button" aria-label={t("m217", title)} disabled={busy || !supported} onClick={() => { hide(); onOpen(tab.id, true); }}><Plus size={14}/></button>
      </MapTooltip>
    </div>, anchorHost)}
  </div>;
}
