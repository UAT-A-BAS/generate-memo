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
import { emptyRichText } from "@/types/richText";
import { generatePerihal } from "@/utils/generatePerihal";
import { createId } from "@/utils/ids";
import {
  isValidInputDate,
  normalizeDateSelection,
} from "@/utils/formatDateRangeID";
import { scenarioHeadingPath, withScenarioHeadingPath } from "@/utils/scenarioHierarchy";

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
    .map((item) => {
      let id = typeof item.id === "string" && item.id.trim() ? item.id : createId("reply");
      while (usedIds.has(id)) id = createId("reply");
      usedIds.add(id);

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
    .map((item) => {
      let id = typeof item.id === "string" && item.id.trim() ? item.id : createId("comment");
      while (usedIds.has(id)) id = createId("comment");
      usedIds.add(id);

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
    .map((item) => {
      let id = typeof item.id === "string" && item.id.trim() ? item.id : createId("audit");
      while (usedIds.has(id)) id = createId("audit");
      usedIds.add(id);

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

export function normalizeMemoDraft(input: MemoDraftInput): MemoDraft {
  const base = createInitialMemoDraft();
  const metadata = {
    ...base.metadata,
    ...(input.metadata ?? {}),
  };
  const pilotSchedule = normalizeDateFields(input.pilotSchedule ?? base.pilotSchedule);

  const activities = Array.isArray(input.activities)
    ? input.activities.map((row) => normalizeDateFields(row))
    : base.activities;
  let previousScenarioStartDate = "";
  let previousScenarioEndDate = "";
  let previousScenarioDates: string[] = [];
  let previousScenarioSection = "";
  let previousScenarioDateGroupId = "";
  let previousScenarioSectionGroupId = "";
  let previousScenarioHeadingPath: ScenarioRow["headingPath"] = undefined;
  const appendixScenarios = Array.isArray(input.appendixScenarios)
    ? input.appendixScenarios.map((row) => {
        const legacyDate = (row as ScenarioRow & { date?: string }).date ?? "";
        const dates = normalizeDateSelection(row.dates);
        const rawStartDate = row.startDate ?? legacyDate;
        const validStartDate = isValidInputDate(rawStartDate) ? rawStartDate : "";
        const validEndDate = isValidInputDate(row.endDate ?? "") ? row.endDate ?? "" : "";
        const startDate = dates[0] ?? validStartDate;
        const endDate = dates.at(-1) ?? (validEndDate || validStartDate);
        const section = row.section?.trim() ? row.section : previousScenarioSection;
        const normalizedStartDate = startDate || previousScenarioStartDate;
        const normalizedEndDate = endDate || previousScenarioEndDate || normalizedStartDate;
        const continuesPreviousDate = !startDate && !endDate && Boolean(previousScenarioDateGroupId);
        const normalizedDates = dates.length
          ? dates
          : continuesPreviousDate
            ? previousScenarioDates
            : [];
        const dateGroupId =
          row.dateGroupId ??
          (continuesPreviousDate ? previousScenarioDateGroupId : createId("scenario-date"));
        const continuesPreviousSection =
          !row.section?.trim() &&
          dateGroupId === previousScenarioDateGroupId &&
          Boolean(previousScenarioSectionGroupId);
        const sectionGroupId =
          row.sectionGroupId ??
          (continuesPreviousSection
            ? previousScenarioSectionGroupId
            : createId("scenario-section"));

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
    ...base,
    ...input,
    version: 1,
    id: input.id ?? createId("draft"),
    metadata: {
      ...metadata,
      perihal: metadata.autoPerihal ? generatePerihal(metadata) : metadata.perihal,
    },
    recipients: Array.isArray(input.recipients) ? input.recipients : base.recipients,
    introduction: input.introduction ?? base.introduction,
    referenceEnabled: input.referenceEnabled ?? base.referenceEnabled,
    reference: input.reference ?? base.reference,
    developmentRows: Array.isArray(input.developmentRows)
      ? input.developmentRows
      : base.developmentRows,
    pilotSchedule,
    activities,
    attachmentsEnabled:
      typeof input.attachmentsEnabled === "boolean"
        ? input.attachmentsEnabled
        : Boolean(input.attachments),
    attachments: typeof input.attachments === "string" ? input.attachments : base.attachments,
    contacts: Array.isArray(input.contacts) ? input.contacts : base.contacts,
    signers: Array.isArray(input.signers) ? input.signers : base.signers,
    ccRecipients: input.ccRecipients ?? base.ccRecipients,
    initialsBureau: input.initialsBureau ?? base.initialsBureau,
    appendixScenarios,
    reviewComments: normalizeReviewComments(input.reviewComments),
    reviewAuditLog: normalizeReviewAuditLog(input.reviewAuditLog),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}
