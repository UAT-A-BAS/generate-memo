import type {
  ActivityRow,
  ContactRow,
  DevelopmentRow,
  MemoDraft,
  MemoMetadata,
  Recipient,
  ScenarioRow,
  SignerRow,
} from "@/types/memo";
import { emptyRichText } from "@/types/richText";
import { generatePerihal } from "@/utils/generatePerihal";
import { createId } from "@/utils/ids";

export function createRecipient(seed: Partial<Recipient> = {}): Recipient {
  return {
    id: createId("recipient"),
    gender: "Bapak",
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
  return {
    id: createId("scenario"),
    dateGroupId: seed.dateGroupId ?? createId("scenario-date"),
    startDate: "",
    endDate: "",
    section: "",
    scenario: emptyRichText(),
    expectedResult: emptyRichText(),
    pic: "",
    notes: emptyRichText(),
    ...seed,
  };
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
    contacts: [createContactRow()],
    signers: [createSignerRow()],
    ccRecipients: [createRecipient()],
    initials: "",
    initialsBureau: "A",
    appendixScenarios: [createScenarioRow()],
    updatedAt: new Date().toISOString(),
  };
}

export type MemoDraftInput = Partial<Omit<MemoDraft, "metadata">> & {
  metadata?: Partial<MemoMetadata>;
};

export function normalizeMemoDraft(input: MemoDraftInput): MemoDraft {
  const base = createInitialMemoDraft();
  const metadata = {
    ...base.metadata,
    ...(input.metadata ?? {}),
  };

  const activities = Array.isArray(input.activities)
    ? input.activities.map((row) => ({
        ...row,
        startDate: row.startDate ?? "",
        endDate: row.endDate ?? row.startDate ?? "",
      }))
    : base.activities;
  const appendixScenarios = Array.isArray(input.appendixScenarios)
    ? input.appendixScenarios.map((row) => {
        const legacyDate = (row as ScenarioRow & { date?: string }).date ?? "";
        return {
          ...row,
          dateGroupId: row.dateGroupId ?? createId("scenario-date"),
          startDate: row.startDate ?? legacyDate,
          endDate: row.endDate ?? row.startDate ?? legacyDate,
        };
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
    pilotSchedule: input.pilotSchedule ?? base.pilotSchedule,
    activities,
    contacts: Array.isArray(input.contacts) ? input.contacts : base.contacts,
    signers: Array.isArray(input.signers) ? input.signers : base.signers,
    ccRecipients: input.ccRecipients ?? base.ccRecipients,
    initialsBureau: input.initialsBureau ?? base.initialsBureau,
    appendixScenarios,
    updatedAt: new Date().toISOString(),
  };
}
