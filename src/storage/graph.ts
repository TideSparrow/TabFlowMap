import { emptyMapState, type MapState } from "../types/map";
import { parseMapState } from "../core/graph";

export const graphStorageKey = "tab-flow-map-graph.v1";

// The background manager is the only graph writer and serializes all commands.
// Keep the standalone extension's data separate from the original SEO database.
export async function readTabMap(): Promise<MapState> {
  const stored = (await browser.storage.local.get(graphStorageKey))[graphStorageKey];
  return stored === undefined ? emptyMapState() : parseMapState(JSON.stringify(stored));
}

export async function saveTabMap(state: MapState): Promise<void> {
  await browser.storage.local.set({ [graphStorageKey]: state });
}
