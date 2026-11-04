import { t } from "../../i18n";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { MapContextAnchor } from "../../hooks/useMapContextMenu";
import type { MapContextAction } from "./actions";
import "./styles.css";
export function MapContextMenu({ anchor, actions, title, busy, onClose }: {
    anchor: MapContextAnchor;
    actions: MapContextAction[];
    title: string;
    busy: boolean;
    onClose: () => void;
}) {
    const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
    const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
    const [pending, setPending] = useState(false), [error, setError] = useState("");
    const [pasteAction, setPasteAction] = useState<MapContextAction | null>(null), [text, setText] = useState("");
    function close() { onClose(); if (anchor.source?.isConnected)
        anchor.source.focus({ preventScroll: true }); }
    useLayoutEffect(() => {
        function place() {
            const host = anchor.host.getBoundingClientRect(), menu = root.current?.getBoundingClientRect();
            setPosition({ left: Math.max(8, Math.min(anchor.x - host.left, host.width - (menu?.width ?? 220) - 8)),
                top: Math.max(8, Math.min(anchor.y - host.top, host.height - (menu?.height ?? 0) - 8)),
                maxHeight: host.height - 16 });
        }
        place();
        const observer = new ResizeObserver(place);
        observer.observe(anchor.host);
        if (root.current)
            observer.observe(root.current);
        return () => observer.disconnect();
    }, [anchor]);
    useEffect(() => {
        const focusFrame = requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true }));
        const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node))
            onClose(); };
        const escape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close();
            }
        };
        document.addEventListener("pointerdown", outside, true);
        window.addEventListener("keydown", escape, true);
        window.addEventListener("blur", onClose);
        return () => { cancelAnimationFrame(focusFrame); document.removeEventListener("pointerdown", outside, true); window.removeEventListener("keydown", escape, true); window.removeEventListener("blur", onClose); };
    }, [anchor, onClose]);
    useEffect(() => { if (pasteAction)
        input.current?.focus(); }, [pasteAction]);
    async function perform(action: MapContextAction, pasted?: string) {
        if (busy || pending)
            return;
        setPending(true);
        setError("");
        try {
            let value = pasted;
            if (action.paste && value === undefined) {
                try {
                    value = await navigator.clipboard.readText();
                }
                catch {
                    setPasteAction(action);
                    setError(t("m181"));
                    return;
                }
            }
            if (action.paste && !value?.trim())
                throw new Error(t("m182"));
            const ok = action.paste ? await action.paste(value!.trim()) : await action.run?.();
            if (ok === false)
                throw new Error(t("m183"));
            close();
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : t("m184"));
        }
        finally {
            setPending(false);
        }
    }
    return createPortal(<div ref={root} className="tm-context-menu" style={position} role="menu" aria-label={title} aria-busy={busy || pending} onContextMenu={(event) => event.preventDefault()} onKeyDown={(event) => {
            if (event.target instanceof HTMLInputElement)
                return;
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
                return;
            event.preventDefault();
            event.stopPropagation();
            const items = [...root.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            items[index]?.focus();
        }}>
    <div className="tm-context-title">{title}</div>
    {actions.map((action) => <button key={action.label} type="button" role="menuitem" className={action.danger ? "is-danger" : ""} disabled={busy || pending} onClick={() => void perform(action)}><action.icon size={15}/>{action.label}</button>)}
    {error && <p className="tm-context-error" role="alert">{error}</p>}
    {pasteAction && <input ref={input} aria-label={t("m185")} placeholder={t("m186")} value={text} maxLength={2000} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void perform(pasteAction, text);
                }
            }}/>}
  </div>, anchor.host);
}
