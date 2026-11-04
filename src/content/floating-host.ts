import { t, subscribeLanguage } from "../i18n";
import { tabMapGeometryKey, tabMapOverlayKey } from "../types/map";
import { defaultMapSize, finiteNumber, restoredMapSize } from "../core/window-geometry";

type Geometry = { x: number; y: number; width: number; height: number };
const defaultGeometry: Geometry = { x: 30, y: 70, ...defaultMapSize };

export async function mountFloatingMap() {
  const host = document.createElement("div");
  host.id = "tab-flow-map-host";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>
    :host { all:initial; position:fixed; z-index:2147483646; display:none; }
    .frame { position:relative; display:flex; flex-direction:column; width:100%; height:100%; box-sizing:border-box;
      background:#fff; border:1px solid #cbd5e1; border-radius:12px; box-shadow:0 18px 60px #0f172a35; overflow:hidden; }
    .bar { display:flex; align-items:center; justify-content:space-between; flex:none; height:36px; padding:0 12px;
      background:#f1f5f9; color:#334155; font:600 12px/1.4 system-ui; cursor:move; touch-action:none; user-select:none; }
    button { border:0; border-radius:5px; background:transparent; color:#475569; cursor:pointer; padding:4px 8px; font:inherit; }
    button:hover { background:#e2e8f0; } button:focus-visible, .resize:focus-visible { outline:2px solid #2563eb; }
    iframe { border:0; width:100%; flex:1; min-height:0; background:white; }
    .resize { position:absolute; bottom:0; right:0; width:20px; height:20px; cursor:nwse-resize; touch-action:none;
      background:linear-gradient(135deg,transparent 50%,#94a3b8 50%,#94a3b8 56%,transparent 56%,transparent 67%,#94a3b8 67%,#94a3b8 73%,transparent 73%); }
  </style><div class="frame"><div class="bar"><span>${t("overlayTitle")}</span><button aria-label="${t("overlayClose")}" title="${t("overlayClose")}">×</button></div><div class="resize" tabindex="0" role="button" aria-label="${t("overlayResize")}" title="${t("overlayResizeDrag")}"></div></div>`;
  document.documentElement.append(host);
  const unsubscribeLanguage = subscribeLanguage(() => {
    shadow.querySelector(".bar span")!.textContent = t("overlayTitle");
    const close = shadow.querySelector("button")!;
    close.setAttribute("aria-label", t("overlayClose")); close.title = t("overlayClose");
    const handle = shadow.querySelector<HTMLElement>(".resize")!;
    handle.setAttribute("aria-label", t("overlayResize")); handle.title = t("overlayResizeDrag");
    if (iframe) iframe.title = t("m126");
  });
  const stored = await browser.storage.local.get([tabMapGeometryKey, tabMapOverlayKey]);
  function restore(value: unknown): Geometry {
    const saved = value && typeof value === "object" ? value as Partial<Geometry> : {};
    return { ...restoredMapSize(saved), x: finiteNumber(saved.x, defaultGeometry.x), y: finiteNumber(saved.y, defaultGeometry.y) };
  }
  let geometry = restore(stored[tabMapGeometryKey]);
  const frame = shadow.querySelector<HTMLDivElement>(".frame")!;
  const bar = shadow.querySelector<HTMLDivElement>(".bar")!;
  const resize = shadow.querySelector<HTMLDivElement>(".resize")!;
  let iframe: HTMLIFrameElement | undefined;
  let active = false;

  function clamp() {
    geometry.width = Math.min(Math.max(380, geometry.width), Math.max(280, innerWidth - 12));
    geometry.height = Math.min(Math.max(240, geometry.height), Math.max(220, innerHeight - 12));
    geometry.x = Math.max(0, Math.min(geometry.x, innerWidth - geometry.width));
    geometry.y = Math.max(0, Math.min(geometry.y, innerHeight - geometry.height));
  }
  function position() {
    clamp();
    Object.assign(host.style, {
      left: `${geometry.x}px`, top: `${geometry.y}px`, width: `${geometry.width}px`, height: `${geometry.height}px`,
    });
  }
  function show(visible: boolean) {
    if (visible && !iframe) {
      iframe = document.createElement("iframe");
      iframe.src = browser.runtime.getURL("/tab-map.html?mode=embedded");
      iframe.title = t("m126");
      iframe.allow = "clipboard-read; clipboard-write";
      frame.insertBefore(iframe, resize);
    }
    host.style.display = visible ? "block" : "none";
    position();
  }
  const save = () => browser.storage.local.set({ [tabMapGeometryKey]: geometry });
  function attachDrag(element: HTMLElement, resizing: boolean) {
    let initial: Geometry | undefined;
    let startX = 0;
    let startY = 0;
    element.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
      event.preventDefault();
      startX = event.clientX; startY = event.clientY; initial = { ...geometry };
      active = true;
      element.setPointerCapture(event.pointerId);
      if (iframe) iframe.style.pointerEvents = "none";
    });
    element.addEventListener("pointermove", (event) => {
      if (!initial) return;
      const dx = event.clientX - startX, dy = event.clientY - startY;
      geometry = resizing ? { ...initial, width: initial.width + dx, height: initial.height + dy }
        : { ...initial, x: initial.x + dx, y: initial.y + dy };
      position();
    });
    function finish() {
      if (!initial) return;
      initial = undefined; active = false;
      if (iframe) iframe.style.pointerEvents = "auto";
      void save();
    }
    element.addEventListener("pointerup", finish);
    element.addEventListener("pointercancel", finish);
    element.addEventListener("lostpointercapture", finish);
  }
  attachDrag(bar, false);
  attachDrag(resize, true);
  resize.addEventListener("keydown", (event) => {
    const direction: Record<string, [number, number]> = { ArrowRight: [20, 0], ArrowLeft: [-20, 0], ArrowDown: [0, 20], ArrowUp: [0, -20] };
    const change = direction[event.key];
    if (!change) return;
    event.preventDefault(); geometry.width += change[0]; geometry.height += change[1]; position(); void save();
  });
  shadow.querySelector("button")!.addEventListener("click", () => {
    void browser.storage.local.set({ [tabMapOverlayKey]: false });
  });
  const onResize = () => position();
  window.addEventListener("resize", onResize);
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== "local") return;
    if (changes[tabMapOverlayKey]) show(changes[tabMapOverlayKey].newValue === true);
    if (changes[tabMapGeometryKey] && !active) {
      geometry = restore(changes[tabMapGeometryKey].newValue);
      position();
    }
  };
  browser.storage.onChanged.addListener(listener);
  show(stored[tabMapOverlayKey] === true);
  return () => { unsubscribeLanguage(); host.remove(); window.removeEventListener("resize", onResize); browser.storage.onChanged.removeListener(listener); };
}
