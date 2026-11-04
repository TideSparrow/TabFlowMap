import { t } from "../i18n";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Map, Monitor, Move, PanelRight, Plus, Radar, Settings, SlidersHorizontal, Trash2 } from "lucide-react";
import { useNormalWindowId } from "../hooks/useNormalWindowId";
import { MapDisplaySwitch } from "./MapDisplaySwitch";
import { MapTooltip } from "./MapTooltip";
import type { MapCommand } from "../types/map";
import type { MapDisplayMode } from "../core/view-options";
type Props = {
    children: ReactNode;
    displayMode: MapDisplayMode;
    onDisplayMode: (mode: MapDisplayMode) => void;
    mode: "sidepanel" | "embedded" | "window";
    showMinimap: boolean;
    onToggleMinimap: () => void;
    canClear: boolean;
    busy: boolean;
    run: (command: MapCommand) => Promise<boolean>;
    onAdd: () => void;
    canAdd: boolean;
    toolsRef: (element: HTMLDivElement | null) => void;
};
export function CompactMapMenu({ children, displayMode, onDisplayMode, mode, showMinimap, onToggleMinimap, canClear, busy, run, onAdd, canAdd, toolsRef }: Props) {
    const normalWindowId = useNormalWindowId();
    const [open, setOpen] = useState(false);
    const [panel, setPanel] = useState<"tools" | "modes" | null>(null);
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    function close() { setOpen(false); setPanel(null); }
    useEffect(() => {
        if (!open)
            return;
        function outside(event: PointerEvent) {
            if (!root.current?.contains(event.target as Node))
                close();
        }
        function escape(event: KeyboardEvent) {
            if (event.key !== "Escape")
                return;
            close();
            trigger.current?.focus();
        }
        document.addEventListener("pointerdown", outside);
        document.addEventListener("keydown", escape);
        return () => {
            document.removeEventListener("pointerdown", outside);
            document.removeEventListener("keydown", escape);
        };
    }, [open]);
    const actions = [
        { tone: "green", label: t("m030"), tip: t("m031"), icon: Plus, run: canAdd ? onAdd : undefined },
        { tone: "red", label: t("m032"), tip: t("m033"), icon: Trash2, run: canClear ? () => void run({ action: "clear" }) : undefined },
        { tone: "cyan", label: t("m034"), tip: displayMode === "tree" ? t("m035") : showMinimap ? t("m036") : t("m037"), icon: Map, run: displayMode === "tree" ? undefined : onToggleMinimap, pressed: showMinimap },
        { tone: "violet", label: t("m038"), tip: t("m039"), icon: Monitor, run: () => setPanel("modes"), panel: true },
        { tone: "amber", label: t("m040"), tip: t("m041"), icon: SlidersHorizontal, run: () => setPanel("tools"), panel: true },
    ];
    const modes = [
        { mode: "embedded", action: "overlay", label: t("m042"), icon: Move },
        { mode: "window", action: "window", label: t("m043"), icon: Monitor },
        { mode: "sidepanel", action: "sidepanel", label: t("m044"), icon: PanelRight },
    ] as const;
    return <div className="tm-compact-menu" ref={root}>
    <MapTooltip label={t("settingsTitle")}><button className="tm-settings-shortcut" aria-label={t("settingsTitle")} onClick={() => void browser.runtime.openOptionsPage()}><Settings size={18}/></button></MapTooltip>
    <div id="tm-radar-actions" className={`tm-radar-actions ${open && !panel ? "is-open" : ""}`} role="group" aria-label={t("m045")} inert={!open || Boolean(panel)}>
      {actions.map(({ tone, label, tip, icon: Icon, run: action, pressed, panel: opensPanel }, index) => {
            const angle = (-90 - index * 22.5) * Math.PI / 180;
            const style = {
                "--radar-x": `${126 * Math.cos(angle)}px`, "--radar-y": `${126 * Math.sin(angle)}px`,
                "--radar-open-delay": `${index * 45}ms`, "--radar-close-delay": `${(actions.length - index - 1) * 35}ms`,
            } as CSSProperties;
            return <MapTooltip key={label} label={tip}><button className={`tm-radar-action tm-tone-${tone}`} aria-label={label} disabled={!action} aria-pressed={pressed} style={style} onClick={() => { if (!opensPanel)
                close(); action?.(); }}><span><Icon size={17}/></span><small>{label}</small></button></MapTooltip>;
        })}
    </div>
    <div id="tm-compact-tools" className="tm-compact-menu-panel" hidden={!open || panel !== "tools"} aria-label={t("m046")}>
      <MapDisplaySwitch mode={displayMode} onChange={(next) => { close(); onDisplayMode(next); }}/>
      {children}<div ref={toolsRef}/><button className="tm-button tm-settings-link" onClick={() => void browser.runtime.openOptionsPage()}><Settings size={15}/>{t("settingsTitle")}</button>
    </div>
    <div id="tm-map-modes" className="tm-compact-menu-panel tm-mode-panel" hidden={!open || panel !== "modes"} role="group" aria-label={t("m048")}>
      {modes.map(({ mode: targetMode, action, label, icon: Icon }) => <button key={targetMode} className="tm-button" aria-pressed={mode === targetMode} disabled={busy || mode === targetMode || (targetMode === "sidepanel" && normalWindowId === null)} onClick={() => { close(); void run(action === "sidepanel" ? { action, windowId: normalWindowId! } : { action }); }}><Icon size={16}/>{label}{mode === targetMode && <small>{t("m047")}</small>}</button>)}
    </div>
    <MapTooltip label={open ? t("m051") : t("m052")}><button className="tm-menu-icon" ref={trigger} aria-label={open ? t("m049") : t("m050")} aria-expanded={open} aria-controls="tm-radar-actions tm-compact-tools tm-map-modes" onClick={() => { if (open)
        close();
    else
        setOpen(true); }}><Radar size={20}/></button></MapTooltip>
  </div>;
}
