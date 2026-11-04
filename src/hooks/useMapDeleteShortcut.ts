import { useEffect } from "react";

export function useMapDeleteShortcut(enabled: boolean, onDelete: () => Promise<void>) {
  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (!enabled || event.defaultPrevented || event.isComposing || (event.key !== "Delete" && event.key !== "Backspace") ||
          event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable ||
          target.closest("input, textarea, select, [role='search'], [role='menu'], [role='dialog'], [role='alertdialog']"))) return;
      event.preventDefault();
      if (!event.repeat) void onDelete();
    }
    // 先于画布组件处理按键，避免节点自身的键盘处理吞掉删除。
    window.addEventListener("keydown", keyDown, { capture: true });
    return () => window.removeEventListener("keydown", keyDown, { capture: true });
  }, [enabled, onDelete]);
}
