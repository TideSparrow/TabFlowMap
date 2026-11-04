import { t } from "../i18n";
import type { MapDisplayMode } from "../core/view-options";
export function MapDisplaySwitch({ mode, onChange }: {
    mode: MapDisplayMode;
    onChange: (mode: MapDisplayMode) => void;
}) {
    return <div className="tm-view-switch" role="group" aria-label={t("m137")}>
    <button aria-pressed={mode === "compact"} onClick={() => onChange("compact")}>{t("m134")}</button>
    <button aria-pressed={mode === "detailed"} onClick={() => onChange("detailed")}>{t("m135")}</button>
    <button aria-pressed={mode === "tree"} onClick={() => onChange("tree")}>{t("m136")}</button>
  </div>;
}
