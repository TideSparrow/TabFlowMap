import { t } from "../../i18n";
import { useReactFlow, useViewport } from "@xyflow/react";
import { MapTooltip } from "../MapTooltip";
import { useReducedMapMotion } from "../../hooks/useGraphMotion";
// Viewport animation updates this small control, rather than rebuilding the whole graph.
export function MapZoomReset() {
    const { zoom } = useViewport();
    const flow = useReactFlow();
    const reducedMotion = useReducedMapMotion();
    return <MapTooltip label={t("m203")}><button data-tool="zoom-reset" aria-label={t("m202")} onClick={() => void flow.zoomTo(1, { duration: reducedMotion ? 0 : 150 })}>{Math.round(zoom * 100)}%</button></MapTooltip>;
}
