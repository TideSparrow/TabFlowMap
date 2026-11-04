import { describe, expect, it } from "vitest";
import { matchesAddressBarNavigation } from "./address-bar-lineage";

const windowFor = (text: string) => ({ steps: 1, source: { nodeId: "source", text, at: 1 } });

describe("address-bar navigation matching", () => {
  it("matches decoded search words across supported search engines", () => {
    for (const url of ["https://www.google.com/search?q=image+editor", "https://www.google.co.jp/search?q=image%20editor",
      "https://www.bing.com/search?q=image+editor", "https://duckduckgo.com/?q=image+editor", "https://www.baidu.com/s?wd=image+editor"]) {
      expect(matchesAddressBarNavigation(windowFor("image editor"), url)).toBe(true);
    }
  });
  it("matches complete URLs and bare domains without matching a different destination", () => {
    expect(matchesAddressBarNavigation(windowFor("https://example.com/path?a=1"), "https://example.com/path?a=1")).toBe(true);
    expect(matchesAddressBarNavigation(windowFor("example.com"), "https://example.com/")).toBe(true);
    expect(matchesAddressBarNavigation(windowFor("example.com"), "http://example.com/")).toBe(true);
    expect(matchesAddressBarNavigation(windowFor("example.com"), "https://www.example.com/")).toBe(false);
    expect(matchesAddressBarNavigation(windowFor("https://example.com/path"), "https://example.com/other")).toBe(false);
  });
  it("does not match arbitrary query parameters, partial words, or missing copy sources", () => {
    expect(matchesAddressBarNavigation(windowFor("image"), "https://www.google.com/search?q=image+editor")).toBe(false);
    expect(matchesAddressBarNavigation(windowFor("image"), "https://example.com/?q=image")).toBe(false);
    expect(matchesAddressBarNavigation(windowFor("image"), "https://www.google.com/?q=image")).toBe(false);
    expect(matchesAddressBarNavigation({ steps: 1 }, "https://www.google.com/search?q=image")).toBe(false);
    expect(matchesAddressBarNavigation(windowFor("image"), "chrome://newtab/")).toBe(false);
  });
});
