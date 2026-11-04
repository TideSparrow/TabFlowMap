import { useState } from "react";
import { Globe } from "lucide-react";

export function SiteIcon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const source = new URL("/_favicon/", browser.runtime.getURL("/tab-map.html"));
  source.searchParams.set("pageUrl", url);
  source.searchParams.set("size", "64");
  return failed ? <Globe size={20} /> : <img src={source.href} alt="" width={20} height={20} draggable={false} onError={() => setFailed(true)} />;
}
