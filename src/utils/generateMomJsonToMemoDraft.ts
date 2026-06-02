import type { MemoDraft, ScenarioRow } from "@/types/memo";
import { paragraphRichText } from "@/types/richText";
import { createScenarioRow, normalizeMemoDraft } from "@/templates/bcaMemoTemplate";

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asLines(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean).join("\n");
  }

  return asString(value);
}

function mapScenario(value: unknown): ScenarioRow {
  const item = asRecord(value);

  return createScenarioRow({
    startDate: asString(item.startDate ?? item.date ?? item.tanggal),
    endDate: asString(item.endDate ?? item.startDate ?? item.date ?? item.tanggal),
    section: asString(item.section ?? item.group ?? item.kategori, "Skenario"),
    scenario: paragraphRichText(
      asString(item.scenario ?? item.skenario ?? item.activity ?? item.aktivitas),
    ),
    expectedResult: paragraphRichText(
      asString(item.expectedResult ?? item.expected_result ?? item.hasil, "Sesuai ekspektasi"),
    ),
    pic: asString(item.pic ?? item.owner ?? item.penanggungJawab, ""),
    notes: paragraphRichText(asString(item.notes ?? item.catatan)),
  });
}

export function generateMomJsonToMemoDraft(input: unknown): MemoDraft {
  const root = asRecord(input);
  const scenarios =
    asArray(root.scenarios).length > 0
      ? asArray(root.scenarios)
      : asArray(root.items).length > 0
        ? asArray(root.items)
        : asArray(root.agenda);

  return normalizeMemoDraft({
    metadata: {
      projectName: asString(root.projectName ?? root.project ?? root.namaProject),
      perihal: asString(root.perihal),
      memoType: "Pilot",
      bureau: "A",
      noMemo: asString(root.noMemo ?? root.memoNumber),
      releaseDate: asString(root.releaseDate ?? root.tanggalRilis),
      autoPerihal: !root.perihal,
      accessLinkEnabled: Boolean(root.accessLink),
      accessLink: asString(root.accessLink),
    },
    attachments: asLines(root.attachments ?? root.lampiran),
    appendixScenarios: scenarios.map(mapScenario),
  });
}
