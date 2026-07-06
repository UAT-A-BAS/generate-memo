import type {
  ActivityRow,
  DevelopmentRow,
  MemoDraft,
  Recipient,
  ScenarioRow,
} from "@/types/memo";
import type { RichTextDoc, RichTextNode } from "@/types/richText";
import { paragraphRichText } from "@/types/richText";
import {
  A4_PORTRAIT_HEIGHT_PX,
  MAIN_PAGE_MARGINS,
} from "@/documentLayout";
import { formatDateRangeID } from "@/utils/formatDateRangeID";
import { memoAttachmentItems } from "@/utils/attachments";
import { formatRecipientAttention } from "@/utils/formatRecipient";
import { richTextToPlainText } from "@/utils/richText";
import { buildScenarioHierarchy, scenarioHeadingPath, type ScenarioHierarchyNode } from "@/utils/scenarioHierarchy";

export type PreviewOrientation = "portrait" | "landscape";
export type PreviewKind = "main" | "appendix" | "validation";

export type AppendixRowMeta = {
  dateLabel: string;
  showDate: boolean;
  sectionTitle: string;
  showSection: boolean;
  sectionLetter: string;
  headingRows: Array<{ id: string; label: string; title: string; depth: number }>;
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
  | {
      id: string;
      type: "cc";
      estimatedHeight: number;
      recipients: Recipient[];
      totalRecipients: number;
    }
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

const TWIPS_PER_CSS_PIXEL = 15;
const PORTRAIT_CONTENT_HEIGHT =
  A4_PORTRAIT_HEIGHT_PX -
  (MAIN_PAGE_MARGINS.top + MAIN_PAGE_MARGINS.bottom) / TWIPS_PER_CSS_PIXEL;
const FIRST_PORTRAIT_PAGE_LIMIT = Math.floor(PORTRAIT_CONTENT_HEIGHT - 40);
const CONTINUATION_PORTRAIT_PAGE_LIMIT = Math.floor(PORTRAIT_CONTENT_HEIGHT - 120);
const LANDSCAPE_PAGE_LIMIT = 560;
const CC_BLOCK_PAGE_LIMIT = 780;

function pageLimit(orientation: PreviewOrientation, pageIndex: number) {
  if (orientation === "landscape") return LANDSCAPE_PAGE_LIMIT;
  return pageIndex === 0
    ? FIRST_PORTRAIT_PAGE_LIMIT
    : CONTINUATION_PORTRAIT_PAGE_LIMIT;
}

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

function inlineVisualLineCount(content: RichTextNode[], charsPerLine: number) {
  let lines = 1;
  let used = 0;

  for (const node of content) {
    if (node.type === "hardBreak") {
      lines += 1;
      used = 0;
      continue;
    }

    const length = typeof node.text === "string"
      ? node.text.length
      : richTextToPlainText({ type: "doc", content: [node] }).length;
    if (!length) continue;
    const total = used + length;
    lines += Math.floor((total - 1) / charsPerLine);
    used = ((total - 1) % charsPerLine) + 1;
  }

  return lines;
}

function nodeVisualLineCount(node: RichTextNode, charsPerLine: number): number {
  if (node.type === "paragraph" || node.type === "heading") {
    return inlineVisualLineCount(node.content ?? [], charsPerLine);
  }
  if (node.type === "hardBreak") return 1;
  if (node.type === "text") {
    return Math.max(1, Math.ceil((node.text?.length ?? 0) / charsPerLine));
  }
  if (node.content?.length) {
    return node.content.reduce(
      (total, child) => total + nodeVisualLineCount(child, charsPerLine),
      0,
    );
  }
  return 1;
}

function visualBudgetLength(node: RichTextNode, charsPerLine: number) {
  return Math.max(
    1,
    richTextToPlainText({ type: "doc", content: [node] }).length,
    nodeVisualLineCount(node, charsPerLine) * charsPerLine,
  );
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
  const structuralLines = Math.max(
    1,
    doc.content.reduce(
      (total, node) => total + nodeVisualLineCount(node, charsPerLine),
      0,
    ),
  );
  return base + Math.max(textLines, structuralLines) * 22 + Math.max(0, paragraphCount - 1) * 4;
}

function compactRichHeight(doc: RichTextDoc, charsPerLine = 48) {
  const text = richTextToPlainText(doc);
  const paragraphCount = Math.max(1, doc.content.length);
  const textLines = Math.max(1, visualLineCount(text, charsPerLine));
  const structuralLines = Math.max(
    1,
    doc.content.reduce(
      (total, node) => total + nodeVisualLineCount(node, charsPerLine),
      0,
    ),
  );
  return Math.max(textLines, structuralLines, paragraphCount) * 18 + Math.max(0, paragraphCount - 1) * 4;
}

function compactTextHeight(value: string, charsPerLine = 76) {
  return Math.max(1, visualLineCount(value, charsPerLine)) * 16;
}

function ccBlockHeight(recipients: Recipient[]) {
  return 48 + recipients.reduce(
    (height, recipient) =>
      height + (formatRecipientAttention(recipient) ? 45 : 24),
    0,
  );
}

function appendixRowContentHeight(row: ScenarioRow) {
  const scenarioHeight = compactRichHeight(row.scenario, 48);
  const expectedHeight = compactRichHeight(row.expectedResult, 50);
  const picHeight = compactTextHeight(row.pic, 18);

  return 8 + Math.max(24, scenarioHeight, expectedHeight, picHeight);
}

function splitTextAtBudget(text: string, maxChars: number) {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    const searchFrom = Math.max(1, Math.floor(maxChars * 0.6));
    const whitespace = remaining.lastIndexOf(" ", maxChars);
    const splitAt = whitespace >= searchFrom ? whitespace + 1 : maxChars;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function splitInlineContent(
  content: RichTextNode[],
  maxChars: number,
  visualCharsPerLine: number,
) {
  const chunks: RichTextNode[][] = [[]];
  let used = 0;

  for (const node of content) {
    if (typeof node.text !== "string") {
      const nodeLength = visualBudgetLength(node, visualCharsPerLine);
      if (used && used + nodeLength > maxChars) {
        chunks.push([]);
        used = 0;
        if (node.type === "hardBreak") continue;
      }
      chunks.at(-1)?.push(JSON.parse(JSON.stringify(node)) as RichTextNode);
      used += nodeLength;
      continue;
    }

    for (const piece of splitTextAtBudget(node.text, maxChars)) {
      if (used && used + piece.length > maxChars) {
        chunks.push([]);
        used = 0;
      }
      chunks.at(-1)?.push({ ...node, text: piece });
      used += piece.length;
    }
  }

  return chunks.filter((chunk) => chunk.length);
}

function splitOversizedNode(
  node: RichTextNode,
  maxChars: number,
  visualCharsPerLine: number,
) {
  if (
    visualBudgetLength(node, visualCharsPerLine) <= maxChars ||
    !node.content?.length
  ) {
    return [JSON.parse(JSON.stringify(node)) as RichTextNode];
  }

  if (node.type === "paragraph" || node.type === "heading") {
    return splitInlineContent(node.content, maxChars, visualCharsPerLine).map((content) => ({
      ...node,
      content,
    }));
  }

  if (node.type === "bulletList" || node.type === "orderedList") {
    const chunks: RichTextNode[][] = [];
    let current: RichTextNode[] = [];
    let currentLength = 0;

    for (const item of node.content) {
      const itemLength = visualBudgetLength(item, visualCharsPerLine);
      if (current.length && currentLength + itemLength > maxChars) {
        chunks.push(current);
        current = [];
        currentLength = 0;
      }
      current.push(JSON.parse(JSON.stringify(item)) as RichTextNode);
      currentLength += itemLength;
    }
    if (current.length) chunks.push(current);

    const start = Number(node.attrs?.start ?? 1);
    let consumed = 0;
    return chunks.map((content) => {
      const next = {
        ...node,
        attrs:
          node.type === "orderedList"
            ? { ...node.attrs, start: start + consumed }
            : node.attrs,
        content,
      };
      consumed += content.length;
      return next;
    });
  }

  return [JSON.parse(JSON.stringify(node)) as RichTextNode];
}

function splitDoc(doc: RichTextDoc, maxChars: number, visualCharsPerLine = 48) {
  const chunks: RichTextNode[][] = [];
  let current: RichTextNode[] = [];
  let currentLength = 0;

  const nodes = doc.content.flatMap((node) =>
    splitOversizedNode(node, maxChars, visualCharsPerLine),
  );

  for (const node of nodes) {
    const nodeLength = visualBudgetLength(node, visualCharsPerLine);

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
  if (block.type === "cc" && block.estimatedHeight > CC_BLOCK_PAGE_LIMIT) {
    const chunks: Recipient[][] = [];
    let current: Recipient[] = [];

    for (const recipient of block.recipients) {
      if (
        current.length > 0 &&
        ccBlockHeight([...current, recipient]) > CC_BLOCK_PAGE_LIMIT
      ) {
        chunks.push(current);
        current = [];
      }
      current.push(recipient);
    }
    if (current.length) chunks.push(current);

    return chunks.map((recipients, index) => ({
      ...block,
      id: `${block.id}-part-${index + 1}`,
      recipients,
      estimatedHeight: ccBlockHeight(recipients),
    }));
  }

  if (block.type === "development-row" && block.estimatedHeight > 540) {
    const itemParts = splitDoc(block.row.item, 520, 30);
    const descriptionParts = splitDoc(block.row.description, 700, 52);
    const total = Math.max(itemParts.length, descriptionParts.length);

    return Array.from({ length: total }, (_, part) => {
      const item = itemParts[part] ?? block.row.item;
      const description = descriptionParts[part] ?? paragraphRichText("");
      return {
        ...block,
        id: `${block.id}-part-${part + 1}`,
        row: { ...block.row, item, description },
        estimatedHeight:
          96 +
          Math.max(
            richVisualBlockHeight(item, 0, 30),
            richVisualBlockHeight(description, 0, 62),
          ),
      };
    });
  }

  if (block.type === "activity-row" && block.estimatedHeight > 540) {
    return splitDoc(block.row.activity, 650, 44).map((activity, part) => ({
      ...block,
      id: `${block.id}-part-${part + 1}`,
      row: { ...block.row, activity },
      estimatedHeight: 96 + richVisualBlockHeight(activity, 0, 44),
    }));
  }

  return [block];
}

function expandLargeAppendixBlock(block: PreviewBlock): PreviewBlock[] {
  if (block.type !== "appendix-row" || block.estimatedHeight <= 360) return [block];

  const scenarioParts = splitDoc(block.row.scenario, 420, 48);
  const expectedParts = splitDoc(block.row.expectedResult, 420, 50);
  const total = Math.max(scenarioParts.length, expectedParts.length);

  return Array.from({ length: total }, (_, part) => {
    const scenario = scenarioParts[part] ??
      (scenarioParts.length === 1 ? block.row.scenario : paragraphRichText(""));
    const expectedResult = expectedParts[part] ??
      (expectedParts.length === 1 ? block.row.expectedResult : paragraphRichText(""));
    const row = { ...block.row, scenario, expectedResult };
    return {
      ...block,
      id: `${block.id}-part-${part + 1}`,
      row,
      estimatedHeight: appendixRowContentHeight(row),
    };
  });
}

function sourceBlockId(id: string) {
  return id.replace(/-part-\d+$/, "");
}

function mainBlocks(draft: MemoDraft): PreviewBlock[] {
  const attachmentItems = memoAttachmentItems(draft.attachments);
  const blocks: PreviewBlock[] = [
    {
      id: "memo-heading",
      type: "memo-heading",
      estimatedHeight: 150 + Math.max(0, draft.recipients.length - 1) * 40,
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
        (index === 0 ? 112 : 24) +
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
      estimatedHeight:
        (index === 0 ? 104 : 24) +
        richVisualBlockHeight(row.activity, 0, 44),
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
      estimatedHeight: 58 + draft.contacts.reduce(
        (height, contact) =>
          height + compactTextHeight(`${contact.name} - ${contact.email}`, 58) + 2,
        0,
      ),
    },
    {
      id: "signature",
      type: "signature",
      estimatedHeight: 104 + draft.signers.reduce(
        (height, signer) => height + Math.max(
          compactTextHeight(signer.name, 28),
          compactTextHeight(signer.title, 52),
        ) + 2,
        0,
      ),
    },
    {
      id: "cc",
      type: "cc",
      recipients: draft.ccRecipients,
      totalRecipients: draft.ccRecipients.length,
      estimatedHeight: ccBlockHeight(draft.ccRecipients),
    },
    { id: "initials", type: "initials", estimatedHeight: 40 },
  ];

  return blocks.flatMap(expandLargeMainBlock);
}

function appendixBlocks(draft: MemoDraft): PreviewBlock[] {
  let previousDateGroupId = "";
  let previousHeadingIds: string[] = [];
  let previousSource = "";
  let currentNumber = 0;
  const numberByParent = new Map<string, number>();
  const labelsByDate = new Map<string, Map<string, { label: string; title: string; depth: number }>>();
  const rowsByDate = new Map<string, ScenarioRow[]>();

  draft.appendixScenarios.forEach((row) => {
    const dateId = row.dateGroupId ?? row.id;
    const group = rowsByDate.get(dateId) ?? [];
    group.push(row);
    rowsByDate.set(dateId, group);
  });
  rowsByDate.forEach((rows, dateId) => {
    const labels = new Map<string, { label: string; title: string; depth: number }>();
    const visit = (nodes: ScenarioHierarchyNode[]) => nodes.forEach((node) => {
      labels.set(node.id, { label: node.label, title: node.title, depth: node.depth });
      visit(node.children);
    });
    visit(buildScenarioHierarchy(rows).children);
    labelsByDate.set(dateId, labels);
  });

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
      headingRows: [],
      number: 0,
      isSplitContinuation: false,
    },
    estimatedHeight: Math.max(32, appendixRowContentHeight(row)),
  })).flatMap(expandLargeAppendixBlock) as Extract<PreviewBlock, { type: "appendix-row" }>[];

  return blocks.map((block) => {
    const sourceId = sourceBlockId(block.id);
    const isSplitContinuation = sourceId === previousSource;
    const dateLabel = formatDateRangeID(block.row.startDate, block.row.endDate, block.row.dates);
    const dateGroupId = block.row.dateGroupId ?? block.row.id;
    const headingPath = scenarioHeadingPath(block.row);
    const showDate =
      !isSplitContinuation &&
      dateLabel !== "-" &&
      dateGroupId !== previousDateGroupId;

    if (showDate) {
      previousDateGroupId = dateGroupId;
      previousHeadingIds = [];
    }

    let commonDepth = 0;
    while (
      commonDepth < headingPath.length &&
      headingPath[commonDepth]?.id === previousHeadingIds[commonDepth]
    ) commonDepth += 1;
    const headingRows = isSplitContinuation
      ? []
      : headingPath.slice(commonDepth).map((heading, offset) => {
          const resolved = labelsByDate.get(dateGroupId)?.get(heading.id);
          return {
            id: heading.id,
            label: resolved?.label ?? "",
            title: resolved?.title ?? heading.title,
            depth: resolved?.depth ?? commonDepth + offset + 1,
          };
        });
    const showSection = headingRows.length > 0;
    const lastHeading = headingRows.at(-1);

    if (!isSplitContinuation) {
      const parentKey = headingPath.at(-1)?.id ?? `${dateGroupId}:root`;
      currentNumber = (numberByParent.get(parentKey) ?? 0) + 1;
      numberByParent.set(parentKey, currentNumber);
      previousHeadingIds = headingPath.map((heading) => heading.id);
      previousSource = sourceId;
    }

    return {
      ...block,
      meta: {
        dateLabel,
        showDate,
        sectionTitle: lastHeading?.title ?? "",
        showSection,
        sectionLetter: lastHeading?.label ?? "",
        headingRows,
        number: currentNumber,
        isSplitContinuation,
      },
      estimatedHeight:
        block.estimatedHeight +
        (showDate ? 24 : 0) +
        headingRows.reduce((height, heading) => height + Math.max(24, compactTextHeight(heading.title, 72)), 0),
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
  let limit = pageLimit(options.orientation, 0);

  const repeatedTableHeadingHeight = (block: PreviewBlock, previous?: PreviewBlock) => {
    if (block.type === "appendix-row") {
      return previous?.type === "appendix-row" ? 0 : 32;
    }

    if (
      previous?.type === block.type ||
      (block.type !== "development-row" && block.type !== "activity-row") ||
      !isTableSectionContinuation(block)
    ) {
      return 0;
    }

    return block.type === "development-row" ? 88 : 80;
  };

  for (const block of blocks) {
    const hasContent = current.blocks.length > 0;
    let sectionHeadingHeight = repeatedTableHeadingHeight(
      block,
      current.blocks[current.blocks.length - 1],
    );
    const wouldOverflow = used + sectionHeadingHeight + block.estimatedHeight > limit;
    const shouldBreakForOverflow = wouldOverflow && hasContent;

    if (shouldBreakForOverflow) {
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
      limit = pageLimit(options.orientation, pages.length);
      sectionHeadingHeight = repeatedTableHeadingHeight(block);
    }

    current.blocks.push(block);
    used += sectionHeadingHeight + block.estimatedHeight;
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
