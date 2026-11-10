const snapshotTimeoutMs = 250;

export async function readPagePosition(tabId: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // A frozen or busy renderer may never answer. Position capture is optional
    // and must not hold up tab activation or the manager's shared command queue.
    return await Promise.race([
      browser.tabs.sendMessage(tabId, { type: "tab-flow-map-snapshot" }, { frameId: 0 }).catch(() => undefined),
      new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), snapshotTimeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
