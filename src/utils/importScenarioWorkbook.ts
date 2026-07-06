import JSZip from "jszip";
import type { ScenarioHeading, ScenarioRow } from "@/types/memo";
import type { RichTextDoc, RichTextNode } from "@/types/richText";
import { paragraphRichText } from "@/types/richText";
import { createScenarioRow } from "@/templates/bcaMemoTemplate";
import { datesFromRange } from "@/utils/formatDateRangeID";
import { createId } from "@/utils/ids";
import { scenarioHierarchyDepth } from "@/utils/scenarioHierarchy";

type CellValue = {
  text: string;
  richText: RichTextDoc;
};
type SheetRow = Map<number, CellValue>;

export type ScenarioWorkbookSheet = {
  name: string;
  rows: ScenarioRow[];
  ignoredRows: number;
  hierarchyDepth: number;
};

export type ScenarioWorkbookPreview = {
  activeSheetName: string;
  sheets: ScenarioWorkbookSheet[];
};

const HEADER_ALIASES = {
  number: ["no", "nomor", "number"],
  scenario: ["aktivitas", "activity", "skenario", "scenario"],
  result: ["hasil", "expected", "hasil expected", "result", "keterangan"],
  pic: ["pic", "pelaksana", "owner"],
  date: ["tanggal", "date", "waktu"],
} as const;

const MONTHS: Record<string, number> = {
  januari: 1, january: 1, jan: 1,
  februari: 2, february: 2, feb: 2,
  maret: 3, march: 3, mar: 3,
  april: 4, apr: 4,
  mei: 5, may: 5,
  juni: 6, june: 6, jun: 6,
  juli: 7, july: 7, jul: 7,
  agustus: 8, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  oktober: 10, october: 10, oct: 10, okt: 10,
  november: 11, nov: 11,
  desember: 12, december: 12, dec: 12, des: 12,
};

function xml(text: string) {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.getElementsByTagName("parsererror").length) {
    throw new Error("Struktur XML pada file Excel tidak valid.");
  }
  return document;
}

function elements(document: Document | Element, localName: string) {
  return Array.from(document.getElementsByTagNameNS("*", localName));
}

function cleanHeader(value: string) {
  return value
    .toLocaleLowerCase("id-ID")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function paragraphNodeFromLines(lines: string[]): RichTextNode {
  const content = lines.flatMap((line, index) => {
    const nodes: RichTextNode[] = [];
    if (index > 0) nodes.push({ type: "hardBreak" });
    if (line) nodes.push({ type: "text", text: line });
    return nodes;
  });

  return { type: "paragraph", content };
}

function listItemNode(text: string): RichTextNode {
  return {
    type: "listItem",
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : [],
      },
    ],
  };
}

function richTextFromCellText(value: string): RichTextDoc {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return paragraphRichText("");

  const content: RichTextNode[] = [];
  let textLines: string[] = [];
  let list: RichTextNode | null = null;

  const flushText = () => {
    if (!textLines.length) return;
    content.push(paragraphNodeFromLines(textLines));
    textLines = [];
  };

  const flushList = () => {
    if (!list) return;
    content.push(list);
    list = null;
  };

  normalized.split("\n").forEach((rawLine) => {
    const line = rawLine.trim();
    const bullet = /^[•●○▪▫‣]\s*(.+)$/.exec(line);
    if (bullet) {
      flushText();
      if (list?.type !== "bulletList") flushList();
      list ??= { type: "bulletList", content: [] };
      list.content ??= [];
      list.content.push(listItemNode(bullet[1].trim()));
      return;
    }

    const ordered = /^(\d+)[.)]\s+(.+)$/.exec(line);
    if (ordered) {
      flushText();
      if (list?.type !== "orderedList") flushList();
      list ??= {
        type: "orderedList",
        attrs: { start: Number(ordered[1]) || 1 },
        content: [],
      };
      list.content ??= [];
      list.content.push(listItemNode(ordered[2].trim()));
      return;
    }

    flushList();
    textLines.push(line);
  });

  flushText();
  flushList();

  return { type: "doc", content: content.length ? content : paragraphRichText("").content };
}

function cellValue(text: string): CellValue {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  return {
    text: normalized,
    richText: richTextFromCellText(normalized),
  };
}

function cellText(value?: CellValue) {
  return value?.text ?? "";
}

function cellRichText(value?: CellValue) {
  return value?.richText ?? paragraphRichText("");
}

function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "A";
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function parseReference(reference: string) {
  return {
    column: columnIndex(reference),
    row: Number(reference.match(/\d+$/)?.[0] ?? 1) - 1,
  };
}

function isoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function excelSerialDate(serial: number) {
  const milliseconds = Math.round((serial - 25569) * 86400 * 1000);
  const date = new Date(milliseconds);
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function parseDateRange(value: string) {
  const source = value.trim();
  if (!source) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) {
    return { startDate: source, endDate: source, dates: [source] };
  }

  const numeric = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s*(?:-|–|—|s\/d)\s*(\d{1,2})[\/-](\d{1,2})[\/-](\d{4}))?$/i.exec(source);
  if (numeric) {
    const startDate = isoDate(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
    const endDate = numeric[4]
      ? isoDate(Number(numeric[6]), Number(numeric[5]), Number(numeric[4]))
      : startDate;
    return startDate && endDate ? { startDate, endDate, dates: datesFromRange(startDate, endDate) } : null;
  }

  const words = /^(\d{1,2})(?:\s*(?:-|–|—|s\/d)\s*(\d{1,2}))?\s+([A-Za-z]+)\s+(\d{4})$/i.exec(source);
  if (!words) return null;
  const month = MONTHS[words[3].toLocaleLowerCase("id-ID")];
  const startDate = month ? isoDate(Number(words[4]), month, Number(words[1])) : "";
  const endDate = month ? isoDate(Number(words[4]), month, Number(words[2] ?? words[1])) : "";
  return startDate && endDate ? { startDate, endDate, dates: datesFromRange(startDate, endDate) } : null;
}

function dateRangeFromRow(row: SheetRow, columns: ColumnMap) {
  const columnRange = parseDateRange(cellText(row.get(columns.date ?? -1)));
  if (columnRange) return columnRange;

  const uniqueValues = [...new Set([...row.values()].map(cellText).filter(Boolean))];
  return uniqueValues.length === 1 ? parseDateRange(uniqueValues[0]) : null;
}

function normalizeTarget(target: string) {
  const clean = target.replace(/^\//, "");
  return clean.startsWith("xl/") ? clean : `xl/${clean}`;
}

async function sharedStrings(zip: JSZip) {
  const file = zip.file("xl/sharedStrings.xml");
  if (!file) return [];
  return elements(xml(await file.async("string")), "si").map((item) =>
    cellValue(elements(item, "t").map((textNode) => textNode.textContent ?? "").join("")),
  );
}

async function dateStyleIndexes(zip: JSZip) {
  const file = zip.file("xl/styles.xml");
  if (!file) return new Set<number>();
  const document = xml(await file.async("string"));
  const custom = new Map<number, string>();
  elements(document, "numFmt").forEach((item) => {
    custom.set(Number(item.getAttribute("numFmtId")), item.getAttribute("formatCode") ?? "");
  });
  const cellXfs = elements(document, "cellXfs")[0];
  const styles = new Set<number>();
  elements(cellXfs ?? document.createElement("cellXfs"), "xf").forEach((item, index) => {
    const id = Number(item.getAttribute("numFmtId") ?? 0);
    const format = custom.get(id) ?? "";
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[dmy]/i.test(format.replace(/\[[^\]]+]/g, ""))) {
      styles.add(index);
    }
  });
  return styles;
}

function worksheetRows(
  document: Document,
  strings: CellValue[],
  dateStyles: Set<number>,
) {
  const rows = new Map<number, SheetRow>();
  const cells = document.getElementsByTagNameNS("*", "c");
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells.item(index);
    if (!cell) continue;
    const reference = cell.getAttribute("r") ?? "A1";
    const { row, column } = parseReference(reference);
    const type = cell.getAttribute("t") ?? "";
    const raw = elements(cell, "v")[0]?.textContent ?? "";
    let value: CellValue;
    if (type === "s") value = strings[Number(raw)] ?? cellValue("");
    else if (type === "inlineStr") value = cellValue(elements(cell, "is")[0]?.textContent ?? "");
    else if (type === "str") value = cellValue(raw);
    else if (dateStyles.has(Number(cell.getAttribute("s") ?? -1)) && raw) value = cellValue(excelSerialDate(Number(raw)));
    else value = cellValue(raw);
    if (!value.text.trim()) continue;
    if (!rows.has(row)) rows.set(row, new Map());
    rows.get(row)?.set(column, value);
  }

  elements(document, "mergeCell").forEach((merge) => {
    const [from, to] = (merge.getAttribute("ref") ?? "").split(":");
    if (!from || !to) return;
    const start = parseReference(from);
    const end = parseReference(to);
    const value = rows.get(start.row)?.get(start.column);
    if (!value?.text || end.row - start.row > 1000 || end.column - start.column > 30) return;
    for (let row = start.row; row <= end.row; row += 1) {
      if (!rows.has(row)) rows.set(row, new Map());
      for (let column = start.column; column <= end.column; column += 1) {
        if (!rows.get(row)?.get(column)) rows.get(row)?.set(column, value);
      }
    }
  });

  return rows;
}

type ColumnMap = Partial<Record<keyof typeof HEADER_ALIASES, number>>;

function findColumns(rows: Map<number, SheetRow>) {
  let best: { row: number; columns: ColumnMap; score: number } | null = null;
  for (const [rowNumber, row] of [...rows.entries()].slice(0, 80)) {
    const columns: ColumnMap = {};
    row.forEach((value, column) => {
      const header = cleanHeader(cellText(value));
      (Object.keys(HEADER_ALIASES) as (keyof typeof HEADER_ALIASES)[]).forEach((key) => {
        if (HEADER_ALIASES[key].some((alias) => header === alias || header.includes(alias))) {
          columns[key] ??= column;
        }
      });
    });
    const score = Object.keys(columns).length;
    if (!best || score > best.score) best = { row: rowNumber, columns, score };
  }
  if (!best || best.columns.scenario === undefined || best.columns.result === undefined) {
    throw new Error("Kolom Aktivitas/Skenario dan Hasil/Expected tidak ditemukan.");
  }
  return best;
}

function headingDefinition(value: string) {
  const match = /^([A-Z])(?:\.(\d+))?(?:\.(\d+))?\.?\s*(.+)$/i.exec(value.trim());
  if (!match || !match[4]?.trim()) return null;
  const codes = [match[1].toUpperCase(), match[2], match[3]].filter(Boolean) as string[];
  return { codes, title: match[4].trim() };
}

function parseSheet(name: string, rows: Map<number, SheetRow>): ScenarioWorkbookSheet {
  const header = findColumns(rows);
  const columns = header.columns;
  const headingTitles = new Map<string, string>();
  let currentCodes: string[] = [];
  let currentRange: ReturnType<typeof parseDateRange> = null;
  let currentDateKey = "";
  let dateGroupId = "";
  let ignoredRows = 0;
  const inspectedRows: string[] = [];
  const headingIds = new Map<string, string>();
  const scenarios: ScenarioRow[] = [];

  [...rows.entries()]
    .filter(([rowNumber]) => rowNumber > header.row)
    .sort(([a], [b]) => a - b)
    .forEach(([, row]) => {
      const values = [...row.values()].map(cellText).filter(Boolean);
      if (!values.length) return;
      const numberText = cellText(row.get(columns.number ?? 0) ?? row.get(0));
      const scenarioCell = row.get(columns.scenario as number);
      const resultCell = row.get(columns.result as number);
      const scenarioText = cellText(scenarioCell);
      const resultText = cellText(resultCell);
      if (inspectedRows.length < 4) inspectedRows.push(`${numberText} | ${scenarioText} | ${resultText}`);
      const normalizedScenarioHeader = cleanHeader(scenarioText);
      if (HEADER_ALIASES.scenario.some((alias) => normalizedScenarioHeader === alias) &&
          HEADER_ALIASES.result.some((alias) => cleanHeader(resultText) === alias || cleanHeader(resultText) === "hasil expected")) return;

      const parsedRange = dateRangeFromRow(row, columns);
      if (parsedRange) currentRange = parsedRange;

      const heading = headingDefinition(numberText);
      if (
        heading &&
        (!scenarioText || scenarioText === numberText) &&
        (!resultText || resultText === numberText)
      ) {
        currentCodes = heading.codes;
        headingTitles.set(currentCodes.join("."), heading.title);
        return;
      }

      const isScenario = Boolean(scenarioText || resultText) && (
        !numberText.trim() || /^\d+(?:[.)])?$/.test(numberText.trim())
      );
      if (!isScenario) {
        ignoredRows += 1;
        return;
      }

      const dateKey = currentRange ? `${currentRange.startDate}:${currentRange.endDate}` : "undated";
      if (!dateGroupId || dateKey !== currentDateKey) {
        currentDateKey = dateKey;
        dateGroupId = createId("scenario-date");
      }

      const path: ScenarioHeading[] = currentCodes.map((_, index) => {
        const code = currentCodes.slice(0, index + 1).join(".");
        const key = `${dateGroupId}:${code}`;
        if (!headingIds.has(key)) headingIds.set(key, createId(`scenario-heading-${index + 1}`));
        return {
          id: headingIds.get(key) as string,
          title: headingTitles.get(code) ?? code,
        };
      });

      scenarios.push(createScenarioRow({
        dateGroupId,
        headingPath: path,
        startDate: currentRange?.startDate ?? "",
        endDate: currentRange?.endDate ?? "",
        dates: currentRange?.dates ?? [],
        scenario: cellRichText(scenarioCell),
        expectedResult: cellRichText(resultCell),
        pic: cellText(row.get(columns.pic ?? -1)),
      }));
    });

  if (!scenarios.length) {
    throw new Error(`Sheet “${name}” tidak memiliki skenario yang dapat diimport. Contoh baris: ${inspectedRows.join("; ") || "kosong"}.`);
  }
  return {
    name,
    rows: scenarios,
    ignoredRows,
    hierarchyDepth: scenarioHierarchyDepth(scenarios),
  };
}

export async function importScenarioWorkbook(file: File): Promise<ScenarioWorkbookPreview> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const workbookFile = zip.file("xl/workbook.xml");
  const relationshipFile = zip.file("xl/_rels/workbook.xml.rels");
  if (!workbookFile || !relationshipFile) throw new Error("File Excel tidak memiliki struktur workbook yang valid.");

  const workbook = xml(await workbookFile.async("string"));
  const relationships = xml(await relationshipFile.async("string"));
  const targets = new Map(
    elements(relationships, "Relationship").map((item) => [
      item.getAttribute("Id") ?? "",
      normalizeTarget(item.getAttribute("Target") ?? ""),
    ]),
  );
  const allSheets = elements(workbook, "sheet").map((sheet, index) => ({
    index,
    name: sheet.getAttribute("name") ?? `Sheet ${index + 1}`,
    state: sheet.getAttribute("state") ?? "visible",
    relationshipId: sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? sheet.getAttribute("r:id") ?? "",
  }));
  const visibleSheets = allSheets.filter((sheet) => sheet.state === "visible");
  if (!visibleSheets.length) throw new Error("File Excel tidak memiliki sheet yang terlihat.");

  const strings = await sharedStrings(zip);
  const styles = await dateStyleIndexes(zip);
  const parsedSheets: ScenarioWorkbookSheet[] = [];
  const errors: string[] = [];
  for (const sheet of visibleSheets) {
    const target = targets.get(sheet.relationshipId);
    const worksheet = target ? zip.file(target) : null;
    if (!worksheet) continue;
    try {
      parsedSheets.push(parseSheet(sheet.name, worksheetRows(xml(await worksheet.async("string")), strings, styles)));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Sheet “${sheet.name}” tidak dapat dibaca.`);
    }
  }
  if (!parsedSheets.length) throw new Error(errors[0] ?? "Tidak ada sheet yang memiliki skenario.");

  const activeIndex = Number(elements(workbook, "workbookView")[0]?.getAttribute("activeTab") ?? 0);
  const activeName = allSheets[activeIndex]?.name;
  return {
    activeSheetName: parsedSheets.some((sheet) => sheet.name === activeName)
      ? activeName
      : parsedSheets[0].name,
    sheets: parsedSheets,
  };
}
