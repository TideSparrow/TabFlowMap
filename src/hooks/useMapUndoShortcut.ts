import { useEffect } from "react";

export function useMapUndoShortcut(enabled: boolean, undo: () => Promise<boolean>) {
  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (!enabled || event.defaultPrevented || event.isComposing || event.shiftKey || event.altKey ||
        !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input,textarea,select,[role=search],[role=dialog],[role=menu]"))) return;
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) void undo();
    }
    window.addEventListener("keydown", keyDown, true);
    return () => window.removeEventListener("keydown", keyDown, true);
  }, [enabled, undo]);
}
