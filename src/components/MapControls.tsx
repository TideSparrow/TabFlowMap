import { t } from "../i18n";
import { GitBranch, Layers, Pause, Play, Plus } from "lucide-react";
import type { MapCommand, MapView } from "../types/map";
type Props = {
    view: MapView;
    count: number;
    busy: boolean;
    loading: boolean;
    onSession: (id: string) => void;
    onStart: () => void;
    run: (command: MapCommand) => Promise<boolean>;
};
export function MapControls({ view, count, busy, loading, onSession, onStart, run }: Props) {
    return <>
    <header className="tm-header">
      <div className="tm-brand"><GitBranch size={19}/><div><h2>{t("m126")}</h2><p>{t("m127")}</p></div></div>
    </header>
    <div className="tm-toolbar">
      <div className="tm-session"><Layers size={14}/><select aria-label={t("m129")} value={view.sessionId ?? ""} disabled={busy || !view.sessions.length} onChange={(event) => onSession(event.target.value)}>
        {!view.sessions.length && <option value="">{t("m128")}</option>}{view.sessions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></div>
      <button className="tm-button" disabled={busy || loading} onClick={onStart}><Plus size={14}/>{t("m130")}</button>
      {view.sessionId && <button className={`tm-button ${view.recording ? "tm-recording" : ""}`} disabled={busy} onClick={() => void run({ action: view.recording ? "pause" : "resume" })}>{view.recording ? <Pause size={13}/> : <Play size={13}/>}{view.recording ? t("m131") : t("m132")}</button>}
      <span className="tm-muted tm-count">{t("m133", count)}</span>
    </div>
  </>;
}
