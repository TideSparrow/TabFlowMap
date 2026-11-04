export const mapFrameReadyType = "tab-flow-map-frame-ready.v1";

// Only a readiness signal crosses the frame boundary; map data stays in the extension.
export function notifyMapFrameReady() {
  if (window.parent !== window) window.parent.postMessage({ type: mapFrameReadyType }, "*");
}
