import type {
  CustomSection,
  CustomSectionAnchor,
  MemoType,
} from "@/types/memo";
import { emptyRichText } from "@/types/richText";
import { createId } from "@/utils/ids";

/**
 * Every anchor is a boundary between two built-in sections. The list is
 * ordered the same way the memo body is rendered, and the first and the last
 * entry keep custom sections below Pengantar and above PIC yang Dapat Dihubungi.
 */
export const CUSTOM_SECTION_ANCHORS: CustomSectionAnchor[] = [
  "introduction",
  "reference",
  "development",
  "pilot-schedule",
  "activities",
  "access-link",
  "attachments",
];

const ANCHOR_LABELS: Record<CustomSectionAnchor, string> = {
  introduction: "Setelah Pengantar",
  reference: "Setelah Referensi",
  development: "Setelah Lingkup Pengembangan",
  "pilot-schedule": "Setelah Jadwal Implementasi",
  activities: "Setelah Aktivitas Cabang dan Unit Kerja",
  "access-link": "Setelah Akses Link",
  attachments: "Sebelum PIC yang Dapat Dihubungi",
};

export function isCustomSectionAnchor(value: unknown): value is CustomSectionAnchor {
  return typeof value === "string" &&
    (CUSTOM_SECTION_ANCHORS as string[]).includes(value);
}

export function normalizeCustomSectionAnchor(value: unknown): CustomSectionAnchor {
  return isCustomSectionAnchor(value) ? value : "introduction";
}

export function customSectionAnchorLabel(
  anchor: CustomSectionAnchor,
  memoType: MemoType,
) {
  if (anchor === "pilot-schedule") {
    return memoType === "Pilot"
      ? "Setelah Jadwal Pilot Implementasi"
      : "Setelah Jadwal Implementasi";
  }

  return ANCHOR_LABELS[anchor] ?? ANCHOR_LABELS.introduction;
}

export function createCustomSection(seed: Partial<CustomSection> = {}): CustomSection {
  return {
    id: createId("custom-section"),
    title: "",
    content: emptyRichText(),
    enabled: true,
    after: "introduction",
    ...seed,
  };
}

export function customSectionsForAnchor(
  sections: CustomSection[],
  anchor: CustomSectionAnchor,
) {
  return sections.filter((section) => section.after === anchor);
}

export function enabledCustomSectionsForAnchor(
  sections: CustomSection[],
  anchor: CustomSectionAnchor,
) {
  return sections.filter((section) => section.enabled && section.after === anchor);
}

/**
 * Moves a section one step up or down among the sections that share its anchor.
 * The stored array order is the render order inside one anchor.
 */
export function reorderCustomSection(
  sections: CustomSection[],
  id: string,
  direction: -1 | 1,
) {
  const index = sections.findIndex((section) => section.id === id);
  if (index < 0) return sections;

  const anchor = sections[index].after;
  const siblingIndexes = sections
    .map((section, position) => (section.after === anchor ? position : -1))
    .filter((position) => position >= 0);
  const targetIndex = siblingIndexes[siblingIndexes.indexOf(index) + direction];
  if (targetIndex === undefined) return sections;

  const next = [...sections];
  next[index] = sections[targetIndex];
  next[targetIndex] = sections[index];
  return next;
}
