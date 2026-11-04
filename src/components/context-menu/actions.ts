import { t } from "../../i18n";
import { ArrowUpLeft, ClipboardPaste, Copy, Crosshair, ExternalLink, GitBranch, Maximize, Pin, PinOff, Plus, RotateCcw, Trash2, UnfoldVertical } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MapNode, MapPlacement } from "../../types/map";
export type CreateContextTab = (parentId: string | null, text?: string, placement?: MapPlacement) => Promise<boolean>;
export type MapContextAction = {
    label: string;
    icon: LucideIcon;
    danger?: boolean;
    run?: () => void | Promise<boolean | void>;
    paste?: (text: string) => Promise<boolean>;
};
export function mapContextActions({ node, placement, create, focus, remove, selectedCount = 0, selection = false, removeSelected, toggle, collapsed, makeRoot, fit, reset, pinned, togglePin }: {
    node?: MapNode;
    placement?: MapPlacement;
    create: CreateContextTab;
    focus: (id?: string) => void;
    remove?: () => void;
    selectedCount?: number;
    selection?: boolean;
    removeSelected?: () => Promise<void>;
    toggle?: () => void;
    collapsed?: boolean;
    pinned?: boolean;
    togglePin?: () => Promise<boolean>;
    makeRoot?: () => Promise<boolean>;
    fit?: () => void;
    reset?: () => void;
}): MapContextAction[] {
    if (selection)
        return [
            ...(fit ? [{ label: t("m187"), icon: Maximize, run: fit }] : []),
            ...(selectedCount && removeSelected ? [{ label: t("m188", selectedCount), icon: Trash2, danger: true, run: removeSelected }] : []),
        ];
    if (node)
        return [
            { label: t("m189"), icon: ExternalLink, run: () => focus(node.id) },
            { label: t("m190"), icon: Plus, run: () => create(node.id) },
            { label: t("m191"), icon: ClipboardPaste, paste: (text) => create(node.id, text) },
            ...(togglePin ? [{ label: pinned ? t("m192") : t("m193"), icon: pinned ? PinOff : Pin, run: togglePin }] : []),
            { label: t("m194"), icon: Copy, run: () => navigator.clipboard.writeText(node.url) },
            ...(toggle ? [{ label: collapsed ? t("m195") : t("m196"), icon: UnfoldVertical, run: toggle }] : []),
            ...(node.parentId ? [{ label: t("m197"), icon: ArrowUpLeft, run: () => focus(node.parentId!) },
                ...(makeRoot ? [{ label: t("m198"), icon: GitBranch, run: makeRoot }] : [])] : []),
            ...(selectedCount > 1 && removeSelected ? [{ label: t("m188", selectedCount), icon: Trash2, danger: true, run: removeSelected }]
                : remove ? [{ label: t("m199"), icon: Trash2, danger: true, run: remove }] : []),
        ];
    return [
        { label: t("m200"), icon: Plus, run: () => create(null, undefined, placement) },
        { label: t("m185"), icon: ClipboardPaste, paste: (text) => create(null, text, placement) },
        { label: t("m201"), icon: Crosshair, run: () => focus() },
        ...(fit ? [{ label: t("m107"), icon: Maximize, run: fit }] : []),
        ...(reset ? [{ label: t("m109"), icon: RotateCcw, run: reset }] : []),
        ...(selectedCount && removeSelected ? [{ label: t("m188", selectedCount), icon: Trash2, danger: true, run: removeSelected }] : []),
    ];
}
