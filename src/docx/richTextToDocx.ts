import {
  LineRuleType,
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
  spacingBefore?: number;
  line?: number;
};

const WORD_LINE_MULTIPLE_108 = 259;

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
  depth = 0,
): Paragraph {
  const runs = textRunsFromNode(node, options);

  return new Paragraph({
    indent: depth > 0 ? { left: depth * 360, hanging: prefix ? 180 : 0 } : undefined,
    spacing: {
      before: options.spacingBefore ?? 0,
      after: options.spacingAfter ?? 0,
      line: options.line ?? WORD_LINE_MULTIPLE_108,
      lineRule: LineRuleType.AUTO,
    },
    children: [
      ...(prefix ? [new TextRun({ text: prefix, font: "Times New Roman", size: options.size ?? 22 })] : []),
      ...(runs.length
        ? runs
        : [new TextRun({ text: "", font: "Times New Roman", size: options.size ?? 22 })]),
    ],
  });
}

function listNodeParagraphs(
  node: RichTextNode,
  options: RichTextDocxOptions,
  depth = 0,
): Paragraph[] {
  const start = Number(node.attrs?.start ?? 1);

  return (node.content ?? []).flatMap((item, itemIndex) => {
    const prefix = node.type === "orderedList" ? `${start + itemIndex}. ` : "\u2022 ";
    const children = item.content ?? [];
    const paragraphs: Paragraph[] = [];
    let hasPrimaryParagraph = false;

    for (const child of children) {
      if (child.type === "bulletList" || child.type === "orderedList") {
        paragraphs.push(...listNodeParagraphs(child, options, depth + 1));
        continue;
      }

      paragraphs.push(
        paragraphFromNode(child, options, hasPrimaryParagraph ? "" : prefix, depth),
      );
      hasPrimaryParagraph = true;
    }

    if (!hasPrimaryParagraph) {
      paragraphs.unshift(paragraphFromNode(item, options, prefix, depth));
    }

    return paragraphs;
  });
}

export function richTextToDocxParagraphs(
  doc?: RichTextDoc,
  options: RichTextDocxOptions & Partial<IParagraphOptions> = {},
): Paragraph[] {
  if (!doc?.content?.length) {
    return [
      new Paragraph({
        spacing: {
          before: options.spacingBefore ?? 0,
          after: options.spacingAfter ?? 0,
          line: options.line ?? WORD_LINE_MULTIPLE_108,
          lineRule: LineRuleType.AUTO,
        },
        children: [new TextRun({ text: "", font: "Times New Roman", size: options.size ?? 22 })],
      }),
    ];
  }

  return doc.content.flatMap((node) => {
    if (node.type === "bulletList" || node.type === "orderedList") {
      return listNodeParagraphs(node, options);
    }

    return [paragraphFromNode(node, options)];
  });
}
