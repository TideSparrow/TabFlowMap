import { useState, type DragEvent } from "react";
import { pinnedSortDragType, pinnedTabFromDrop } from "../components/pinned/drag";
import type { PinnedTab } from "./usePinnedTabs";
import type { MapLayoutDirection } from "../core/view-options";

export type ReorderPinned = (tabId: number, targetTabId: number, side: "before" | "after") => Promise<boolean>;
type Hint = { tabId: number; side: "before" | "after" };

export function usePinnedSorting(tabs: PinnedTab[], busy: boolean, direction: MapLayoutDirection, reorder: ReorderPinned) {
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const horizontal = direction === "vertical";
  function end() { setDraggedId(null); setHint(null); }
  function targetAt(event: DragEvent<HTMLDivElement>, sourceId: number): Hint | null {
    const source = tabs.find((tab) => tab.id === sourceId);
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-pinned-id]")];
    const coordinate = horizontal ? event.clientX : event.clientY;
    const nearest = items.reduce<{ element: HTMLElement; distance: number } | null>((previous, element) => {
      const bounds = element.getBoundingClientRect();
      const center = horizontal ? bounds.left + bounds.width / 2 : bounds.top + bounds.height / 2;
      const distance = Math.abs(coordinate - center);
      return !previous || distance < previous.distance ? { element, distance } : previous;
    }, null)?.element;
    const target = tabs.find((tab) => tab.id === Number(nearest?.dataset.pinnedId));
    if (!source || !target || source.id === target.id || source.windowId !== target.windowId || !nearest) return null;
    const bounds = nearest.getBoundingClientRect();
    return { tabId: target.id, side: coordinate < (horizontal ? bounds.left + bounds.width / 2 : bounds.top + bounds.height / 2) ? "before" : "after" };
  }
  function over(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes(pinnedSortDragType)) return;
    event.preventDefault(); event.stopPropagation();
    const next = busy || draggedId === null ? null : targetAt(event, draggedId);
    event.dataTransfer.dropEffect = next ? "move" : "none";
    setHint((previous) => previous?.tabId === next?.tabId && previous?.side === next?.side ? previous : next);
    const bounds = event.currentTarget.getBoundingClientRect();
    const coordinate = horizontal ? event.clientX : event.clientY;
    const amount = coordinate < (horizontal ? bounds.left : bounds.top) + 24 ? -12
      : coordinate > (horizontal ? bounds.right : bounds.bottom) - 24 ? 12 : 0;
    if (horizontal) event.currentTarget.scrollLeft += amount; else event.currentTarget.scrollTop += amount;
  }
  function drop(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes(pinnedSortDragType)) return;
    event.preventDefault(); event.stopPropagation();
    const sourceId = pinnedTabFromDrop(event.dataTransfer, pinnedSortDragType);
    const target = !busy && sourceId !== null && sourceId === draggedId ? targetAt(event, sourceId) : null;
    end();
    if (sourceId !== null && target) void reorder(sourceId, target.tabId, target.side);
  }
  return { draggedId, hint, start: setDraggedId, end, over, drop,
    leave: (event: DragEvent<HTMLDivElement>) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHint(null); } };
}
