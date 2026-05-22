import {
  Paragraph,
  TextRun,
  UnderlineType,
  type IParagraphOptions,
} from "docx";
import type { RichTextDoc, RichTextMark, RichTextNode } from "@/types/richText";

type RichTextDocxOptions = {
  size?: number;
  bold?: boolean;
  spacingAfter?: number;
};

function hasMark(marks: RichTextMark[] | undefined, type: string) {
  return Boolean(marks?.some((mark) => mark.type === type));
}

function breakLongWords(text: string, chunkSize = 28) {
  return text.replace(/\S{29,}/g, (word) => {
    const parts = word.match(new RegExp(`.{1,${chunkSize}}`, "g"));
    return parts?.join("\u200B") ?? word;
  });
}

function textRunsFromNode(node: RichTextNode, options: RichTextDocxOptions): TextRun[] {
  if (node.type === "text") {
    return [
      new TextRun({
        text: breakLongWords(node.text ?? ""),
        font: "Times New Roman",
        size: options.size ?? 22,
        bold: options.bold || hasMark(node.marks, "bold"),
        italics: hasMark(node.marks, "italic"),
        strike: hasMark(node.marks, "strike"),
        underline: hasMark(node.marks, "underline")
          ? { type: UnderlineType.SINGLE }
          : undefined,
      }),
    ];
  }

  if (node.type === "hardBreak") {
    return [new TextRun({ break: 1 })];
  }

  return (node.content ?? []).flatMap((child) => textRunsFromNode(child, options));
}

function paragraphFromNode(
  node: RichTextNode,
  options: RichTextDocxOptions,
  prefix = "",
): Paragraph {
  const runs = textRunsFromNode(node, options);

  return new Paragraph({
    spacing: { after: options.spacingAfter ?? 90, line: 260 },
    children: [
      ...(prefix ? [new TextRun({ text: prefix, font: "Times New Roman", size: options.size ?? 22 })] : []),
      ...(runs.length
        ? runs
        : [new TextRun({ text: "", font: "Times New Roman", size: options.size ?? 22 })]),
    ],
  });
}

function listItemParagraphs(node: RichTextNode, options: RichTextDocxOptions) {
  return (node.content ?? []).map((item, index) =>
    paragraphFromNode(item, options, node.type === "orderedList" ? `${index + 1}. ` : "• "),
  );
}

export function richTextToDocxParagraphs(
  doc?: RichTextDoc,
  options: RichTextDocxOptions & Partial<IParagraphOptions> = {},
): Paragraph[] {
  if (!doc?.content?.length) {
    return [
      new Paragraph({
        spacing: { after: options.spacingAfter ?? 90 },
        children: [new TextRun({ text: "", font: "Times New Roman", size: options.size ?? 22 })],
      }),
    ];
  }

  return doc.content.flatMap((node) => {
    if (node.type === "bulletList" || node.type === "orderedList") {
      return listItemParagraphs(node, options);
    }

    return [paragraphFromNode(node, options)];
  });
}
