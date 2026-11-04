import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { zipSync } from "fflate";

// An explicit source allowlist keeps local profiles, credentials and build output out
// of public archives. Include tests: store-review source packaging tools omit them.
const directories = ["src", "public", "scripts", "test", "docs", ".github"];
const rootFiles = ["package.json", "pnpm-lock.yaml", "tsconfig.json", "wxt.config.ts", "AGENTS.md", "LICENSE", "PRIVACY.md", "THIRD_PARTY_NOTICES.md", "README.md", "README.zh-CN.md", ".gitignore", ".npmrc"];
const files = {};
const excluded = /(?:^|\/)(?:\.env(?:\..*)?|\.DS_Store)$|\.(?:pem|key|p12|pfx|crx)$/i;

async function include(file) {
  if (excluded.test(file)) throw new Error(`Private file in source directories: ${file}`);
  files[file] = new Uint8Array(await readFile(file));
}
async function walk(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Symlinks cannot be included in a public source archive: ${name}`);
    if (entry.isDirectory()) await walk(name);
    else if (entry.isFile()) await include(name);
  }
}
for (const file of rootFiles) await include(file);
for (const directory of directories) await walk(directory);
const manifest = JSON.parse(await readFile("package.json", "utf8"));
if (!/^[a-z0-9-]+$/.test(manifest.name) || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("Invalid package name or release version");
const output = `.output/${manifest.name}-${manifest.version}-sources.zip`;
await mkdir(".output", { recursive: true });
// Stable timestamps make source packages reproducible for the same source tree.
await writeFile(output, zipSync(files, { level: 9, mtime: new Date("2026-01-01T00:00:00Z") }));
console.log(`Packaged ${Object.keys(files).length} source files, including tests and CI: ${output}`);
