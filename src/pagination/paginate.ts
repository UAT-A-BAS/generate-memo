import type {
  ActivityRow,
  DevelopmentRow,
  MemoDraft,
  ScenarioRow,
} from "@/types/memo";
import type { RichTextDoc, RichTextNode } from "@/types/richText";
import { paragraphRichText } from "@/types/richText";
import { formatDateRangeID } from "@/utils/formatDateRangeID";
import { richTextToPlainText } from "@/utils/richText";

export type PreviewOrientation = "portrait" | "landscape";
export type PreviewKind = "main" | "appendix" | "validation";

export type AppendixRowMeta = {
  dateLabel: string;
  showDate: boolean;
  sectionTitle: string;
  showSection: boolean;
  sectionLetter: string;
  number: number;
  isSplitContinuation: boolean;
};

export type PreviewBlock =
  | { id: string; type: "memo-heading"; estimatedHeight: number }
  | { id: string; type: "recipients"; estimatedHeight: number }
  | { id: string; type: "introduction"; estimatedHeight: number }
  | { id: string; type: "reference"; estimatedHeight: number }
  | { id: string; type: "development-row"; estimatedHeight: number; row: DevelopmentRow; index: number }
  | { id: string; type: "pilot-schedule"; estimatedHeight: number }
  | { id: string; type: "activity-row"; estimatedHeight: number; row: ActivityRow; index: number }
  | { id: string; type: "access-link"; estimatedHeight: number }
  | { id: string; type: "contacts"; estimatedHeight: number }
  | { id: string; type: "signature"; estimatedHeight: number }
  | { id: string; type: "cc"; estimatedHeight: number }
  | { id: string; type: "initials"; estimatedHeight: number }
  | { id: string; type: "appendix-row"; estimatedHeight: number; row: ScenarioRow; index: number; meta: AppendixRowMeta }
  | { id: string; type: "validation"; estimatedHeight: number };

export type PreviewPage = {
  id: string;
  kind: PreviewKind;
  orientation: PreviewOrientation;
  title: string;
  continuationTitle?: string;
  blocks: PreviewBlock[];
  continues: boolean;
};

const PAGE_LIMITS: Record<PreviewOrientation, number> = {
  portrait: 735,
  landscape: 520,
};

function visualLineCount(value: string, charsPerLine: number) {
  const lines = value.split(/\r?\n/);
  return lines.reduce((total, line) => {
    const normalized = line.trim();
    return total + Math.max(1, Math.ceil(normalized.length / charsPerLine));
  }, 0);
}

function textHeight(value: string, base = 40, charsPerLine = 76) {
  return base + Math.max(1, visualLineCount(value, charsPerLine)) * 17;
}

function nodeCount(node?: RichTextNode): number {
  if (!node) return 0;
  return 1 + (node.content ?? []).reduce((total, child) => total + nodeCount(child), 0);
}

function richBlockHeight(doc: RichTextDoc, base = 42, charsPerLine = 56) {
  const text = richTextToPlainText(doc);
  const textLines = Math.max(1, visualLineCount(text, charsPerLine));
  const structuralLines = doc.content.reduce((total, node) => total + nodeCount(node), 0);
  return base + Math.max(textLines, structuralLines) * 22;
}

function richVisualBlockHeight(doc: RichTextDoc, base = 0, charsPerLine = 56) {
  const text = richTextToPlainText(doc);
  const paragraphCount = Math.max(1, doc.content.length);
  const textLines = Math.max(1, visualLineCount(text, charsPerLine));
  return base + Math.max(textLines, paragraphCount) * 22 + Math.max(0, paragraphCount - 1) * 4;
}

function appendixRowContentHeight(row: ScenarioRow) {
  const scenarioHeight = richVisualBlockHeight(row.scenario, 0, 42);
  const expectedHeight = richVisualBlockHeight(row.expectedResult, 0, 44);
  const picHeight = textHeight(row.pic, 0, 16);

  return 34 + Math.max(58, scenarioHeight, expectedHeight, picHeight);
}

function splitText(value: string, maxChars: number) {
  const normalized = value.trim();
  if (!normalized) return [""];

  const chunks: string[] = [];
  let current = "";

  for (const line of normalized.split(/\n+/)) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);

    if (line.length <= maxChars) {
      current = line;
      continue;
    }

    let cursor = line;
    while (cursor.length > maxChars) {
      const splitAt = Math.max(cursor.lastIndexOf(" ", maxChars), Math.floor(maxChars * 0.7));
      chunks.push(cursor.slice(0, splitAt).trim());
      cursor = cursor.slice(splitAt).trim();
    }
    current = cursor;
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [""];
}

function splitDoc(doc: RichTextDoc, maxChars: number) {
  return splitText(richTextToPlainText(doc), maxChars).map((chunk) => paragraphRichText(chunk));
}

function expandLargeMainBlock(block: PreviewBlock): PreviewBlock[] {
  if (block.type === "activity-row" && block.estimatedHeight > 390) {
    return splitDoc(block.row.activity, 520).map((activity, part) => ({
      ...block,
      id: `${block.id}-part-${part + 1}`,
      row: { ...block.row, activity },
      estimatedHeight: 210 + richBlockHeight(activity, 0, 46),
    }));
  }

  if (block.type === "development-row" && block.estimatedHeight > 390) {
    const itemParts = splitDoc(block.row.item, 320);
    const descriptionParts = splitDoc(block.row.description, 520);
    const total = Math.max(itemParts.length, descriptionParts.length);

    return Array.from({ length: total }, (_, part) => {
      const item = itemParts[part] ?? paragraphRichText("");
      const description = descriptionParts[part] ?? paragraphRichText("");
      return {
        ...block,
        id: `${block.id}-part-${part + 1}`,
        row: { ...block.row, item, description },
        estimatedHeight: 150 + richBlockHeight(item, 0, 32) + richBlockHeight(description, 0, 42),
      };
    });
  }

  return [block];
}

function expandLargeAppendixBlock(block: PreviewBlock): PreviewBlock[] {
  if (block.type !== "appendix-row" || block.estimatedHeight <= 360) return [block];

  const scenarioParts = splitDoc(block.row.scenario, 420);
  const expectedParts = splitDoc(block.row.expectedResult, 420);
  const total = Math.max(scenarioParts.length, expectedParts.length);

  return Array.from({ length: total }, (_, part) => {
    const scenario = scenarioParts[part] ?? paragraphRichText("");
    const expectedResult = expectedParts[part] ?? paragraphRichText("");
    const row = { ...block.row, scenario, expectedResult };
    return {
      ...block,
      id: `${block.id}-part-${part + 1}`,
      row,
      estimatedHeight: appendixRowContentHeight(row),
    };
  });
}

function alphaIndex(index: number) {
  let value = index + 1;
  let result = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

function sourceBlockId(id: string) {
  return id.replace(/-part-\d+$/, "");
}

function mainBlocks(draft: MemoDraft): PreviewBlock[] {
  const blocks: PreviewBlock[] = [
    { id: "memo-heading", type: "memo-heading", estimatedHeight: 170 },
    {
      id: "recipients",
      type: "recipients",
      estimatedHeight: 54 + draft.recipients.length * 24,
    },
    {
      id: "introduction",
      type: "introduction",
      estimatedHeight: 88,
    },
    ...(draft.metadata.memoType === "Nasional" && draft.referenceEnabled
      ? [{
          id: "reference",
          type: "reference" as const,
          estimatedHeight: richBlockHeight(draft.reference, 68, 72),
        }]
      : []),
    ...draft.developmentRows.map((row, index) => ({
      id: `development-${row.id}`,
      type: "development-row" as const,
      row,
      index,
      estimatedHeight:
        104 +
        richBlockHeight(row.item, 0, 32) +
        richBlockHeight(row.description, 0, 42),
    })),
    { id: "pilot-schedule", type: "pilot-schedule", estimatedHeight: 96 },
    ...draft.activities.map((row, index) => ({
      id: `activity-${row.id}`,
      type: "activity-row" as const,
      row,
      index,
      estimatedHeight: 118 + richBlockHeight(row.activity, 0, 46),
    })),
    ...(draft.metadata.accessLinkEnabled
      ? [{ id: "access-link", type: "access-link" as const, estimatedHeight: 72 }]
      : []),
    {
      id: "contacts",
      type: "contacts",
      estimatedHeight: 58 + draft.contacts.length * 28,
    },
    { id: "signature", type: "signature", estimatedHeight: 132 },
    {
      id: "cc",
      type: "cc",
      estimatedHeight: 48 + draft.ccRecipients.length * 22,
    },
    { id: "initials", type: "initials", estimatedHeight: 40 },
  ];

  return blocks.flatMap(expandLargeMainBlock);
}

function appendixBlocks(draft: MemoDraft): PreviewBlock[] {
  let previousDate = "";
  let previousSection = "";
  let previousSource = "";
  let sectionIndex = -1;
  let numberInSection = 0;
  let currentNumber = 0;

  const blocks = draft.appendixScenarios.map((row, index) => ({
    id: `appendix-${row.id}`,
    type: "appendix-row" as const,
    row,
    index,
    meta: {
      dateLabel: "",
      showDate: false,
      sectionTitle: "",
      showSection: false,
      sectionLetter: "",
      number: 0,
      isSplitContinuation: false,
    },
    estimatedHeight: Math.max(
      54,
      appendixRowContentHeight(row),
    ),
  })).flatMap(expandLargeAppendixBlock) as Extract<PreviewBlock, { type: "appendix-row" }>[];

  return blocks.map((block) => {
    const sourceId = sourceBlockId(block.id);
    const isSplitContinuation = sourceId === previousSource;
    const dateLabel = formatDateRangeID(block.row.startDate, block.row.endDate);
    const sectionTitle = block.row.section.trim();
    const showDate = !isSplitContinuation && dateLabel !== "-" && dateLabel !== previousDate;
    const showSection = !isSplitContinuation && Boolean(sectionTitle) && sectionTitle !== previousSection;

    if (!isSplitContinuation) {
      if (showDate) previousDate = dateLabel;
      if (showSection) {
        sectionIndex += 1;
        previousSection = sectionTitle;
        numberInSection = 0;
      }
      numberInSection += 1;
      currentNumber = numberInSection;
      previousSource = sourceId;
    }

    return {
      ...block,
      meta: {
        dateLabel,
        showDate,
        sectionTitle,
        showSection,
        sectionLetter: showSection ? alphaIndex(sectionIndex) : "",
        number: currentNumber,
        isSplitContinuation,
      },
      estimatedHeight:
        block.estimatedHeight +
        (showDate ? 30 : 0) +
        (showSection ? Math.max(30, textHeight(sectionTitle, 2, 68)) : 0),
    };
  });
}

function packPages(
  blocks: PreviewBlock[],
  options: {
    kind: PreviewKind;
    orientation: PreviewOrientation;
    title: string;
    continuationTitle: string;
  },
): PreviewPage[] {
  const pages: PreviewPage[] = [];
  let current: PreviewPage = {
    id: `${options.kind}-1`,
    kind: options.kind,
    orientation: options.orientation,
    title: options.title,
    blocks: [],
    continues: false,
  };
  let used = 0;
  const limit = PAGE_LIMITS[options.orientation];

  for (const block of blocks) {
    const wouldOverflow = used + block.estimatedHeight > limit;
    const hasContent = current.blocks.length > 0;

    if (wouldOverflow && hasContent) {
      pages.push(current);
      current = {
        id: `${options.kind}-${pages.length + 1}`,
        kind: options.kind,
        orientation: options.orientation,
        title: options.title,
        continuationTitle: options.continuationTitle,
        blocks: [],
        continues: false,
      };
      used = 0;
    }

    current.blocks.push(block);
    used += block.estimatedHeight;
  }

  pages.push(current);
  return pages.map((page, index) => ({
    ...page,
    continues: index < pages.length - 1,
  }));
}

export function paginateMemoDraft(draft: MemoDraft): PreviewPage[] {
  const mainPages = packPages(mainBlocks(draft), {
    kind: "main",
    orientation: "portrait",
    title: draft.metadata.perihal,
    continuationTitle: `Perihal: ${draft.metadata.perihal}, Sambungan`,
  });

  const appendixPages = packPages(appendixBlocks(draft), {
    kind: "appendix",
    orientation: "landscape",
    title: `Lampiran - Skenario ${draft.metadata.perihal}`,
    continuationTitle: `Lampiran - Skenario ${draft.metadata.perihal}, Sambungan`,
  });

  const validationPage: PreviewPage = {
    id: "validation",
    kind: "validation",
    orientation: "portrait",
    title: "Validasi Dokumen",
    blocks: [{ id: "validation", type: "validation", estimatedHeight: 360 }],
    continues: false,
  };

  return [...mainPages, ...appendixPages, validationPage];
}
