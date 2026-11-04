import { beforeEach, describe, expect, it, vi } from "vitest";

describe("language settings across extension contexts", () => {
  let changed: (changes: Record<string, { newValue?: unknown }>, area: string) => void;
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("browser", {
      i18n: { getUILanguage: () => "en-GB" },
      storage: {
        local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
        onChanged: { addListener: (listener: typeof changed) => { changed = listener; } },
      },
    });
  });
  it("follows the browser, persists an override and receives changes from another context", async () => {
    const i18n = await import("../src/i18n");
    await i18n.initializeI18n();
    expect(i18n.getLocale()).toBe("en");
    expect(i18n.t("m133", 4)).toBe("4 tabs");
    await i18n.setLanguage("ja");
    expect(browser.storage.local.set).toHaveBeenCalledWith({ [i18n.languageStorageKey]: "ja" });
    expect(i18n.t("m133", 4)).toBe("4 個のタブ");
    const notify = vi.fn();
    const unsubscribe = i18n.subscribeLanguage(notify);
    changed({ [i18n.languageStorageKey]: { newValue: "zh-CN" } }, "local");
    expect(i18n.getLocale()).toBe("zh-CN");
    expect(i18n.t("m133", 4)).toBe("4 个标签");
    expect(notify).toHaveBeenCalledOnce();
    unsubscribe();
    changed({ [i18n.languageStorageKey]: {} }, "local");
    expect(i18n.getLanguagePreference()).toBe("system");
    expect(i18n.getLocale()).toBe("en");
  });
  it("keeps the current language when saving fails", async () => {
    const i18n = await import("../src/i18n");
    await i18n.initializeI18n();
    vi.mocked(browser.storage.local.set).mockRejectedValueOnce(new Error("Storage failed"));
    await expect(i18n.setLanguage("ja")).rejects.toThrow();
    expect(i18n.getLocale()).toBe("en");
  });
  it("normalizes browser locales and falls back safely for unsupported languages", async () => {
    const i18n = await import("../src/i18n");
    expect(i18n.resolveLocale("zh-TW")).toBe("zh-CN");
    expect(i18n.resolveLocale("ja-JP")).toBe("ja");
    expect(i18n.resolveLocale("fr-FR")).toBe("en");
    expect(i18n.isLanguagePreference("fr")).toBe(false);
  });
});
