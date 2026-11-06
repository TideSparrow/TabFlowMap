# Chrome 商店：隐私权规范填写

关闭提示框，进入「隐私权规范」标签页，按标题分别复制以下内容。已按 v1.0.2 实现核对。

## 单一用途说明

```text
Visually organize browser tabs and their source relationships so users can follow research branches, keep context, and return to the page where their research started.
```

## 主机权限理由（HTTP / HTTPS）

```text
The extension works across the websites users choose for research. Content scripts capture source-related copy/paste events, short text anchors and scroll positions, and display the optional page overlay. This enables automatic parent-child tab relationships and reading-position restoration across sites. A fixed domain list would not support user-chosen research sites. This data is processed locally and is not sent to an extension server.
```

## clipboardRead 权限理由

```text
Read clipboard text only when the user selects Paste in the map menu, to create a related tab or search from that text. The extension does not poll the system clipboard. Text is processed locally.
```

## clipboardWrite 权限理由

```text
Copy a tab URL to the clipboard when the user selects Copy URL in the map or pinned-tab menu.
```

## favicon 权限理由

```text
Use Chrome's favicon service to display recognizable website icons beside tab nodes, making research branches easier to identify.
```

## sessions 权限理由

```text
Read recently closed tab metadata to reconnect browser-restored tabs with their previous map nodes and source relationships.
```

## sidePanel 权限理由

```text
Display the research map in Chrome's side panel so users can view tab relationships while browsing the current website.
```

## storage 权限理由

```text
Store workflows, tab relationships, notes, language preferences, reading positions and restart checkpoints in local extension storage. Use session storage for live tab bindings, temporary source matching and undo state. No extension backend receives this data.
```

## tabs 权限理由

```text
Read tab URLs, titles and state to represent real tabs in the map. Focus, create, close, pin and reorder tabs in response to user actions, and keep map nodes synchronized with tab changes.
```

## webNavigation 权限理由

```text
Observe navigation and new-tab target events to identify the source of a newly opened tab, update its map node when it navigates, and match supported copied-URL or search transitions to their source tab.
```

## 远程代码

选择 **否，我未使用远程代码（No, I am not using remote code）**。这不是要求填写“使用远程代码”的理由。如果页面仍提供说明框，可填写：

```text
No remote code is used. All JavaScript, CSS and executable dependencies are bundled with the extension. The extension does not download or execute remote scripts, use remote eval, or load executable code from a CDN.
```

## 数据使用情况

按当前实现披露以下三类本地处理的数据：

- **网络记录 / Web history**：工作流中的标签网址、标题及来源关系。
- **用户活动 / User activity**：用于来源判断的复制、粘贴、点击步骤，以及阅读位置。
- **网站内容 / Website content**：用户选中并复制的短文本、粘贴的搜索词、页面文字定位锚点和用户备注。

数据只在浏览器本地处理，也不能因此填成“完全不处理用户数据”。插件没有账号、统计或服务端采集。

页面底部对应的三条有限使用声明，可以按当前实现勾选确认：

- 不出售或向第三方转让用户数据（政策允许的情形除外）。
- 不为与插件单一用途无关的目的使用或转让用户数据。
- 不为确定信用状况或贷款资格使用或转让用户数据。

不要额外勾选与实际功能不符的数据类型或作出未核对的声明。

## 隐私政策网址

```text
https://github.com/TideSparrow/TabFlowMap/blob/main/PRIVACY.md
```

**完成后点击「保存草稿」**，再检查发布提示。填写这些字段不等于已通过审核。

官方依据：[隐私字段说明](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/)；[用户数据政策 FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq/)第 3 问明确要求披露仅在本地处理的数据。
