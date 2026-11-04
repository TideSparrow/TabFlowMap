import { Component, type ReactNode } from "react";
import { t } from "../i18n";

export class MapErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div role="alert" style={{ padding: 24, font: "14px/1.6 system-ui", color: "#334155" }}>
      <h2>{t("mapLoadErrorTitle")}</h2>
      <p>{t("mapLoadErrorDescription")}</p>
      <button type="button" onClick={() => window.location.reload()}>{t("m071")}</button>
    </div>;
  }
}
