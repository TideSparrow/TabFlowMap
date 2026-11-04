import { t } from "../../i18n";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { SiteIcon } from "../SiteIcon";
import type { MapNode } from "../../types/map";
import "./menu.css";
export function MainTaskMenu({ roots, index, disabled, onNavigate }: {
    roots: MapNode[];
    index: number;
    disabled: boolean;
    onNavigate: (id: string) => void;
}) {
    const [open, setOpen] = useState(false), [host, setHost] = useState<HTMLElement | null>(null);
    const [placement, setPlacement] = useState<CSSProperties>({});
    const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
    const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const focusFrame = useRef(0), menuId = useId();
    function cancelLeave() { if (leaveTimer.current)
        clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    function show() { cancelLeave(); setOpen(true); }
    function hide() { cancelLeave(); cancelAnimationFrame(focusFrame.current); setOpen(false); }
    function leave() { cancelLeave(); leaveTimer.current = setTimeout(() => setOpen(false), 140); }
    function contains(target: EventTarget | null) {
        return target instanceof Node && (root.current?.contains(target) || menu.current?.contains(target));
    }
    function focusItem(position: number) {
        cancelAnimationFrame(focusFrame.current);
        const focus = () => {
            const item = menu.current?.querySelectorAll<HTMLButtonElement>("[role='menuitemradio']")[position];
            item?.focus({ preventScroll: true });
            item?.scrollIntoView({ block: "nearest" });
        };
        if (open)
            focus();
        else
            focusFrame.current = requestAnimationFrame(focus);
    }
    function keyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            hide();
            trigger.current?.focus();
            return;
        }
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
            return;
        event.preventDefault();
        show();
        const items = Array.from(menu.current?.querySelectorAll("[role='menuitemradio']") ?? []);
        const focused = items.indexOf(document.activeElement!);
        const next = event.key === "Home" ? 0 : event.key === "End" ? roots.length - 1
            : focused < 0 ? index : (focused + (event.key === "ArrowDown" ? 1 : -1) + roots.length) % roots.length;
        focusItem(next);
    }
    useEffect(() => {
        setHost(root.current?.closest<HTMLElement>(".tm-app") ?? null);
        return () => { cancelLeave(); cancelAnimationFrame(focusFrame.current); };
    }, []);
    useEffect(() => {
        if (!open || !host || !root.current)
            return;
        const card = root.current;
        function place() {
            const bounds = card.getBoundingClientRect(), frame = host!.getBoundingClientRect();
            const width = Math.min(300, frame.width - 24);
            const above = frame.bottom - bounds.bottom < 100 && bounds.top - frame.top > 120;
            setPlacement({ width, left: Math.max(12, Math.min(bounds.left - frame.left, frame.width - width - 12)),
                top: above ? undefined : bounds.bottom - frame.top + 6, bottom: above ? frame.bottom - bounds.top + 6 : undefined,
                maxHeight: Math.max(48, Math.min(320, above ? bounds.top - frame.top - 18 : frame.bottom - bounds.bottom - 18)) });
        }
        place();
        const observer = new ResizeObserver(place);
        observer.observe(host);
        observer.observe(card);
        function outside(event: PointerEvent) { if (!contains(event.target))
            hide(); }
        document.addEventListener("pointerdown", outside, true);
        return () => { observer.disconnect(); document.removeEventListener("pointerdown", outside, true); };
    }, [open, host, roots[index]?.id]);
    return <div className="tm-main-task-count" ref={root} onPointerEnter={(event) => { if (event.pointerType === "mouse")
        show(); }} onPointerLeave={leave} onBlur={(event) => { if (!contains(event.relatedTarget))
        hide(); }} onKeyDown={keyDown}>
    <button className="tm-main-task-trigger" ref={trigger} type="button" aria-label={t("m205")} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} onClick={(event) => { if (open)
        hide();
    else {
        show();
        if (!event.detail)
            focusItem(index);
    } }}>
      <span className="tm-main-task-summary" role="status" aria-live="polite" aria-atomic="true">
        <span>{t("m204", index + 1, roots.length)}</span><strong>{roots[index]?.title}</strong>
      </span><ChevronDown className={open ? "is-open" : ""} size={13}/>
    </button>
    {host && createPortal(<div ref={menu} id={menuId} className={`tm-main-task-menu ${open ? "is-open" : ""}`} style={placement} role="menu" aria-label={t("m206")} aria-hidden={!open} inert={!open} onPointerEnter={show} onPointerLeave={leave}>
      {roots.map((node, position) => <button key={node.id} type="button" role="menuitemradio" tabIndex={-1} aria-checked={position === index} disabled={disabled} style={{ "--task-enter-delay": `${Math.min(position * 35, 210)}ms`, "--task-exit-delay": `${Math.min((roots.length - position - 1) * 20, 100)}ms` } as CSSProperties} onClick={() => { hide(); trigger.current?.focus({ preventScroll: true }); onNavigate(node.id); }}>
        <span className="tm-main-task-site"><SiteIcon url={node.url}/></span>
        <span className="tm-main-task-title"><strong>{node.title || node.url}</strong><small>{node.url}</small></span>
        {position === index && <Check size={14}/>}
      </button>)}
    </div>, host)}
  </div>;
}
