// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapErrorBoundary } from "./MapErrorBoundary";
import { t } from "../i18n";

describe("map render failure", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("shows a localized recovery action instead of leaving a blank window", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container, { onCaughtError: () => {} });
    function BrokenMap(): ReactNode { throw new Error("Broken saved view"); }
    try {
      await act(() => root.render(<MapErrorBoundary><BrokenMap /></MapErrorBoundary>));
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(t("mapLoadErrorTitle"));
      expect(container.querySelector("button")?.textContent).toBe(t("m071"));
    } finally {
      await act(() => root.unmount()); container.remove();
    }
  });
});
