import type {
  ActivityRow,
  DevelopmentRow,
  MemoDraft,
  ScenarioRow,
} from "@/types/memo";
import type { RichTextDoc, RichTextNode } from "@/types/richText";
import { paragraphRichText } from "@/types/richText";
import { formatDateRangeID } from "@/utils/formatDateRangeID";
import { memoAttachmentItems } from "@/utils/attachments";
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
  | { id: string; type: "attachments"; estimatedHeight: number }
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

export function isTableSectionContinuation(
  block: Extract<PreviewBlock, { type: "development-row" | "activity-row" }>,
) {
  const splitPart = Number(block.id.match(/-part-(\d+)$/)?.[1] ?? "1");
  return block.index > 0 || splitPart > 1;
}

const PAGE_LIMITS: Record<PreviewOrientation, number> = {
  portrait: 1040,
  landscape: 620,
};

function visualLineCount(value: string, charsPerLine: number) {
  const lines = value.split(/\r?\n/);
  return lines.reduce((total, line) => {
    const normalized = line.trim();
    return total + Math.max(1, Math.ceil(normalized.length / charsPerLine));
  }, 0);
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

function compactRichHeight(doc: RichTextDoc, charsPerLine = 48) {
  const text = richTextToPlainText(doc);
  const paragraphCount = Math.max(1, doc.content.length);
  const textLines = Math.max(1, visualLineCount(text, charsPerLine));
  return Math.max(textLines, paragraphCount) * 16 + Math.max(0, paragraphCount - 1) * 3;
}

function compactTextHeight(value: string, charsPerLine = 76) {
  return Math.max(1, visualLineCount(value, charsPerLine)) * 16;
}

function appendixRowContentHeight(row: ScenarioRow) {
  const scenarioHeight = compactRichHeight(row.scenario, 48);
  const expectedHeight = compactRichHeight(row.expectedResult, 50);
  const picHeight = compactTextHeight(row.pic, 18);

  return 8 + Math.max(24, scenarioHeight, expectedHeight, picHeight);
}

function splitDoc(doc: RichTextDoc, maxChars: number) {
  const chunks: RichTextNode[][] = [];
  let current: RichTextNode[] = [];
  let currentLength = 0;

  for (const node of doc.content) {
    const nodeText = richTextToPlainText({ type: "doc", content: [node] });
    const nodeLength = Math.max(1, nodeText.length);

    if (current.length && currentLength + nodeLength > maxChars) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }

    current.push(JSON.parse(JSON.stringify(node)) as RichTextNode);
    currentLength += nodeLength;
  }

  if (current.length) chunks.push(current);

  if (!chunks.length) return [paragraphRichText("")];
  return chunks.map((content) => ({ type: "doc" as const, content }));
}

function expandLargeMainBlock(block: PreviewBlock): PreviewBlock[] {
  if (block.type === "activity-row" && block.estimatedHeight > 620) {
    return splitDoc(block.row.activity, 880).map((activity, part) => ({
      ...block,
      id: `${block.id}-part-${part + 1}`,
      row: { ...block.row, activity },
      estimatedHeight: 110 + richVisualBlockHeight(activity, 0, 50),
    }));
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
  const attachmentItems = memoAttachmentItems(draft.attachments);
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
        112 +
        Math.max(
          richVisualBlockHeight(row.item, 0, 30),
          richVisualBlockHeight(row.description, 0, 62),
        ),
    })),
    { id: "pilot-schedule", type: "pilot-schedule", estimatedHeight: 96 },
    ...draft.activities.map((row, index) => ({
      id: `activity-${row.id}`,
      type: "activity-row" as const,
      row,
      index,
      estimatedHeight: 104 + richVisualBlockHeight(row.activity, 0, 54),
    })),
    ...(draft.metadata.accessLinkEnabled
      ? [{ id: "access-link", type: "access-link" as const, estimatedHeight: 72 }]
      : []),
    ...(draft.attachmentsEnabled
      ? [{
          id: "attachments",
          type: "attachments" as const,
          estimatedHeight: 58 + Math.max(1, attachmentItems.length) * 24,
        }]
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
    estimatedHeight: Math.max(32, appendixRowContentHeight(row)),
  })).flatMap(expandLargeAppendixBlock) as Extract<PreviewBlock, { type: "appendix-row" }>[];

  return blocks.map((block) => {
    const sourceId = sourceBlockId(block.id);
    const isSplitContinuation = sourceId === previousSource;
    const dateLabel = formatDateRangeID(block.row.startDate, block.row.endDate);
    const sectionTitle = block.row.section.trim();
    const showDate = !isSplitContinuation && dateLabel !== "-" && dateLabel !== previousDate;

    if (showDate) {
      previousDate = dateLabel;
      previousSection = "";
      sectionIndex = -1;
      numberInSection = 0;
    }

    const showSection = !isSplitContinuation && Boolean(sectionTitle) && sectionTitle !== previousSection;

    if (!isSplitContinuation) {
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
        (showDate ? 24 : 0) +
        (showSection ? Math.max(24, compactTextHeight(sectionTitle, 72)) : 0),
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
  if (!blocks.length) return [];

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
  const closingHeight = blocks
    .filter((block) => block.type === "signature" || block.type === "cc" || block.type === "initials")
    .reduce((total, block) => total + block.estimatedHeight, 0);

  for (const block of blocks) {
    const isClosingBlock = block.type === "signature" || block.type === "cc" || block.type === "initials";
    const currentHasClosing = current.blocks.some((item) => item.type === "signature");
    const hasContent = current.blocks.length > 0;
    const shouldStartClosingPage =
      block.type === "signature" && hasContent && used + closingHeight > limit;
    const wouldOverflow = used + block.estimatedHeight > limit;
    const shouldBreakForOverflow = wouldOverflow && hasContent && !(isClosingBlock && currentHasClosing);

    if (shouldStartClosingPage || shouldBreakForOverflow) {
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
