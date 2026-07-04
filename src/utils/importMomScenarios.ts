import type { ScenarioRow } from "@/types/memo";
import { paragraphRichText } from "@/types/richText";
import { createScenarioRow } from "@/templates/bcaMemoTemplate";
import { createId } from "@/utils/ids";

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : {};
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toIsoDate(value: string) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());
  if (!match) return "";

  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00`);

  return Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getDate() !== Number(day)
    ? ""
    : iso;
}

function parseDateRange(value: unknown) {
  const parts = asText(value).split(/\s+-\s+/);
  const startDate = toIsoDate(parts[0] ?? "");
  const endDate = toIsoDate(parts[1] ?? parts[0] ?? "");

  if (!startDate || !endDate) {
    throw new Error("Tanggal Lampiran Skenario MOM tidak valid.");
  }

  return { startDate, endDate };
}

export function importMomScenarioRows(input: unknown): ScenarioRow[] {
  const root = asRecord(input);
  if (!Array.isArray(root.lampiranState)) {
    throw new Error("File MOM tidak memiliki lampiranState yang valid.");
  }

  const rows: ScenarioRow[] = [];

  for (const dateValue of root.lampiranState) {
    const date = asRecord(dateValue);
    const range = parseDateRange(date.date);
    const dateGroupId = createId("scenario-date");
    const features = Array.isArray(date.features) ? date.features : [];

    for (const featureValue of features) {
      const feature = asRecord(featureValue);
      const sectionGroupId = createId("scenario-section");
      const scenarios = Array.isArray(feature.scenarios) ? feature.scenarios : [];

      for (const scenarioValue of scenarios) {
        const scenario = asRecord(scenarioValue);
        rows.push(
          createScenarioRow({
            ...range,
            dateGroupId,
            sectionGroupId,
            section: asText(feature.title),
            scenario: paragraphRichText(asText(scenario.activity)),
            expectedResult: paragraphRichText(asText(scenario.result)),
            pic: "",
          }),
        );
      }
    }
  }

  if (!rows.length) {
    throw new Error("File MOM tidak memiliki skenario yang dapat diimport.");
  }

  return rows;
}
