import type {
  ActivityRow,
  ContactRow,
  DevelopmentRow,
  MemoDraft,
  MemoMetadata,
  Recipient,
  ReviewAuditLogEntry,
  ReviewComment,
  ReviewCommentReply,
  ScenarioRow,
  SignerRow,
} from "@/types/memo";
import type { RichTextDoc, RichTextMark, RichTextNode } from "@/types/richText";
import { emptyRichText } from "@/types/richText";
import { generatePerihal } from "@/utils/generatePerihal";
import { createId } from "@/utils/ids";
import {
  isValidDateValue,
  isValidInputDate,
  normalizeActivityDateSelection,
  normalizeDateSelection,
} from "@/utils/formatDateRangeID";
import { scenarioHeadingPath, withScenarioHeadingPath } from "@/utils/scenarioHierarchy";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function stableId(value: unknown, prefix: string, index: number) {
  const id = stringValue(value).trim();
  return id || `${prefix}-${index + 1}`;
}

function uniqueStableId(
  value: unknown,
  prefix: string,
  index: number,
  usedIds: Set<string>,
) {
  const baseId = stableId(value, prefix, index);
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function jsonRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  try {
    const cloned = JSON.parse(JSON.stringify(value)) as unknown;
    return isRecord(cloned) ? cloned : undefined;
  } catch {
    return undefined;
  }
}

function normalizeRichTextMark(value: unknown): RichTextMark | null {
  if (!isRecord(value) || typeof value.type !== "string" || !value.type) return null;
  const attrs = jsonRecord(value.attrs);
  return {
    type: value.type,
    ...(attrs ? { attrs } : {}),
  };
}

function normalizeRichTextNode(value: unknown): RichTextNode | null {
  if (!isRecord(value) || typeof value.type !== "string" || !value.type) return null;

  const attrs = jsonRecord(value.attrs);
  const marks = Array.isArray(value.marks)
    ? value.marks
      .map(normalizeRichTextMark)
      .filter((mark): mark is RichTextMark => Boolean(mark))
    : undefined;
  const content = Array.isArray(value.content)
    ? value.content
      .map(normalizeRichTextNode)
      .filter((node): node is RichTextNode => Boolean(node))
    : undefined;

  return {
    type: value.type,
    ...(typeof value.text === "string" ? { text: value.text } : {}),
    ...(attrs ? { attrs } : {}),
    ...(marks ? { marks } : {}),
    ...(content ? { content } : {}),
  };
}

function normalizeRichText(value: unknown): RichTextDoc {
  if (!isRecord(value) || value.type !== "doc" || !Array.isArray(value.content)) {
    return emptyRichText();
  }
  const content = value.content
    .map(normalizeRichTextNode)
    .filter((node): node is RichTextNode => Boolean(node));
  return content.length ? { type: "doc", content } : emptyRichText();
}

function normalizeRecipient(value: unknown, index: number, prefix: string): Recipient {
  const row = isRecord(value) ? value : {};
  return {
    id: stableId(row.id, prefix, index),
    gender: stringValue(row.gender) as Recipient["gender"],
    name: stringValue(row.name),
    position: stringValue(row.position),
    bureau: stringValue(row.bureau),
  };
}

function normalizeDevelopmentRow(value: unknown, index: number): DevelopmentRow {
  const row = isRecord(value) ? value : {};
  return {
    id: stableId(row.id, "development", index),
    item: normalizeRichText(row.item),
    description: normalizeRichText(row.description),
  };
}

function normalizeContact(value: unknown, index: number): ContactRow {
  const row = isRecord(value) ? value : {};
  return {
    id: stableId(row.id, "contact", index),
    name: stringValue(row.name),
    email: stringValue(row.email),
  };
}

function normalizeSigner(value: unknown, index: number): SignerRow {
  const row = isRecord(value) ? value : {};
  return {
    id: stableId(row.id, "signer", index),
    name: stringValue(row.name),
    title: stringValue(row.title),
  };
}

export function createRecipient(seed: Partial<Recipient> = {}): Recipient {
  return {
    id: createId("recipient"),
    gender: "",
    name: "",
    position: "",
    bureau: "",
    ...seed,
  };
}

export function createDevelopmentRow(seed: Partial<DevelopmentRow> = {}): DevelopmentRow {
  return {
    id: createId("development"),
    item: emptyRichText(),
    description: emptyRichText(),
    ...seed,
  };
}

export function createActivityRow(seed: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: createId("activity"),
    startDate: "",
    endDate: "",
    activity: emptyRichText(),
    owner: "",
    ...seed,
  };
}

export function createContactRow(seed: Partial<ContactRow> = {}): ContactRow {
  return {
    id: createId("contact"),
    name: "",
    email: "",
    ...seed,
  };
}

export function createSignerRow(seed: Partial<SignerRow> = {}): SignerRow {
  return {
    id: createId("signer"),
    name: "",
    title: "",
    ...seed,
  };
}

export function createScenarioRow(seed: Partial<ScenarioRow> = {}): ScenarioRow {
  const sectionGroupId = seed.sectionGroupId ?? createId("scenario-section");
  const base: ScenarioRow = {
    id: createId("scenario"),
    dateGroupId: seed.dateGroupId ?? createId("scenario-date"),
    sectionGroupId,
    startDate: "",
    endDate: "",
    section: "",
    scenario: emptyRichText(),
    expectedResult: emptyRichText(),
    pic: "",
    notes: emptyRichText(),
    ...seed,
  };
  const path = Array.isArray(seed.headingPath)
    ? seed.headingPath
    : [{ id: sectionGroupId, title: seed.section ?? "" }];
  return withScenarioHeadingPath(base, path);
}

export function createInitialMemoDraft(): MemoDraft {
  const metadata = {
    noMemo: "[No Memo]",
    releaseDate: "[Tanggal Rilis]",
    memoType: "Pilot" as const,
    projectName: "",
    bureau: "A" as const,
    perihal: "",
    autoPerihal: true,
    accessLinkEnabled: false,
    accessLink: "",
  };

  return {
    id: createId("draft"),
    version: 1,
    metadata: {
      ...metadata,
      perihal: generatePerihal(metadata),
    },
    recipients: [createRecipient()],
    introduction: emptyRichText(),
    referenceEnabled: false,
    reference: emptyRichText(),
    developmentRows: [createDevelopmentRow()],
    pilotSchedule: {
      startDate: "",
      endDate: "",
    },
    activities: [createActivityRow()],
    attachmentsEnabled: false,
    attachments: "",
    contacts: [createContactRow()],
    signers: [createSignerRow()],
    ccRecipients: [createRecipient({ gender: "" })],
    initials: "",
    initialsBureau: "A",
    scenarioLetterResetPerDate: true,
    appendixScenarios: [createScenarioRow()],
    reviewComments: [],
    reviewAuditLog: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeReviewReplies(input: unknown): ReviewCommentReply[] {
  if (!Array.isArray(input)) return [];

  const usedIds = new Set<string>();
  return input
    .filter((item): item is Partial<ReviewCommentReply> => Boolean(item && typeof item === "object"))
    .map((item, index) => {
      const id = uniqueStableId(item.id, "reply", index, usedIds);

      return {
        id,
        text: typeof item.text === "string" ? item.text : "",
        author: typeof item.author === "string" ? item.author : "",
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      };
    });
}

function normalizeReviewComments(input: unknown): ReviewComment[] {
  if (!Array.isArray(input)) return [];

  const usedIds = new Set<string>();
  return input
    .filter((item): item is Partial<ReviewComment> => Boolean(item && typeof item === "object"))
    .map((item, index) => {
      const id = uniqueStableId(item.id, "comment", index, usedIds);

      const createdAt = typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString();
      const updatedAt = typeof item.updatedAt === "string" ? item.updatedAt : createdAt;

      return {
        id,
        type: item.type === "preview" ? "preview" : "field",
        targetId: typeof item.targetId === "string" ? item.targetId : "",
        targetLabel: typeof item.targetLabel === "string" && item.targetLabel.trim()
          ? item.targetLabel
          : "Area terkait",
        path: Array.isArray(item.path)
          ? item.path.filter((index): index is number => Number.isInteger(index))
            .slice(0, 32)
          : [],
        text: typeof item.text === "string" ? item.text : "",
        author: typeof item.author === "string" ? item.author : "",
        resolved: Boolean(item.resolved),
        createdAt,
        updatedAt,
        replies: normalizeReviewReplies(item.replies),
      };
    });
}

function normalizeReviewAuditLog(input: unknown): ReviewAuditLogEntry[] {
  if (!Array.isArray(input)) return [];

  const validActions = new Set<ReviewAuditLogEntry["action"]>([
    "collaboration-started",
    "comment-created",
    "comment-edited",
    "comment-replied",
    "comment-resolved",
    "comment-reopened",
    "comment-deleted",
  ]);
  const usedIds = new Set<string>();

  return input
    .filter((item): item is Partial<ReviewAuditLogEntry> => Boolean(item && typeof item === "object"))
    .map((item, index) => {
      const id = uniqueStableId(item.id, "audit", index, usedIds);

      return {
        id,
        action: validActions.has(item.action as ReviewAuditLogEntry["action"])
          ? item.action as ReviewAuditLogEntry["action"]
          : "comment-created",
        actor: typeof item.actor === "string" ? item.actor : "",
        description: typeof item.description === "string" ? item.description : "",
        commentId: typeof item.commentId === "string" ? item.commentId : undefined,
        targetLabel: typeof item.targetLabel === "string" ? item.targetLabel : undefined,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      };
    });
}

export type MemoDraftInput = Partial<Omit<MemoDraft, "metadata">> & {
  metadata?: Partial<MemoMetadata>;
};

function normalizeDateFields<T extends { startDate?: string; endDate?: string; dates?: string[] }>(value: T) {
  const dates = normalizeDateSelection(value.dates);
  const validStartDate = isValidInputDate(value.startDate ?? "") ? value.startDate ?? "" : "";
  const validEndDate = isValidInputDate(value.endDate ?? "") ? value.endDate ?? "" : "";
  return {
    ...value,
    startDate: dates[0] ?? validStartDate,
    endDate: dates.at(-1) ?? (validEndDate || validStartDate),
    dates,
  };
}

function normalizeActivityDateFields<T extends { startDate?: string; endDate?: string; dates?: string[] }>(value: T) {
  const sourceDates = Array.isArray(value.dates)
    ? value.dates.filter((date): date is string => typeof date === "string")
    : [];
  const dates = normalizeActivityDateSelection(sourceDates);
  const containsInvalidDate = sourceDates.some((date) => !isValidDateValue(date));
  const rawStartDate = value.startDate ?? "";
  const rawEndDate = value.endDate ?? "";
  const validStartDate = normalizeActivityDateSelection([rawStartDate])[0] ?? "";
  const validEndDate = normalizeActivityDateSelection([rawEndDate])[0] ?? "";

  return {
    ...value,
    startDate: dates[0] ?? (rawStartDate && !validStartDate ? rawStartDate : validStartDate),
    endDate: dates.at(-1) ?? (
      rawEndDate && !validEndDate
        ? rawEndDate
        : validEndDate || validStartDate
    ),
    dates: containsInvalidDate ? sourceDates : dates,
  };
}

export function normalizeMemoDraft(input: MemoDraftInput | null | undefined): MemoDraft {
  const base = createInitialMemoDraft();
  const source = isRecord(input) ? input as MemoDraftInput : {};
  const metadataInput = isRecord(source.metadata)
    ? source.metadata as Partial<MemoMetadata>
    : {};
  const metadata = {
    noMemo: stringValue(metadataInput.noMemo, base.metadata.noMemo),
    releaseDate: stringValue(metadataInput.releaseDate, base.metadata.releaseDate),
    memoType: stringValue(metadataInput.memoType, base.metadata.memoType) as MemoMetadata["memoType"],
    projectName: stringValue(metadataInput.projectName, base.metadata.projectName),
    bureau: stringValue(metadataInput.bureau, base.metadata.bureau) as MemoMetadata["bureau"],
    perihal: stringValue(metadataInput.perihal, base.metadata.perihal),
    autoPerihal: typeof metadataInput.autoPerihal === "boolean"
      ? metadataInput.autoPerihal
      : base.metadata.autoPerihal,
    accessLinkEnabled: typeof metadataInput.accessLinkEnabled === "boolean"
      ? metadataInput.accessLinkEnabled
      : base.metadata.accessLinkEnabled,
    accessLink: stringValue(metadataInput.accessLink, base.metadata.accessLink),
  };
  const rawPilotSchedule: Record<string, unknown> = isRecord(source.pilotSchedule)
    ? source.pilotSchedule
    : {};
  const pilotSchedule = normalizeDateFields({
    startDate: stringValue(rawPilotSchedule.startDate),
    endDate: stringValue(rawPilotSchedule.endDate),
    dates: Array.isArray(rawPilotSchedule.dates)
      ? rawPilotSchedule.dates.filter((date): date is string => typeof date === "string")
      : [],
  });

  const activities = Array.isArray(source.activities)
    ? source.activities.map((value, index) => {
        const row: Record<string, unknown> = isRecord(value) ? value : {};
        return normalizeActivityDateFields({
          id: stableId(row.id, "activity", index),
          startDate: stringValue(row.startDate),
          endDate: stringValue(row.endDate),
          dates: Array.isArray(row.dates)
            ? row.dates.filter((date): date is string => typeof date === "string")
            : [],
          activity: normalizeRichText(row.activity),
          owner: stringValue(row.owner),
        });
      })
    : base.activities;
  let previousScenarioStartDate = "";
  let previousScenarioEndDate = "";
  let previousScenarioDates: string[] = [];
  let previousScenarioSection = "";
  let previousScenarioDateGroupId = "";
  let previousScenarioSectionGroupId = "";
  let previousScenarioHeadingPath: ScenarioRow["headingPath"] = undefined;
  const appendixScenarios = Array.isArray(source.appendixScenarios)
    ? source.appendixScenarios.map((value, index) => {
        const rawRow: Record<string, unknown> = isRecord(value) ? value : {};
        const row: ScenarioRow = {
          id: stableId(rawRow.id, "scenario", index),
          dateGroupId: typeof rawRow.dateGroupId === "string" ? rawRow.dateGroupId : undefined,
          sectionGroupId: typeof rawRow.sectionGroupId === "string"
            ? rawRow.sectionGroupId
            : undefined,
          headingPath: Array.isArray(rawRow.headingPath)
            ? rawRow.headingPath
              .filter(isRecord)
              .map((heading, headingIndex) => ({
                id: stableId(heading.id, `scenario-heading-${index + 1}`, headingIndex),
                title: stringValue(heading.title),
                code: typeof heading.code === "string" ? heading.code : undefined,
              }))
            : undefined,
          startDate: stringValue(rawRow.startDate),
          endDate: stringValue(rawRow.endDate),
          dates: Array.isArray(rawRow.dates)
            ? rawRow.dates.filter((date): date is string => typeof date === "string")
            : [],
          section: stringValue(rawRow.section),
          scenario: normalizeRichText(rawRow.scenario),
          expectedResult: normalizeRichText(rawRow.expectedResult),
          pic: stringValue(rawRow.pic),
          notes: normalizeRichText(rawRow.notes),
          ...(typeof rawRow.isSectionHeader === "boolean"
            ? { isSectionHeader: rawRow.isSectionHeader }
            : {}),
          ...(typeof rawRow.sectionTitleEditable === "boolean"
            ? { sectionTitleEditable: rawRow.sectionTitleEditable }
            : {}),
        };
        const legacyDate = stringValue(rawRow.date);
        const rawStartDate = row.startDate || legacyDate;
        const normalizedDateFields = normalizeActivityDateFields({
          ...row,
          startDate: rawStartDate,
        });
        const dates = normalizedDateFields.dates ?? [];
        const startDate = normalizedDateFields.startDate;
        const endDate = normalizedDateFields.endDate;
        const hasExplicitDateSource = Boolean(row.dates?.length || rawStartDate || row.endDate);
        const section = row.section?.trim() ? row.section : previousScenarioSection;
        const normalizedStartDate = hasExplicitDateSource ? startDate : startDate || previousScenarioStartDate;
        const normalizedEndDate = hasExplicitDateSource
          ? endDate
          : endDate || previousScenarioEndDate || normalizedStartDate;
        const continuesPreviousDate = !hasExplicitDateSource && Boolean(previousScenarioDateGroupId);
        const normalizedDates = dates.length
          ? dates
          : continuesPreviousDate
            ? previousScenarioDates
            : [];
        const dateGroupId =
          row.dateGroupId ??
          (continuesPreviousDate
            ? previousScenarioDateGroupId
            : `scenario-date-${index + 1}`);
        const continuesPreviousSection =
          !row.section?.trim() &&
          dateGroupId === previousScenarioDateGroupId &&
          Boolean(previousScenarioSectionGroupId);
        const sectionGroupId =
          row.sectionGroupId ??
          (continuesPreviousSection
            ? previousScenarioSectionGroupId
            : `scenario-section-${index + 1}`);

        if (normalizedStartDate) previousScenarioStartDate = normalizedStartDate;
        if (normalizedEndDate) previousScenarioEndDate = normalizedEndDate;
        previousScenarioDates = normalizedDates;
        if (section?.trim()) previousScenarioSection = section;
        previousScenarioDateGroupId = dateGroupId;
        previousScenarioSectionGroupId = sectionGroupId;

        const normalizedRow = {
          ...row,
          dateGroupId,
          sectionGroupId,
          startDate: normalizedStartDate,
          endDate: normalizedEndDate,
          dates: normalizedDates,
          section,
        };
        const explicitPath = Array.isArray(row.headingPath);
        const headingPath = explicitPath
          ? scenarioHeadingPath(normalizedRow)
          : continuesPreviousSection && previousScenarioHeadingPath
            ? previousScenarioHeadingPath
            : scenarioHeadingPath(normalizedRow);
        previousScenarioHeadingPath = headingPath;
        return withScenarioHeadingPath(normalizedRow, headingPath);
      })
    : base.appendixScenarios;

  return {
    id: typeof source.id === "string" ? source.id : "draft",
    version: 1,
    metadata: {
      ...metadata,
      perihal: metadata.autoPerihal ? generatePerihal(metadata) : metadata.perihal,
    },
    recipients: Array.isArray(source.recipients)
      ? source.recipients.map((row, index) => normalizeRecipient(row, index, "recipient"))
      : base.recipients,
    introduction: normalizeRichText(source.introduction),
    referenceEnabled: typeof source.referenceEnabled === "boolean"
      ? source.referenceEnabled
      : base.referenceEnabled,
    reference: normalizeRichText(source.reference),
    developmentRows: Array.isArray(source.developmentRows)
      ? source.developmentRows.map(normalizeDevelopmentRow)
      : base.developmentRows,
    pilotSchedule,
    activities,
    attachmentsEnabled:
      typeof source.attachmentsEnabled === "boolean"
        ? source.attachmentsEnabled
        : Boolean(source.attachments),
    attachments: stringValue(source.attachments, base.attachments),
    contacts: Array.isArray(source.contacts)
      ? source.contacts.map(normalizeContact)
      : base.contacts,
    signers: Array.isArray(source.signers)
      ? source.signers.map(normalizeSigner)
      : base.signers,
    ccRecipients: Array.isArray(source.ccRecipients)
      ? source.ccRecipients.map((row, index) => normalizeRecipient(row, index, "cc"))
      : base.ccRecipients,
    initials: stringValue(source.initials, base.initials),
    initialsBureau: stringValue(source.initialsBureau, base.initialsBureau) as MemoDraft["initialsBureau"],
    scenarioLetterResetPerDate:
      typeof source.scenarioLetterResetPerDate === "boolean"
        ? source.scenarioLetterResetPerDate
        : base.scenarioLetterResetPerDate,
    appendixScenarios,
    reviewComments: normalizeReviewComments(source.reviewComments),
    reviewAuditLog: normalizeReviewAuditLog(source.reviewAuditLog),
    updatedAt: stringValue(source.updatedAt, new Date().toISOString()),
  };
}
