import en from "./en.json";
import zh from "./zh-CN.json";
import ja from "./ja.json";

export type Locale = "en" | "zh-CN" | "ja";
export type LanguagePreference = Locale | "system";
export type MessageKey = keyof typeof en;
export const languageStorageKey = "tab-flow-map-language.v1";
export const catalogs: Record<Locale, Record<MessageKey, string>> = { en, "zh-CN": zh, ja };

// Pure graph utilities can also run without a browser runtime.
let locale: Locale = "zh-CN";
let preference: LanguagePreference = "system";
let initialized: Promise<void> | undefined;
const listeners = new Set<() => void>();

export function resolveLocale(value: string): Locale {
  const language = value.toLowerCase();
  return language.startsWith("zh") ? "zh-CN" : language.startsWith("ja") ? "ja" : "en";
}
export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === "system" || value === "en" || value === "zh-CN" || value === "ja";
}
function apply(value: unknown) {
  preference = isLanguagePreference(value) ? value : "system";
  locale = preference === "system" ? resolveLocale(browser.i18n.getUILanguage()) : preference;
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  listeners.forEach((notify) => notify());
}
export function initializeI18n(): Promise<void> {
  if (!initialized) {
    apply("system");
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[languageStorageKey]) apply(changes[languageStorageKey].newValue);
    });
    initialized = browser.storage.local.get(languageStorageKey).then((stored) => apply(stored[languageStorageKey]));
  }
  return initialized;
}
export async function setLanguage(value: LanguagePreference): Promise<void> {
  if (!isLanguagePreference(value)) throw new Error("Unsupported language");
  // Update visible state only after the setting is durably saved.
  await browser.storage.local.set({ [languageStorageKey]: value });
  apply(value);
}
export const getLocale = () => locale;
export const getLanguagePreference = () => preference;
export const languageSnapshot = () => `${preference}:${locale}`;
export function subscribeLanguage(notify: () => void) {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
}
export function t(key: MessageKey, ...values: (string | number)[]): string {
  return (catalogs[locale][key] ?? en[key]).replace(/\{(\d+)\}/g, (match, index: string) => String(values[Number(index)] ?? match));
}
