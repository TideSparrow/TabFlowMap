import { initializeTabMapManager } from "../background/manager";
import { replyToMapMessage } from "../background/message-response";
import { initializeI18n } from "../i18n";

export default defineBackground(() => {
  const languageReady = initializeI18n();
  const manager = initializeTabMapManager(async (windowId) => {
    await browser.sidePanel.open({ windowId });
  }, async () => {
    // close() is available only on newer Chrome releases.
    const panel = browser.sidePanel as typeof browser.sidePanel & { close?: (options: { windowId: number }) => Promise<void> };
    const target = await browser.windows.getLastFocused({ windowTypes: ["normal"] });
    if (target.id !== undefined && panel.close) await panel.close({ windowId: target.id });
  });

  browser.runtime.onInstalled.addListener(() => {
    void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  });
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const result = manager.handleMessage(message, sender);
    if (result) return replyToMapMessage(result, sendResponse);
  });
  void languageReady;
});
