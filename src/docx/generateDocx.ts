import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  LineRuleType,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  SectionType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  Tab,
  TabStopType,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType,
  type FileChild,
  type ISectionOptions,
  type TableVerticalAlign,
} from "docx";
import type { MemoDraft, Recipient } from "@/types/memo";
import type { PreviewBlock, PreviewOrientation, PreviewPage } from "@/pagination/paginate";
import {
  ACTIVITY_COLUMN_WIDTHS,
  ACTIVITY_NUMBERED_COLUMN_WIDTHS,
  A4_HEIGHT_TWIPS,
  A4_WIDTH_TWIPS,
  APPENDIX_PAGE_MARGINS,
  APPENDIX_TABLE_WIDTH,
  APPENDIX_COLUMN_WIDTHS,
  APPENDIX_HEADER_FILL,
  BODY_COLUMN_GAP,
  BODY_COLUMN_INDENT,
  BODY_COLUMN_RIGHT_INDENT,
  BODY_TITLE_WIDTH,
  DEVELOPMENT_COLUMN_WIDTHS,
  DEVELOPMENT_SINGLE_COLUMN_WIDTHS,
  MAIN_PAGE_MARGINS,
  MAIN_BODY_CONTENT_WIDTH,
  MAIN_BODY_TABLE_WIDTH,
  MAIN_PAGE_CONTENT_WIDTH,
  TABLE_HEADER_FILL,
  WORD_INDENT_002_CM,
  WORD_LINE_MULTIPLE_108,
  WORD_LINE_MULTIPLE_115,
} from "@/documentLayout";
import { isTableSectionContinuation, paginateMemoDraft } from "@/pagination/paginate";
import {
  formatDateRangeID,
  formatDateRangeNonBreakingID,
} from "@/utils/formatDateRangeID";
import { memoAttachmentItems } from "@/utils/attachments";
import { formatRecipientAttention } from "@/utils/formatRecipient";
import {
  consecutiveMergeState,
  type ConsecutiveMergeState,
} from "@/utils/tableMerge";
import { richTextToPlainText } from "@/utils/richText";
import { richTextToDocxParagraphs } from "./richTextToDocx";
import { spliceValidationTemplate } from "./spliceValidationTemplate";

function createOnePointDocxBorder() {
  return {
    style: BorderStyle.SINGLE,
    size: 8,
    color: "000000",
    space: 0,
  } as const;
}

const hiddenBorder = {
  style: BorderStyle.NIL,
  size: 0,
};
const noBorder = {
  top: hiddenBorder,
  bottom: hiddenBorder,
  left: hiddenBorder,
  right: hiddenBorder,
};
const noTableBorder = {
  ...noBorder,
  insideHorizontal: hiddenBorder,
  insideVertical: hiddenBorder,
};
function createStableDocxTableBorders() {
  return {
    top: createOnePointDocxBorder(),
    bottom: createOnePointDocxBorder(),
    left: createOnePointDocxBorder(),
    right: createOnePointDocxBorder(),
    insideHorizontal: createOnePointDocxBorder(),
    insideVertical: createOnePointDocxBorder(),
  };
}

const dataTableBorders = createStableDocxTableBorders();

const sectionTopBorder = createOnePointDocxBorder();
const LIST_TEXT_OFFSET = 300;

type SectionRule = "full" | "content" | "none";
type TableBorders = ConstructorParameters<typeof Table>[0]["borders"];

function breakLongWords(text: string, chunkSize = 28) {
  return text.replace(/\S{29,}/g, (word) => {
    const parts = word.match(new RegExp(`.{1,${chunkSize}}`, "g"));
    return parts?.join("\u200B") ?? word;
  });
}

function pct(value: number) {
  return value * 50;
}

function wordSpacing(
  overrides: {
    before?: number;
    after?: number;
    line?: number;
    lineRule?: (typeof LineRuleType)[keyof typeof LineRuleType];
  } = {},
) {
  return {
    before: overrides.before ?? 0,
    after: overrides.after ?? 0,
    line: overrides.line ?? WORD_LINE_MULTIPLE_108,
    lineRule: overrides.lineRule ?? LineRuleType.AUTO,
  };
}

function scheduleTitle(draft: MemoDraft) {
  return draft.metadata.memoType === "Pilot" ? "Jadwal Pilot Implementasi" : "Jadwal Implementasi";
}

function initialsText(draft: MemoDraft) {
  const suffix = `/uat-${draft.initialsBureau.toLowerCase()}`;
  if (draft.initials.toLowerCase().includes("/uat-")) return draft.initials;
  return draft.initials ? `${draft.initials}${suffix}` : suffix;
}

function referenceItems(draft: MemoDraft) {
  return richTextToPlainText(draft.reference)
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function run(
  text: string,
  options: { bold?: boolean; size?: number; allCaps?: boolean; italics?: boolean; color?: string; underline?: boolean; font?: string } = {},
) {
  return new TextRun({
    text: breakLongWords(options.allCaps ? text.toUpperCase() : text),
    bold: options.bold,
    italics: options.italics,
    color: options.color,
    underline: options.underline ? { type: UnderlineType.SINGLE } : undefined,
    size: options.size ?? 22,
    font: options.font ?? "Times New Roman",
  });
}

function multilineRuns(
  text: string,
  options: { bold?: boolean; size?: number; allCaps?: boolean; italics?: boolean; color?: string; underline?: boolean; font?: string } = {},
) {
  return text.split(/\r?\n/).flatMap((line, index) => {
    const children: TextRun[] = [];
    if (index > 0) children.push(new TextRun({ break: 1 }));
    children.push(run(line, options));
    return children;
  });
}

function paragraph(
  text: string,
  options: {
    bold?: boolean;
    size?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    italics?: boolean;
    color?: string;
    underline?: boolean;
    font?: string;
    indent?: { left?: number; right?: number; firstLine?: number; hanging?: number };
    spacingBefore?: number;
    spacingAfter?: number;
    line?: number;
    keepNext?: boolean;
  } = {},
) {
  return new Paragraph({
    alignment: options.align,
    indent: options.indent,
    keepNext: options.keepNext,
    spacing: wordSpacing({
      before: options.spacingBefore,
      after: options.spacingAfter,
      line: options.line,
    }),
    children: multilineRuns(text, options),
  });
}

function hyperlinkTarget(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function hyperlinkAfterTextParagraph(
  introduction: string,
  text: string,
  options: Parameters<typeof paragraph>[1] = {},
) {
  const target = hyperlinkTarget(text);
  return new Paragraph({
    spacing: wordSpacing({
      before: options.spacingBefore,
      after: options.spacingAfter,
      line: options.line,
    }),
    children: [
      run(introduction, options),
      new TextRun({ break: 1 }),
      ...(target
        ? [
            new ExternalHyperlink({
              link: target,
              children: multilineRuns(text.trim(), { ...options, underline: true }),
            }),
          ]
        : [run("-", options)]),
    ],
  });
}

function bodyColumnParagraph(
  text: string,
  options: Parameters<typeof paragraph>[1] = {},
) {
  return paragraph(text, {
    ...options,
    indent: { left: BODY_COLUMN_INDENT, right: BODY_COLUMN_RIGHT_INDENT, ...options.indent },
  });
}

function dashGapParagraph(
  text: string,
  options: Parameters<typeof paragraph>[1] = {},
) {
  const indent = options.indent ?? {};
  const textPosition = (indent.left ?? 0) + LIST_TEXT_OFFSET;

  return new Paragraph({
    alignment: options.align,
    keepNext: options.keepNext,
    indent: { ...indent, left: textPosition, hanging: LIST_TEXT_OFFSET },
    tabStops: [{ type: TabStopType.LEFT, position: textPosition }],
    spacing: wordSpacing({
      before: options.spacingBefore,
      after: options.spacingAfter,
      line: options.line,
    }),
    children: [
      run("-", options),
      new TextRun({ children: [new Tab()] }),
      ...multilineRuns(text, options),
    ],
  });
}

function bulletGapParagraph(
  text: string,
  options: Parameters<typeof paragraph>[1] = {},
) {
  const indent = options.indent ?? {};
  const textPosition = (indent.left ?? 0) + LIST_TEXT_OFFSET;

  return new Paragraph({
    alignment: options.align,
    keepNext: options.keepNext,
    indent: { ...indent, left: textPosition, hanging: LIST_TEXT_OFFSET },
    tabStops: [{ type: TabStopType.LEFT, position: textPosition }],
    spacing: wordSpacing({
      before: options.spacingBefore,
      after: options.spacingAfter,
      line: options.line,
    }),
    children: [
      run("•", options),
      new TextRun({ children: [new Tab()] }),
      ...multilineRuns(text, options),
    ],
  });
}

function tabAlignedParagraph(
  text: string,
  options: Parameters<typeof paragraph>[1] = {},
) {
  const indent = options.indent ?? {};
  return paragraph(text, {
    ...options,
    indent: { ...indent, left: (indent.left ?? 0) + LIST_TEXT_OFFSET },
  });
}

function memoHeadingParagraph(text: string, options: Parameters<typeof paragraph>[1] = {}) {
  return paragraph(text, {
    ...options,
    indent: { left: WORD_INDENT_002_CM, ...options.indent },
    spacingBefore: options.spacingBefore ?? 40,
    spacingAfter: options.spacingAfter ?? 0,
    line: options.line ?? WORD_LINE_MULTIPLE_115,
  });
}

function exactSpacer(height: number) {
  return new Paragraph({
    spacing: {
      before: height,
      after: 0,
      line: 1,
      lineRule: LineRuleType.EXACT,
    },
    children: [new TextRun({ text: "", size: 2 })],
  });
}

function bodyRuleTable(children: Paragraph[]) {
  return bodyTable([
    bodyRow({
      children: [
        new TableCell({
          verticalAlign: VerticalAlign.TOP,
          margins: { top: 40, bottom: 0, left: 0, right: 0 },
          width: { size: MAIN_BODY_CONTENT_WIDTH, type: WidthType.DXA },
          borders: {
            top: sectionTopBorder,
            bottom: hiddenBorder,
            left: hiddenBorder,
            right: hiddenBorder,
          },
          children,
        }),
      ],
    }),
  ], [100], BODY_COLUMN_INDENT, noTableBorder, MAIN_BODY_CONTENT_WIDTH);
}

function continuationRule(): FileChild[] {
  return [
    exactSpacer(160),
    bodyRuleTable([paragraph("\u00A0", { size: 2 })]),
  ];
}

function sectionCell(
  children: FileChild[],
  width: number,
  withTopBorder: boolean,
  topMargin = 180,
) {
  return new TableCell({
    verticalAlign: VerticalAlign.TOP,
    margins: { top: topMargin, bottom: 0, left: 0, right: 0 },
    width: { size: width, type: WidthType.DXA },
    borders: {
      ...noBorder,
      top: withTopBorder ? sectionTopBorder : hiddenBorder,
    },
    children,
  });
}

function sectionTitleParagraph(title: string) {
  const continuationSuffix = ", Sambungan";
  if (!title.endsWith(continuationSuffix)) {
    return paragraph(title, { bold: true, size: 20 });
  }

  return new Paragraph({
    spacing: wordSpacing(),
    children: [
      run(title.slice(0, -continuationSuffix.length), { bold: true, size: 20 }),
      run(continuationSuffix, { size: 20 }),
    ],
  });
}

function previewSection(title: string, content: FileChild[], rule: SectionRule = "content") {
  const titleHasRule = rule === "full";
  const contentHasRule = rule !== "none";
  const topMargin = rule === "none" ? 0 : 180;

  return table([
    new TableRow({
      children: [
        sectionCell([sectionTitleParagraph(title)], BODY_TITLE_WIDTH, titleHasRule, topMargin),
        sectionCell([paragraph("", { size: 2 })], BODY_COLUMN_GAP, titleHasRule, topMargin),
        sectionCell(content, MAIN_BODY_CONTENT_WIDTH, contentHasRule, topMargin),
      ],
    }),
  ], MAIN_PAGE_CONTENT_WIDTH, [
    BODY_TITLE_WIDTH,
    BODY_COLUMN_GAP,
    MAIN_BODY_CONTENT_WIDTH,
  ]);
}

function bodyCell(children: Paragraph[], width: number, shaded = false) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 45, bottom: 45, left: 90, right: 90 },
    shading: shaded ? { fill: TABLE_HEADER_FILL } : undefined,
    width: {
      size: Math.round((MAIN_BODY_TABLE_WIDTH * width) / 100),
      type: WidthType.DXA,
    },
    children,
  });
}

function table(
  rows: TableRow[],
  width: number,
  columnWidths: number[],
  tableBorders: TableBorders = noTableBorder,
) {
  return new Table({
    width: { size: width, type: WidthType.DXA },
    columnWidths,
    layout: TableLayoutType.FIXED,
    borders: tableBorders,
    rows,
  });
}

function bodyRow(options: ConstructorParameters<typeof TableRow>[0]) {
  return new TableRow(options);
}

function bodyTable(
  rows: TableRow[],
  columnWidths: number[],
  indent = BODY_COLUMN_INDENT,
  tableBorders: TableBorders = noTableBorder,
  tableWidth = MAIN_BODY_TABLE_WIDTH,
) {
  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    indent: indent ? { size: indent, type: WidthType.DXA } : undefined,
    columnWidths: columnWidths.map((columnWidth) =>
      Math.round((tableWidth * columnWidth) / 100),
    ),
    layout: TableLayoutType.FIXED,
    borders: tableBorders,
    rows,
  });
}

function mergedCell(
  children: Paragraph[],
  width: number,
  merge: ConsecutiveMergeState,
) {
  return new TableCell({
    rowSpan: merge.span > 1 ? merge.span : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 45, bottom: 45, left: 90, right: 90 },
    width: {
      size: Math.round((MAIN_BODY_TABLE_WIDTH * width) / 100),
      type: WidthType.DXA,
    },
    children,
  });
}

function continuationNotice(): FileChild[] {
  return [
    exactSpacer(120),
    bodyRuleTable([
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: wordSpacing(),
        children: [run("Bersambung ke halaman berikut", { italics: true, size: 20 })],
      }),
    ]),
  ];
}

function compactCell(
  children: Paragraph[],
  width?: number,
  shaded = false,
  verticalAlign: TableVerticalAlign = VerticalAlign.TOP,
) {
  return new TableCell({
    verticalAlign,
    margins: { top: 30, bottom: 30, left: 55, right: 55 },
    shading: shaded ? { fill: APPENDIX_HEADER_FILL } : undefined,
    width: width
      ? {
          size: Math.round((APPENDIX_TABLE_WIDTH * width) / 100),
          type: WidthType.DXA,
        }
      : undefined,
    children,
  });
}

function compactSpanningCell(children: Paragraph[], span: number, shaded = false) {
  return new TableCell({
    columnSpan: span,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 30, bottom: 30, left: 55, right: 55 },
    shading: shaded ? { fill: APPENDIX_HEADER_FILL } : undefined,
    children,
  });
}

function mergedCompactCell(
  children: Paragraph[],
  width: number,
  merge: ConsecutiveMergeState,
) {
  return new TableCell({
    rowSpan: merge.span > 1 ? merge.span : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 30, bottom: 30, left: 55, right: 55 },
    width: {
      size: Math.round((APPENDIX_TABLE_WIDTH * width) / 100),
      type: WidthType.DXA,
    },
    children,
  });
}

function appendixParagraph(
  text: string,
  options: Parameters<typeof paragraph>[1] = {},
) {
  return paragraph(text, {
    ...options,
    spacingAfter: options.spacingAfter ?? 0,
    line: options.line ?? WORD_LINE_MULTIPLE_108,
  });
}

function closingParagraph(text: string, withTopBorder = true, spacingBefore = 220) {
  return new Paragraph({
    indent: { left: BODY_COLUMN_INDENT, right: BODY_COLUMN_RIGHT_INDENT },
    spacing: wordSpacing({ before: spacingBefore, after: 220 }),
    border: withTopBorder
      ? {
          top: { ...sectionTopBorder, space: 8 },
        }
      : undefined,
    children: multilineRuns(text, { size: 22 }),
  });
}

function signerNameWidthTwips(text: string, fontSize: number) {
  if (typeof document !== "undefined") {
    const context = document.createElement("canvas").getContext("2d");
    if (context) {
      context.font = `700 ${fontSize / 2}pt "Times New Roman"`;
      return Math.ceil(context.measureText(text).width * 15);
    }
  }

  return Math.ceil(text.length * fontSize * 5.5);
}

function signerParagraph(name: string, title: string) {
  const nonBreakingName = name.trim().toUpperCase().replace(/\s+/g, "\u00A0");
  const measuredText = `${name.trim().toUpperCase()} - `;
  const maximumNameWidth = MAIN_BODY_CONTENT_WIDTH - 1200;
  const naturalWidth = signerNameWidthTwips(measuredText, 22) + 20;
  const nameFontSize = naturalWidth > maximumNameWidth
    ? Math.max(8, Math.floor((22 * maximumNameWidth) / naturalWidth))
    : 22;
  const nameWidth = Math.min(
    maximumNameWidth,
    signerNameWidthTwips(measuredText, nameFontSize) + 20,
  );

  return new Paragraph({
    indent: {
      left: BODY_COLUMN_INDENT + nameWidth,
      hanging: nameWidth,
      right: BODY_COLUMN_RIGHT_INDENT,
    },
    keepLines: true,
    spacing: wordSpacing({ after: 70 }),
    children: [
      new TextRun({
        text: `${nonBreakingName}\u00A0-\u00A0`,
        bold: true,
        size: nameFontSize,
        font: "Times New Roman",
      }),
      new TextRun({
        text: breakLongWords(title, 1),
        size: 22,
        font: "Times New Roman",
      }),
    ],
  });
}

function header() {
  return new Header({
    children: [
      new Paragraph({
        spacing: wordSpacing(),
        children: [
          run("[No Memo]", { size: 22, color: "BFBFBF" }),
          new TextRun({ break: 1 }),
          run("[Tanggal Rilis]", { size: 22, color: "BFBFBF" }),
        ],
      }),
    ],
  });
}

function footer() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: wordSpacing(),
        children: [
          new TextRun({ children: [PageNumber.CURRENT], font: "Times New Roman", size: 22, color: "7F7F7F" }),
          run(" / ", { size: 22, color: "7F7F7F" }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Times New Roman", size: 22, color: "7F7F7F" }),
        ],
      }),
    ],
  });
}

function memoHeadingRecipientParagraphs(recipients: Recipient[]) {
  const useDash = recipients.length > 1;

  return recipients.flatMap((recipient) => {
    const position = useDash
      ? dashGapParagraph(recipient.position, {
          size: 22,
          indent: { left: WORD_INDENT_002_CM },
          spacingBefore: 80,
          line: WORD_LINE_MULTIPLE_115,
        })
      : memoHeadingParagraph(recipient.position, { size: 22 });
    const name = formatRecipientAttention(recipient)
      ? useDash
        ? tabAlignedParagraph(formatRecipientAttention(recipient), {
            size: 22,
            indent: { left: WORD_INDENT_002_CM },
            spacingBefore: 80,
            line: WORD_LINE_MULTIPLE_115,
          })
        : memoHeadingParagraph(formatRecipientAttention(recipient), { size: 22 })
      : null;

    return name ? [position, name] : [position];
  });
}

function ccRecipientParagraphs(recipients: Recipient[], totalRecipients = recipients.length) {
  const useDash = totalRecipients > 1;

  return recipients.flatMap((recipient) => {
    const attention = formatRecipientAttention(recipient);
    const sharedOptions = {
      size: 22,
      spacingAfter: 70,
      indent: { left: BODY_COLUMN_INDENT, right: BODY_COLUMN_RIGHT_INDENT },
    };
    const positionOptions = {
      ...sharedOptions,
      keepNext: Boolean(attention),
    };
    const position = useDash
      ? dashGapParagraph(recipient.position, positionOptions)
      : bodyColumnParagraph(recipient.position, {
          size: 22,
          spacingAfter: 70,
          keepNext: Boolean(attention),
        });
    const name = attention
      ? useDash
        ? tabAlignedParagraph(
            attention,
            sharedOptions,
          )
        : bodyColumnParagraph(attention, {
            size: 22,
            spacingAfter: 70,
          })
      : null;

    return name ? [position, name] : [position];
  });
}

function developmentTable(
  rows: Extract<PreviewBlock, { type: "development-row" }>[],
  numbered: boolean,
  indent = BODY_COLUMN_INDENT,
) {
  const columnWidths = numbered
    ? Array.from(DEVELOPMENT_COLUMN_WIDTHS)
    : Array.from(DEVELOPMENT_SINGLE_COLUMN_WIDTHS);

  return bodyTable([
    bodyRow({
      tableHeader: true,
      children: [
        ...(numbered
          ? [bodyCell([paragraph("No.", { bold: true, size: 22, align: AlignmentType.CENTER })], DEVELOPMENT_COLUMN_WIDTHS[0], true)]
          : []),
        bodyCell(
          [paragraph("Pengembangan", { bold: true, size: 22, align: AlignmentType.CENTER })],
          numbered ? DEVELOPMENT_COLUMN_WIDTHS[1] : DEVELOPMENT_SINGLE_COLUMN_WIDTHS[0],
          true,
        ),
        bodyCell(
          [paragraph("Keterangan", { bold: true, size: 22, align: AlignmentType.CENTER })],
          numbered ? DEVELOPMENT_COLUMN_WIDTHS[2] : DEVELOPMENT_SINGLE_COLUMN_WIDTHS[1],
          true,
        ),
      ],
    }),
    ...rows.map(
      (block, index) => {
        const itemMerge = consecutiveMergeState(
          rows,
          index,
          (row) => richTextToPlainText(row.row.item),
        );
        const descriptionMerge = consecutiveMergeState(
          rows,
          index,
          (row) => richTextToPlainText(row.row.description),
        );
        return (
        bodyRow({
          cantSplit: true,
          children: [
            ...(numbered
              ? [bodyCell([paragraph(String(block.index + 1), { size: 22, align: AlignmentType.CENTER })], DEVELOPMENT_COLUMN_WIDTHS[0])]
              : []),
            ...(itemMerge.hidden
              ? []
              : [
                  mergedCell(
                    richTextToDocxParagraphs(block.row.item, {
                      size: 22,
                    }),
                    numbered
                      ? DEVELOPMENT_COLUMN_WIDTHS[1]
                      : DEVELOPMENT_SINGLE_COLUMN_WIDTHS[0],
                    itemMerge,
                  ),
                ]),
            ...(descriptionMerge.hidden
              ? []
              : [
                  mergedCell(
                    richTextToDocxParagraphs(block.row.description, {
                      size: 22,
                    }),
                    numbered
                      ? DEVELOPMENT_COLUMN_WIDTHS[2]
                      : DEVELOPMENT_SINGLE_COLUMN_WIDTHS[1],
                    descriptionMerge,
                  ),
                ]),
          ],
        })
        );
      },
    ),
  ], columnWidths, indent, dataTableBorders);
}

function activityTable(
  rows: Extract<PreviewBlock, { type: "activity-row" }>[],
  numbered: boolean,
  indent = BODY_COLUMN_INDENT,
) {
  const columnWidths = numbered
    ? Array.from(ACTIVITY_NUMBERED_COLUMN_WIDTHS)
    : Array.from(ACTIVITY_COLUMN_WIDTHS);

  return bodyTable([
    bodyRow({
      tableHeader: true,
      children: [
        ...(numbered
          ? [bodyCell([paragraph("No.", { bold: true, size: 22, align: AlignmentType.CENTER })], ACTIVITY_NUMBERED_COLUMN_WIDTHS[0], true)]
          : []),
        bodyCell(
          [paragraph("Aktivitas", { bold: true, size: 22, align: AlignmentType.CENTER })],
          numbered ? ACTIVITY_NUMBERED_COLUMN_WIDTHS[1] : ACTIVITY_COLUMN_WIDTHS[0],
          true,
        ),
        bodyCell(
          [paragraph("PIC", { bold: true, size: 22, align: AlignmentType.CENTER })],
          numbered ? ACTIVITY_NUMBERED_COLUMN_WIDTHS[2] : ACTIVITY_COLUMN_WIDTHS[1],
          true,
        ),
        bodyCell(
          [paragraph("Waktu", { bold: true, size: 22, align: AlignmentType.CENTER })],
          numbered ? ACTIVITY_NUMBERED_COLUMN_WIDTHS[3] : ACTIVITY_COLUMN_WIDTHS[2],
          true,
        ),
      ],
    }),
    ...rows.map(
      (block, index) => {
        const activityMerge = consecutiveMergeState(
          rows,
          index,
          (row) => richTextToPlainText(row.row.activity),
        );
        const ownerMerge = consecutiveMergeState(rows, index, (row) => row.row.owner);
        const dateMerge = consecutiveMergeState(
          rows,
          index,
          (row) => formatDateRangeID(row.row.startDate, row.row.endDate, row.row.dates),
        );
        return (
        bodyRow({
          cantSplit: true,
          children: [
            ...(numbered
              ? [bodyCell([paragraph(String(block.index + 1), { size: 22, align: AlignmentType.CENTER })], ACTIVITY_NUMBERED_COLUMN_WIDTHS[0])]
              : []),
            ...(activityMerge.hidden
              ? []
              : [
                  mergedCell(
                    richTextToDocxParagraphs(block.row.activity, {
                      size: 22,
                    }),
                    numbered
                      ? ACTIVITY_NUMBERED_COLUMN_WIDTHS[1]
                      : ACTIVITY_COLUMN_WIDTHS[0],
                    activityMerge,
                  ),
                ]),
            ...(ownerMerge.hidden
              ? []
              : [
                  mergedCell(
                    [paragraph(block.row.owner, { size: 22, align: AlignmentType.CENTER })],
                    numbered
                      ? ACTIVITY_NUMBERED_COLUMN_WIDTHS[2]
                      : ACTIVITY_COLUMN_WIDTHS[1],
                    ownerMerge,
                  ),
                ]),
            ...(dateMerge.hidden
              ? []
              : [
                  mergedCell(
                    [
                      paragraph(
                        formatDateRangeID(block.row.startDate, block.row.endDate, block.row.dates),
                        { size: 22, align: AlignmentType.CENTER },
                      ),
                    ],
                    numbered
                      ? ACTIVITY_NUMBERED_COLUMN_WIDTHS[3]
                      : ACTIVITY_COLUMN_WIDTHS[2],
                    dateMerge,
                  ),
                ]),
          ],
        })
        );
      },
    ),
  ], columnWidths, indent, dataTableBorders);
}

function appendixTable(rows: Extract<PreviewBlock, { type: "appendix-row" }>[]) {
  const bodyRows = rows.flatMap((block, index) => {
    const startsGroup = (row: typeof block) => row.meta.showDate || row.meta.headingRows.length > 0;
    const scenarioMerge = consecutiveMergeState(
      rows,
      index,
      (row) => richTextToPlainText(row.row.scenario),
      startsGroup,
    );
    const resultMerge = consecutiveMergeState(
      rows,
      index,
      (row) => richTextToPlainText(row.row.expectedResult),
      startsGroup,
    );
    const picMerge = consecutiveMergeState(
      rows,
      index,
      (row) => row.row.pic,
      startsGroup,
    );
    const dateRows =
      block.meta.showDate
        ? [
            new TableRow({
              cantSplit: true,
              children: [compactSpanningCell([appendixParagraph(block.meta.dateLabel, { bold: true, size: 22 })], 4, true)],
            }),
          ]
        : [];
    const sectionRows = block.meta.headingRows.map((heading) =>
      new TableRow({
        cantSplit: true,
        children: [
          compactCell(
            [appendixParagraph(`${heading.label}.`, { bold: true, size: 22, align: AlignmentType.CENTER })],
            APPENDIX_COLUMN_WIDTHS[0],
            true,
          ),
          compactSpanningCell(
            [appendixParagraph(heading.title, { bold: true, size: 22 })],
            3,
            true,
          ),
        ],
      }),
    );
    return [
      ...dateRows,
      ...sectionRows,
      new TableRow({
        cantSplit: true,
        children: [
          compactCell(
            [appendixParagraph(`${block.meta.number}.`, { size: 22, align: AlignmentType.CENTER })],
            APPENDIX_COLUMN_WIDTHS[0],
            false,
            VerticalAlign.CENTER,
          ),
          ...(scenarioMerge.hidden
            ? []
            : [
                mergedCompactCell(
                  richTextToDocxParagraphs(block.row.scenario, {
                    size: 22,
                    spacingBefore: 0,
                    spacingAfter: 0,
                    line: WORD_LINE_MULTIPLE_108,
                  }),
                  APPENDIX_COLUMN_WIDTHS[1],
                  scenarioMerge,
                ),
              ]),
          ...(resultMerge.hidden
            ? []
            : [
                mergedCompactCell(
                  richTextToDocxParagraphs(block.row.expectedResult, {
                    size: 22,
                    spacingBefore: 0,
                    spacingAfter: 0,
                    line: WORD_LINE_MULTIPLE_108,
                  }),
                  APPENDIX_COLUMN_WIDTHS[2],
                  resultMerge,
                ),
              ]),
          ...(picMerge.hidden
            ? []
            : [
                mergedCompactCell(
                  [
                    appendixParagraph(block.row.pic, {
                      size: 22,
                      align: AlignmentType.CENTER,
                    }),
                  ],
                  APPENDIX_COLUMN_WIDTHS[3],
                  picMerge,
                ),
              ]),
        ],
      }),
    ];
  });

  return table([
    new TableRow({
      cantSplit: true,
      tableHeader: true,
      children: [
        compactCell([appendixParagraph("No", { bold: true, size: 22, align: AlignmentType.CENTER })], APPENDIX_COLUMN_WIDTHS[0], true),
        compactCell([appendixParagraph("Aktivitas", { bold: true, size: 22, align: AlignmentType.CENTER })], APPENDIX_COLUMN_WIDTHS[1], true),
        compactCell([appendixParagraph("Hasil/Keterangan", { bold: true, size: 22, align: AlignmentType.CENTER })], APPENDIX_COLUMN_WIDTHS[2], true),
        compactCell([appendixParagraph("PIC", { bold: true, size: 22, align: AlignmentType.CENTER })], APPENDIX_COLUMN_WIDTHS[3], true),
      ],
    }),
    ...bodyRows,
  ], APPENDIX_TABLE_WIDTH, APPENDIX_COLUMN_WIDTHS.map((columnWidth) =>
    Math.round((APPENDIX_TABLE_WIDTH * columnWidth) / 100),
  ), dataTableBorders);
}

function consumeTableRows(
  blocks: PreviewBlock[],
  start: number,
  type: "development-row" | "activity-row" | "appendix-row",
) {
  const rows: PreviewBlock[] = [];
  let index = start;

  while (blocks[index]?.type === type) {
    rows.push(blocks[index]);
    index += 1;
  }

  return { rows, nextIndex: index };
}

function isSectionBlock(block: PreviewBlock) {
  return (
    block.type === "introduction" ||
    block.type === "reference" ||
    block.type === "pilot-schedule" ||
    block.type === "access-link" ||
    block.type === "attachments" ||
    block.type === "contacts"
  );
}

function leadingSectionSpacer(sectionRule: SectionRule): FileChild[] {
  return [
    new Paragraph({
      spacing: {
        before: sectionRule === "full" ? 40 : sectionRule === "none" ? 0 : 240,
        after: 0,
        line: 1,
        lineRule: LineRuleType.EXACT,
      },
      children: [new TextRun({ text: "", size: 2 })],
    }),
  ];
}

function tableBottomSpacer() {
  return new Paragraph({
    spacing: {
      before: 120,
      after: 0,
      line: 1,
      lineRule: LineRuleType.EXACT,
    },
    children: [new TextRun({ text: "", size: 2 })],
  });
}

function blockChildren(
  draft: MemoDraft,
  block: PreviewBlock,
  sectionRule: SectionRule = "content",
  options: {
    firstBlockOnContinuation?: boolean;
    firstBlockOnPage?: boolean;
  } = {},
): FileChild[] {
  switch (block.type) {
    case "memo-heading":
      return [
        new Paragraph({
          spacing: {
            before: 120,
            after: 0,
            line: 1,
            lineRule: LineRuleType.EXACT,
          },
          children: [new TextRun({ text: "", size: 2 })],
        }),
        table([
          new TableRow({
            children: [
              new TableCell({ borders: noBorder, width: { size: pct(18), type: WidthType.PERCENTAGE }, children: [memoHeadingParagraph("Kepada", { size: 22 })] }),
              new TableCell({ borders: noBorder, width: { size: pct(3), type: WidthType.PERCENTAGE }, children: [memoHeadingParagraph(":", { size: 22 })] }),
              new TableCell({ borders: noBorder, width: { size: pct(79), type: WidthType.PERCENTAGE }, children: memoHeadingRecipientParagraphs(draft.recipients) }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ borders: noBorder, width: { size: pct(18), type: WidthType.PERCENTAGE }, children: [memoHeadingParagraph("Dari", { size: 22 })] }),
              new TableCell({ borders: noBorder, width: { size: pct(3), type: WidthType.PERCENTAGE }, children: [memoHeadingParagraph(":", { size: 22 })] }),
              new TableCell({ borders: noBorder, width: { size: pct(79), type: WidthType.PERCENTAGE }, children: [memoHeadingParagraph(`POL Application & User Acceptance Test Bureau ${draft.metadata.bureau} (UAT ${draft.metadata.bureau})`, { size: 22 })] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ borders: noBorder, width: { size: pct(18), type: WidthType.PERCENTAGE }, children: [memoHeadingParagraph("Jenis Informasi", { size: 22 })] }),
              new TableCell({ borders: noBorder, width: { size: pct(3), type: WidthType.PERCENTAGE }, children: [memoHeadingParagraph(":", { size: 22 })] }),
              new TableCell({ borders: noBorder, width: { size: pct(79), type: WidthType.PERCENTAGE }, children: [memoHeadingParagraph("INTERNAL BCA", { size: 22 })] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ borders: noBorder, width: { size: pct(18), type: WidthType.PERCENTAGE }, children: [memoHeadingParagraph("Perihal", { size: 22, font: "Arial" })] }),
              new TableCell({ borders: noBorder, width: { size: pct(3), type: WidthType.PERCENTAGE }, children: [memoHeadingParagraph(":", { size: 22, font: "Arial" })] }),
              new TableCell({ borders: noBorder, width: { size: pct(79), type: WidthType.PERCENTAGE }, children: [memoHeadingParagraph(draft.metadata.perihal, { bold: true, size: 24, font: "Arial" })] }),
            ],
          }),
        ], MAIN_PAGE_CONTENT_WIDTH, [18, 3, 79].map((columnWidth) =>
          Math.round((MAIN_PAGE_CONTENT_WIDTH * columnWidth) / 100),
        )),
      ];
    case "recipients":
      return [];
    case "introduction":
      return [
        ...leadingSectionSpacer(sectionRule),
        previewSection("Pengantar", [
          paragraph(`Sehubungan dengan akan dilakukannya ${draft.metadata.perihal}, berikut kami sampaikan informasi dan tindak lanjut yang harus dilakukan oleh Cabang dan Unit Kerja terkait.`, { size: 22 }),
        ], sectionRule),
      ];
    case "reference":
      const items = referenceItems(draft);
      return [
        ...leadingSectionSpacer(sectionRule),
        previewSection("Referensi", [
          paragraph("Memorandum ini mengacu pada.", { size: 22 }),
          ...items.map((item) => paragraph(`\u2022 ${item}`, { size: 22 })),
        ], sectionRule),
      ];
    case "pilot-schedule":
      return [
        ...leadingSectionSpacer(sectionRule),
        previewSection(scheduleTitle(draft), [
          new Paragraph({
            spacing: wordSpacing(),
            children: [
              run(`${draft.metadata.perihal} akan dilaksanakan pada tanggal `, { size: 22 }),
              run(formatDateRangeNonBreakingID(draft.pilotSchedule.startDate, draft.pilotSchedule.endDate, draft.pilotSchedule.dates), { bold: true, size: 22 }),
              run(".", { size: 22 }),
            ],
          }),
        ], sectionRule),
      ];
    case "access-link":
      return [
        ...leadingSectionSpacer(sectionRule),
        previewSection(`Akses Link ${draft.metadata.perihal}`, [
          hyperlinkAfterTextParagraph(
            `${draft.metadata.perihal} dapat diakses melalui link berikut:`,
            draft.metadata.accessLink,
            { size: 22 },
          ),
        ], sectionRule),
      ];
    case "attachments":
      const attachmentItems = memoAttachmentItems(draft.attachments);
      return [
        ...leadingSectionSpacer(sectionRule),
        previewSection(
          "Lampiran",
          attachmentItems.length === 1
            ? [
                paragraph(
                  `Bersama dengan memo ini dilampirkan ${attachmentItems[0].replace(/[.\s]+$/, "")}.`,
                  { size: 22 },
                ),
              ]
            : [
                paragraph("Bersama dengan memo ini dilampirkan:", { size: 22 }),
                ...attachmentItems.map((item) => bulletGapParagraph(item, { size: 22 })),
              ],
          sectionRule,
        ),
      ];
    case "contacts":
      const contactParagraph = draft.contacts.length === 1 ? paragraph : bulletGapParagraph;
      return [
        ...leadingSectionSpacer(sectionRule),
        previewSection("PIC yang Dapat Dihubungi", [
          paragraph(`PIC yang dapat dihubungi sehubungan dengan ${draft.metadata.perihal} adalah:`, { size: 22 }),
          ...draft.contacts.map((contact) =>
            contactParagraph(`${contact.name} – ${contact.email}`, {
              size: 22,
            }),
          ),
        ], sectionRule),
      ];
    case "signature":
      return [
        closingParagraph(
          "Demikian informasi ini kami sampaikan, atas perhatian Bapak/Ibu kami ucapkan terima kasih.",
          !options.firstBlockOnPage,
          options.firstBlockOnPage ? 0 : 220,
        ),
        ...draft.signers.map((signer) => signerParagraph(signer.name, signer.title)),
      ];
    case "cc":
      return [
        bodyColumnParagraph("Tembusan:", {
          size: 22,
          spacingBefore: options.firstBlockOnContinuation ? 0 : 220,
          spacingAfter: 70,
        }),
        ...ccRecipientParagraphs(block.recipients, block.totalRecipients),
      ];
    case "initials":
      return [bodyColumnParagraph(initialsText(draft), { size: 20, spacingBefore: 220 })];
    default:
      return [];
  }
}

function pageChildren(
  draft: MemoDraft,
  page: PreviewPage,
  options: { pageBreakBefore?: boolean } = {},
): FileChild[] {
  const children: FileChild[] = [];
  let sectionCount = 0;
  const nextSectionRule = (): SectionRule => {
    if (sectionCount === 0) {
      sectionCount += 1;
      return page.continuationTitle && page.kind === "main" ? "none" : "full";
    }

    sectionCount += 1;
    return "content";
  };

  if (page.continuationTitle) {
    if (page.kind === "main") {
      children.push(
        new Paragraph({
          pageBreakBefore: options.pageBreakBefore,
          spacing: {
            before: 0,
            after: 660,
            line: 1,
            lineRule: LineRuleType.EXACT,
          },
          children: [new TextRun({ text: "", size: 2 })],
        }),
        new Paragraph({
          spacing: wordSpacing({ before: 0, after: 80 }),
          children: [
            run("Perihal:  ", { size: 22, font: "Arial" }),
            run(draft.metadata.perihal, { bold: true, size: 24, font: "Arial" }),
            run(", Sambungan", { size: 22, font: "Arial" }),
          ],
        }),
        ...continuationRule(),
        exactSpacer(240),
      );
    } else {
      children.push(
        new Paragraph({
          pageBreakBefore: options.pageBreakBefore,
          spacing: wordSpacing({ before: 0, after: 180 }),
          children: [
            run(page.continuationTitle.replace(", Sambungan", ""), { bold: true, size: 20 }),
            run(", Sambungan", { size: 20 }),
          ],
        }),
      );
    }
  } else if (page.kind === "appendix") {
    children.push(new Paragraph({
      pageBreakBefore: options.pageBreakBefore,
      spacing: wordSpacing({ before: 0, after: 180 }),
      children: [run(page.title, { bold: true, size: 20 })],
    }));
  }

  let index = 0;
  while (index < page.blocks.length) {
    const block = page.blocks[index];

    if (block.type === "development-row") {
      const { rows, nextIndex } = consumeTableRows(page.blocks, index, "development-row");
      const developmentRows = rows as Extract<PreviewBlock, { type: "development-row" }>[];
      const sectionRule = nextSectionRule();
      const title = isTableSectionContinuation(developmentRows[0])
        ? "Lingkup Pengembangan, Sambungan"
        : "Lingkup Pengembangan";
      children.push(
        ...leadingSectionSpacer(sectionRule),
        previewSection(title, [
          paragraph(`Berikut adalah fitur pengembangan pada ${draft.metadata.projectName}:`, {
            size: 22,
            spacingAfter: 120,
          }),
        ], sectionRule),
        developmentTable(developmentRows, draft.developmentRows.length > 1),
        tableBottomSpacer(),
      );
      index = nextIndex;
      continue;
    }

    if (block.type === "activity-row") {
      const { rows, nextIndex } = consumeTableRows(page.blocks, index, "activity-row");
      const activityRows = rows as Extract<PreviewBlock, { type: "activity-row" }>[];
      const sectionRule = nextSectionRule();
      const title = isTableSectionContinuation(activityRows[0])
        ? "Aktivitas Cabang dan Unit Kerja, Sambungan"
        : "Aktivitas Cabang dan Unit Kerja";
      children.push(
        ...leadingSectionSpacer(sectionRule),
        previewSection(title, [
          paragraph(`Berikut ini adalah aktivitas yang perlu dilakukan oleh Cabang dan Unit Kerja selama ${draft.metadata.perihal}:`, {
            size: 22,
            spacingAfter: 120,
          }),
        ], sectionRule),
        activityTable(activityRows, draft.activities.length > 1),
        tableBottomSpacer(),
      );
      index = nextIndex;
      continue;
    }

    if (block.type === "appendix-row") {
      const { rows, nextIndex } = consumeTableRows(page.blocks, index, "appendix-row");
      children.push(appendixTable(rows as Extract<PreviewBlock, { type: "appendix-row" }>[]));
      index = nextIndex;
      continue;
    }

    children.push(
      ...blockChildren(draft, block, isSectionBlock(block) ? nextSectionRule() : "content", {
        firstBlockOnContinuation: Boolean(
          page.continuationTitle &&
          page.kind === "main" &&
          index === 0
        ),
        firstBlockOnPage: index === 0,
      }),
    );
    index += 1;
  }

  if (page.continues && page.kind === "main") {
    children.push(...continuationNotice());
  }

  return children;
}

function sectionProperties(orientation: PreviewOrientation) {
  const isLandscape = orientation === "landscape";
  const margins = isLandscape ? APPENDIX_PAGE_MARGINS : MAIN_PAGE_MARGINS;

  return {
    type: SectionType.NEXT_PAGE,
    page: {
      size: {
        width: A4_WIDTH_TWIPS,
        height: A4_HEIGHT_TWIPS,
        orientation:
          isLandscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
      },
      margin: { ...margins },
    },
  };
}

function buildSection(draft: MemoDraft, pages: PreviewPage[]): ISectionOptions {
  const orientation = pages[0]?.orientation ?? "portrait";
  const children = pages.flatMap((page, index) =>
    pageChildren(draft, page, { pageBreakBefore: index > 0 }),
  );

  return {
    headers: { default: header() },
    footers: { default: footer() },
    properties: sectionProperties(orientation),
    children,
  };
}

function hasExportablePageContent(page: PreviewPage) {
  return page.blocks.some((block) => block.type !== "recipients");
}

export async function generateMemoDocxBlob(draft: MemoDraft) {
  const pages = paginateMemoDraft(draft);
  const mainPages = pages.filter((page) => page.kind === "main" && hasExportablePageContent(page));
  const appendixPages = pages.filter((page) => page.kind === "appendix" && hasExportablePageContent(page));
  const validationTemplateBuffer = await fetch("/template-assets/validation-template.docx").then(
    (response) => response.arrayBuffer(),
  );

  const doc = new Document({
    title: draft.metadata.perihal,
    creator: "Memo Builder",
    description: "Generated memo document",
    styles: {
      default: {
        document: {
          run: {
            font: "Times New Roman",
            size: 22,
          },
        },
      },
    },
    sections: [
      buildSection(draft, mainPages),
      ...(appendixPages.length ? [buildSection(draft, appendixPages)] : []),
    ],
  });

  const generatedDocx = await Packer.toBlob(doc);
  return spliceValidationTemplate(generatedDocx, validationTemplateBuffer);
}

export function memoDocxFileName(draft: MemoDraft) {
  const safeProject = draft.metadata.projectName
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const prefix =
    draft.metadata.memoType === "Pilot"
      ? "Memo Pilot Implementasi"
      : "Memo Implementasi";

  return `${prefix} (${safeProject || "Draft"}).docx`;
}
