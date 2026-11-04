import { initializeI18n } from "../i18n";
import { mountFloatingMap } from "../content/floating-host";
import { tabMapMessageType, type MapNode } from "../types/map";
import { installLineageCapture } from "../content/capture";

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_start",
  async main(ctx) {
    if (window.top !== window || browser.extension.inIncognitoContext) return;
    await initializeI18n();
    if (ctx.isInvalid) return;
    const send = (message: Record<string, unknown>) => browser.runtime.sendMessage({ type: tabMapMessageType, ...message }).catch(() => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let restoring = false;
    function position() {
      const element = document.elementFromPoint(Math.min(100, innerWidth / 2), Math.min(100, innerHeight / 2));
      const anchor = element && !element.closest("input,textarea,[contenteditable=true],#tab-flow-map-host")
        ? (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 120) : "";
      return { url: location.href, scrollX, scrollY, anchor };
    }
    function checkpoint() {
      if (!restoring) void send({ action: "checkpoint", ...position() });
    }
    function restore(node: MapNode) {
      if (node.url !== location.href) return;
      restoring = true;
      let attempts = 0;
      const apply = () => {
        window.scrollTo(node.scrollX, node.scrollY);
        if (++attempts >= 6 || Math.abs(window.scrollY - node.scrollY) < 3) {
          clearInterval(interval); restoring = false;
        }
      };
      const interval = setInterval(apply, 350);
      apply();
      ctx.onInvalidated(() => clearInterval(interval));
    }
    ctx.onInvalidated(installLineageCapture(document, send, checkpoint));
    ctx.addEventListener(window, "scroll", () => {
      clearTimeout(timer); timer = setTimeout(checkpoint, 1200);
    }, { passive: true });
    ctx.addEventListener(window, "pagehide", () => checkpoint());
    ctx.addEventListener(document, "visibilitychange", () => { if (document.hidden) checkpoint(); });
    const listener = (message: { type?: string; node?: MapNode }) => {
      if (message.type === "tab-flow-map-snapshot") return Promise.resolve(position());
      if (message.type === "tab-flow-map-restore" && message.node) restore(message.node);
    };
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => { clearTimeout(timer); browser.runtime.onMessage.removeListener(listener); });
    function ready() {
      void mountFloatingMap().then((dispose) => ctx.onInvalidated(dispose)).catch(() => undefined);
      void send({ action: "ready", url: location.href }).then((result) => {
        if (result?.restore) restore(result.restore);
      });
    }
    if (document.readyState === "loading") ctx.addEventListener(document, "DOMContentLoaded", ready, { once: true });
    else ready();
  },
});
