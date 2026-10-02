import {
  AlignmentType,
  LevelFormat,
  LevelSuffix,
  LineRuleType,
  Paragraph,
  TabStopType,
  TextRun,
  UnderlineType,
  type IParagraphOptions,
  type INumberingOptions,
} from "docx";
import type { RichTextDoc, RichTextMark, RichTextNode } from "@/types/richText";
import { trimTrailingEmptyRichTextNodes } from "@/utils/richText";

type RichTextDocxOptions = {
  numberingContext?: RichTextNumbering;
  size?: number;
  bold?: boolean;
  spacingAfter?: number;
  spacingBefore?: number;
  line?: number;
  alignment?: IParagraphOptions["alignment"];
};

export type RichTextNumbering = {
  config: INumberingOptions["config"][number][];
};

export function createRichTextNumbering(): RichTextNumbering {
  return { config: [] };
}

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
  numbering?: IParagraphOptions["numbering"],
  listDepth?: number,
): Paragraph {
  const runs = textRunsFromNode(node, options);

  return new Paragraph({
    alignment: options.alignment,
    numbering,
    tabStops: numbering && listDepth !== undefined
      ? [{ type: TabStopType.NUM, position: (listDepth + 1) * 360 }]
      : undefined,
    indent: listDepth !== undefined
      ? { left: (listDepth + 1) * 360, ...(numbering ? { hanging: 240 } : {}) }
      : undefined,
    spacing: {
      before: options.spacingBefore ?? 0,
      after: options.spacingAfter ?? 0,
      line: options.line ?? WORD_LINE_MULTIPLE_108,
      lineRule: LineRuleType.AUTO,
    },
    children: [
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
  if (!options.numberingContext) throw new Error("Rich text lists require a DOCX numbering context.");
  const level = Math.min(depth, 8);
  const rawStart = Number(node.attrs?.start ?? 1);
  const start = Number.isInteger(rawStart) && rawStart > 0 ? rawStart : 1;
  const reference = `rich-text-list-${options.numberingContext.config.length + 1}`;
  const left = (level + 1) * 360;
  options.numberingContext.config.push({
    reference,
    levels: [{
      level,
      start,
      format: node.type === "orderedList" ? LevelFormat.DECIMAL : LevelFormat.BULLET,
      text: node.type === "orderedList" ? `%${level + 1}.` : ["•", "◦", "▪"][level % 3],
      alignment: AlignmentType.LEFT,
      suffix: LevelSuffix.TAB,
      style: {
        run: { font: "Times New Roman", size: options.size ?? 22 },
        paragraph: { indent: { left, hanging: 240 } },
      },
    }],
  });

  return (node.content ?? []).flatMap((item) => {
    const children = item.content ?? [];
    const paragraphs: Paragraph[] = [];
    let hasPrimaryParagraph = false;

    for (const child of children) {
      if (child.type === "bulletList" || child.type === "orderedList") {
        paragraphs.push(...listNodeParagraphs(child, options, depth + 1));
        continue;
      }

      paragraphs.push(
        paragraphFromNode(child, options, hasPrimaryParagraph ? undefined : { reference, level }, level),
      );
      hasPrimaryParagraph = true;
    }

    if (!hasPrimaryParagraph) {
      paragraphs.unshift(paragraphFromNode({ type: "paragraph", content: [] }, options, { reference, level }, level));
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
        alignment: options.alignment,
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

  return trimTrailingEmptyRichTextNodes(doc).content.flatMap((node) => {
    if (node.type === "bulletList" || node.type === "orderedList") {
      return listNodeParagraphs(node, options);
    }

    return [paragraphFromNode(node, options)];
  });
}
