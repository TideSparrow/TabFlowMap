# Packaging and publishing

The supported release target is a Chrome Manifest V3 extension for Chrome and Chromium-based Edge. This repository does not claim Firefox support; the side-panel APIs and browser-specific recovery behavior need separate verification for that target.

## Prepare a release

1. Update the version in `package.json` and the lockfile if dependencies change.
2. Run `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm zip` and `pnpm audit:source`.
3. Load `.output/chrome-mv3/` in a clean browser profile. Verify workflow creation, real link sources, copying / pasting, pinning, deletion / undo, native restoration, restart recovery and all three display locations.
4. Verify the language selector in English, Simplified Chinese and Japanese, including another open map view and the overlay title bar.
5. Inspect the two ZIPs. The extension package must contain `manifest.json` at its root. Do not upload the source ZIP as the extension package. Generated names include the current package version.

No `.env`, provider keys, OAuth secrets, fixed extension identity key, custom update URL or private repository configuration is required. Keep all future signing keys and store credentials outside the repository. The source audit checks common patterns; review additions before making the repository public.

## Store submission

Use the Chrome Web Store or Microsoft Edge Add-ons publisher account you control. Supply the extension ZIP, localized descriptions, independent icon and genuine product screenshots, a public privacy-policy URL, and your support contact. These publisher-owned details are intentionally not hardcoded here.

State the single purpose: **visually organize browser tabs and their source relationships into local workflows**. The HTTP(S) site access supports source capture, scroll restoration and the optional map overlay; no website data is sent to a backend. Detailed permission explanations are in `PRIVACY.md`.

The release package uses bundled scripts and assets. There is no remote executable code, analytics SDK, SQL/WASM runtime or embedded API credential. Keep the React Flow attribution visible. Automated packaging does not guarantee store approval.

## Suggested listing text

**Name:** Tab Flow Map

**English:** Turn your browser tabs into connected workflows. Follow where each task came from, add notes, search your map and keep pinned tabs close. Choose a compact map, a detailed map or a tree, in the side panel, a separate window or a page overlay. Includes undo and browsing-context recovery. English, Simplified Chinese and Japanese. No account or backend; data stays in your browser.

**简体中文：** 将浏览器标签整理成有关联的工作流。追溯任务来源、添加备注、搜索导图，管理固定标签。支持精简、完整和树状视图，以及侧边栏、独立窗口、网页悬浮三种展示方式。包含撤销与浏览上下文恢复。支持中文、英文、日文，无需账号，数据保存在本地浏览器。

**日本語：** ブラウザーのタブをつながりのあるワークフローに整理。元のタブをたどり、メモや検索、固定タブを活用できます。コンパクト・詳細・ツリー表示と、サイドパネル・別ウィンドウ・フローティングに対応。元に戻す操作と閲覧状況の復元機能を備え、英語・簡体字中国語・日本語に対応します。アカウント不要で、データはブラウザー内に保存されます。

## Open source

Publish the source repository or the `*-sources.zip` archive with `LICENSE`, third-party notices, the lockfile and documentation. The source archive includes `pnpm-workspace.yaml`, which explicitly allows the pinned esbuild dependency's installation script for clean builds.

## GitHub releases

Set the package version and add matching notes at `docs/releases/vX.Y.Z.md`. After committing and pushing, create an annotated `vX.Y.Z` tag and push that tag. The **Check and package** workflow runs installation, tests, packaging and the source audit. Only when these pass does its publish job create the GitHub release with the extension ZIP, source ZIP and `SHA256SUMS.txt`.

The tag must match `package.json`. Publishing uses GitHub's temporary repository token, with write access limited to the publish job. No personal token or browser-store credentials are stored in the repository. Main-branch pushes build artifacts without creating a release. Chrome Web Store and Edge Add-ons submissions are separate; copy-ready store information is in [STORE_LISTING.md](STORE_LISTING.md).
