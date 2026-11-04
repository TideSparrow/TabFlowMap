export const pinnedTabDragType = "application/x-tab-flow-map-pinned-tab";
export const pinnedSortDragType = "application/x-tab-flow-map-pinned-sort";
export function pinnedTabFromDrop(transfer: Pick<DataTransfer, "getData">, type = pinnedTabDragType) {
  const value = transfer.getData(type);
  if (!/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
