const HIGHLIGHT_SELECTOR = ".field-jump-highlight, .validation-jump-highlight";
let highlightTimer: number | undefined;

function editableTarget(target: HTMLElement) {
  return target.matches("input, textarea, select, button, .ProseMirror")
    ? target
    : target.querySelector<HTMLElement>("input, textarea, select, button, .ProseMirror");
}

export function focusEditorField(fieldId: string, duration = 2400) {
  const target = document.querySelector<HTMLElement>(
    `[data-field-id="${CSS.escape(fieldId)}"]`,
  );
  if (!target) return false;

  document
    .querySelectorAll(HIGHLIGHT_SELECTOR)
    .forEach((element) => element.classList.remove(
      "field-jump-highlight",
      "validation-jump-highlight",
    ));
  if (highlightTimer) window.clearTimeout(highlightTimer);

  target.classList.add("field-jump-highlight");
  target.scrollIntoView({ block: "center", behavior: "smooth", inline: "nearest" });
  window.setTimeout(() => editableTarget(target)?.focus({ preventScroll: true }), 250);
  highlightTimer = window.setTimeout(() => {
    target.classList.remove("field-jump-highlight");
    highlightTimer = undefined;
  }, duration);
  return true;
}
