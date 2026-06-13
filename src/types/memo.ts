import type { RichTextDoc } from "./richText";

export type GenderTitle = "" | "Bapak" | "Ibu" | "Tim" | "Yth.";

export type MemoType = "Pilot" | "Nasional";

export type Bureau = "A" | "B" | "C" | "D";

export type Recipient = {
  id: string;
  gender: GenderTitle;
  name?: string;
  position: string;
  bureau?: string;
};

export type DevelopmentRow = {
  id: string;
  item: RichTextDoc;
  description: RichTextDoc;
};

export type ActivityRow = {
  id: string;
  startDate: string;
  endDate: string;
  activity: RichTextDoc;
  owner: string;
};

export type ScenarioRow = {
  id: string;
  dateGroupId?: string;
  sectionGroupId?: string;
  startDate: string;
  endDate: string;
  section: string;
  scenario: RichTextDoc;
  expectedResult: RichTextDoc;
  pic: string;
  notes: RichTextDoc;
  isSectionHeader?: boolean;
};

export type ContactRow = {
  id: string;
  name: string;
  email: string;
};

export type SignerRow = {
  id: string;
  name: string;
  title: string;
};

export type ReviewComment = {
  id: string;
  type: "field" | "preview";
  targetId: string;
  targetLabel: string;
  path: number[];
  text: string;
  author: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MemoMetadata = {
  noMemo: string;
  releaseDate: string;
  memoType: MemoType;
  projectName: string;
  bureau: Bureau;
  perihal: string;
  autoPerihal: boolean;
  accessLinkEnabled: boolean;
  accessLink: string;
};

export type PilotSchedule = {
  startDate: string;
  endDate: string;
};

export type MemoDraft = {
  id: string;
  version: 1;
  metadata: MemoMetadata;
  recipients: Recipient[];
  introduction: RichTextDoc;
  referenceEnabled: boolean;
  reference: RichTextDoc;
  developmentRows: DevelopmentRow[];
  pilotSchedule: PilotSchedule;
  activities: ActivityRow[];
  attachmentsEnabled: boolean;
  attachments: string;
  contacts: ContactRow[];
  signers: SignerRow[];
  ccRecipients: Recipient[];
  initials: string;
  initialsBureau: Bureau;
  appendixScenarios: ScenarioRow[];
  reviewComments: ReviewComment[];
  updatedAt: string;
};

export type MemoCollectionKey =
  | "recipients"
  | "developmentRows"
  | "activities"
  | "contacts"
  | "signers"
  | "ccRecipients"
  | "appendixScenarios";
