# Privacy policy — Tab Flow Map

Last updated: 2026-11-04

Tab Flow Map runs locally in your browser. It has no account system, backend, analytics, advertising or telemetry. The extension does not transmit your tab graph, notes, copied-text matches, scroll positions or settings to a server.

## Data handled

While you record a workflow, the extension reads tab URLs, titles, opening / navigation events and short copied or pasted text to identify sources. Copied-text capture is limited to 500 characters and skips password fields. Scroll offsets and a short text anchor can be saved to help restore the browsing position. User-entered notes, workflow names, graph relationships and interface preferences are also stored locally.

The saved graph, positions, language preference and restart checkpoint use extension-local storage. Live tab bindings, recent copied-text context, closed-tab matching and up to 50 undo entries use session storage. New workflows, pausing recording and explicit manual relationships clear or take precedence over pending source inference. Incognito access is disabled.

## Permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Save the graph, preferences and recovery state locally. |
| `tabs` | Read titles / URLs and open, focus, close, pin or reorder tabs when requested. |
| `sessions` | Match native browser tab restoration to its previous node. |
| `webNavigation` | Identify real link-opening sources and navigation changes. |
| `sidePanel` | Display the map in the browser side panel. |
| `favicon` | Show site icons using the browser's favicon service. |
| `clipboardRead` | Read text after you choose a paste action from the map menu. A manual paste fallback is available. |
| `clipboardWrite` | Copy a URL after you choose the copy action. |
| HTTP(S) site access | Capture source-related copy / paste and scroll events, and render the optional page overlay. |

There is no permission for browser history, downloads, identity, debugger access or network-request rewriting. URLs can contain personal information; map data remains within this browser profile.

## External websites

Opening a tab, following a link or searching intentionally visits the chosen website or search engine. Those websites process the normal browser request under their own policies. Site icons are requested through the browser's favicon service. Browser-store delivery and updates are managed by the browser store, not by a custom update server.

## Retention and deletion

Individual tab closure and map deletion follow the map's tab-management behavior. Deleting a branch can leave a local undo entry; removing nodes does not mean every recovery snapshot has been erased immediately. Session data clears when the browser session ends. Uninstalling the extension removes its local storage. Other extensions, browser sync behavior and website data are outside this extension's control.

This extension does not share or sell user data. For questions, use the issue tracker of the public repository from which you obtained this extension. Publishers should provide their own public privacy-policy URL and support contact when submitting a store listing.
