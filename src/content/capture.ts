import { copiedSelection, editablePasteTarget, ignoredLineageTarget } from "./lineage";
import type { MapCommand } from "../types/map";

export function installLineageCapture(document: Document, send: (message: MapCommand) => unknown, checkpoint: () => void) {
  function copy(event: ClipboardEvent) {
    if (!event.isTrusted || ignoredLineageTarget(event.target)) return;
    const text = copiedSelection(event.target);
    if (text && text.length <= 500) void send({ action: "copy", text, url: location.href });
    checkpoint();
  }
  function paste(event: ClipboardEvent) {
    if (!event.isTrusted || ignoredLineageTarget(event.target) || !editablePasteTarget(event.target)) return;
    const text = event.clipboardData?.getData("text/plain").trim() ?? "";
    if (text.length <= 500) void send({ action: "paste", text, url: location.href });
    else void send({ action: "step", url: location.href });
  }
  function pointer(event: PointerEvent) {
    checkpoint();
    // 聚焦输入框只是粘贴前的准备；搜索框展开、链接点击等操作仍然计步。
    if (event.isTrusted && event.button === 0 && !ignoredLineageTarget(event.target) && !editablePasteTarget(event.target)) {
      void send({ action: "step", url: location.href });
    }
  }
  // 搜索框可能阻止冒泡；在默认剪切清空选区之前读取来源内容。
  document.addEventListener("copy", copy, true);
  document.addEventListener("cut", copy, true);
  document.addEventListener("paste", paste, true);
  document.addEventListener("pointerdown", pointer, true);
  return () => {
    document.removeEventListener("copy", copy, true);
    document.removeEventListener("cut", copy, true);
    document.removeEventListener("paste", paste, true);
    document.removeEventListener("pointerdown", pointer, true);
  };
}
