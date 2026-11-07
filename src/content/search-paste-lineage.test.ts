import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeTabMapManager } from "../background/manager";
import { installLineageCapture } from "./capture";
import { createBrowser } from "../testing/browser-fixture";
import { emptyMapState, tabMapMessageType, type MapCommand, type MapView } from "../types/map";
import type { Browser } from "wxt/browser";

const persisted = vi.hoisted(() => ({ graph: {} as ReturnType<typeof emptyMapState> }));
vi.mock("../storage/graph", () => ({
  readTabMap: async () => structuredClone(persisted.graph),
  saveTabMap: async (state: ReturnType<typeof emptyMapState>) => { persisted.graph = structuredClone(state); },
}));

class TestElement {
  isContentEditable = false;
  closest(selector: string) { return selector === "input,textarea,[contenteditable]" && this.isContentEditable ? this : null; }
}
class TestInput extends TestElement {
  type = "search"; value = "image editor"; selectionStart = 0; selectionEnd = 12;
  closest(selector: string) { return selector === "input,textarea,[contenteditable]" ? this : null; }
}

describe("copy to search lineage in an independent map window", () => {
  let fake: ReturnType<typeof createBrowser>, manager: ReturnType<typeof initializeTabMapManager>, rootId: string;
  let tabId: number, dispose: () => void;
  const listeners = new Map<string, (event: any) => unknown>();
  const pending: Promise<unknown>[] = [];
  const extension = { url: "chrome-extension://map/tab-map.html?mode=window" };
  async function command(message: MapCommand, sender: Browser.runtime.MessageSender = extension) {
    return await manager.handleMessage({ type: tabMapMessageType, ...message }, sender) as { ok: boolean; view: MapView };
  }
  async function view() { await Promise.all(pending.splice(0)); return (await command({ action: "get" })).view; }
  function emit(type: string, target: TestElement, text = "image editor", trusted = true) {
    listeners.get(type)?.({ target, button: 0, isTrusted: trusted, clipboardData: { getData: () => text } });
  }
  function visit(url: string, qualifiers: string[] = [], original = url) {
    fake.api.webNavigation.onBeforeNavigate.emit({ tabId, frameId: 0, url: original });
    fake.tabs.get(tabId).url = url;
    (globalThis.location as { href: string }).href = url;
    fake.api.webNavigation.onCommitted.emit({ tabId, frameId: 0, url, transitionQualifiers: qualifiers });
  }
  async function open(url = "https://github.com/") {
    tabId = 2;
    fake.tabs.set(2, { id: 2, windowId: 10, active: true, incognito: false, url: "chrome://newtab/" });
    fake.api.tabs.onCreated.emit(fake.tabs.get(2));
    visit(url, ["from_address_bar"]); await view();
  }
  beforeEach(async () => {
    persisted.graph = emptyMapState(); fake = createBrowser(); listeners.clear(); pending.length = 0; tabId = 1;
    vi.stubGlobal("browser", fake.api); vi.stubGlobal("location", { href: "https://a.example/" });
    vi.stubGlobal("Element", TestElement); vi.stubGlobal("HTMLElement", TestElement);
    vi.stubGlobal("HTMLInputElement", TestInput); vi.stubGlobal("HTMLTextAreaElement", class extends TestElement {});
    manager = initializeTabMapManager();
    rootId = (await command({ action: "start", name: "搜索" })).view.nodes[0].id;
    await command({ action: "window" });
    const document = { addEventListener: (type: string, listener: any) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type) } as unknown as Document;
    dispose = installLineageCapture(document, (message) => {
      pending.push(command(message, { tab: { ...fake.tabs.get(tabId) }, frameId: 0, url: fake.tabs.get(tabId).url }));
    }, () => {});
  });
  afterEach(() => { dispose(); vi.unstubAllGlobals(); });

  it.each(["address bar", "Google search field"])("attaches a word copied from page text through the %s", async (target) => {
    vi.stubGlobal("window", { getSelection: () => ({ toString: () => "image editor" }) });
    emit("copy", new TestElement()); await view();
    if (target === "address bar") await open("https://www.google.com/search?q=image+editor");
    else {
      await open("https://www.google.com/");
      emit("pointerdown", new TestInput());
      emit("paste", new TestInput());
      visit("https://www.google.com/search?q=image+editor");
    }
    const result = await view();
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[1]).toMatchObject({ parentId: rootId, kind: "copied", keyword: "image editor" });
    expect(result.runtime.pasteWindows[2]).toBeUndefined();
  });

  it.each(["copy", "cut"])("attaches GitHub search after %s, opening search, focusing twice and pasting", async (action) => {
    emit(action, new TestInput()); await view(); await open();
    emit("pointerdown", new TestElement()); // Expand the search dialog: second action.
    emit("pointerdown", new TestInput()); emit("pointerdown", new TestInput());
    expect((await view()).runtime.pasteWindows[2].steps).toBe(2);
    emit("paste", new TestInput());
    visit("https://github.com/search?q=image+editor&type=repositories");
    const result = await view();
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[1]).toMatchObject({ parentId: rootId, kind: "copied", keyword: "image editor" });
    expect(result.runtime.activeNodeId).toBe(result.nodes[1].id);
  });

  it.each([
    ["example.com", "http://example.com/", "http://example.com/", []],
    ["example.com", "https://example.com/", "https://www.example.com/home", ["server_redirect"]],
    ["https://example.com/path", "https://example.com/path", "https://destination.example/landing", ["server_redirect"]],
  ])("attaches pasted domain %s using this address-bar navigation's initial URL", async (text, original, final, qualifiers) => {
    const input = new TestInput(); input.value = text as string; input.selectionEnd = input.value.length;
    emit("copy", input); await view();
    tabId = 2; fake.tabs.set(2, { id: 2, windowId: 10, active: true, incognito: false, url: "chrome://newtab/" });
    fake.api.tabs.onCreated.emit(fake.tabs.get(2));
    visit(final as string, ["from_address_bar", ...qualifiers as string[]], original as string);
    expect((await view()).nodes[1]).toMatchObject({ parentId: rootId, kind: "copied" });
  });

  it("keeps a fourth-action paste independent and does not count untrusted pastes", async () => {
    emit("copy", new TestInput()); await view(); await open();
    emit("paste", new TestInput(), "image editor", false);
    expect((await view()).runtime.pasteWindows[2].steps).toBe(1);
    emit("pointerdown", new TestElement()); emit("pointerdown", new TestElement());
    emit("paste", new TestInput());
    expect((await view()).nodes[1].parentId).toBeNull();
  });

  it.each([true, false])("validates the sending document when navigation beats a queued paste (%s)", async (validDocument) => {
    emit("copy", new TestInput()); await view(); await open();
    const sender = { tab: { ...fake.tabs.get(2) }, frameId: 0,
      url: validDocument ? fake.tabs.get(2).url : "https://wrong-document.example/" };
    const url = fake.tabs.get(2).url;
    visit("https://github.com/search?q=image+editor");
    await command({ action: "paste", text: "image editor", url }, sender);
    expect((await view()).nodes[1].parentId).toBe(validDocument ? rootId : null);
  });

  it.each([
    ["https://example.com/", ["server_redirect"]],
    ["https://unrelated.example/", ["from_address_bar"]],
    ["https://unrelated.example/", ["from_address_bar", "server_redirect"]],
  ])("does not infer domain lineage without matching address-bar evidence (%s)", async (original, qualifiers) => {
    const input = new TestInput(); input.value = "example.com"; input.selectionEnd = input.value.length;
    emit("copy", input); await view();
    tabId = 2; fake.tabs.set(2, { id: 2, windowId: 10, active: true, incognito: false, url: "chrome://newtab/" });
    fake.api.tabs.onCreated.emit(fake.tabs.get(2));
    visit("https://destination.example/", qualifiers, original);
    expect((await view()).nodes[1].parentId).toBeNull();
  });

  it("rejects a different pasted word and an unrelated redirected address-bar visit", async () => {
    emit("copy", new TestInput()); await view(); await open();
    emit("paste", new TestInput(), "unrelated word");
    visit("https://github.com/search?q=image+editor", ["from_address_bar", "server_redirect"], "https://unrelated.example/");
    expect((await view()).nodes[1].parentId).toBeNull();
  });

  it("removes all capture listeners when the content script is invalidated", () => {
    expect(listeners.size).toBe(4); dispose(); expect(listeners.size).toBe(0);
  });
});
