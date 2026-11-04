import { useCallback, useState } from "react";
import type { MapPlacement } from "../types/map";

export type MapContextAnchor = { requestId: number; x: number; y: number; host: HTMLElement; source: HTMLElement | null; nodeId?: string; tabId?: number; selection?: boolean; placement?: MapPlacement };
type PointerEvent = Pick<MouseEvent, "clientX" | "clientY" | "target" | "preventDefault" | "stopPropagation">;
export function useMapContextMenu() {
  const [anchor, setAnchor] = useState<MapContextAnchor | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  function show(event: PointerEvent, options: { nodeId?: string; tabId?: number; selection?: boolean; placement?: MapPlacement } = {}) {
    const target = event.target instanceof Element ? event.target : null;
    const host = target?.closest<HTMLElement>(".tm-app");
    if (!target || !host) return;
    event.preventDefault(); event.stopPropagation();
    const rect = target.getBoundingClientRect();
    const keyboard = !event.clientX && !event.clientY;
    setAnchor({ requestId: performance.now(), x: keyboard ? rect.left + rect.width / 2 : event.clientX, y: keyboard ? rect.top + rect.height / 2 : event.clientY, host,
      source: target.closest<HTMLElement>("[tabindex], .tm-canvas, .tm-empty"), ...options });
  }
  return { anchor, show, close };
}
