# Browser-store submission material

This document prepares the store listing. It is not confirmation of a submitted or approved listing. Upload the extension ZIP, not the source ZIP.

## Basic information

- Name: **Tab Flow Map**
- Version: **1.0.0**
- Suggested category: productivity / workflow organization; choose the matching category in the current store form.
- Website: https://github.com/TideSparrow/TabFlowMap
- Support: https://github.com/TideSparrow/TabFlowMap/issues
- Privacy policy: https://github.com/TideSparrow/TabFlowMap/blob/main/PRIVACY.md
- Package: `tab-flow-map-1.0.0-chrome.zip`
- Store icon: `public/icon/128.png`

## English

**Short description:** Automatically map how your tabs connect. Follow research branches and find your way back to the original question.

**Detailed description:**

You start with one question, follow a review, compare another product, and open a dozen more tabs. Everything is still there, but the thread that connected it is gone.

Tab Flow Map keeps those connections visible. Start recording, then browse normally. Open a link in a new tab and it becomes a branch of the source page. Copy a keyword or URL from a page and use it in a new tab; matching searches, pastes and visits can connect back to that source. You do not need to operate the map for every new tab.

Keep using your browser's native tab bar, groups and bookmarks. Open the map when you want to see a branch, return to its source, or recover your train of thought.

Choose Compact, Detailed or Tree view. Use the side panel, a separate window or a page overlay. Search your map, add notes, manage pinned tabs, adjust sources manually, and undo supported actions.

English, Simplified Chinese and Japanese are included. Maps, notes, positions and preferences stay in your browser. The extension has no account system, analytics or backend. Ordinary website visits and searches still make normal browser requests.

Copy-based source matching is limited to the new tab's first three tracked actions. Navigating within a tab updates its node; the map is not a permanent browsing-history archive. Deleting a map branch closes its ordinary tabs. Details are in the README and privacy policy.

## 简体中文

**简短说明：** 自动连接标签与来源，在多标签调研中看清分支，回到最初的问题。

**详细说明：**

从一个问题出发，打开评测、商品和资料页，越查标签越多，最后忘了自己最初要弄清楚什么？Tab Flow Map 帮你保留页面之间的来路。

开启记录后照常浏览：从网页链接打开的新标签会自动成为来源页的子分支；在当前页面复制关键词或网址，再到新标签中搜索或访问，匹配成功后也能关联原页面。不需要每开一个标签，就到导图里操作一次。

原生标签栏、标签组和书签照常使用。需要梳理来源、找回主线或回到起点时，再看导图。

支持 Compact 精简、Detailed 完整和 Tree 树状视图，以及侧边栏、独立窗口、网页悬浮三种展示方式。可以搜索、写备注、管理固定标签、手动调整来源，并撤销支持的操作。

支持简体中文、英文和日文。导图、备注、位置和偏好保存在本地浏览器，无需插件账号，不含统计追踪，也没有服务端。主动访问网站或搜索仍会产生正常浏览请求。

复制关联在新标签的前三步追踪操作内匹配。同一标签内跳转会更新原节点；导图不是完整浏览历史存档。删除分支会关闭对应的普通标签。详见 README 和隐私说明。

## 日本語

**短い説明：** タブと参照元のつながりを自動で可視化。調べものの流れをたどり、最初の問いに戻れます。

**詳細説明：**

ひとつの疑問からレビューや商品ページを開いているうちに、最初に調べたかったことを見失っていませんか。Tab Flow Map はタブと参照元のつながりを見える形にします。

記録を開始したら、いつもどおり閲覧してください。リンクを新しいタブで開くと参照元の子ブランチになります。ページからコピーしたキーワードや URL を新しいタブで検索・閲覧した場合も、一致が確認できれば元のページにつながります。タブを開くたびにマップを操作する必要はありません。

ブラウザー標準のタブバー、タブグループ、ブックマークと併用できます。Compact・Detailed・Tree 表示と、サイドパネル・別ウィンドウ・ページ上のフローティング表示を選べます。検索、メモ、固定タブ、参照元の手動調整、対応する操作の取り消しも利用できます。

英語・簡体字中国語・日本語に対応。マップ、メモ、位置、設定はブラウザー内に保存されます。拡張機能用のアカウント、アクセス解析、バックエンドはありません。通常のサイト閲覧や検索はブラウザー通信を行います。

コピー元の照合は新しいタブの最初の3操作までです。同じタブ内で移動するとノードが更新され、完全な閲覧履歴は保存されません。ブランチを削除すると対応する通常タブも閉じます。詳しくは README とプライバシーポリシーをご覧ください。

## Single purpose and permissions

**Single purpose:** Visually organize browser tabs and their source relationships to help users follow research and return to its starting point.

| Permission | Why it is used |
| --- | --- |
| `tabs` | Read tab titles, URLs and state; focus, create, close and manage the tabs represented in the map. |
| `webNavigation` | Identify actual source tabs when websites open new tabs, and update relationships as pages navigate. |
| `storage` | Store maps, notes, preferences and positions locally; keep live bindings and undo state in browser session storage. |
| `sessions` | Reconnect supported browser-restored tabs with their saved map context. |
| `favicon` | Display site icons beside tab nodes. |
| `sidePanel` | Show the map beside the current website. |
| `clipboardRead`, `clipboardWrite` | Read clipboard text when the user chooses Paste in the map menu, and copy a tab URL when the user requests it. Clipboard text is handled locally. |
| HTTP(S) host access | Capture page copy/paste events, save and restore scroll positions, and show the optional map overlay on ordinary websites. |

No remotely hosted executable code is used. Do not upload signing keys, environment files, browser profiles or store credentials.

## Images

Use the real English screenshots in `docs/screenshots/`, prioritizing Compact mode. If the store requires a fixed canvas size, fit the image proportionally with neutral padding; do not replace UI text or invent map nodes. The Mac/iPad SVG is an explanatory diagram, not evidence of a device test, and is not a store product screenshot.
