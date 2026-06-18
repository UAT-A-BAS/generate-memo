import type { RichTextDoc, RichTextMark, RichTextNode } from "@/types/richText";

const markTags: Record<string, [string, string]> = {
  bold: ["<strong>", "</strong>"],
  italic: ["<em>", "</em>"],
  underline: ['<span class="rt-underline">', "</span>"],
  strike: ["<s>", "</s>"],
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function wrapMarks(text: string, marks?: RichTextMark[]) {
  return (marks ?? []).reduce((current, mark) => {
    const tags = markTags[mark.type];
    return tags ? `${tags[0]}${current}${tags[1]}` : current;
  }, escapeHtml(text));
}

function nodeText(node?: RichTextNode): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(nodeText).join(node.type === "paragraph" ? "" : " ");
}

function nodeHtml(node: RichTextNode): string {
  if (node.type === "text") return wrapMarks(node.text ?? "", node.marks);

  const children = (node.content ?? []).map(nodeHtml).join("");

  switch (node.type) {
    case "doc":
      return children;
    case "paragraph":
      return `<p>${children || "<br />"}</p>`;
    case "bulletList":
      return `<ul>${children}</ul>`;
    case "orderedList": {
      const start = Number(node.attrs?.start ?? 1);
      const startAttribute = Number.isInteger(start) && start !== 1
        ? ` start="${start}"`
        : "";
      return `<ol${startAttribute}>${children}</ol>`;
    }
    case "listItem":
      return `<li>${children}</li>`;
    case "hardBreak":
      return "<br />";
    default:
      return children;
  }
}

export function richTextToPlainText(doc?: RichTextDoc) {
  if (!doc) return "";
  return doc.content.map(nodeText).join("\n").trim();
}

export function trimTrailingEmptyRichTextNodes(doc: RichTextDoc): RichTextDoc {
  const content = [...doc.content];

  while (content.length > 1) {
    const last = content.at(-1);
    if (!last || last.type !== "paragraph" || nodeText(last).trim()) break;
    content.pop();
  }

  return content.length === doc.content.length ? doc : { ...doc, content };
}

export function richTextToHtml(doc?: RichTextDoc) {
  if (!doc) return "";
  return trimTrailingEmptyRichTextNodes(doc).content.map(nodeHtml).join("");
}

export function cloneRichText(doc: RichTextDoc): RichTextDoc {
  return JSON.parse(JSON.stringify(doc)) as RichTextDoc;
}

export function estimateRichTextHeight(doc?: RichTextDoc, base = 34) {
  const text = richTextToPlainText(doc);
  const lines = Math.max(1, Math.ceil(text.length / 82));
  const paragraphCount = doc?.content?.length ?? 1;
  return base + lines * 18 + Math.max(0, paragraphCount - 1) * 8;
}
