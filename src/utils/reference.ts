export function referenceIntroduction(items: string[]) {
  if (items.length !== 1) return "Memorandum ini mengacu pada:";
  const item = items[0].trim();
  return `Memorandum ini mengacu pada ${item}${/[.!?]$/.test(item) ? "" : "."}`;
}
