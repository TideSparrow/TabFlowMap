import type { MapPlacement } from "../types/map";

export function mapPositionPrefix(displayMode: MapPlacement["displayMode"], direction: MapPlacement["direction"]) {
  return `tab-flow-map-position.v1:${displayMode === "compact" ? "compact:" : ""}${direction === "vertical" ? "vertical:" : ""}`;
}
export function mapPositionKeys(id: string) {
  return (["compact", "detailed"] as const).flatMap((mode) =>
    (["horizontal", "vertical"] as const).map((direction) => mapPositionPrefix(mode, direction) + id));
}
