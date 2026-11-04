import { t } from "../../i18n";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import type { MapNode } from "../../types/map";
import "./styles.css";
export function MapSearch({ nodes, query, onQuery, onNavigate, enabled = true, busy }: {
    nodes: MapNode[];
    query: string;
    onQuery: (query: string) => void;
    onNavigate: (id: string) => void;
    enabled?: boolean;
    busy: boolean;
}) {
    const [open, setOpen] = useState(false), [request, setRequest] = useState(0), [index, setIndex] = useState(0);
    const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
    const anchor = useRef<HTMLSpanElement>(null);
    const [host, setHost] = useState<HTMLElement | null>(null);
    const previousFocus = useRef<HTMLElement | null>(null);
    const listId = useId();
    const matches = useMemo(() => {
        const text = query.trim().toLowerCase();
        return text ? nodes.filter((node) => `${node.title} ${node.url} ${node.keyword ?? ""} ${node.note}`.toLowerCase().includes(text)) : [];
    }, [nodes, query]);
    const activeIndex = Math.min(index, Math.max(0, matches.length - 1));
    function close() {
        setOpen(false);
        onQuery("");
        const target = previousFocus.current;
        if (target?.isConnected && target.getClientRects().length)
            target.focus({ preventScroll: true });
        else
            anchor.current?.parentElement?.focus({ preventScroll: true });
    }
    function navigate(id: string) { if (!busy) {
        close();
        onNavigate(id);
    } }
    // Keep search usable when detailed controls leave very little canvas height.
    useEffect(() => { setHost(anchor.current?.closest<HTMLElement>(".tm-app") ?? null); }, []);
    useEffect(() => {
        function keyDown(event: KeyboardEvent) {
            if (!enabled || event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey ||
                !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "f" || !anchor.current?.parentElement?.getClientRects().length || !root.current)
                return;
            if (event.target instanceof Element && event.target.closest("[role='dialog'], [role='alertdialog']"))
                return;
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat)
                return;
            if (!root.current.contains(document.activeElement))
                previousFocus.current = document.activeElement as HTMLElement | null;
            setOpen(true);
            setRequest((value) => value + 1);
        }
        window.addEventListener("keydown", keyDown, { capture: true });
        return () => window.removeEventListener("keydown", keyDown, { capture: true });
    }, [enabled]);
    useEffect(() => { if (open) {
        input.current?.focus();
        input.current?.select();
    } }, [open, request]);
    useEffect(() => { setIndex(0); }, [query]);
    useEffect(() => {
        root.current?.querySelector<HTMLElement>(`[data-result-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, query, open]);
    return <><span ref={anchor} hidden/>{host && createPortal(<div ref={root} className="tm-map-search" hidden={!open} role="search" aria-label={t("m231")} onKeyDown={(event) => {
                if (event.nativeEvent.isComposing)
                    return;
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    close();
                }
                else if (event.target === input.current && (event.key === "ArrowDown" || event.key === "ArrowUp") && matches.length) {
                    event.preventDefault();
                    setIndex((activeIndex + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
                }
                else if (event.target === input.current && event.key === "Enter" && matches[activeIndex]) {
                    event.preventDefault();
                    navigate(matches[activeIndex].id);
                }
            }}>
    <div className="tm-map-search-input"><Search size={16}/>
      <input ref={input} role="combobox" aria-label={t("m231")} aria-autocomplete="list" aria-expanded={Boolean(matches.length)} aria-controls={listId} aria-activedescendant={matches.length ? `${listId}-${activeIndex}` : undefined} placeholder={t("m232")} value={query} onChange={(event) => onQuery(event.target.value)}/>
      <button type="button" aria-label={t("m233")} onClick={close}><X size={16}/></button>
    </div>
    <div className="tm-map-search-status" role="status">{query.trim() ? t("m234", matches.length) : t("m235")}</div>
    <div id={listId} className="tm-map-search-results" role="listbox" aria-label={t("m237")}>
      {matches.map((node, position) => <button key={node.id} id={`${listId}-${position}`} type="button" role="option" data-result-index={position} aria-selected={position === activeIndex} disabled={busy} onClick={() => navigate(node.id)}>
        <strong>{node.title || node.url}</strong><small>{node.url}</small>
      </button>)}
      {query.trim() && !matches.length && <p>{t("m236")}</p>}
    </div>
  </div>, host)}</>;
}
