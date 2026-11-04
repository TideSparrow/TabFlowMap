import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignored = new Set(["node_modules", ".git", ".output", ".wxt", "output", "coverage", ".playwright-cli"]);
const violations = [];
const credentials = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{24,}\b/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  /\bAIza[A-Za-z0-9_-]{30,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    const relative = path.relative(root, file);
    if (entry.isDirectory()) { await inspect(file); continue; }
    if (/^\.env(?:\.|$)|\.(?:pem|key|p12|pfx|crx)$/.test(entry.name)) violations.push(`${relative}: private file`);
    if (!/\.(?:[cm]?[jt]sx?|json|html|css|md|ya?ml)$/.test(entry.name)) continue;
    const source = await readFile(file, "utf8");
    if (credentials.some((pattern) => pattern.test(source))) violations.push(`${relative}: credential pattern`);
    if (source.includes("/" + "Users" + "/") || source.includes("/" + "home" + "/")) violations.push(`${relative}: local machine path`);
    if (relative.startsWith("src/") && /(?:common_plugin_seo|tide-sparrow|local-db)/.test(source)) violations.push(`${relative}: original project dependency`);
  }
}
await inspect(root);

const catalogs = await Promise.all(["en", "zh-CN", "ja"].map(async (locale) => JSON.parse(await readFile(`src/i18n/${locale}.json`, "utf8"))));
const keys = Object.keys(catalogs[0]).sort();
const tokens = (value) => [...value.matchAll(/\{\d+\}/g)].map(([token]) => token).sort().join();
for (const catalog of catalogs) {
  if (Object.keys(catalog).sort().join() !== keys.join()) violations.push("Translation keys differ between languages");
  for (const key of keys) if (!catalog[key] || tokens(catalog[key]) !== tokens(catalogs[0][key])) violations.push(`Invalid translation: ${key}`);
}

const manifestPath = ".output/chrome-mv3/manifest.json";
if (await stat(manifestPath).catch(() => false)) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const field of ["key", "update_url", "oauth2", "externally_connectable", "declarative_net_request"]) {
    if (field in manifest) violations.push(`Unexpected manifest field: ${field}`);
  }
  const allowed = new Set(["storage", "tabs", "sessions", "webNavigation", "favicon", "sidePanel", "clipboardRead", "clipboardWrite"]);
  if (manifest.permissions.some((permission) => !allowed.has(permission))) violations.push("Unexpected permission in manifest");
  if (manifest.background?.service_worker !== "background.js" || !manifest.options_ui || !manifest.side_panel) violations.push("Missing standalone entrypoint");
}
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else console.log(`Source audit passed; ${keys.length} messages in 3 languages; no known credentials or original project dependencies found.`);
