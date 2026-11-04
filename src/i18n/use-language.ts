import { useSyncExternalStore } from "react";
import { getLocale, languageSnapshot, subscribeLanguage } from ".";

export function useLanguage() {
  useSyncExternalStore(subscribeLanguage, languageSnapshot, languageSnapshot);
  return getLocale();
}
