const HIGHLIGHT_SELECTOR = ".field-jump-highlight, .validation-jump-highlight";
let highlightTimer: number | undefined;

function editableTarget(target: HTMLElement) {
  return target.matches("input, textarea, select, button, .ProseMirror")
    ? target
    : target.querySelector<HTMLElement>(".ProseMirror") ??
        target.querySelector<HTMLElement>("input, textarea, select, button");
}

export function revealEditorTarget(target: HTMLElement) {
  let details = target.closest<HTMLDetailsElement>("details");
  while (details) {
    details.open = true;
    details = details.parentElement?.closest<HTMLDetailsElement>("details") ?? null;
  }
}

export function focusEditorField(fieldId: string, duration = 2400) {
  const target = document.querySelector<HTMLElement>(
    `[data-field-id="${CSS.escape(fieldId)}"]`,
  );
  if (!target) return false;

  revealEditorTarget(target);

  document
    .querySelectorAll(HIGHLIGHT_SELECTOR)
    .forEach((element) => element.classList.remove(
      "field-jump-highlight",
      "validation-jump-highlight",
    ));
  if (highlightTimer) window.clearTimeout(highlightTimer);

  target.classList.add("field-jump-highlight");
  target.scrollIntoView({ block: "center", behavior: "smooth", inline: "nearest" });
  window.setTimeout(() => {
    const currentTarget = document.querySelector<HTMLElement>(
      `[data-field-id="${CSS.escape(fieldId)}"]`,
    );
    if (currentTarget) editableTarget(currentTarget)?.focus({ preventScroll: true });
  }, 350);
  highlightTimer = window.setTimeout(() => {
    target.classList.remove("field-jump-highlight");
    highlightTimer = undefined;
  }, duration);
  return true;
}
