import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, Coffee, ExternalLink, GitBranch, Languages } from "lucide-react";
import { getLanguagePreference, initializeI18n, setLanguage, t, type LanguagePreference } from "../../i18n";
import { useLanguage } from "../../i18n/use-language";
import "./styles.css";

const supportUrl = "https://buymeacoffee.com/marklongpcm";

function Settings() {
  const language = useLanguage();
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { document.title = `${t("settingsTitle")} · Tab Flow Map`; }, [language]);
  async function changeLanguage(value: LanguagePreference) {
    setError(false); setSaving(true);
    try { await setLanguage(value); } catch { setError(true); }
    finally { setSaving(false); }
  }
  return <main className="settings-page">
    <header><GitBranch size={28} /><div><p>Tab Flow Map</p><h1>{t("settingsTitle")}</h1></div></header>
    <section aria-labelledby="language-title">
      <h2 id="language-title"><Languages size={20} />{t("languageTitle")}</h2>
      <p>{t("languageHelp")}</p>
      <label htmlFor="language">{t("languageLabel")}</label>
      <select id="language" value={getLanguagePreference()} disabled={saving} onChange={(event) => void changeLanguage(event.target.value as LanguagePreference)}>
        <option value="system">{t("systemLanguage")}</option>
        <option value="en">English</option><option value="zh-CN">简体中文</option><option value="ja">日本語</option>
      </select>
      <p className="settings-hint" role="status">{error ? t("settingsSaveError") : saving ? t("m090") : t("settingsSaved")}</p>
    </section>
    <section><h2>{t("privacyTitle")}</h2><p>{t("privacyDescription")}</p></section>
    <section aria-labelledby="support-title">
      <h2 id="support-title"><Coffee size={20} aria-hidden="true" />{t("supportTitle")}</h2>
      <p>{t("supportDescription")}</p>
      <a className="support-link" href={supportUrl} target="_blank" rel="noopener noreferrer" aria-label={t("supportLinkLabel")}>
        <Coffee size={18} aria-hidden="true" />{t("supportAction")}<ExternalLink size={16} aria-hidden="true" />
      </a>
    </section>
    <a className="back-link" href={browser.runtime.getURL("/tab-map.html?mode=window")}><ArrowLeft size={16} />{t("backToMap")}</a>
    <footer>Tab Flow Map · {browser.runtime.getManifest().version} · MIT</footer>
  </main>;
}
void initializeI18n().then(() => createRoot(document.getElementById("root")!).render(<React.StrictMode><Settings /></React.StrictMode>));
