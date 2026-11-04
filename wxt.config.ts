import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "__MSG_extensionName__",
    description: "__MSG_extensionDescription__",
    default_locale: "en",
    minimum_chrome_version: "116",
    permissions: ["storage", "tabs", "sessions", "webNavigation", "favicon", "sidePanel", "clipboardRead", "clipboardWrite"],
    host_permissions: ["http://*/*", "https://*/*"],
    incognito: "not_allowed",
    action: { default_title: "__MSG_extensionName__" },
    icons: { 16: "icon/16.png", 32: "icon/32.png", 48: "icon/48.png", 128: "icon/128.png" },
    web_accessible_resources: [{ resources: ["tab-map.html", "assets/*", "chunks/*"], matches: ["http://*/*", "https://*/*"] }],
  },
  zip: { zipSources: false },
});
