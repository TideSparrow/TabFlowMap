import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MapApp } from "./components/MapApp";
import { initializeI18n, t } from "./i18n";
import { useLanguage } from "./i18n/use-language";

function LocalizedMap({ mode }: { mode: "sidepanel" | "embedded" | "window" }) {
  const language = useLanguage();
  useEffect(() => { document.title = t("m126"); }, [language]);
  return <MapApp mode={mode} />;
}
export async function mountMap(mode: "sidepanel" | "embedded" | "window") {
  await initializeI18n();
  createRoot(document.getElementById("root")!).render(<React.StrictMode><LocalizedMap mode={mode} /></React.StrictMode>);
}
