function field(target: EventTarget | null) {
  return target instanceof Element ? target.closest("input,textarea,[contenteditable]") : null;
}

export function ignoredLineageTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return true;
  return Boolean(target.closest("#tab-flow-map-host") ||
    target.closest('input[type="password"]'));
}

export function copiedSelection(target: EventTarget | null) {
  const input = field(target);
  if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
    return input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0).trim();
  }
  return window.getSelection()?.toString().trim() ?? "";
}

export function editablePasteTarget(target: EventTarget | null) {
  const input = field(target);
  return input instanceof HTMLTextAreaElement ||
    (input instanceof HTMLInputElement && /^(text|search|url|email|tel|number)$/.test(input.type)) ||
    (input instanceof HTMLElement && input.isContentEditable);
}
