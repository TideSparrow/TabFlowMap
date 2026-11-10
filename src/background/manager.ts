import { t, getLocale } from "../i18n";
import { readTabMap, saveTabMap } from "../storage/graph";
import { httpUrl, mapUrl, tabTitle, destination, setParent } from "../core/graph";
import { createPasteWindow, matchesPaste, takePasteStep } from "../core/paste-lineage";
import { matchesAddressBarNavigation } from "../core/address-bar-lineage";
import { branchDeletionOrder, removeMapNode } from "../core/node-deletion";
import { mapPositionKeys, mapPositionPrefix } from "../storage/positions";
import { createUndoHistory } from "./history/undo-history";
import { reorderPinnedTabs } from "./pinned/reorder";
import { createClosedTabRecovery } from "./recovery/closed-tab-recovery";
import { createBrowserRestartRecovery } from "./recovery/browser-restart";
import { initializeMapWindows } from "./windows";
import { readPagePosition } from "./page-position";
import {
  emptyMapRuntime, isMapMessage, tabMapRuntimeKey, tabMapStateKey,
  type MapCommand, type MapPlacement, type MapNode, type MapRuntime, type MapState, type PasteWindow,
} from "../types/map";
import type { Browser } from "wxt/browser";
type WebTab = Browser.tabs.Tab;
type MessageSender = Browser.runtime.MessageSender;

const contentActions = new Set(["copy", "paste", "step", "checkpoint", "ready"]);

export function initializeTabMapManager(openSidePanel?: (windowId: number) => Promise<void>, closeSidePanel?: () => Promise<void>) {
  let state: MapState;
  let runtime: MapRuntime = emptyMapRuntime();
  let queue: Promise<unknown> = Promise.resolve();
  let savedGraph: string | undefined, savedRuntime: string | undefined, publishedView: string | undefined;
  const openMap = initializeMapWindows(openSidePanel, closeSidePanel);
  const history = createUndoHistory();
  const closedTabs = createClosedTabRecovery();
  const restoredUntracked = new Map<number, string>();
  const lastTabs = new Map<number, WebTab>();
  const browserRestart = createBrowserRestartRecovery();
  let restoreTimer: ReturnType<typeof setTimeout> | undefined;
  const ready = initialize();

  async function initialize() {
    state = await readTabMap();
    savedGraph = JSON.stringify(state);
    await history.load();
    await closedTabs.load();
    const saved = (await browser.storage.session.get(tabMapRuntimeKey))[tabMapRuntimeKey] as MapRuntime | undefined;
    if (saved?.bindings && saved?.pendingParents && saved?.restores && Array.isArray(saved.copies)) runtime = saved;
    const restoredGraph = await browserRestart.load(!saved);
    if (restoredGraph) state = restoredGraph;
    runtime.histories ??= {};
    runtime.fixedSources ??= {};
    runtime.pasteWindows ??= {};
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) if (tab.id !== undefined && !tab.incognito) lastTabs.set(tab.id, { ...tab });
    Object.entries(runtime.bindings).forEach(([tabId, nodeId]) => {
      const node = state.nodes.find((item) => item.id === nodeId);
      const liveTab = tabs.find((tab) => tab.id === Number(tabId) && !tab.incognito);
      if (liveTab && node?.sessionId === state.sessionId && !mapUrl(liveTab.url ?? "")) {
        removeNavigatingNode(node, Number(tabId), liveTab.url ?? "");
        return;
      }
      if (!tabs.some((tab) => tab.id === Number(tabId) && !tab.incognito && Boolean(node) && Boolean(mapUrl(tab.url ?? "")))) {
        delete runtime.bindings[tabId];
        delete runtime.restores[tabId];
        delete runtime.histories[tabId];
        delete runtime.fixedSources[tabId];
        delete runtime.pasteWindows[tabId];
      } else if (node) {
        updateLiveNode(node, tabs.find((tab) => tab.id === Number(tabId))!);
        runtime.histories[tabId] = { nodeIds: [nodeId], index: 0 };
      }
    });
    // Reconnect uniquely matching pages after an extension/browser restart; tab IDs are never durable identities.
    browserRestart.reconnectAll(tabs, state, runtime);
    tabs.forEach((tab) => {
      if (browserRestart.reconnect(tab, state, runtime, true)) return;
      if (tab.id === undefined || tab.incognito || runtime.bindings[tab.id] || !mapUrl(tab.url ?? "")) return;
      const matches = state.nodes.filter((node) => node.url === tab.url);
      if (matches.length !== 1 || tabs.filter((item) => !item.incognito && item.url === tab.url).length !== 1) return;
      runtime.bindings[tab.id] = matches[0].id;
      runtime.histories[tab.id] = { nodeIds: [matches[0].id], index: 0 };
    });
    const lastCopy = createPasteWindow(runtime.copies, state.nodes).source;
    runtime.copies = lastCopy ? [lastCopy] : [];
    for (const tabId of Object.keys(runtime.pasteWindows)) {
      if (!tabs.some((tab) => tab.id === Number(tabId) && !tab.incognito)) delete runtime.pasteWindows[tabId];
    }
    for (const [tabId, parentId] of Object.entries(runtime.pendingParents)) {
      if (!tabs.some((tab) => tab.id === Number(tabId) && !tab.incognito) ||
          !state.nodes.some((node) => node.id === parentId && node.sessionId === state.sessionId)) delete runtime.pendingParents[tabId];
    }
    if (browserRestart.accepting) settleBrowserRestore(); else pruneCurrentSession();
    await persistGraph();
    const tab = await activeWebTab();
    if (tab?.id) runtime.activeNodeId = runtime.bindings[tab.id] ?? null;
    await publish();
  }

  const view = () => ({ ...state, runtime, canUndo: history.available(state.sessionId) });

  async function persistGraph() {
    const next = JSON.stringify(state);
    if (next === savedGraph) return;
    await saveTabMap(state);
    savedGraph = next;
  }

  async function publish(error?: string) {
    const nextRuntime = JSON.stringify(runtime);
    if (nextRuntime !== savedRuntime) {
      await browser.storage.session.set({ [tabMapRuntimeKey]: runtime });
      savedRuntime = nextRuntime;
    }
    // Copy/paste counters and restore bookkeeping do not change anything on the canvas.
    const nextView = JSON.stringify([state, runtime.bindings, runtime.activeNodeId, runtime.suspended, history.available(state.sessionId), error]);
    if (nextView !== publishedView) {
      await browserRestart.save(state, runtime, lastTabs);
      await browser.storage.local.set({ [tabMapStateKey]: { ...view(), error } });
      publishedView = nextView;
    }
  }

  // All events and commands share one queue, including events produced by our own tab operations.
  function enqueue<T>(operation: () => Promise<T>) {
    const result = queue.then(async () => { await ready; return operation(); });
    queue = result.catch(() => undefined);
    return result;
  }

  function event(operation: () => Promise<boolean>, relevant?: () => boolean) {
    void enqueue(async () => {
      if (runtime.suspended || (relevant && !relevant())) return;
      const previousState = structuredClone(state);
      const previousRuntime = structuredClone(runtime);
      try {
        if (await operation()) {
          await persistGraph();
          await publish();
        }
      } catch (error) {
        state = previousState;
        runtime = previousRuntime;
        await publish(readError(error));
      }
    }).catch((error) => console.error(t("m001"), error));
  }

  function boundNode(tabId: number) {
    return state.nodes.find((node) => node.id === runtime.bindings[tabId]);
  }
  function ensureSession() {
    if (state.sessionId) return;
    const session = { id: crypto.randomUUID(), name: t("m002", new Date().toLocaleDateString(getLocale())), createdAt: Date.now() };
    state.sessions.push(session); state.sessionId = session.id; state.recording = true;
  }
  async function savePlacement(node: MapNode, placement?: MapPlacement) {
    if (placement) {
      const { x, y, displayMode, direction } = placement;
      await browser.storage.local.set({ [mapPositionPrefix(displayMode, direction) + node.id]: { x, y } });
    }
  }

  function updateLiveNode(node: MapNode, tab: WebTab, url = tab.url) {
    if (tab.id !== undefined) lastTabs.set(tab.id, { ...tab, url });
    const normalized = mapUrl(url ?? "");
    if (!normalized) return;
    if (node.url !== normalized) {
      node.scrollX = 0; node.scrollY = 0; node.anchor = "";
    }
    node.url = normalized;
    node.title = tabTitle(normalized, tab.url === url ? tab.title : undefined);
  }

  function pruneCurrentSession() {
    const live = new Set(Object.values(runtime.bindings));
    for (const node of [...state.nodes]) {
      if (node.sessionId === state.sessionId && !live.has(node.id)) removeMapNode(state, runtime, node.id);
    }
  }

  function newNode(tab: WebTab, parentId: string | null, kind: MapNode["kind"], url = tab.url) {
    const normalized = mapUrl(url ?? "");
    if (!state.sessionId || !normalized || tab.incognito || tab.id === undefined) return undefined;
    lastTabs.set(tab.id, { ...tab, url });
    const previous = boundNode(tab.id);
    if (previous) removeMapNode(state, runtime, previous.id);
    const node: MapNode = {
      id: crypto.randomUUID(), sessionId: state.sessionId, parentId, kind,
      url: normalized, title: tabTitle(normalized, tab.url === url ? tab.title : undefined),
      note: "", createdAt: Date.now(), scrollX: 0, scrollY: 0, anchor: "",
    };
    state.nodes.push(node);
    runtime.histories[tab.id] = { nodeIds: [node.id], index: 0 };
    runtime.bindings[tab.id] = node.id;
    if (tab.active) runtime.activeNodeId = node.id;
    return node;
  }

  function settleBrowserRestore() {
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => event(async () => {
      browserRestart.finish(); pruneCurrentSession(); return true;
    }), 3000);
    restoreTimer.unref?.();
  }

  async function sourceNode(tabId: number) {
    const bound = boundNode(tabId);
    if (bound?.sessionId === state.sessionId) return bound;
    try {
      const tab = await browser.tabs.get(tabId);
      return tab.pinned ? undefined : newNode(tab, null, "root");
    }
    catch { return undefined; }
  }

  function removeNavigatingNode(node: MapNode, tabId: number, url: string) {
    const window = runtime.pasteWindows[tabId];
    removeMapNode(state, runtime, node.id);
    // 新标签页扩展会把 chrome://newtab/ 替换成扩展页；保留来源，等待它访问普通网页。
    if (window?.rootId === node.id && window.source && window.source.nodeId !== node.id &&
        !url.startsWith(browser.runtime.getURL("/")) && state.nodes.some((item) => item.id === window.source!.nodeId)) {
      runtime.pasteWindows[tabId] = { ...window, rootId: undefined };
    }
  }

  function applyPasteSource(tabId: number, window: PasteWindow | undefined, text: string) {
    if (!window || runtime.fixedSources[tabId] === runtime.bindings[tabId]) return false;
    const root = state.nodes.find((item) => item.id === window.rootId && item.sessionId === state.sessionId);
    const source = state.nodes.find((item) => item.id === window.source?.nodeId && item.sessionId === state.sessionId);
    if (!root || !source || root.id === source.id || !matchesPaste(window, text)) return false;
    setParent(state.nodes, root.id, source.id);
    root.kind = "copied";
    root.keyword = window.source!.text;
    delete runtime.pasteWindows[tabId];
    runtime.fixedSources[tabId] = root.id;
    return true;
  }

  async function recordNavigation(tabId: number, url: string, _back = false, redirect = false, countStep = true) {
    const live = await browser.tabs.get(tabId).catch(() => undefined);
    if (live && browserRestart.reconnect({ ...live, url, pendingUrl: undefined }, state, runtime)) {
      lastTabs.set(tabId, { ...live, url }); return true;
    }
    if (live && await closedTabs.recover({ ...live, url, pendingUrl: undefined }, state, runtime)) {
      lastTabs.set(tabId, { ...live, url });
      return true;
    }
    const normalized = mapUrl(url);
    const current = boundNode(tabId);
    if (!current && restoredUntracked.get(tabId) === normalized) return false;
    restoredUntracked.delete(tabId);
    if (!current && !state.recording && !runtime.pendingParents[tabId]) return false;
    const tab = live;
    if (!tab || tab.incognito) return false;
    // Untracked pinned pages stay in the pinned strip, including reloads after activation.
    if (!current && tab.pinned && !runtime.pendingParents[tabId]) return false;
    if (!normalized) {
      if (!current || mapUrl(tab.url ?? "")) return false;
      removeNavigatingNode(current, tabId, url);
      forgetPositions([current.id]);
      return true;
    }
    const explicitParent = runtime.pendingParents[tabId];
    delete runtime.pendingParents[tabId];
    if (current?.url === normalized) {
      const window = runtime.pasteWindows[tabId];
      if (window && countStep && httpUrl(normalized) && !redirect) { takePasteStep(runtime, tabId); return true; }
      return Boolean(explicitParent);
    }
    const window = runtime.pasteWindows[tabId];
    if (countStep && !redirect && httpUrl(normalized)) takePasteStep(runtime, tabId);
    const parent = state.nodes.find((node) => node.id === explicitParent && node.sessionId === state.sessionId);
    const node = current ?? newNode(tab, parent?.id ?? null, parent ? "link" : "root", normalized);
    if (!node) return false;
    updateLiveNode(node, tab, normalized);
    if (parent && node.id !== parent.id) { setParent(state.nodes, node.id, parent.id); node.kind = "link"; }
    if (parent) delete runtime.pasteWindows[tabId];
    else if (window && !window.rootId) window.rootId = node.id;
    if (tab.active) runtime.activeNodeId = node.id;
    return true;
  }

  browser.tabs.onCreated.addListener((tab) => event(async () => {
    if (tab.id !== undefined && !tab.incognito) lastTabs.set(tab.id, { ...tab });
    if (tab.id !== undefined) browserRestart.created(tab.id);
    if (browserRestart.accepting) settleBrowserRestore();
    if (browserRestart.reconnect(tab, state, runtime)) return true;
    if (tab.id !== undefined && restoredUntracked.has(tab.id)) return false;
    if (tab.id !== undefined && !tab.incognito) closedTabs.created(tab.id);
    if (await closedTabs.recover(tab, state, runtime)) return true;
    if (!state.recording || tab.incognito || tab.pinned || tab.id === undefined || boundNode(tab.id) || runtime.pendingParents[tab.id]) return false;
    runtime.pasteWindows[tab.id] = createPasteWindow(runtime.copies, state.nodes.filter((node) => node.sessionId === state.sessionId));
    // openerTabId 不是网页点击来源的充分证据，外部应用打开的页面也可能携带它。
    // 先作为起点，再由真实导航来源或前三步内匹配的粘贴确认父任务。
    const node = newNode(tab, null, "root", tab.pendingUrl || tab.url);
    if (node) runtime.pasteWindows[tab.id].rootId = node.id;
    return true;
  }));
  browser.webNavigation.onCreatedNavigationTarget.addListener((details) => event(async () => {
    if (!state.recording || !mapUrl(details.url)) return false;
    const target = boundNode(details.tabId);
    // Explicit map actions take precedence over delayed browser source events.
    if (target && (target.kind === "manual" || runtime.fixedSources[details.tabId] === target.id)) return false;
    const source = await sourceNode(details.sourceTabId);
    if (!source) return false;
    delete runtime.pasteWindows[details.tabId];
    if (target && target.sessionId === source.sessionId && target.id !== source.id) {
      setParent(state.nodes, target.id, source.id);
      target.kind = "link";
    } else runtime.pendingParents[details.tabId] = source.id;
    return true;
  }));
  browser.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0) return;
    event(async () => {
      const window = runtime.pasteWindows[details.tabId];
      if (!window || window.navigationUrl === details.url || !httpUrl(details.url)) return false;
      window.navigationUrl = details.url;
      return true;
    }, () => Boolean(runtime.pasteWindows[details.tabId]));
  });
  browser.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    event(async () => {
      const window = runtime.pasteWindows[details.tabId];
      const navigationUrl = window?.navigationUrl;
      if (window) delete window.navigationUrl;
      const changed = await recordNavigation(details.tabId, details.url,
        details.transitionQualifiers.includes("forward_back"),
        details.transitionQualifiers.includes("client_redirect"));
      if (changed && state.recording && window && httpUrl(details.url) &&
          details.transitionQualifiers.includes("from_address_bar") && (matchesAddressBarNavigation(window, details.url) ||
            (details.transitionQualifiers.includes("server_redirect") && navigationUrl && matchesAddressBarNavigation(window, navigationUrl)))) {
        applyPasteSource(details.tabId, window, window.source!.text);
      }
      return changed;
    });
  });
  browser.webNavigation.onHistoryStateUpdated.addListener((details) => {
    // SPA 地址更新已由点击/粘贴计步，不能再次消耗同一次操作的额度。
    if (details.frameId === 0) event(() => recordNavigation(details.tabId, details.url, false, false, false));
  });
  browser.webNavigation.onReferenceFragmentUpdated.addListener((details) => {
    if (details.frameId === 0) event(() => recordNavigation(details.tabId, details.url, false, true));
  });
  browser.tabs.onUpdated.addListener((tabId, change, tab) => event(async () => {
    const node = boundNode(tabId);
    // URL 通知只同步节点，正式的文档提交才计为一次访问。
    if (change.url && (node || state.recording || runtime.pendingParents[tabId])) return recordNavigation(tabId, change.url, false, false, false);
    if (!node || node.url !== tab.url || !change.title || node.title === change.title) return false;
    node.title = tabTitle(node.url, change.title);
    return true;
  }, () => Boolean((change.url && (runtime.bindings[tabId] || state.recording || runtime.pendingParents[tabId])) ||
    (change.title && runtime.bindings[tabId]))));
  function refreshTabSlots() {
    event(async () => {
      for (const tab of await browser.tabs.query({})) {
        if (tab.id !== undefined && runtime.bindings[tab.id] && !tab.incognito) lastTabs.set(tab.id, { ...tab });
      }
      await browserRestart.save(state, runtime, lastTabs);
      return false;
    }, () => Object.keys(runtime.bindings).length > 0);
  }
  browser.tabs.onMoved.addListener(refreshTabSlots);
  browser.tabs.onAttached?.addListener(refreshTabSlots);
  browser.tabs.onUpdated.addListener((_tabId, change) => { if (change.pinned !== undefined) refreshTabSlots(); });
  browser.tabs.onRemoved.addListener((tabId, info) => event(async () => {
    if (info?.isWindowClosing) browserRestart.closingWindow(info.windowId);
    const existed = Boolean(runtime.bindings[tabId] || runtime.pendingParents[tabId] || runtime.pasteWindows[tabId]);
    const nodeId = runtime.bindings[tabId];
    const node = boundNode(tabId);
    if (node && !info?.isWindowClosing) browserRestart.forget([node.id]);
    const before = node ? await history.capture({ action: "close", nodeId: node.id }, state, runtime) : null;
    const previousTab = lastTabs.get(tabId);
    if (before && previousTab && !before.tabs.some((tab) => tab.id === tabId)) before.tabs.push(previousTab);
    if (node) await closedTabs.remember(node, state);
    closedTabs.forget(tabId);
    if (nodeId) { removeMapNode(state, runtime, nodeId); forgetPositions([nodeId]); }
    delete runtime.bindings[tabId];
    delete runtime.pendingParents[tabId];
    delete runtime.restores[tabId];
    delete runtime.histories[tabId];
    delete runtime.fixedSources[tabId];
    delete runtime.pasteWindows[tabId];
    lastTabs.delete(tabId);
    await history.record(before, state, runtime);
    return existed;
  }));
  browser.sessions?.onChanged.addListener(() => event(async () => {
    await closedTabs.refresh();
    let changed = false;
    for (const tab of await browser.tabs.query({})) {
      if (await closedTabs.recover(tab, state, runtime)) {
        if (tab.id !== undefined) lastTabs.set(tab.id, { ...tab });
        changed = true;
      }
    }
    return changed;
  }));
  browser.tabs.onReplaced.addListener((added, removed) => event(async () => {
    if (!runtime.bindings[removed] && !runtime.pendingParents[removed] && !runtime.pasteWindows[removed]) return false;
    if (runtime.bindings[removed]) runtime.bindings[added] = runtime.bindings[removed];
    if (runtime.histories[removed]) runtime.histories[added] = runtime.histories[removed];
    if (runtime.pendingParents[removed]) runtime.pendingParents[added] = runtime.pendingParents[removed];
    if (runtime.fixedSources[removed]) runtime.fixedSources[added] = runtime.fixedSources[removed];
    if (runtime.pasteWindows[removed]) runtime.pasteWindows[added] = runtime.pasteWindows[removed];
    const previousTab = lastTabs.get(removed);
    if (previousTab) lastTabs.set(added, { ...previousTab, id: added });
    lastTabs.delete(removed);
    delete runtime.bindings[removed];
    delete runtime.histories[removed];
    delete runtime.pendingParents[removed];
    delete runtime.fixedSources[removed];
    delete runtime.pasteWindows[removed];
    return true;
  }));
  browser.tabs.onActivated.addListener(({ tabId }) => {
    void enqueue(async () => {
      const tab = await browser.tabs.get(tabId).catch(() => undefined);
      if (!tab || !mapUrl(tab.url ?? "") || tab.incognito) return;
      runtime.activeNodeId = runtime.bindings[tabId] ?? null;
      await publish();
    }).catch(() => undefined);
  });

  function forgetPositions(ids: string[]) {
    if (!ids.length) return Promise.resolve();
    return browser.storage.local.remove(ids.flatMap(mapPositionKeys)).catch(() => undefined);
  }

  async function capturePosition(tabId: number) {
    const node = boundNode(tabId);
    if (!node) return;
    const position = await readPagePosition(tabId);
    if (position?.url !== node.url || !Number.isFinite(position.scrollX) || !Number.isFinite(position.scrollY)) return;
    node.scrollX = Math.max(0, position.scrollX);
    node.scrollY = Math.max(0, position.scrollY);
    node.anchor = String(position.anchor ?? "").slice(0, 160);
  }

  async function focusNode(node: MapNode, retainMapFocus = false) {
    const currentTab = await activeWebTab();
    if (currentTab?.id !== undefined) await capturePosition(currentTab.id);
    const entry = Object.entries(runtime.bindings).find(([, id]) => id === node.id);
    let tab = entry ? await browser.tabs.get(Number(entry[0])).catch(() => undefined) : undefined;
    if (tab?.url !== node.url) tab = undefined;
    if (tab?.id !== undefined) {
      await browser.tabs.update(tab.id, { active: true });
      // Restoration needs no reply; a frozen target must not block later commands.
      void browser.tabs.sendMessage(tab.id, { type: "tab-flow-map-restore", node }, { frameId: 0 }).catch(() => undefined);
    } else {
      const target = await browser.windows.getLastFocused({ windowTypes: ["normal"] }).catch(() => undefined);
      tab = await browser.tabs.create({ url: node.url, active: true, windowId: target?.id });
      if (tab.id !== undefined) {
        runtime.bindings[tab.id] = node.id;
        runtime.restores[tab.id] = node.id;
        runtime.histories[tab.id] = { nodeIds: [node.id], index: 0 };
      }
    }
    runtime.activeNodeId = node.id;
    // 独立地图窗口切换浏览器中的标签，但保留地图焦点以继续框选、按删除键。
    if (!retainMapFocus) await browser.windows.update(tab.windowId, { focused: true });
  }

  async function command(message: MapCommand, sender: MessageSender) {
    const fromExtension = sender.url?.startsWith(browser.runtime.getURL("/"));
    const fromContent = contentActions.has(message.action);
    if (!fromExtension && !fromContent) throw new Error(t("m003"));
    if (runtime.suspended && !fromContent && !["get", "reload", "suspend", "overlay", "window", "sidepanel"].includes(message.action)) {
      throw new Error(t("m004"));
    }
    if (fromContent) {
      if (sender.frameId !== 0 || sender.tab?.id === undefined || sender.tab.incognito) return { ok: true };
      const node = boundNode(sender.tab.id);
      if (!node || !("url" in message)) return { ok: true };
      // 粘贴后立即搜索可能先改变标签 URL；仍验证浏览器提供的发送文档和前三步来源。
      const capturedPaste = message.action === "paste" && Boolean(runtime.pasteWindows[sender.tab.id]) &&
        sender.url === message.url && Boolean(httpUrl(message.url));
      if (node.url !== message.url && !capturedPaste) return { ok: true };
      if (message.action === "step" && !runtime.pasteWindows[sender.tab.id]) return { ok: true };
      const tab = await browser.tabs.get(sender.tab.id);
      if (!httpUrl(tab.url ?? "") || (message.url !== tab.url && !capturedPaste)) return { ok: true };
      if (message.action === "ready") {
        const restore = runtime.restores[tab.id!] === node.id;
        delete runtime.restores[tab.id!];
        await publish();
        return { ok: true, restore: restore ? node : undefined };
      }
      if (runtime.suspended || !state.recording || node.sessionId !== state.sessionId) return { ok: true };
      if (message.action === "step") {
        if (takePasteStep(runtime, tab.id!)) await publish();
        return { ok: true };
      }
      if (message.action === "paste") {
        // 加号创建和手动拉线的来源已明确，粘贴推断不能覆盖它。
        if (runtime.fixedSources[tab.id!] === node.id) {
          if (runtime.pasteWindows[tab.id!]) {
            delete runtime.pasteWindows[tab.id!];
            await publish();
          }
          return { ok: true };
        }
        const window = takePasteStep(runtime, tab.id!);
        if (applyPasteSource(tab.id!, window, message.text)) await persistGraph();
        if (window) await publish();
        return { ok: true };
      }
      if (message.action === "copy") {
        const text = message.text.trim();
        if (!text || text.length > 500) return { ok: true };
        runtime.copies = [{ nodeId: node.id, text, at: Date.now() }];
        await publish();
        return { ok: true };
      }
      if (message.action === "checkpoint") {
        if (node.scrollX === message.scrollX && node.scrollY === message.scrollY && node.anchor === message.anchor.slice(0, 160)) return { ok: true };
        node.scrollX = Math.max(0, message.scrollX);
        node.scrollY = Math.max(0, message.scrollY);
        node.anchor = message.anchor.slice(0, 160);
      }
    } else switch (message.action) {
      case "undo": {
        try {
          await history.undo(state, runtime, async (nodeIds) => {
            if (!nodeIds.length) return;
            const result = await command({ action: "delete-many", nodeIds }, sender);
            if (!result.ok) throw new Error(result.error || t("m005"));
          }, (tabId, url) => restoredUntracked.set(tabId, url));
        } finally { await persistGraph(); await publish(); }
        return { ok: true, view: view() };
      }
      case "positions": {
        if (message.items.some((item) => !state.nodes.some((node) => node.id === item.nodeId && node.sessionId === state.sessionId))) throw new Error(t("m006"));
        const patch: Record<string, unknown> = {}, remove: string[] = [], prefix = mapPositionPrefix(message.displayMode, message.direction);
        for (const item of message.items) item.position ? patch[prefix + item.nodeId] = item.position : remove.push(prefix + item.nodeId);
        if (Object.keys(patch).length) await browser.storage.local.set(patch);
        if (remove.length) await browser.storage.local.remove(remove);
        break;
      }
      case "get": return { ok: true, view: view() };
      case "suspend":
        runtime.suspended = true;
        await publish();
        return { ok: true };
      case "reload":
        await browserRestart.clear(); clearTimeout(restoreTimer);
        await history.clear(); restoredUntracked.clear();
        await closedTabs.clear();
        state = await readTabMap();
        runtime = emptyMapRuntime();
        await initialize();
        return { ok: true, view: view() };
      case "overlay": case "window":
        await openMap(message.action);
        return { ok: true };
      case "start": {
        runtime.suspended = false;
        const session = { id: crypto.randomUUID(), name: message.name.trim().slice(0, 100) || t("m007"), createdAt: Date.now() };
        state.sessions.push(session);
        state.sessionId = session.id;
        state.recording = true;
        runtime.copies = [];
        runtime.pendingParents = {};
        runtime.pasteWindows = {};
        const tab = await activeWebTab();
        if (tab) newNode(tab, null, "root");
        break;
      }
      case "session":
        if (!state.sessions.some((session) => session.id === message.sessionId)) throw new Error(t("m008"));
        state.sessionId = message.sessionId;
        state.recording = false;
        runtime.copies = [];
        runtime.pendingParents = {};
        runtime.pasteWindows = {};
        pruneCurrentSession();
        break;
      case "pause": state.recording = false; runtime.pasteWindows = {}; runtime.copies = []; break;
      case "resume": {
        runtime.suspended = false;
        if (!state.sessionId) throw new Error(t("m009"));
        state.recording = true;
        runtime.copies = [];
        runtime.pasteWindows = {};
        const tab = await activeWebTab();
        if (tab?.id !== undefined) {
          if (boundNode(tab.id)?.url !== tab.url) newNode(tab, null, "root");
          else await sourceNode(tab.id);
        }
        break;
      }
      case "add": case "new-tab": {
        const url = message.action === "add" ? destination(message.text) : undefined;
        if (!state.sessionId && message.parentId) throw new Error(t("m009"));
        ensureSession();
        const parent = state.nodes.find((node) => node.id === message.parentId && node.sessionId === state.sessionId);
        if (message.parentId && !parent) throw new Error(t("m010"));
        const parentTabId = parent && Object.entries(runtime.bindings).find(([, id]) => id === parent.id)?.[0];
        const parentTab = parentTabId ? await browser.tabs.get(Number(parentTabId)).catch(() => undefined) : undefined;
        if (parentTab?.id !== undefined) await capturePosition(parentTab.id);
        const targetWindow = parentTab?.windowId ?? (await browser.windows.getLastFocused({ windowTypes: ["normal"] }).catch(() => undefined))?.id;
        const tab = await browser.tabs.create({ ...(url ? { url } : {}), active: true, windowId: targetWindow,
          openerTabId: parentTab?.id });
        // Chrome 可能先返回空 url，只在 pendingUrl 中提供新标签页地址。
        const createdUrl = url ?? mapUrl(tab.pendingUrl || tab.url || "") ?? "chrome://newtab/";
        const node = newNode(tab, parent?.id ?? null, parent ? "manual" : "root", createdUrl);
        if (node && tab.id !== undefined) {
          if (message.action === "add") node.keyword = message.text.trim();
          runtime.fixedSources[tab.id] = node.id;
          delete runtime.pasteWindows[tab.id];
          runtime.activeNodeId = node.id;
          await savePlacement(node, message.placement);
        }
        break;
      }
      case "pin-node": {
        const node = state.nodes.find((item) => item.id === message.nodeId && item.sessionId === state.sessionId);
        if (!node) throw new Error(t("m011"));
        const entry = Object.entries(runtime.bindings).find(([, id]) => id === node.id);
        const tab = entry ? await browser.tabs.get(Number(entry[0])).catch(() => undefined) : undefined;
        if (tab?.id === undefined || tab.incognito || tab.url !== node.url) throw new Error(t("m012"));
        await browser.tabs.update(tab.id, { pinned: message.pinned });
        break;
      }
      case "reorder-pinned": {
        await reorderPinnedTabs(message.tabId, message.targetTabId, message.side);
        break;
      }
      case "unpin": {
        const tab = await browser.tabs.get(message.tabId).catch(() => undefined);
        if (!tab || tab.incognito) throw new Error(t("m013"));
        await browser.tabs.update(message.tabId, { pinned: false });
        break;
      }
      case "pinned": {
        const pinned = await browser.tabs.get(message.tabId).catch(() => undefined);
        if (!pinned?.pinned || pinned.incognito) throw new Error(t("m014"));
        const url = mapUrl(pinned.url || pinned.pendingUrl || "");
        const retainMapFocus = new URL(sender.url ?? browser.runtime.getURL("/")).searchParams.get("mode") === "window";
        if (!message.newTask) {
          await browser.tabs.update(message.tabId, { active: true });
          runtime.activeNodeId = boundNode(message.tabId)?.id ?? null;
          if (!retainMapFocus) await browser.windows.update(pinned.windowId, { focused: true });
          break;
        }
        if (!url) throw new Error(t("m015"));
        ensureSession();
        const tab = await browser.tabs.create({ url, active: true, windowId: pinned.windowId });
        const existing = tab.id === undefined ? undefined : boundNode(tab.id);
        const node = existing?.sessionId === state.sessionId ? existing : newNode(tab, null, "root", url);
        if (!node || tab.id === undefined) throw new Error(t("m016"));
        updateLiveNode(node, tab, url);
        setParent(state.nodes, node.id, null); node.kind = "root"; delete node.pendingSource;
        runtime.fixedSources[tab.id] = node.id;
        delete runtime.pendingParents[tab.id]; delete runtime.pasteWindows[tab.id];
        runtime.copies = []; state.recording = true;
        await savePlacement(node, message.placement);
        runtime.activeNodeId = node.id;
        if (!retainMapFocus) await browser.windows.update(tab.windowId, { focused: true });
        break;
      }
      case "focus": {
        const node = state.nodes.find((item) => item.id === message.nodeId);
        if (!node) throw new Error(t("m011"));
        const retainMapFocus = new URL(sender.url ?? browser.runtime.getURL("/")).searchParams.get("mode") === "window";
        await focusNode(node, retainMapFocus);
        break;
      }
      case "close": case "delete": case "delete-many": case "clear": case "delete-pinned": {
        let pinnedNode: MapNode | undefined;
        if (message.action === "delete-pinned") {
          const tab = await browser.tabs.get(message.tabId).catch(() => undefined);
          if (tab && (!tab.pinned || tab.incognito)) throw new Error(t("m017"));
          pinnedNode = boundNode(message.tabId);
          if (!pinnedNode && tab) await browser.tabs.remove(message.tabId).catch(async (error) => {
            if (await browser.tabs.get(message.tabId).catch(() => undefined)) throw error;
          });
        }
        const deletionSessionId = pinnedNode?.sessionId ?? state.sessionId;
        const ids = message.action === "delete-pinned" ? pinnedNode ? [pinnedNode.id] : []
          : message.action === "clear" ? state.nodes.filter((node) => node.sessionId === state.sessionId).map((node) => node.id)
          : message.action === "delete-many" ? message.nodeIds : [message.nodeId];
        if (message.action === "clear") {
          await closedTabs.clear(state.sessionId);
          state.recording = false;
          runtime.copies = []; runtime.pasteWindows = {}; runtime.pendingParents = {};
        }
        const failures: string[] = [];
        const deleted: string[] = [];
        const order = branchDeletionOrder({ ...state, sessionId: deletionSessionId }, ids), selected = new Set(order);
        browserRestart.forget(order);
        let retainedParents = 0;
        for (const id of order) {
          const node = state.nodes.find((item) => item.id === id && item.sessionId === deletionSessionId);
          if (!node) continue;
          // 子标签关闭失败时保留它的祖先，允许再次删除整条分支。
          if (state.nodes.some((child) => child.parentId === id && selected.has(child.id))) {
            retainedParents += 1;
            continue;
          }
          try {
            for (const [tabId, nodeId] of Object.entries(runtime.bindings)) {
              if (nodeId !== id) continue;
              const tab = await browser.tabs.get(Number(tabId)).catch(() => undefined);
              if (!tab || tab.incognito) continue;
              // Canvas deletion detaches persistent pins; only the pinned strip closes them.
              if (tab.pinned && message.action !== "delete-pinned") {
                restoredUntracked.set(Number(tabId), mapUrl(tab.url || tab.pendingUrl || "") ?? "");
                continue;
              }
              await browser.tabs.remove(Number(tabId)).catch(async (error) => {
                if (await browser.tabs.get(Number(tabId)).catch(() => undefined)) throw error;
              });
              await closedTabs.remember(node, state);
            }
            removeMapNode(state, runtime, id);
            deleted.push(id);
          } catch (error) { failures.push(readError(error)); }
        }
        await persistGraph();
        await publish();
        await forgetPositions(deleted);
        return { ok: !failures.length, error: failures.length ? t("m018", failures.length + retainedParents, failures[0]) : undefined, view: view() };
      }
      case "edit": {
        const node = state.nodes.find((item) => item.id === message.nodeId);
        if (node) node.note = message.note.slice(0, 2000);
        break;
      }
      case "parent":
        browserRestart.edited(message.nodeId);
        setParent(state.nodes, message.nodeId, message.parentId);
        for (const [tabId, window] of Object.entries(runtime.pasteWindows)) {
          if (window.rootId === message.nodeId) delete runtime.pasteWindows[tabId];
        }
        for (const [tabId, nodeId] of Object.entries(runtime.bindings)) {
          if (nodeId !== message.nodeId) continue;
          runtime.fixedSources[tabId] = nodeId;
          delete runtime.pendingParents[tabId];
          delete runtime.pasteWindows[tabId];
        }
        break;
    }
    await persistGraph();
    await publish();
    return { ok: true, view: view() };
  }

  return {
    handleMessage(message: unknown, sender: MessageSender) {
      if (!isMapMessage(message)) return undefined;
      if (message.action === "sidepanel") {
        if (!sender.url?.startsWith(browser.runtime.getURL("/"))) return Promise.resolve({ ok: false, error: t("m003") });
        // Preserve the runtime message's user gesture; graph commands still use the queue.
        return openMap("sidepanel", message.windowId).then(() => ({ ok: true }))
          .catch((error) => ({ ok: false, error: readError(error) }));
      }
      return enqueue(async () => {
        try {
          const before = await history.capture(message, state, runtime);
          const result = await command(message, sender);
          await history.record(before, state, runtime);
          if (before) { await publish(); return { ...result, view: view() }; }
          return result;
        }
        catch (error) { return { ok: false, error: readError(error) }; }
      }).catch((error) => ({ ok: false, error: readError(error) }));
    },
  };
}

async function activeWebTab() {
  const normal = await browser.windows.getLastFocused({ windowTypes: ["normal"] }).catch(() => undefined);
  if (normal?.id === undefined) return undefined;
  const [tab] = await browser.tabs.query({ active: true, windowId: normal.id });
  return tab && !tab.incognito && mapUrl(tab.url ?? "") ? tab : undefined;
}
function readError(error: unknown) { return error instanceof Error ? error.message : t("m019"); }
