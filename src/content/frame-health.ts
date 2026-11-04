import { mapFrameReadyType } from "../core/frame-status";

export type FrameStatus = "loading" | "ready" | "failed";

export function monitorMapFrame(frame: HTMLIFrameElement, url: string, onStatus: (status: FrameStatus) => void) {
  const expected = new URL(url);
  const origin = `${expected.protocol}//${expected.host}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let repairs = 0;
  let disposed = false;
  function status(next: FrameStatus) {
    clearTimeout(timer);
    onStatus(next);
    if (next === "loading") timer = setTimeout(() => onStatus("failed"), 8000);
  }
  // A host script can add srcdoc="", which takes precedence over the extension URL.
  // Repair only our own frame, with a bound to avoid fighting a persistent host script.
  const observer = new MutationObserver(() => {
    if (!frame.hasAttribute("srcdoc")) return;
    if (repairs >= 3) { status("failed"); return; }
    repairs++;
    status("loading");
    frame.removeAttribute("srcdoc");
  });
  observer.observe(frame, { attributes: true, attributeFilter: ["srcdoc"] });
  function ready(event: MessageEvent) {
    if (!frame.contentWindow || frame.hasAttribute("srcdoc") || event.source !== frame.contentWindow || event.origin !== origin || event.data?.type !== mapFrameReadyType) return;
    status("ready");
  }
  window.addEventListener("message", ready);
  status("loading");
  return {
    retry() {
      if (disposed) return;
      repairs = 0;
      status("loading");
      frame.removeAttribute("srcdoc");
      frame.src = url;
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("message", ready);
    },
  };
}
