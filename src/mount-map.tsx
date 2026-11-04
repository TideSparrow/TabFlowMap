import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MapApp } from "./components/MapApp";
import { initializeI18n, t } from "./i18n";
import { useLanguage } from "./i18n/use-language";
import { MapErrorBoundary } from "./components/MapErrorBoundary";
import { notifyMapFrameReady } from "./core/frame-status";

function LocalizedMap({ mode }: { mode: "sidepanel" | "embedded" | "window" }) {
  const language = useLanguage();
  useEffect(() => { document.title = t("m126"); }, [language]);
  useEffect(notifyMapFrameReady, []);
  return <MapApp mode={mode} />;
}
export async function mountMap(mode: "sidepanel" | "embedded" | "window") {
  // A slow preference read must not prevent the window from rendering.
  void initializeI18n();
  createRoot(document.getElementById("root")!).render(<React.StrictMode><MapErrorBoundary><LocalizedMap mode={mode} /></MapErrorBoundary></React.StrictMode>);
}
