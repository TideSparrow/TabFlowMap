import { httpUrl } from "./graph";
import { matchesPaste } from "./paste-lineage";
import type { PasteWindow } from "../types/map";

// Chrome 不提供地址栏粘贴事件；仅在地址栏发起导航时匹配明确的搜索词或完整网址。
export function matchesAddressBarNavigation(window: PasteWindow, value: string) {
  const normalized = httpUrl(value);
  if (!window.source || !normalized) return false;
  const text = window.source.text.trim();
  const direct = httpUrl(text) ?? (/^[\w-]+(?:\.[\w-]+)+(?:[/:?#]|$)/.test(text) ? httpUrl(`https://${text}`) : null);
  if (direct) {
    if (httpUrl(text)) return direct === normalized;
    // 裸域名没有指定协议，Chrome 的 http/https 选择不能影响来源识别。
    const expected = new URL(direct), actual = new URL(normalized);
    return expected.host === actual.host && expected.pathname === actual.pathname &&
      expected.search === actual.search && expected.hash === actual.hash;
  }
  const url = new URL(normalized);
  const host = url.hostname.replace(/^www\./, "");
  const queryKey = /^google\.(?:[a-z]{2,3}\.)?[a-z]{2,3}$/.test(host) && url.pathname === "/search" ? "q"
    : host === "bing.com" && url.pathname === "/search" ? "q"
    : host === "duckduckgo.com" ? "q"
    : host === "baidu.com" && url.pathname === "/s" ? "wd" : undefined;
  return Boolean(queryKey && matchesPaste(window, url.searchParams.get(queryKey) ?? ""));
}
