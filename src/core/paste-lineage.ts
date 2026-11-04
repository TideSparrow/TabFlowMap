import type { CopySource, MapNode, MapRuntime, PasteWindow } from "../types/map";

export const pasteStepLimit = 3;

export function createPasteWindow(copies: CopySource[], nodes: MapNode[]): PasteWindow {
  const source = copies.filter((copy) => nodes.some((node) => node.id === copy.nodeId))
    .sort((a, b) => b.at - a.at)[0];
  return { steps: 0, source: source ? { ...source } : undefined };
}

// The third action is eligible; the fourth never is. Return the last window
// even when closing it, so a paste on the third action can still be verified.
export function takePasteStep(runtime: MapRuntime, tabId: number) {
  const window = runtime.pasteWindows[tabId];
  if (!window) return undefined;
  window.steps += 1;
  if (window.steps >= pasteStepLimit) delete runtime.pasteWindows[tabId];
  return window.steps <= pasteStepLimit ? window : undefined;
}

export function matchesPaste(window: PasteWindow, text: string) {
  const normalize = (value: string) => value.trim().replace(/\r\n/g, "\n");
  return Boolean(window.source && normalize(window.source.text) === normalize(text));
}
