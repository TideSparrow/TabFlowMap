import { describe, expect, it } from "vitest";
import { pinnedTabFromDrop, pinnedTabDragType } from "./drag";
import { isMapMessage, tabMapMessageType } from "../../types/map";

describe("pinned task commands and drag data", () => {
  it.each([0, -1, 1.5, "1", undefined, 9007199254740992])("rejects invalid pinned closure IDs: %s", (tabId) => {
    expect(isMapMessage({ type: tabMapMessageType, action: "delete-pinned", tabId })).toBe(false);
  });
  it("accepts a pinned closure by live tab ID", () => {
    expect(isMapMessage({ type: tabMapMessageType, action: "delete-pinned", tabId: 42 })).toBe(true);
  });
  it.each(["", "-1", "0", "1.5", "https://evil.example", "9007199254740992"])("ignores invalid drag IDs: %s", (value) => {
    expect(pinnedTabFromDrop({ getData: () => value })).toBeNull();
  });
  it("accepts only its own drag format with a valid live tab ID", () => {
    expect(pinnedTabFromDrop({ getData: (type) => type === pinnedTabDragType ? "42" : "" })).toBe(42);
  });
  it.each([
    { tabId: 0 }, { tabId: "1" }, { tabId: 1, newTask: "yes" },
    { tabId: 1, placement: { x: 1, y: 1, displayMode: "compact", direction: "vertical" } },
    { tabId: 1, newTask: true, placement: null },
    { tabId: 1, newTask: true, placement: { x: Infinity, y: 1, displayMode: "compact", direction: "vertical" } },
  ])("rejects malformed creation commands: %j", (values) => {
    expect(isMapMessage({ type: tabMapMessageType, action: "pinned", ...values })).toBe(false);
  });
  it("accepts a placed independent task", () => {
    expect(isMapMessage({ type: tabMapMessageType, action: "pinned", tabId: 1, newTask: true,
      placement: { x: 50, y: 100, displayMode: "compact", direction: "vertical" } })).toBe(true);
  });
});
