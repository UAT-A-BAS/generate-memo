import {
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  Document,
  Footer,
  Header,
  LineRuleType,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  SectionType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  Tab,
  TextRun,
  UnderlineType,
  VerticalMergeType,
  VerticalAlign,
  WidthType,
  type FileChild,
  type ISectionOptions,
} from "docx";
import type { MemoDraft, Recipient } from "@/types/memo";
import type { PreviewBlock, PreviewOrientation, PreviewPage } from "@/pagination/paginate";
import {
  APPENDIX_COLUMN_WIDTHS,
  APPENDIX_HEADER_FILL,
  BODY_COLUMN_INDENT,
  BODY_COLUMN_RIGHT_INDENT,
  CONTINUATION_RULE_INDENT,
  DEVELOPMENT_COLUMN_WIDTHS,
  TABLE_HEADER_FILL,
  WORD_INDENT_002_CM,
  WORD_LINE_MULTIPLE_108,
  WORD_LINE_MULTIPLE_115,
} from "@/documentLayout";
import { paginateMemoDraft } from "@/pagination/paginate";
import { formatDateRangeID } from "@/utils/formatDateRangeID";
import { memoAttachmentItems } from "@/utils/attachments";
import { richTextToPlainText } from "@/utils/richText";
import { richTextToDocxParagraphs } from "./richTextToDocx";
import { spliceValidationTemplate } from "./spliceValidationTemplate";

const border = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: "9CA3AF",
};

const noBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

const sectionTopBorder = {
  style: BorderStyle.SINGLE,
  size: 6,
  color: "1F2937",
};
const APPENDIX_TITLE_SPACING_BEFORE = 520;
const CONTINUATION_TITLE_SPACING_BEFORE = 520;
const LIST_TEXT_TAB = 720;

type SectionRule = "full" | "content" | "none";

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
  } = {},
) {
  return new Paragraph({
    alignment: options.align,
    indent: options.indent,
    spacing: wordSpacing({
      before: options.spacingBefore,
      after: options.spacingAfter,
      line: options.line,
    }),
    children: multilineRuns(text, options),
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

function dashTabParagraph(
  text: string,
  options: Parameters<typeof paragraph>[1] = {},
) {
  const leftIndent = options.indent?.left ?? 0;

  return new Paragraph({
    alignment: options.align,
    indent: options.indent,
    leftTabStop: leftIndent + LIST_TEXT_TAB,
    spacing: wordSpacing({
      before: options.spacingBefore,
      after: options.spacingAfter,
      line: options.line,
    }),
    children: [
      run("-", options),
      new Tab(),
      ...multilineRuns(text, options),
    ],
  });
}

function memoHeadingParagraph(text: string, options: Parameters<typeof paragraph>[1] = {}) {
  return paragraph(text, {
    ...options,
    indent: { left: WORD_INDENT_002_CM, ...options.indent },
    spacingBefore: options.spacingBefore ?? 80,
    spacingAfter: options.spacingAfter ?? 0,
    line: options.line ?? WORD_LINE_MULTIPLE_115,
  });
}

function continuationRule() {
  return new Paragraph({
    includeIfEmpty: true,
    indent: { left: CONTINUATION_RULE_INDENT, right: BODY_COLUMN_RIGHT_INDENT },
    spacing: wordSpacing({ before: 160, after: 260 }),
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 },
    },
    children: [new TextRun({ text: "" })],
  });
}

function sectionCell(children: FileChild[], width: number, withTopBorder: boolean) {
  return new TableCell({
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 140, bottom: 120, left: 0, right: 120 },
    width: { size: pct(width), type: WidthType.PERCENTAGE },
    borders: {
      top: withTopBorder ? sectionTopBorder : noBorder.top,
      bottom: noBorder.bottom,
      left: noBorder.left,
      right: noBorder.right,
    },
    children,
  });
}

function previewSection(title: string, content: FileChild[], rule: SectionRule = "content") {
  const titleHasRule = rule === "full";
  const contentHasRule = rule !== "none";

  return table([
    new TableRow({
      children: [
        sectionCell([paragraph(title, { bold: true, size: 20 })], 22, titleHasRule),
        sectionCell(content, 78, contentHasRule),
      ],
    }),
  ], 100, [22, 78]);
}

function cell(children: Paragraph[], width?: number, shaded = false) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 90, bottom: 90, left: 90, right: 90 },
    shading: shaded ? { fill: TABLE_HEADER_FILL } : undefined,
    width: width ? { size: pct(width), type: WidthType.PERCENTAGE } : undefined,
    borders: { top: border, bottom: border, left: border, right: border },
    children,
  });
}

function table(rows: TableRow[], width = 100, columnWidths?: number[]) {
  return new Table({
    width: { size: pct(width), type: WidthType.PERCENTAGE },
    columnWidths: columnWidths?.map((columnWidth) => columnWidth * 100),
    layout: TableLayoutType.FIXED,
    rows,
  });
}

function continuationNotice() {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    indent: { left: CONTINUATION_RULE_INDENT, right: BODY_COLUMN_RIGHT_INDENT },
    spacing: wordSpacing({ before: 140 }),
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 },
    },
    children: [run("Bersambung ke halaman berikutnya", { italics: true, size: 20 })],
  });
}

function compactCell(children: Paragraph[], width?: number, shaded = false) {
  return new TableCell({
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 35, bottom: 35, left: 55, right: 55 },
    shading: shaded ? { fill: APPENDIX_HEADER_FILL } : undefined,
    width: width ? { size: pct(width), type: WidthType.PERCENTAGE } : undefined,
    borders: { top: border, bottom: border, left: border, right: border },
    children,
  });
}

function compactSpanningCell(children: Paragraph[], span: number, shaded = false) {
  return new TableCell({
    columnSpan: span,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 35, bottom: 35, left: 55, right: 55 },
    shading: shaded ? { fill: APPENDIX_HEADER_FILL } : undefined,
    borders: { top: border, bottom: border, left: border, right: border },
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

function appendixRichParagraphs(doc: Parameters<typeof richTextToDocxParagraphs>[0]) {
  return richTextToDocxParagraphs(doc, { size: 22, spacingBefore: 0, spacingAfter: 0, line: WORD_LINE_MULTIPLE_108 });
}

function closingParagraph(text: string, withTopBorder = true) {
  return new Paragraph({
    indent: { left: BODY_COLUMN_INDENT, right: BODY_COLUMN_RIGHT_INDENT },
    spacing: wordSpacing({ before: withTopBorder ? 140 : 0 }),
    border: withTopBorder
      ? {
          top: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 8 },
        }
      : undefined,
    children: multilineRuns(text, { size: 22 }),
  });
}

function mergeKey(value: string) {
  return value.trim().replace(/\s+/g, " ");
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

function recipientsText(recipients: Recipient[], options: { dashSingle?: boolean } = {}) {
  const useDash = options.dashSingle || recipients.length > 1;
  return recipients.flatMap((recipient) => {
    const name = recipient.name?.trim()
      ? [`  U.p. Yth. ${recipient.gender} ${recipient.name}`]
      : [];
    return [`${useDash ? "- " : ""}${recipient.position}`, ...name];
  });
}

function developmentTable(rows: Extract<PreviewBlock, { type: "development-row" }>[]) {
  return table([
    new TableRow({
      tableHeader: true,
      children: [
        cell([paragraph("No.", { bold: true, size: 22, align: AlignmentType.CENTER })], DEVELOPMENT_COLUMN_WIDTHS[0], true),
        cell([paragraph("Pengembangan", { bold: true, size: 22, align: AlignmentType.CENTER })], DEVELOPMENT_COLUMN_WIDTHS[1], true),
        cell([paragraph("Keterangan", { bold: true, size: 22, align: AlignmentType.CENTER })], DEVELOPMENT_COLUMN_WIDTHS[2], true),
      ],
    }),
    ...rows.map(
      (block) =>
        new TableRow({
          children: [
            cell([paragraph(String(block.index + 1), { size: 22, align: AlignmentType.CENTER })], DEVELOPMENT_COLUMN_WIDTHS[0]),
            cell(richTextToDocxParagraphs(block.row.item, { size: 22 }), DEVELOPMENT_COLUMN_WIDTHS[1]),
            cell(richTextToDocxParagraphs(block.row.description, { size: 22 }), DEVELOPMENT_COLUMN_WIDTHS[2]),
          ],
        }),
    ),
  ], 100, Array.from(DEVELOPMENT_COLUMN_WIDTHS));
}

function activityTable(rows: Extract<PreviewBlock, { type: "activity-row" }>[]) {
  return table([
    new TableRow({
      tableHeader: true,
      children: [
        cell([paragraph("Aktivitas", { bold: true, size: 22, align: AlignmentType.CENTER })], 56, true),
        cell([paragraph("PIC", { bold: true, size: 22, align: AlignmentType.CENTER })], 22, true),
        cell([paragraph("Waktu", { bold: true, size: 22, align: AlignmentType.CENTER })], 22, true),
      ],
    }),
    ...rows.map(
      (block) =>
        new TableRow({
          children: [
            cell(richTextToDocxParagraphs(block.row.activity, { size: 22 }), 56),
            cell([paragraph(block.row.owner, { size: 22, align: AlignmentType.CENTER })], 22),
            cell(
              [paragraph(formatDateRangeID(block.row.startDate, block.row.endDate), { size: 22, align: AlignmentType.CENTER })],
              22,
            ),
          ],
        }),
    ),
  ], 100, [56, 22, 22]);
}

function appendixTable(rows: Extract<PreviewBlock, { type: "appendix-row" }>[]) {
  function picMergeState(index: number) {
    const current = rows[index];
    const currentPic = mergeKey(current.row.pic);
    if (!currentPic) return { hidden: false, restart: false };
    if (
      index > 0 &&
      !current.meta.showDate &&
      !current.meta.showSection &&
      mergeKey(rows[index - 1].row.pic) === currentPic
    ) {
      return { hidden: true, restart: false };
    }

    let restart = false;
    for (let cursor = index + 1; cursor < rows.length; cursor += 1) {
      const next = rows[cursor];
      if (next.meta.showDate || next.meta.showSection) break;
      if (mergeKey(next.row.pic) === currentPic) {
        restart = true;
        break;
      }
    }
    return { hidden: false, restart };
  }

  const bodyRows = rows.flatMap((block, index) => {
    const dateRows =
      block.meta.showDate
        ? [
            new TableRow({
              cantSplit: true,
              children: [compactSpanningCell([appendixParagraph(block.meta.dateLabel, { bold: true, size: 22 })], 4, true)],
            }),
          ]
        : [];
    const sectionRows =
      block.meta.showSection
        ? [
            new TableRow({
              cantSplit: true,
              children: [
                compactCell(
                  [appendixParagraph(`${block.meta.sectionLetter}.`, { bold: true, size: 22, align: AlignmentType.CENTER })],
                  APPENDIX_COLUMN_WIDTHS[0],
                  true,
                ),
                new TableCell({
                  columnSpan: 3,
                  verticalAlign: VerticalAlign.CENTER,
                  margins: { top: 35, bottom: 35, left: 55, right: 55 },
                  shading: { fill: APPENDIX_HEADER_FILL },
                  width: { size: pct(95), type: WidthType.PERCENTAGE },
                  borders: { top: border, bottom: border, left: border, right: border },
                  children: [appendixParagraph(block.meta.sectionTitle, { bold: true, size: 22 })],
                }),
              ],
            }),
          ]
        : [];
    const picMerge = picMergeState(index);
    const picCell = picMerge.hidden
      ? new TableCell({
          verticalMerge: VerticalMergeType.CONTINUE,
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 35, bottom: 35, left: 55, right: 55 },
          borders: { top: border, bottom: border, left: border, right: border },
          children: [appendixParagraph("", { size: 22 })],
        })
      : new TableCell({
          verticalMerge: picMerge.restart ? VerticalMergeType.RESTART : undefined,
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 35, bottom: 35, left: 55, right: 55 },
          width: { size: pct(APPENDIX_COLUMN_WIDTHS[3]), type: WidthType.PERCENTAGE },
          borders: { top: border, bottom: border, left: border, right: border },
          children: [appendixParagraph(block.row.pic, { size: 22, align: AlignmentType.CENTER })],
        });

    return [
      ...dateRows,
      ...sectionRows,
      new TableRow({
        children: [
          compactCell([appendixParagraph(`${block.meta.number}.`, { size: 22, align: AlignmentType.CENTER })], APPENDIX_COLUMN_WIDTHS[0]),
          compactCell(appendixRichParagraphs(block.row.scenario), APPENDIX_COLUMN_WIDTHS[1]),
          compactCell(appendixRichParagraphs(block.row.expectedResult), APPENDIX_COLUMN_WIDTHS[2]),
          picCell,
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
  ], 100, Array.from(APPENDIX_COLUMN_WIDTHS));
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
  if (sectionRule !== "full") return [];

  return [
    new Paragraph({
      spacing: wordSpacing({ before: 80, after: 0 }),
      children: [new TextRun({ text: "" })],
    }),
  ];
}

function blockChildren(
  draft: MemoDraft,
  block: PreviewBlock,
  sectionRule: SectionRule = "content",
  options: { continuationMainPage?: boolean } = {},
): FileChild[] {
  switch (block.type) {
    case "memo-heading":
      return [
        new Paragraph({ spacing: wordSpacing({ before: 320 }) }),
        table([
          new TableRow({
            children: [
              new TableCell({ borders: noBorder, width: { size: pct(18), type: WidthType.PERCENTAGE }, children: [memoHeadingParagraph("Kepada", { size: 22 })] }),
              new TableCell({ borders: noBorder, width: { size: pct(3), type: WidthType.PERCENTAGE }, children: [memoHeadingParagraph(":", { size: 22 })] }),
              new TableCell({ borders: noBorder, width: { size: pct(79), type: WidthType.PERCENTAGE }, children: recipientsText(draft.recipients).map((item) => memoHeadingParagraph(item, { size: 22 })) }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ borders: noBorder, width: { size: pct(18), type: WidthType.PERCENTAGE }, children: [memoHeadingParagraph("Dari", { size: 22 })] }),
              new TableCell({ borders: noBorder, width: { size: pct(3), type: WidthType.PERCENTAGE }, children: [memoHeadingParagraph(":", { size: 22 })] }),
              new TableCell({ borders: noBorder, width: { size: pct(79), type: WidthType.PERCENTAGE }, children: [memoHeadingParagraph(`POL Application & User Acceptance Test Bureau ${draft.metadata.bureau}`, { size: 22 })] }),
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
        ], 100, [18, 3, 79]),
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
              run(formatDateRangeID(draft.pilotSchedule.startDate, draft.pilotSchedule.endDate), { bold: true, size: 22 }),
              run(".", { size: 22 }),
            ],
          }),
        ], sectionRule),
      ];
    case "access-link":
      return [
        ...leadingSectionSpacer(sectionRule),
        previewSection(`Akses Link ${draft.metadata.perihal}`, [
          paragraph(`${draft.metadata.perihal} dapat diakses melalui link berikut:`, { size: 22 }),
          paragraph(draft.metadata.accessLink || "-", { size: 22 }),
        ], sectionRule),
      ];
    case "attachments":
      return [
        ...leadingSectionSpacer(sectionRule),
        previewSection("Lampiran", [
          paragraph("Bersama dengan memo ini dilampirkan:", { size: 22 }),
          ...memoAttachmentItems(draft.attachments).map((item) =>
            dashTabParagraph(item, { size: 22 }),
          ),
        ], sectionRule),
      ];
    case "contacts":
      return [
        ...leadingSectionSpacer(sectionRule),
        previewSection("PIC yang Dapat Dihubungi", [
          paragraph(`PIC yang dapat dihubungi sehubungan dengan ${draft.metadata.perihal} adalah:`, { size: 22 }),
          ...draft.contacts.map((contact) =>
            dashTabParagraph(`${contact.name} - ${contact.email}`, {
              size: 22,
            }),
          ),
        ], sectionRule),
      ];
    case "signature":
      return [
        closingParagraph(
          "Demikian informasi ini kami sampaikan, atas perhatian Bapak/Ibu kami ucapkan terima kasih.",
          !options.continuationMainPage,
        ),
        ...draft.signers.map((signer) =>
          new Paragraph({
            indent: { left: BODY_COLUMN_INDENT, right: BODY_COLUMN_RIGHT_INDENT },
            spacing: wordSpacing({ after: 70 }),
            children: [
              run(signer.name.toUpperCase(), { bold: true, size: 22 }),
              run(` - ${signer.title}`, { size: 22 }),
            ],
          }),
        ),
      ];
    case "cc":
      return [
        bodyColumnParagraph("Tembusan:", { size: 22, spacingBefore: 260, spacingAfter: 70 }),
        ...recipientsText(draft.ccRecipients, { dashSingle: true }).map((item) =>
          item.startsWith("- ")
            ? dashTabParagraph(item.slice(2), {
                size: 22,
                spacingAfter: 70,
                indent: { left: BODY_COLUMN_INDENT, right: BODY_COLUMN_RIGHT_INDENT },
              })
            : bodyColumnParagraph(item.trimStart(), {
                size: 22,
                spacingAfter: 70,
                indent: { left: BODY_COLUMN_INDENT + LIST_TEXT_TAB, right: BODY_COLUMN_RIGHT_INDENT },
              }),
        ),
      ];
    case "initials":
      return [bodyColumnParagraph(initialsText(draft), { size: 20, spacingBefore: 260 })];
    default:
      return [];
  }
}

function pageChildren(draft: MemoDraft, page: PreviewPage): FileChild[] {
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
          spacing: wordSpacing({ before: CONTINUATION_TITLE_SPACING_BEFORE, after: 80 }),
          children: [
            run("Perihal:  ", { size: 22, font: "Arial" }),
            run(draft.metadata.perihal, { bold: true, size: 24, font: "Arial" }),
            run(", Sambungan", { size: 22, font: "Arial" }),
          ],
        }),
        continuationRule(),
      );
    } else {
      children.push(
        new Paragraph({
          spacing: wordSpacing({ before: 360, after: 180 }),
          children: [
            run(page.continuationTitle.replace(", Sambungan", ""), { bold: true, size: 22 }),
            run(", Sambungan", { size: 22 }),
          ],
        }),
      );
    }
  } else if (page.kind === "appendix") {
    children.push(new Paragraph({
      spacing: wordSpacing({ before: APPENDIX_TITLE_SPACING_BEFORE, after: 180 }),
      children: [run(page.title, { bold: true, size: 22 })],
    }));
  }

  let index = 0;
  while (index < page.blocks.length) {
    const block = page.blocks[index];

    if (block.type === "development-row") {
      const { rows, nextIndex } = consumeTableRows(page.blocks, index, "development-row");
      const sectionRule = nextSectionRule();
      children.push(
        ...leadingSectionSpacer(sectionRule),
        previewSection("Lingkup Pengembangan", [
          paragraph(`Berikut adalah fitur pengembangan pada ${draft.metadata.perihal}:`, { size: 22 }),
          developmentTable(rows as Extract<PreviewBlock, { type: "development-row" }>[]),
        ], sectionRule),
      );
      index = nextIndex;
      continue;
    }

    if (block.type === "activity-row") {
      const { rows, nextIndex } = consumeTableRows(page.blocks, index, "activity-row");
      const sectionRule = nextSectionRule();
      children.push(
        ...leadingSectionSpacer(sectionRule),
        previewSection("Aktivitas Cabang dan Unit Kerja", [
          paragraph(`Berikut ini adalah aktivitas yang perlu dilakukan oleh Cabang dan Unit Kerja selama ${draft.metadata.perihal}:`, { size: 22 }),
          activityTable(rows as Extract<PreviewBlock, { type: "activity-row" }>[]),
        ], sectionRule),
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
        continuationMainPage: Boolean(page.continuationTitle && page.kind === "main"),
      }),
    );
    index += 1;
  }

  if (page.continues && page.kind === "main") {
    children.push(continuationNotice());
  }

  return children;
}

function sectionProperties(orientation: PreviewOrientation) {
  return {
    type: SectionType.NEXT_PAGE,
    page: {
      size: {
        orientation:
          orientation === "landscape" ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
      },
      margin: {
        top: convertInchesToTwip(0.65),
        right: convertInchesToTwip(0.65),
        bottom: convertInchesToTwip(0.65),
        left: convertInchesToTwip(0.75),
        header: convertInchesToTwip(0.28),
        footer: convertInchesToTwip(0.28),
      },
    },
  };
}

function buildSection(draft: MemoDraft, pages: PreviewPage[]): ISectionOptions {
  const orientation = pages[0]?.orientation ?? "portrait";
  const children = pages.flatMap((page, index) => {
    const pageContent = pageChildren(draft, page);
    return index < pages.length - 1
      ? [...pageContent, new Paragraph({ spacing: wordSpacing(), children: [new PageBreak()] })]
      : pageContent;
  });

  return {
    headers: { default: header() },
    footers: { default: footer() },
    properties: sectionProperties(orientation),
    children,
  };
}

export async function generateMemoDocxBlob(draft: MemoDraft) {
  const pages = paginateMemoDraft(draft);
  const mainPages = pages.filter((page) => page.kind === "main");
  const appendixPages = pages.filter((page) => page.kind === "appendix");
  const validationTemplateBuffer = await fetch("/template-assets/validation-template.docx").then(
    (response) => response.arrayBuffer(),
  );

  const doc = new Document({
    title: draft.metadata.perihal,
    creator: "Memo Builder",
    description: "Generated memo document",
    sections: [
      buildSection(draft, mainPages),
      buildSection(draft, appendixPages),
    ],
  });

  const generatedDocx = await Packer.toBlob(doc);
  return spliceValidationTemplate(generatedDocx, validationTemplateBuffer);
}

export function memoDocxFileName(draft: MemoDraft) {
  const safeProject = draft.metadata.projectName
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const prefix =
    draft.metadata.memoType === "Pilot"
      ? "Memo Pilot Implementasi"
      : "Memo Implementasi";

  return `${prefix} (${safeProject || "Draft"}).docx`;
}
