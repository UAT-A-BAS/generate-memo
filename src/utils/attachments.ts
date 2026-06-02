export function memoAttachmentItems(value?: string) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim().replace(/^[-*\u2022]\s*/, ""))
    .filter(Boolean);
}

