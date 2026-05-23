import {
  AlignmentType,
  BorderStyle,
  Bookmark,
  convertInchesToTwip,
  Document,
  Footer,
  Header,
  HorizontalPositionRelativeFrom,
  ImageRun,
  InternalHyperlink,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  SectionType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  TextWrappingType,
  UnderlineType,
  VerticalPositionRelativeFrom,
  VerticalAlign,
  WidthType,
  type FileChild,
  type ISectionOptions,
} from "docx";
import type { MemoDraft, Recipient } from "@/types/memo";
import type { PreviewBlock, PreviewOrientation, PreviewPage } from "@/pagination/paginate";
import { paginateMemoDraft } from "@/pagination/paginate";
import { formatDateRangeID } from "@/utils/formatDateRangeID";
import { richTextToPlainText } from "@/utils/richText";
import { richTextToDocxParagraphs } from "./richTextToDocx";

const VALIDATION_BOOKMARK = "Validasi_Dokumen";

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

function breakLongWords(text: string, chunkSize = 28) {
  return text.replace(/\S{29,}/g, (word) => {
    const parts = word.match(new RegExp(`.{1,${chunkSize}}`, "g"));
    return parts?.join("\u200B") ?? word;
  });
}

function pct(value: number) {
  return value * 50;
}

function scheduleTitle(draft: MemoDraft) {
  return draft.metadata.memoType === "Pilot" ? "Jadwal Pilot Implementasi" : "Jadwal Implementasi";
}

function initialsText(draft: MemoDraft) {
  const suffix = `/uat-${draft.initialsBureau.toLowerCase()}`;
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
  } = {},
) {
  return new Paragraph({
    alignment: options.align,
    spacing: { after: 100, line: 260 },
    children: [run(text, options)],
  });
}

function sectionCell(children: FileChild[], width: number) {
  return new TableCell({
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 140, bottom: 120, left: 0, right: 120 },
    width: { size: pct(width), type: WidthType.PERCENTAGE },
    borders: {
      top: sectionTopBorder,
      bottom: noBorder.bottom,
      left: noBorder.left,
      right: noBorder.right,
    },
    children,
  });
}

function previewSection(title: string, content: FileChild[]) {
  return table([
    new TableRow({
      children: [
        sectionCell([paragraph(title, { bold: true, size: 20 })], 22),
        sectionCell(content, 78),
      ],
    }),
  ]);
}

function cell(children: Paragraph[], width?: number, shaded = false) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 90, bottom: 90, left: 90, right: 90 },
    shading: shaded ? { fill: "F3F4F6" } : undefined,
    width: width ? { size: pct(width), type: WidthType.PERCENTAGE } : undefined,
    borders: { top: border, bottom: border, left: border, right: border },
    children,
  });
}

function spanningCell(children: Paragraph[], span: number, shaded = false) {
  return new TableCell({
    columnSpan: span,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 70, bottom: 70, left: 90, right: 90 },
    shading: shaded ? { fill: "D9D9D9" } : undefined,
    borders: { top: border, bottom: border, left: border, right: border },
    children,
  });
}

function validationCell(children: Paragraph[], width?: number) {
  return new TableCell({
    margins: { top: 45, bottom: 45, left: 90, right: 90 },
    shading: { fill: "F0F0F0" },
    width: width ? { size: pct(width), type: WidthType.PERCENTAGE } : undefined,
    borders: noBorder,
    children,
  });
}

function table(rows: TableRow[], width = 100) {
  return new Table({
    width: { size: pct(width), type: WidthType.PERCENTAGE },
    rows,
  });
}

function validationWatermark(watermarkData: Uint8Array) {
  return new Paragraph({
    children: [
      new ImageRun({
        type: "png",
        data: watermarkData,
        transformation: {
          width: 700,
          height: 990,
        },
        floating: {
          behindDocument: true,
          allowOverlap: true,
          horizontalPosition: {
            relative: HorizontalPositionRelativeFrom.PAGE,
            offset: 1280000,
          },
          verticalPosition: {
            relative: VerticalPositionRelativeFrom.PAGE,
            offset: 2050000,
          },
          wrap: {
            type: TextWrappingType.NONE,
          },
        },
      }),
    ],
  });
}

function header() {
  return new Header({
    children: [
      new Paragraph({
        children: [
          new InternalHyperlink({
            anchor: VALIDATION_BOOKMARK,
            children: [run("[No Memo]", { size: 22, color: "BFBFBF" })],
          }),
          new TextRun({ break: 1 }),
          new InternalHyperlink({
            anchor: VALIDATION_BOOKMARK,
            children: [run("[Tanggal Rilis]", { size: 22, color: "BFBFBF" })],
          }),
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
        children: [
          new InternalHyperlink({
            anchor: VALIDATION_BOOKMARK,
            children: [
              new TextRun({ children: [PageNumber.CURRENT], font: "Times New Roman", size: 22, color: "7F7F7F" }),
              run(" / ", { size: 22, color: "7F7F7F" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Times New Roman", size: 22, color: "7F7F7F" }),
            ],
          }),
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
        cell([paragraph("No.", { bold: true, size: 22 })], 8, true),
        cell([paragraph("Pengembangan", { bold: true, size: 22 })], 46, true),
        cell([paragraph("Keterangan", { bold: true, size: 22 })], 46, true),
      ],
    }),
    ...rows.map(
      (block) =>
        new TableRow({
          children: [
            cell([paragraph(String(block.index + 1), { size: 22 })], 8),
            cell(richTextToDocxParagraphs(block.row.item, { size: 22 }), 46),
            cell(richTextToDocxParagraphs(block.row.description, { size: 22 }), 46),
          ],
        }),
    ),
  ]);
}

function activityTable(rows: Extract<PreviewBlock, { type: "activity-row" }>[]) {
  return table([
    new TableRow({
      tableHeader: true,
      children: [
        cell([paragraph("Aktivitas", { bold: true, size: 22 })], 56, true),
        cell([paragraph("PIC", { bold: true, size: 22 })], 22, true),
        cell([paragraph("Waktu", { bold: true, size: 22 })], 22, true),
      ],
    }),
    ...rows.map(
      (block) =>
        new TableRow({
          children: [
            cell(richTextToDocxParagraphs(block.row.activity, { size: 22 }), 56),
            cell([paragraph(block.row.owner, { size: 22 })], 22),
            cell(
              [paragraph(formatDateRangeID(block.row.startDate, block.row.endDate), { size: 22 })],
              22,
            ),
          ],
        }),
    ),
  ]);
}

function appendixTable(rows: Extract<PreviewBlock, { type: "appendix-row" }>[]) {
  const bodyRows = rows.flatMap((block, index) => {
    const dateLabel = formatDateRangeID(block.row.startDate, block.row.endDate);
    const previous = rows[index - 1];
    const previousDate = previous ? formatDateRangeID(previous.row.startDate, previous.row.endDate) : "";
    const dateRows =
      dateLabel !== "-" && dateLabel !== previousDate
        ? [
            new TableRow({
              children: [spanningCell([paragraph(dateLabel, { bold: true, size: 17 })], 4, true)],
            }),
          ]
        : [];

    return [
      ...dateRows,
      new TableRow({
        children: [
          cell([paragraph(`${block.index + 1}.`, { size: 17 })], 6),
          cell([
            paragraph(block.row.section, { bold: true, size: 22 }),
            ...richTextToDocxParagraphs(block.row.scenario, { size: 22 }),
          ], 43),
          cell(richTextToDocxParagraphs(block.row.expectedResult, { size: 22 }), 36),
          cell([paragraph(block.row.pic, { size: 22 })], 15),
        ],
      }),
    ];
  });

  return table([
    new TableRow({
      tableHeader: true,
      children: [
        cell([paragraph("No", { bold: true, size: 17 })], 6, true),
        cell([paragraph("Aktivitas", { bold: true, size: 17 })], 43, true),
        cell([paragraph("Hasil/Keterangan", { bold: true, size: 17 })], 36, true),
        cell([paragraph("PIC", { bold: true, size: 17 })], 15, true),
      ],
    }),
    ...bodyRows,
  ]);
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

function blockChildren(draft: MemoDraft, block: PreviewBlock, watermarkData: Uint8Array): FileChild[] {
  switch (block.type) {
    case "memo-heading":
      return [
        new Paragraph({ spacing: { before: 560 } }),
        table([
          new TableRow({
            children: [
              new TableCell({ borders: noBorder, width: { size: pct(18), type: WidthType.PERCENTAGE }, children: [paragraph("Kepada", { size: 22 })] }),
              new TableCell({ borders: noBorder, width: { size: pct(3), type: WidthType.PERCENTAGE }, children: [paragraph(":", { size: 22 })] }),
              new TableCell({ borders: noBorder, width: { size: pct(79), type: WidthType.PERCENTAGE }, children: recipientsText(draft.recipients).map((item) => paragraph(item, { size: 22 })) }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ borders: noBorder, children: [paragraph("Dari", { size: 22 })] }),
              new TableCell({ borders: noBorder, children: [paragraph(":", { size: 22 })] }),
              new TableCell({ borders: noBorder, children: [paragraph(`POL Application & User Acceptance Test Bureau ${draft.metadata.bureau}`, { size: 22 })] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ borders: noBorder, children: [paragraph("Jenis Informasi", { size: 22 })] }),
              new TableCell({ borders: noBorder, children: [paragraph(":", { size: 22 })] }),
              new TableCell({ borders: noBorder, children: [paragraph("INTERNAL BCA", { size: 22 })] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ borders: noBorder, children: [paragraph("Perihal", { size: 22, font: "Arial" })] }),
              new TableCell({ borders: noBorder, children: [paragraph(":", { size: 22, font: "Arial" })] }),
              new TableCell({ borders: noBorder, children: [paragraph(draft.metadata.perihal, { bold: true, size: 24, font: "Arial" })] }),
            ],
          }),
        ]),
      ];
    case "recipients":
      return [];
    case "introduction":
      return [
        previewSection("Pengantar", [
          paragraph(`Sehubungan dengan akan dilakukannya ${draft.metadata.perihal}, berikut kami sampaikan informasi dan tindak lanjut yang harus dilakukan oleh Cabang dan Unit Kerja terkait.`, { size: 22 }),
        ]),
      ];
    case "reference":
      const items = referenceItems(draft);
      return [
        previewSection("Referensi", [
          paragraph("Memorandum ini mengacu pada.", { size: 22 }),
          ...items.map((item) => paragraph(`\u2022 ${item}`, { size: 22 })),
        ]),
      ];
    case "pilot-schedule":
      return [
        previewSection(scheduleTitle(draft), [
          new Paragraph({
            spacing: { after: 100, line: 260 },
            children: [
              run(`${draft.metadata.perihal} akan dilaksanakan pada tanggal `, { size: 22 }),
              run(formatDateRangeID(draft.pilotSchedule.startDate, draft.pilotSchedule.endDate), { bold: true, size: 22 }),
              run(".", { size: 22 }),
            ],
          }),
        ]),
      ];
    case "access-link":
      return [
        previewSection(`Akses Link ${draft.metadata.perihal}`, [
          paragraph(`${draft.metadata.perihal} dapat diakses melalui link berikut:`, { size: 22 }),
          paragraph(draft.metadata.accessLink || "-", { size: 22 }),
        ]),
      ];
    case "contacts":
      return [
        previewSection("PIC yang Dapat Dihubungi", [
          paragraph(`PIC yang dapat dihubungi sehubungan dengan ${draft.metadata.perihal} adalah:`, { size: 22 }),
          ...draft.contacts.map((contact) => paragraph(`- ${contact.name} - ${contact.email}`, { size: 22 })),
        ]),
      ];
    case "signature":
      return [
        paragraph("Demikian informasi ini kami sampaikan, atas perhatian Bapak/Ibu kami ucapkan terima kasih.", { size: 22 }),
        ...draft.signers.map((signer) =>
          new Paragraph({
            spacing: { after: 70, line: 260 },
            children: [
              run(signer.name.toUpperCase(), { bold: true, size: 22 }),
              run(` - ${signer.title}`, { size: 22 }),
            ],
          }),
        ),
      ];
    case "cc":
      return [
        paragraph("Tembusan:", { size: 22 }),
        ...recipientsText(draft.ccRecipients, { dashSingle: true }).map((item) => paragraph(item, { size: 22 })),
      ];
    case "initials":
      return [paragraph(initialsText(draft), { size: 20 })];
    case "validation":
      return [
        validationWatermark(watermarkData),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 520, after: 60 },
          children: [run("INTERNAL BCA/RAHASIA/SANGAT RAHASIA", { size: 18 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 20 },
          children: [
            new Bookmark({
              id: VALIDATION_BOOKMARK,
              children: [run("Validasi Dokumen", { bold: true, size: 36, color: "1F4E79" })],
            }),
          ],
        }),
        paragraph("Dibuat oleh Document Approval", { align: AlignmentType.CENTER, size: 20 }),
        table([
          new TableRow({
            children: [
              validationCell([paragraph("Nomor Dokumen", { size: 18, color: "003B7A" })], 28),
              validationCell([paragraph(":", { size: 18, color: "003B7A" })], 3),
              validationCell([paragraph("[No Memo]", { size: 18, color: "003B7A" })], 69),
            ],
          }),
          new TableRow({
            children: [
              validationCell([paragraph("Tanggal Rilis Dokumen", { size: 18, color: "003B7A" })], 28),
              validationCell([paragraph(":", { size: 18, color: "003B7A" })], 3),
              validationCell([paragraph("[Tanggal Rilis]", { size: 18, color: "003B7A" })], 69),
            ],
          }),
          new TableRow({
            children: [
              validationCell([paragraph("Jumlah Lembar Dokumen", { size: 18, color: "003B7A" })], 28),
              validationCell([paragraph(":", { size: 18, color: "003B7A" })], 3),
              validationCell([paragraph("[Total Lembar]", { size: 18, color: "003B7A" })], 69),
            ],
          }),
        ], 88),
        paragraph("Document Approval History of", { size: 22 }),
        paragraph(`[${draft.metadata.perihal}]`, { bold: true, size: 22 }),
        paragraph("[Request Log]", { size: 19 }),
        paragraph("[Approval Log]", { size: 19 }),
        paragraph("[Release Log]", { size: 19 }),
        paragraph("Disclaimer:", { italics: true, size: 19 }),
        paragraph("Validasi dokumen ini dibuat oleh sistem dan didokumentasi secara otomatis di myBCA Portal yang dapat diverifikasi pada link berikut:", { italics: true, size: 19 }),
        paragraph("https://verifikasi.bca.co.id/document/view/", { underline: true, color: "0563C1", size: 19 }),
        paragraph("Document Details", { size: 22 }),
        table([
          new TableRow({ children: [new TableCell({ borders: noBorder, children: [paragraph("Ditujukan Kepada", { size: 18 })] }), new TableCell({ borders: noBorder, children: [paragraph(":", { size: 18 })] }), new TableCell({ borders: noBorder, children: [paragraph("[Kepada]", { size: 18 })] })] }),
          new TableRow({ children: [new TableCell({ borders: noBorder, children: [paragraph("Divisi/Biro/Cabang Tujuan", { size: 18 })] }), new TableCell({ borders: noBorder, children: [paragraph(":", { size: 18 })] }), new TableCell({ borders: noBorder, children: [paragraph("[Divisi]", { size: 18 })] })] }),
          new TableRow({ children: [new TableCell({ borders: noBorder, children: [paragraph("Tembusan", { size: 18 })] }), new TableCell({ borders: noBorder, children: [paragraph(":", { size: 18 })] }), new TableCell({ borders: noBorder, children: [paragraph("[Tembusan]", { size: 18 })] })] }),
          new TableRow({ children: [new TableCell({ borders: noBorder, children: [paragraph("Unit Pembuat", { size: 18 })] }), new TableCell({ borders: noBorder, children: [paragraph(":", { size: 18 })] }), new TableCell({ borders: noBorder, children: [paragraph("[Unit Pembuat]", { size: 18 })] })] }),
        ], 70),
      ];
    default:
      return [];
  }
}

function pageChildren(draft: MemoDraft, page: PreviewPage, watermarkData: Uint8Array): FileChild[] {
  const children: FileChild[] = [];

  if (page.continuationTitle) {
    if (page.kind === "main") {
      children.push(
        new Paragraph({
          spacing: { before: 220, after: 180 },
          children: [
            run("Perihal: ", { size: 22, font: "Arial" }),
            run(draft.metadata.perihal, { bold: true, size: 24, font: "Arial" }),
            run(", Sambungan", { size: 22, font: "Arial" }),
          ],
        }),
      );
    } else {
      children.push(
        new Paragraph({
          spacing: { before: 360, after: 180 },
          children: [
            run(page.continuationTitle.replace(", Sambungan", ""), { bold: true, size: 20 }),
            run(", Sambungan", { size: 20 }),
          ],
        }),
      );
    }
  } else if (page.kind === "appendix") {
    children.push(new Paragraph({
      spacing: { before: 360, after: 180 },
      children: [run(page.title, { bold: true, size: 20 })],
    }));
  }

  let index = 0;
  while (index < page.blocks.length) {
    const block = page.blocks[index];

    if (block.type === "development-row") {
      const { rows, nextIndex } = consumeTableRows(page.blocks, index, "development-row");
      children.push(
        previewSection("Lingkup Pengembangan", [
          paragraph(`Berikut adalah fitur pengembangan pada ${draft.metadata.perihal}:`, { size: 22 }),
          developmentTable(rows as Extract<PreviewBlock, { type: "development-row" }>[]),
        ]),
      );
      index = nextIndex;
      continue;
    }

    if (block.type === "activity-row") {
      const { rows, nextIndex } = consumeTableRows(page.blocks, index, "activity-row");
      children.push(
        previewSection("Aktivitas Cabang dan Unit Kerja", [
          paragraph(`Berikut ini adalah aktivitas yang perlu dilakukan oleh Cabang dan Unit Kerja selama ${draft.metadata.perihal}:`, { size: 22 }),
          activityTable(rows as Extract<PreviewBlock, { type: "activity-row" }>[]),
        ]),
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

    children.push(...blockChildren(draft, block, watermarkData));
    index += 1;
  }

  if (page.continues && page.kind === "main") {
    children.push(paragraph("Bersambung ke halaman berikut", { italics: true, align: AlignmentType.RIGHT, size: 20 }));
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

function buildSection(draft: MemoDraft, pages: PreviewPage[], watermarkData: Uint8Array): ISectionOptions {
  const orientation = pages[0]?.orientation ?? "portrait";
  const children = pages.flatMap((page, index) => {
    const pageContent = pageChildren(draft, page, watermarkData);
    return index < pages.length - 1
      ? [...pageContent, new Paragraph({ children: [new PageBreak()] })]
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
  const validationPages = pages.filter((page) => page.kind === "validation");
  const watermarkBuffer = await fetch("/template-assets/validation-watermark-source-pale.png").then(
    (response) => response.arrayBuffer(),
  );
  const watermarkData = new Uint8Array(watermarkBuffer);

  const doc = new Document({
    title: draft.metadata.perihal,
    creator: "Memo Builder",
    description: "Generated memo document",
    sections: [
      buildSection(draft, mainPages, watermarkData),
      buildSection(draft, appendixPages, watermarkData),
      buildSection(draft, validationPages, watermarkData),
    ],
  });

  return Packer.toBlob(doc);
}

export function memoDocxFileName(draft: MemoDraft) {
  const safeProject = draft.metadata.projectName
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return `Memo ${safeProject || "Draft"}.docx`;
}
