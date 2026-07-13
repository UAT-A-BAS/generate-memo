import { readFile } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";
import JSZip from "jszip";

function richText(text: string) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : [],
      },
    ],
  };
}

function richTextWithHardBreaks(lines: string[]) {
  return {
    type: "doc",
    content: [{
      type: "paragraph",
      content: lines.flatMap((text, index) => [
        ...(index ? [{ type: "hardBreak" }] : []),
        { type: "text", text },
      ]),
    }],
  };
}

function richList(type: "bulletList" | "orderedList", items: string[]) {
  return {
    type: "doc",
    content: [
      {
        type,
        attrs: type === "orderedList" ? { start: 1 } : undefined,
        content: items.map((text) => ({
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text }],
            },
          ],
        })),
      },
    ],
  };
}

function richListFrom(type: "bulletList" | "orderedList", start: number, items: string[]) {
  const doc = richList(type, items);
  if (type === "orderedList") {
    doc.content[0].attrs = { start };
  }
  return doc;
}

function richListWithTrailingEmpty(type: "bulletList" | "orderedList", items: string[]) {
  const doc = richList(type, items);
  return {
    ...doc,
    content: [
      ...doc.content,
      { type: "paragraph", content: [] },
    ],
  };
}

function completeDraft() {
  return {
    metadata: {
      memoType: "Pilot",
      projectName: "BDS Web Gen 2 versi 4.3.0",
      bureau: "A",
      autoPerihal: true,
      accessLinkEnabled: true,
      accessLink: "https://bdswebg2-pilot.intra.bca.co.id:63144/#/auth/login",
    },
    recipients: [{ id: "recipient-test", gender: "Ibu", name: "Agustina", position: "Kepala Operasi Cabang Pluit" }],
    developmentRows: [{ id: "development-test", item: richText("Pengembangan"), description: richText("Keterangan") }],
    pilotSchedule: { startDate: "2026-05-07", endDate: "2026-05-21" },
    activities: [{ id: "activity-test", startDate: "2026-05-07", endDate: "2026-05-21", owner: "Tim APV", activity: richText("Aktivitas") }],
    attachmentsEnabled: true,
    attachments: [
      "Draft SE Perihal: Pengembangan Pembukaan Rekening Giro Badan",
      "Skenario Pilot Implementasi BDS Web Gen 2 versi 4.3.0",
    ].join("\n"),
    contacts: [{ id: "contact-test", name: "Nama PIC", email: "pic@example.com" }],
    signers: [{ id: "signer-test", name: "Signer", title: "Jabatan" }],
    ccRecipients: [{ id: "cc-test", gender: "Bapak", name: "Verry Iskandar", position: "Kepala KCU Pluit" }],
    initials: "abc",
    initialsBureau: "A",
    appendixScenarios: [{
      id: "scenario-test",
      dateGroupId: "scenario-date-test",
      startDate: "2026-05-07",
      endDate: "2026-05-21",
      section: "Verifikasi Landing Page Pemol Giro Badan (SEEDS)",
      scenario: richText("Verifikasi pencarian data"),
      expectedResult: richText("Berhasil melakukan filter data"),
      pic: "Tim APV",
      notes: richText(""),
    }],
  };
}

function denseAppendixDraft() {
  return {
    ...completeDraft(),
    appendixScenarios: Array.from({ length: 12 }, (_, index) => {
      const dateIndex = Math.floor(index / 4);
      const day = 7 + dateIndex;
      return {
        id: `scenario-${index}`,
        dateGroupId: `date-${dateIndex}`,
        sectionGroupId: `section-${dateIndex}`,
        startDate: `2026-05-${String(day).padStart(2, "0")}`,
        endDate: `2026-05-${String(day).padStart(2, "0")}`,
        section: `Bagian ${dateIndex + 1}`,
        scenario: richText(`Skenario ${index + 1}`),
        expectedResult: richText(`Hasil ${index + 1}`),
        pic: "Tim APV",
        notes: richText(""),
      };
    }),
  };
}

function momScenarioPayload() {
  return {
    version: "mom-generator-draft-v1",
    projectName: "MUST NOT REPLACE MEMO",
    recipients: [{ position: "MUST NOT REPLACE RECIPIENTS" }],
    lampiranState: [
      {
        date: "01-07-2026",
        features: [
          {
            title: "Fitur Alpha",
            scenarios: [
              { activity: "Langkah Alpha 1", result: "Hasil Alpha 1" },
              { activity: "Langkah Alpha 2", result: "Hasil Alpha 2" },
            ],
          },
        ],
      },
      {
        date: "08-07-2026 - 09-07-2026",
        features: [
          {
            title: "Fitur Beta",
            scenarios: [{ activity: "Langkah Beta", result: "Hasil Beta" }],
          },
        ],
      },
    ],
  };
}

async function xlsxScenarioWorkbook() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView activeTab="1"/></bookViews>
  <sheets>
    <sheet name="Arsip" sheetId="1" state="hidden" r:id="rId1"/>
    <sheet name="Skenario Aktif" sheetId="2" r:id="rId2"/>
    <sheet name="Skenario Lain" sheetId="3" r:id="rId3"/>
  </sheets>
</workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
</Relationships>`);

  const escapeXml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const cell = (reference: string, value: string) =>
    `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  const row = (number: number, values: string[]) =>
    `<row r="${number}">${values.map((value, index) => value ? cell(`${String.fromCharCode(65 + index)}${number}`, value) : "").join("")}</row>`;
  const sheet = (rows: string, merges = "") => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rows}</sheetData>${merges}
</worksheet>`;

  zip.file("xl/worksheets/sheet1.xml", sheet(row(1, ["Arsip", "", "", "", ""])));
  zip.file("xl/worksheets/sheet2.xml", sheet([
    row(1, ["Lampiran - Skenario Pilot Implementasi", "", "", "", ""]),
    row(2, ["No", "Aktivitas", "Hasil/Expected", "PIC", "Tanggal"]),
    row(3, ["A. Verifikasi Utama", "", "", "", ""]),
    row(4, ["1", "Skenario langsung\nBaris lanjutan shift enter", "Hasil langsung\nBaris kedua hasil", "PIC Utama", "9 Juli 2026"]),
    row(5, ["A.1. Verifikasi Input", "", "", "", ""]),
    row(6, ["1", "Melakukan Txn 9623\n• Input nomor CIN Organisasi\n• Tekan F12", "Hasil subbagian\n1. Validasi pertama\n2. Validasi kedua", "PIC Input", ""]),
    row(7, ["A.1.1. Kondisi Khusus", "", "", "", ""]),
    row(8, ["1", "Skenario sub-subbagian", "Hasil khusus", "PIC Khusus", ""]),
    row(9, ["No", "Aktivitas", "Hasil/Expected", "PIC", "Tanggal"]),
    row(10, ["B. Verifikasi Kedua", "", "", "", ""]),
    row(11, ["1", "Skenario kedua", "Hasil kedua", "PIC Kedua", "10 Juli 2026"]),
  ].join("")));
  zip.file("xl/worksheets/sheet3.xml", sheet([
    row(1, ["No", "Aktivitas", "Hasil", "PIC"]),
    row(2, ["9 -12 Juni 2026", "", "", ""]),
    row(3, ["A. Verifikasi Sheet Lain", "", "", ""]),
    row(4, ["1", "Skenario sheet lain", "Hasil lain", "PIC Lain"]),
  ].join(""), '<mergeCells count="1"><mergeCell ref="A2:D2"/></mergeCells>'));

  return zip.generateAsync({ type: "nodebuffer" });
}

function pdfBorderStressDraft() {
  const base = completeDraft();
  const scenario = base.appendixScenarios[0];

  return {
    ...base,
    developmentRows: [
      { id: "development-alpha", item: richText("Pengembangan Alpha"), description: richText("Keterangan Alpha") },
      { id: "development-beta", item: richText("Pengembangan Beta"), description: richText("Keterangan Beta") },
    ],
    activities: [
      { id: "activity-alpha", startDate: "2026-07-02", endDate: "2026-07-03", owner: "PIC Alpha", activity: richText("Aktivitas Alpha") },
      { id: "activity-beta", startDate: "2026-07-31", endDate: "2026-07-31", owner: "PIC Beta", activity: richText("Aktivitas Beta") },
    ],
    appendixScenarios: [
      { ...scenario, id: "border-a1", dateGroupId: "border-date-a", sectionGroupId: "border-section-a", startDate: "2026-07-09", endDate: "2026-07-10", section: "Bagian Alpha", scenario: richText("Skenario Alpha 1"), expectedResult: richText("Hasil Alpha 1"), pic: "PIC Alpha" },
      { ...scenario, id: "border-a2", dateGroupId: "border-date-a", sectionGroupId: "border-section-a", startDate: "2026-07-09", endDate: "2026-07-10", section: "Bagian Alpha", scenario: richText("Skenario Alpha 2"), expectedResult: richText("Hasil Alpha 2"), pic: "PIC Alpha 2" },
      { ...scenario, id: "border-b1", dateGroupId: "border-date-a", sectionGroupId: "border-section-b", startDate: "2026-07-09", endDate: "2026-07-10", section: "Bagian Beta", scenario: richText("Skenario Beta 1"), expectedResult: richText("Hasil Beta 1"), pic: "PIC Beta" },
      { ...scenario, id: "border-b2", dateGroupId: "border-date-a", sectionGroupId: "border-section-b", startDate: "2026-07-09", endDate: "2026-07-10", section: "Bagian Beta", scenario: richText("Skenario Beta 2"), expectedResult: richText("Hasil Beta 2"), pic: "PIC Beta 2" },
      { ...scenario, id: "border-c1", dateGroupId: "border-date-b", sectionGroupId: "border-section-c", startDate: "2026-07-30", endDate: "2026-07-30", section: "Bagian Gamma", scenario: richText("Skenario Gamma 1"), expectedResult: richText("Hasil Gamma 1"), pic: "PIC Gamma" },
      { ...scenario, id: "border-c2", dateGroupId: "border-date-b", sectionGroupId: "border-section-c", startDate: "2026-07-30", endDate: "2026-07-30", section: "Bagian Gamma", scenario: richText("Skenario Gamma 2"), expectedResult: richText("Hasil Gamma 2"), pic: "PIC Gamma 2" },
    ],
  };
}

async function importDraft(page: Page, payload: unknown) {
  await page.locator("[data-draft-import-input]").setInputFiles({
    name: "draft.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}

async function documentXmlFrom(download: Download) {
  const parts = await docxPartsFrom(download);
  return parts.xml;
}

function documentTables(xml: string) {
  return xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];
}

function documentTableAround(xml: string, marker: string) {
  const markerIndex = xml.indexOf(marker);
  expect(markerIndex).toBeGreaterThan(-1);
  const tableStart = xml.lastIndexOf("<w:tbl>", markerIndex);
  const tableEnd = xml.indexOf("</w:tbl>", markerIndex) + "</w:tbl>".length;
  expect(tableStart).toBeGreaterThan(-1);
  expect(tableEnd).toBeGreaterThan(tableStart);
  return xml.slice(tableStart, tableEnd);
}

const TABLE_BORDER_EDGES = ["top", "left", "bottom", "right", "insideH", "insideV"];
type TestCellBorderEdge = "top" | "left" | "bottom" | "right";

type TestBorderCell = {
  start: number;
  end: number;
  merge: "none" | "restart" | "continue";
  edges: Set<TestCellBorderEdge>;
};

function xmlAttribute(xml: string, name: string) {
  return xml.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? "";
}

function parsePhysicalBorderTable(table: string) {
  const grid = [...table.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((match) => Number(match[1]));
  const rows = (table.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? []).map((rowXml) => {
    let column = 0;
    const cells = (rowXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? []).map((cellXml) => {
      const properties = cellXml.match(/<w:tcPr\b[\s\S]*?<\/w:tcPr>/)?.[0] ?? "";
      const spanXml = properties.match(/<w:gridSpan\b[^>]*\/>/)?.[0] ?? "";
      const span = Math.max(1, Number.parseInt(xmlAttribute(spanXml, "w:val"), 10) || 1);
      const mergeXml = properties.match(/<w:vMerge\b[^>]*\/>/)?.[0] ?? "";
      const merge = !mergeXml
        ? "none"
        : xmlAttribute(mergeXml, "w:val") === "restart" ? "restart" : "continue";
      const bordersXml = properties.match(/<w:tcBorders\b[\s\S]*?<\/w:tcBorders>/)?.[0] ?? "";
      const edges = new Set<TestCellBorderEdge>();
      for (const match of bordersXml.matchAll(/<w:(top|left|bottom|right)\b[^>]*\/>/g)) {
        const edge = match[1] as TestCellBorderEdge;
        expect(match[0]).toMatch(/w:val="single"/);
        expect(match[0]).toMatch(/w:sz="8"/);
        expect(match[0]).toMatch(/w:space="0"/);
        expect(match[0]).toMatch(/w:color="000000"/);
        edges.add(edge);
      }
      expect(bordersXml).not.toMatch(/<w:(?:insideH|insideV)\b/);
      const cell = { start: column, end: column + span, merge, edges } as TestBorderCell;
      column += span;
      return cell;
    });
    return cells;
  });

  return { grid, rows };
}

function expectPhysicalBorderOwnership(table: string) {
  const { grid, rows } = parsePhysicalBorderTable(table);
  expect(grid.length).toBeGreaterThan(0);
  const horizontal = new Map<string, string[]>();
  const vertical = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, key: string, owner: string) => {
    map.set(key, [...(map.get(key) ?? []), owner]);
  };

  rows.forEach((row, rowIndex) => {
    row.forEach((cell, cellIndex) => {
      const owner = `r${rowIndex}c${cellIndex}`;
      for (const edge of cell.edges) {
        if (edge === "top") {
          for (let column = cell.start; column < cell.end; column += 1) add(horizontal, `${rowIndex}:${column}`, `${owner}:top`);
        } else if (edge === "bottom") {
          for (let column = cell.start; column < cell.end; column += 1) add(horizontal, `${rowIndex + 1}:${column}`, `${owner}:bottom`);
        } else if (edge === "left") {
          add(vertical, `${rowIndex}:${cell.start}`, `${owner}:left`);
        } else if (edge === "right") {
          add(vertical, `${rowIndex}:${cell.end}`, `${owner}:right`);
        }
      }
      if (cell.merge === "continue") expect(cell.edges).not.toContain("top");
      if (cell.end - cell.start > 1) {
        for (let column = cell.start + 1; column < cell.end; column += 1) {
          expect(vertical.has(`${rowIndex}:${column}`)).toBe(false);
        }
      }
    });
  });

  const cellAt = (row: TestBorderCell[] | undefined, column: number) =>
    row?.find((cell) => cell.start <= column && column < cell.end);

  for (let rowIndex = 0; rowIndex <= rows.length; rowIndex += 1) {
    for (let column = 0; column < grid.length; column += 1) {
      const owners = horizontal.get(`${rowIndex}:${column}`) ?? [];
      expect(owners.length, `horizontal ${rowIndex}:${column}`).toBeLessThanOrEqual(1);
      if (rowIndex === 0 || rowIndex === rows.length) {
        expect(owners.length, `outer horizontal ${rowIndex}:${column}`).toBe(1);
        continue;
      }
      const upper = cellAt(rows[rowIndex - 1], column);
      const lower = cellAt(rows[rowIndex], column);
      const internalMerge = lower?.merge === "continue" && (upper?.merge === "restart" || upper?.merge === "continue");
      expect(owners.length, `shared horizontal ${rowIndex}:${column}`).toBe(internalMerge ? 0 : 1);
    }
  }

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const expectedColumns = new Set([0, grid.length, ...rows[rowIndex].filter((cell) => cell.start > 0).map((cell) => cell.start)]);
    for (const column of expectedColumns) {
      const owners = vertical.get(`${rowIndex}:${column}`) ?? [];
      expect(owners.length, `vertical ${rowIndex}:${column}`).toBe(1);
    }
  }
}

function expectStableTableLevelGrid(table: string) {
  const tableProperties = table.match(/<w:tblPr\b[\s\S]*?<\/w:tblPr>/)?.[0] ?? "";
  const tableBorders = tableProperties.match(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/)?.[0] ?? "";

  expect(tableProperties).not.toContain("<w:tblCellSpacing");
  expect(tableProperties).toContain('<w:tblLayout w:type="fixed"/>');
  expect(tableBorders).toBeTruthy();
  for (const edge of TABLE_BORDER_EDGES) {
    expect(tableBorders).toMatch(new RegExp(`<w:${edge}\\b[^>]*w:val="nil"`));
  }
  expect(tableBorders).not.toMatch(/w:val="single"/);
  expect(table).not.toMatch(/<w:shd\b[^>]*w:fill="FFFFFF"[^>]*\/>/);
  expectPhysicalBorderOwnership(table);
}

function expectAppendixTableLevelGrid(table: string) {
  const tableProperties = table.match(/<w:tblPr\b[\s\S]*?<\/w:tblPr>/)?.[0] ?? "";
  const tableBorders = tableProperties.match(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/)?.[0] ?? "";
  expect(tableProperties).not.toContain("<w:tblCellSpacing");
  expect(tableProperties).toContain('<w:tblLayout w:type="fixed"/>');
  expect(tableBorders).toBeTruthy();
  for (const edge of TABLE_BORDER_EDGES) {
    expect(tableBorders).toMatch(new RegExp(`<w:${edge}\\b[^>]*w:val="nil"`));
  }
  expect(tableBorders).not.toMatch(/w:val="single"/);

  const rows = table.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? [];
  expect(rows.length).toBeGreaterThan(0);

  rows.forEach((row) => {
    const cells = row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? [];
    expect(cells.length).toBeGreaterThan(0);

    cells.forEach((cell) => {
      const properties = cell.match(/<w:tcPr\b[\s\S]*?<\/w:tcPr>/)?.[0] ?? "";
      expect(properties).not.toMatch(/<w:shd\b[^>]*w:fill="FFFFFF"[^>]*\/>/);
      const shading = properties.match(/<w:shd\b[^>]*\/>/)?.[0] ?? "";
      if (shading) expect(shading).toContain('w:fill="D9D9D9"');
    });
  });
  expectPhysicalBorderOwnership(table);
}

async function docxPartsFrom(download: Download) {
  const path = await download.path();
  expect(path).toBeTruthy();

  const zip = await JSZip.loadAsync(await readFile(path as string));
  const xml = await zip.file("word/document.xml")?.async("string");
  const rels = await zip.file("word/_rels/document.xml.rels")?.async("string");
  const styles = await zip.file("word/styles.xml")?.async("string");
  expect(xml).toBeTruthy();
  expect(rels).toBeTruthy();
  expect(styles).toBeTruthy();
  return { xml: xml as string, rels: rels as string, styles: styles as string };
}

async function docxHeaderXmlFrom(download: Download) {
  const path = await download.path();
  expect(path).toBeTruthy();

  const zip = await JSZip.loadAsync(await readFile(path as string));
  const headerNames = Object.keys(zip.files).filter((name) =>
    /^word\/header\d+\.xml$/.test(name),
  );
  return Promise.all(
    headerNames.map(async (name) => ({
      name,
      xml: (await zip.file(name)?.async("string")) ?? "",
    })),
  );
}

test("updates generated perihal from metadata", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await page.getByLabel("Nama Project").fill("Project Smoke Test");

  await expect(page.locator("aside").getByText("Pilot Implementasi Project Smoke Test").first()).toBeVisible();
});

test("uses Memo Generator as the browser title", async ({ page }) => {
  await page.goto("http://localhost:3002");

  await expect(page).toHaveTitle("Memo Generator");
});

test("shows memo generator credit at page end", async ({ page }) => {
  await page.goto("http://localhost:3002");

  await expect(page.getByText("Developed by Alex Surya Marcelo (UAT - A) • Memo Generator")).toBeVisible();
});

test("MOM scenario import replaces the completely empty appendix placeholder", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await expect(page.locator("[data-scenario-row]")).toHaveCount(1);

  await page.locator("[data-scenario-import-input]").setInputFiles({
    name: "mom.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(momScenarioPayload())),
  });

  await expect(page.locator("[data-scenario-row]")).toHaveCount(3);
  await expect(page.locator("[data-scenario-row]:not([open])")).toHaveCount(0);
  await expect(page.locator("[data-scenario-date-group]")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Tanggal 1 *" })).toContainText("1 Juli 2026");
  await expect(page.getByRole("textbox", { name: /Bagian \* A/ }).first()).toHaveValue("Fitur Alpha");
  await expect(page.getByLabel("Nama Project")).toHaveValue("");
});

test("MOM scenario import appends only appendix scenarios", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());
  const originalProject = await page.getByLabel("Nama Project").inputValue();
  const originalRows = await page.locator("[data-scenario-row]").count();

  await page.locator("[data-scenario-import-input]").setInputFiles({
    name: "mom.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(momScenarioPayload())),
  });

  await expect(page.getByLabel("Nama Project")).toHaveValue(originalProject);
  await expect(page.getByLabel("Jabatan / Unit").first()).toHaveValue("Kepala Operasi Cabang Pluit");
  await expect(page.locator("[data-scenario-row]")).toHaveCount(originalRows + 3);
  await expect(page.getByRole("textbox", { name: /Bagian \* [A-Z]+/ }).nth(1)).toHaveValue("Fitur Alpha");
  await expect(page.locator('[data-field-id^="scenario-pic-"] textarea').last()).toHaveValue("");
  await expect(page.getByRole("button", { name: /Tanggal \d+ \*/ }).last()).toContainText("8 – 9 Juli 2026");
  await expect(page.locator("[data-scenario-row]").last()).toContainText("Langkah Beta");
});

test("invalid MOM scenario import preserves appendix data and reports the error", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());
  const before = await page.locator("[data-scenario-row]").count();

  await page.locator("[data-scenario-import-input]").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ lampiranState: [] })),
  });

  await expect(page.locator("[data-scenario-row]")).toHaveCount(before);
  await expect(page.locator("[data-scenario-import-error]")).toHaveRole("alert");
  await expect(page.locator("[data-scenario-import-error]")).toContainText(
    "tidak memiliki skenario",
  );
});

test("XLSX scenario import uses the same button and recognizes optional hierarchy", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  await page.locator("[data-scenario-import-input]").setInputFiles({
    name: "skenario.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await xlsxScenarioWorkbook(),
  });

  const dialog = page.getByRole("dialog", { name: "Preview import skenario" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Sheet")).toHaveValue("Skenario Aktif");
  await expect(dialog).toContainText("4 skenario");
  await expect(dialog).toContainText("3 tingkat hierarki");
  await dialog.getByRole("button", { name: "Import 4 skenario" }).click();

  await expect(page.locator("[data-scenario-row]")).toHaveCount(5);
  await expect(page.locator("[data-scenario-row]:not([open])")).toHaveCount(0);
  await expect(page.getByText("Bagian A", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Subbagian A.1", { exact: true })).toBeVisible();
  await expect(page.getByText("Sub-subbagian A.1.1", { exact: true })).toBeVisible();
  await expect(page.locator("aside").getByText("Kondisi Khusus", { exact: true })).toBeVisible();
  await expect(page.locator("aside").getByText("Skenario kedua", { exact: true })).toBeVisible();

  const shiftedResult = page.locator("aside .preview-rich-text").filter({ hasText: "Hasil langsung" }).first();
  await expect(shiftedResult.locator("br")).toHaveCount(1);
  await expect(page.locator("aside .preview-rich-text ul li").filter({ hasText: "Input nomor CIN Organisasi" })).toBeVisible();
  await expect(page.locator("aside .preview-rich-text ul li").filter({ hasText: "Tekan F12" })).toBeVisible();
  await expect(page.locator("aside .preview-rich-text ol li").filter({ hasText: "Validasi pertama" })).toBeVisible();
  await expect(page.locator("aside .preview-rich-text ol li").filter({ hasText: "Validasi kedua" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  const plainXmlText = xml.replace(/<[^>]+>/g, "");
  expect(xml).toContain("<w:br");
  expect(plainXmlText).toContain("• Input nomor CIN Organisasi");
  expect(plainXmlText).toContain("1. Validasi pertama");
});

test("XLSX scenario import recognizes a standalone merged date row", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await page.locator("[data-scenario-import-input]").setInputFiles({
    name: "skenario.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await xlsxScenarioWorkbook(),
  });

  const dialog = page.getByRole("dialog", { name: "Preview import skenario" });
  await dialog.getByLabel("Sheet").selectOption("Skenario Lain");
  await expect(dialog).toContainText("1 skenario");
  await expect(dialog).toContainText("0 baris dilewati");
  await dialog.getByRole("button", { name: "Import 1 skenario" }).click();

  await expect(page.locator("[data-scenario-row]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Tanggal 1 *" })).toContainText("9 – 12 Juni 2026");
  await expect(page.locator("aside")).toContainText("Skenario sheet lain");
});

test("optional scenario hierarchy exposes minimalist contextual add actions", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const firstSection = page.locator("[data-scenario-heading-level='1']").first();
  const subbagianButton = firstSection.getByRole("button", { name: "Tambah subbagian" });
  await expect(subbagianButton).toHaveClass(/bg-\[#eef4fa\]/);
  await subbagianButton.click();
  const firstSubsection = page.locator("[data-scenario-heading-level='2']").first();
  await expect(firstSubsection.getByText("Subbagian A.1", { exact: true })).toBeVisible();

  await firstSubsection.getByRole("button", { name: "Tambah sub-subbagian" }).click();
  const firstSubsubsection = page.locator("[data-scenario-heading-level='3']").first();
  await expect(firstSubsubsection.getByText("Sub-subbagian A.1.1", { exact: true })).toBeVisible();
  await expect(firstSubsubsection.getByRole("button", { name: "Tambah skenario" })).toBeVisible();
  await expect(firstSubsubsection.getByRole("button", { name: /Tambah sub/ })).toHaveCount(0);
});

test("scenario template downloads from the appendix toolbar", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download template skenario XLSX" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("Template Skenario untuk MEMO_AXM.xlsx");
});

test("bulk appendix delete cascades from a date and requires confirmation", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const baseRow = completeDraft().appendixScenarios[0];
  await importDraft(page, {
    ...completeDraft(),
    appendixScenarios: [
      {
        ...baseRow,
        id: "bulk-delete-a",
        headingPath: [{ id: "bulk-heading", title: "Bagian Bulk" }],
        sectionGroupId: "bulk-heading",
        section: "Bagian Bulk",
        scenario: richText("Skenario A"),
      },
      {
        ...baseRow,
        id: "bulk-delete-b",
        headingPath: [{ id: "bulk-heading", title: "Bagian Bulk" }],
        sectionGroupId: "bulk-heading",
        section: "Bagian Bulk",
        scenario: richText("Skenario B"),
      },
    ],
  });

  const panel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Lampiran Skenario" }),
  }).first();
  await panel.locator("[data-appendix-bulk-delete]").click();
  await expect(panel.locator("[data-scenario-delete-checkbox]")).toHaveCount(4);
  await panel.getByRole("checkbox", { name: "Pilih skenario 1" }).check();
  await expect(panel.getByRole("checkbox", { name: "Pilih skenario 1" })).toBeChecked();
  await expect(panel.getByRole("checkbox", { name: "Pilih skenario 2" })).not.toBeChecked();
  await expect(panel.getByRole("checkbox", { name: "Pilih bagian A" })).not.toBeChecked();
  await expect(panel.getByRole("checkbox", { name: "Pilih tanggal 1" })).not.toBeChecked();
  await panel.getByRole("checkbox", { name: "Pilih skenario 1" }).uncheck();
  await panel.getByRole("checkbox", { name: "Pilih bagian A" }).check();
  await expect(panel.getByRole("checkbox", { name: "Pilih bagian A" })).toBeChecked();
  await expect(panel.getByRole("checkbox", { name: "Pilih skenario 1" })).toBeChecked();
  await expect(panel.getByRole("checkbox", { name: "Pilih skenario 2" })).toBeChecked();
  await expect(panel.getByRole("checkbox", { name: "Pilih tanggal 1" })).not.toBeChecked();
  await panel.getByRole("checkbox", { name: "Pilih bagian A" }).uncheck();
  await panel.getByRole("checkbox", { name: "Pilih tanggal 1" }).check();
  await expect(panel.getByRole("checkbox", { name: "Pilih bagian A" })).toBeChecked();
  await expect(panel.locator("[data-appendix-bulk-delete-status]")).toContainText("2 skenario dipilih");
  await panel.locator("[data-appendix-bulk-delete]").click();
  await expect(page.locator("[data-appendix-delete-confirm]")).toContainText("2 skenario");
  await page.locator("[data-appendix-delete-cancel]").click();
  await expect(page.locator("[data-scenario-row]")).toHaveCount(2);
  await panel.locator("[data-appendix-bulk-delete-cancel]").click();
  await panel.locator("[data-appendix-bulk-delete]").click();
  await panel.getByRole("checkbox", { name: "Pilih tanggal 1" }).check();
  await panel.locator("[data-appendix-bulk-delete]").click();
  await page.locator("[data-appendix-delete-confirm-action]").click();
  await expect(page.locator("[data-scenario-row]")).toHaveCount(1);
});

test("contextual scenario add buttons insert inside their own hierarchy level", async ({ page }) => {
  await page.goto("http://localhost:3002");

  await page.locator("[data-scenario-import-input]").setInputFiles({
    name: "skenario.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await xlsxScenarioWorkbook(),
  });
  await page.getByRole("dialog", { name: "Preview import skenario" })
    .getByRole("button", { name: "Import 4 skenario" })
    .click();

  const dateGroup = page.locator("[data-scenario-date-group]").first();
  await dateGroup.locator('[data-scenario-add="date-scenario"]').click();
  const rootScenario = dateGroup.locator("[data-scenario-row]").first();
  await rootScenario.locator('[data-field-id^="scenario-text-"] .ProseMirror').click();
  await page.keyboard.type("Skenario level tanggal baru");

  const firstSection = dateGroup.locator("[data-scenario-heading-level='1']").first();
  await firstSection.locator('[data-scenario-add="section-scenario"]').click();
  const directSectionScenario = firstSection.locator("[data-scenario-row]").nth(1);
  await directSectionScenario.locator('[data-field-id^="scenario-text-"] .ProseMirror').click();
  await page.keyboard.type("Skenario level bagian baru");

  const firstSubsection = firstSection.locator("[data-scenario-heading-level='2']").first();
  await firstSubsection.locator('[data-scenario-add="heading-2-scenario"]').click();
  const directSubsectionScenario = firstSubsection.locator("[data-scenario-row]").nth(1);
  await directSubsectionScenario.locator('[data-field-id^="scenario-text-"] .ProseMirror').click();
  await page.keyboard.type("Skenario level subbagian baru");

  const appendixText = await page.locator('aside article[data-page-kind="appendix"]').first().textContent() ?? "";
  expect(appendixText.indexOf("Skenario level tanggal baru")).toBeLessThan(
    appendixText.indexOf("Verifikasi Utama"),
  );
  expect(appendixText.indexOf("Skenario level bagian baru")).toBeLessThan(
    appendixText.indexOf("Verifikasi Input"),
  );
  expect(appendixText.indexOf("Skenario level subbagian baru")).toBeLessThan(
    appendixText.indexOf("Kondisi Khusus"),
  );
});

test("imported MOM PIC remains mandatory for DOCX export", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());
  await page.locator("[data-scenario-import-input]").setInputFiles({
    name: "mom.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(momScenarioPayload())),
  });

  const downloadPromise = page.waitForEvent("download", { timeout: 1200 }).catch(() => null);
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();

  expect(await downloadPromise).toBeNull();
  await expect(page.locator("[data-validation-panel]")).toContainText(
    "Lampiran Skenario 2: PIC",
  );
});

test("preview renders URL akses as clickable link", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const link = page.locator("aside a", { hasText: "https://bdswebg2-pilot" }).first();
  await expect(link).toHaveAttribute(
    "href",
    "https://bdswebg2-pilot.intra.bca.co.id:63144/#/auth/login",
  );
});

test("exports DOCX from current draft", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Memo Pilot Implementasi (BDS Web Gen 2 versi 4 3 0).docx");

  const { xml, rels } = await docxPartsFrom(download);
  const headingTable = documentTables(xml)[0];
  expect(headingTable).toContain('w:val="nil"');
  expect(headingTable).not.toContain('w:val="none"');
  expect(headingTable).not.toMatch(/<w:(?:tblBorders|tcBorders)>[\s\S]*?w:val="single"/);
  const attachmentIndex = xml.indexOf("Draft SE Perihal: Pengembangan Pembukaan Rekening Giro Badan");
  const attachmentParagraph = xml.slice(
    xml.lastIndexOf("<w:p>", attachmentIndex),
    xml.indexOf("</w:p>", attachmentIndex) + "</w:p>".length,
  );
  expect(attachmentParagraph).toContain('<w:tab w:val="left" w:pos="300"/>');
  expect(attachmentParagraph).toContain('<w:ind w:left="300" w:hanging="300"/>');
  expect(attachmentParagraph).toContain("<w:tab/>");
  expect(xml).toMatch(/<w:t[^>]*>Nama PIC \u2013 pic@example\.com<\/w:t>/);
  expect(xml).toMatch(/<w:t[^>]*>Kepala KCU Pluit<\/w:t>/);
  expect(xml).toContain('<w:type w:val="continuous"/>');
  expect(xml).not.toContain('w:type="page"');
  expect(xml).toContain("<w:hyperlink");
  expect(rels).toContain('Target="https://bdswebg2-pilot.intra.bca.co.id:63144/#/auth/login"');

  const urlIndex = xml.indexOf("https://bdswebg2-pilot");
  expect(urlIndex).toBeGreaterThan(-1);
  const urlContext = xml.slice(Math.max(0, urlIndex - 800), urlIndex + 300);
  expect(urlContext).toContain('<w:u w:val="single"/>');

  const continuationIndex = xml.indexOf("Perihal:  </w:t>");
  expect(continuationIndex).toBeGreaterThan(-1);
  const continuationContext = xml.slice(Math.max(0, continuationIndex - 900), continuationIndex + 100);
  expect(continuationContext).toContain("<w:pageBreakBefore/>");
  expect(continuationContext).toContain('<w:t xml:space="preserve"></w:t>');
});

test("DOCX list rows use the same fixed bullet column as preview", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    recipients: [
      completeDraft().recipients[0],
      {
        id: "recipient-second",
        gender: "Ibu",
        name: "Praptiwi",
        position: "Experience Design - Loan Operations & Credit Process Bureau Head B",
      },
    ],
    contacts: [
      completeDraft().contacts[0],
      { id: "contact-second", name: "Alvyn", email: "alvyn@example.com" },
    ],
    ccRecipients: [
      completeDraft().ccRecipients[0],
      {
        id: "cc-second",
        gender: "",
        name: "",
        position: "Operation Strategy & Design Bureau F",
      },
    ],
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const download = await downloadPromise;
  const xml = await documentXmlFrom(download);
  const paragraphContaining = (text: string) => {
    const textIndex = xml.indexOf(text);
    expect(textIndex).toBeGreaterThan(-1);
    return xml.slice(
      xml.lastIndexOf("<w:p>", textIndex),
      xml.indexOf("</w:p>", textIndex) + "</w:p>".length,
    );
  };

  for (const text of [
    "Kepala Operasi Cabang Pluit",
    "Draft SE Perihal: Pengembangan Pembukaan Rekening Giro Badan",
    "Nama PIC",
  ]) {
    const paragraphXml = paragraphContaining(text);
    const expectedPosition = text === "Kepala Operasi Cabang Pluit" ? 311 : 300;
    expect(paragraphXml).toContain(
      `<w:tab w:val="left" w:pos="${expectedPosition}"/>`,
    );
    expect(paragraphXml).toContain(
      `<w:ind w:left="${expectedPosition}" w:hanging="300"/>`,
    );
    expect(paragraphXml).toContain("<w:tab/>");
  }

  const ccParagraph = paragraphContaining("Kepala KCU Pluit");
  expect(ccParagraph).toContain('<w:tab w:val="left" w:pos="2400"/>');
  expect(ccParagraph).toContain('<w:ind w:left="2400" w:right="0" w:hanging="300"/>');
  expect(ccParagraph).toContain("<w:tab/>");

  expect(paragraphContaining("U.p. Yth. Ibu Agustina")).toContain(
    '<w:ind w:left="311"/>',
  );
  expect(paragraphContaining("U.p. Yth. Bapak Verry Iskandar")).toContain(
    '<w:ind w:left="2400" w:right="0"/>',
  );
});

test("uses validation content controls in every memo header", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const headers = await docxHeaderXmlFrom(await downloadPromise);
  const memoHeaders = headers.filter(({ xml }) => xml.includes("No Memo"));

  expect(memoHeaders.length).toBeGreaterThan(0);
  for (const { xml } of memoHeaders) {
    expect(xml).toContain('<w:alias w:val="Nomor"/>');
    expect(xml).toContain('<w:tag w:val="Nomor"/>');
    expect(xml).toContain('<w:alias w:val="TanggalRelease"/>');
    expect(xml).toContain('<w:tag w:val="TanggalRelease"/>');
  }
});

test("uses conditional numbering columns in memo tables", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const developmentTable = page.locator("aside table").filter({ hasText: "Pengembangan" }).first();
  const activityTable = page.locator("aside table").filter({ hasText: "Aktivitas" }).first();
  await expect(developmentTable.getByRole("columnheader", { name: "No." })).toHaveCount(0);
  await expect(activityTable.getByRole("columnheader", { name: "No." })).toHaveCount(0);

  await importDraft(page, {
    ...completeDraft(),
    developmentRows: [
      ...completeDraft().developmentRows,
      { id: "development-2", item: richText("Pengembangan 2"), description: richText("Keterangan 2") },
    ],
    activities: [
      ...completeDraft().activities,
      {
        id: "activity-2",
        startDate: "2026-05-22",
        endDate: "2026-05-22",
        owner: "Tim APV",
        activity: richText("Aktivitas 2"),
      },
    ],
  });

  await expect(
    page.locator("aside table").filter({ hasText: "Pengembangan" }).first().getByRole("columnheader", { name: "No." }),
  ).toHaveCount(1);
  await expect(
    page.locator("aside table").filter({ hasText: "Aktivitas" }).first().getByRole("columnheader", { name: "No." }),
  ).toHaveCount(1);
});

test("renders single attachment, contact, and cc without bullets", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    attachments: "Skenario Pilot Implementasi BDS Web Gen 2 versi 4.3.0",
  });

  const attachmentSection = page
    .locator("aside section")
    .filter({ has: page.getByRole("heading", { name: "Lampiran", exact: true }) })
    .first();
  const contactSection = page
    .locator("aside section")
    .filter({ has: page.getByRole("heading", { name: "PIC yang Dapat Dihubungi", exact: true }) })
    .first();
  const ccBlock = page.locator("aside").getByText("Tembusan:", { exact: true }).locator("..");
  await expect(attachmentSection).toContainText(
    "Bersama dengan memo ini dilampirkan Skenario Pilot Implementasi BDS Web Gen 2 versi 4.3.0.",
  );
  await expect(attachmentSection).not.toContainText("- Skenario Pilot Implementasi BDS Web Gen 2 versi 4.3.0");
  await expect(contactSection).not.toContainText("- Nama PIC");
  await expect(ccBlock).not.toContainText("- Kepala KCU Pluit");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  expect(xml).toContain("Bersama dengan memo ini dilampirkan Skenario Pilot Implementasi BDS Web Gen 2 versi 4.3.0.");
  expect(xml).not.toMatch(/- {6}Skenario Pilot Implementasi/);
  expect(xml).not.toMatch(/- {6}Nama PIC/);
  expect(xml).not.toMatch(/- {6}Kepala KCU Pluit/);
});

test("preserves bullet and numbered rich text in preview and DOCX", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    developmentRows: [{
      id: "development-list",
      item: richList("bulletList", ["Bullet satu", "Bullet dua"]),
      description: richList("orderedList", ["Nomor satu", "Nomor dua"]),
    }],
  });

  const developmentTable = page.locator("aside table").filter({ hasText: "Pengembangan" }).first();
  await expect(developmentTable.locator("ul li")).toHaveCount(2);
  await expect(developmentTable.locator("ol li")).toHaveCount(2);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  expect(xml).toContain("• ");
  expect(xml).toContain("1. ");
  expect(xml).toContain("2. ");
});

test("preserves an ordered-list start value in preview and DOCX", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    developmentRows: [{
      id: "development-list-start",
      item: richListFrom("orderedList", 4, ["Keempat", "Kelima"]),
      description: richText("Keterangan"),
    }],
  });

  const previewList = page.locator("aside .preview-rich-text ol").first();
  await expect(previewList).toHaveAttribute("start", "4");
  await expect(previewList).toContainText("Keempat");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  expect(xml).toContain("4. ");
  expect(xml).toContain("5. ");
});

test("bold toolbar button toggles bold and paragraph toolbar button is removed", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const editor = page.locator(".ProseMirror").first();
  const editorShell = editor.locator("..").locator("..");
  await editor.click();
  await page.keyboard.type("Awal ");
  await editorShell.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type("Tebal");

  expect(await editor.evaluate((node) => node.innerHTML)).toContain(
    "<p>Awal <strong>Tebal</strong></p>",
  );
  await expect(page.getByRole("button", { name: "Paragraph" })).toHaveCount(0);
});

test("bold toolbar applies to typing in an empty editor", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const editor = page.locator(".ProseMirror").first();
  const editorShell = editor.locator("..").locator("..");
  await editor.click();
  await editorShell.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type("Tebal dari awal");

  expect(await editor.evaluate((node) => node.innerHTML)).toContain(
    "<p><strong>Tebal dari awal</strong></p>",
  );
});

test("bold toolbar applies after clearing all editor content", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const editor = page.locator(".ProseMirror").first();
  const editorShell = editor.locator("..").locator("..");
  await editor.click();
  await page.keyboard.type("Isi lama");
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  await editorShell.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type("Tebal pengganti");

  expect(await editor.evaluate((node) => node.innerHTML)).toContain(
    "<p><strong>Tebal pengganti</strong></p>",
  );
});

test("toolbar formatting works from the keyboard without another editor click", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const editor = page.locator(".ProseMirror").first();
  const editorShell = editor.locator("..").locator("..");
  const boldButton = editorShell.getByRole("button", { name: "Bold" });

  await boldButton.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Keyboard bold");

  await expect(editor).toBeFocused();
  expect(await editor.evaluate((node) => node.innerHTML)).toContain(
    "<strong>Keyboard bold</strong>",
  );
});

test("bullet and numbered toolbar buttons format the active editor", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const editors = page.locator(".ProseMirror");
  const bulletEditor = editors.nth(0);
  const numberedEditor = editors.nth(1);

  await bulletEditor.evaluate((node) => (node as HTMLElement).focus());
  await bulletEditor.locator("..").locator("..").getByRole("button", { name: "Bullet list" }).click();
  await page.keyboard.type("Bullet item");
  expect(await bulletEditor.evaluate((node) => node.innerHTML)).toContain("<ul");

  await numberedEditor.evaluate((node) => (node as HTMLElement).focus());
  await numberedEditor.locator("..").locator("..").getByRole("button", { name: "Numbered list" }).click();
  await page.keyboard.type("Numbered item");
  expect(await numberedEditor.evaluate((node) => node.innerHTML)).toContain("<ol");
});

test("Enter creates the next item in bullet and numbered lists", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const editors = page.locator(".ProseMirror");
  const bulletEditor = editors.nth(0);
  const numberedEditor = editors.nth(1);

  await bulletEditor.evaluate((node) => (node as HTMLElement).focus());
  await bulletEditor.locator("..").locator("..").getByRole("button", { name: "Bullet list" }).click();
  await page.keyboard.type("Bullet satu");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Bullet dua");
  expect(await bulletEditor.locator("li").count()).toBe(2);

  await numberedEditor.evaluate((node) => (node as HTMLElement).focus());
  await numberedEditor.locator("..").locator("..").getByRole("button", { name: "Numbered list" }).click();
  await page.keyboard.type("Nomor satu");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Nomor dua");
  expect(await numberedEditor.locator("li").count()).toBe(2);
});

test("Ctrl+Z restores a deleted row", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    developmentRows: [
      ...completeDraft().developmentRows,
      { id: "development-undo", item: richText("Undo row"), description: richText("Undo description") },
    ],
  });

  await expect(page.getByRole("button", { name: "Hapus lingkup" })).toHaveCount(2);
  await page.getByRole("button", { name: "Hapus lingkup" }).first().click();
  await expect(page.getByRole("button", { name: "Hapus lingkup" })).toHaveCount(1);
  await page.keyboard.press("Control+Z");
  await expect(page.getByRole("button", { name: "Hapus lingkup" })).toHaveCount(2);
});

test("Ctrl+Z restores the previous value after leaving any field", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const projectName = page.getByLabel("Nama Project");
  const bureau = page.getByLabel("Bureau UAT");

  await projectName.fill("Nilai awal");
  await projectName.press("Tab");
  await projectName.fill("Nilai baru");
  await projectName.press("Tab");
  await page.keyboard.press("Control+Z");
  await expect(projectName).toHaveValue("Nilai awal");

  await bureau.selectOption("B");
  await bureau.press("Tab");
  await page.keyboard.press("Control+Z");
  await expect(bureau).toHaveValue("A");
});

test("calendar popup escapes sortable row clipping", async ({ page }) => {
  await page.goto("http://localhost:3002");

  await page.locator('[data-field-id^="activity-date-"] button').first().click();
  const calendar = page.locator("[data-date-range-popup]");
  await expect(calendar).toBeVisible();
  await expect(calendar).toHaveCSS("position", "fixed");
});

test("appendix section lettering restarts for each date and fills available page space", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, denseAppendixDraft());

  await expect(page.locator("aside table").getByText("A.", { exact: true })).toHaveCount(3);
  await expect(page.locator("aside").getByText(/Lampiran - Skenario .*Sambungan/)).toHaveCount(0);
});

test("appendix tables never overflow their preview page", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...denseAppendixDraft(),
    appendixScenarios: Array.from({ length: 2 }, (_, index) => ({
      ...denseAppendixDraft().appendixScenarios[index],
      id: `overflow-scenario-${index}`,
      dateGroupId: "overflow-date",
      sectionGroupId: "overflow-section",
      section: "Bagian overflow",
      scenario: richText(
        `Skenario ${index + 1} ${"dengan uraian panjang ".repeat(180)}`,
      ),
      expectedResult: richText(
        `Hasil ${index + 1} ${"dengan keterangan panjang ".repeat(180)}`,
      ),
    })),
  });

  const pageOverflow = await page
    .locator('aside article[data-page-kind="appendix"] [data-preview-page-content]')
    .evaluateAll((contents) =>
      contents.map((content) => content.scrollHeight - content.clientHeight),
    );

  expect(pageOverflow.length).toBeGreaterThan(1);
  expect(Math.max(...pageOverflow)).toBeLessThanOrEqual(1);
});

test("one appendix section continues across A4 pages without a new section", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const sectionTitle = "Bagian tunggal lintas halaman";
  await importDraft(page, {
    ...completeDraft(),
    appendixScenarios: Array.from({ length: 18 }, (_, index) => ({
      ...completeDraft().appendixScenarios[0],
      id: `single-section-${index}`,
      dateGroupId: "single-date",
      sectionGroupId: "single-section",
      section: sectionTitle,
      scenario: richText(
        `Skenario ${index + 1} dengan langkah verifikasi yang tetap berada pada bagian yang sama.`,
      ),
      expectedResult: richText(
        `Hasil ${index + 1} memastikan tabel dapat berlanjut tanpa membuat bagian baru.`,
      ),
    })),
  });

  const appendixPages = page.locator('aside article[data-page-kind="appendix"]');
  await expect(appendixPages).toHaveCount(2);
  await expect(appendixPages.getByText("A.", { exact: true })).toHaveCount(1);
  await expect(appendixPages.getByText(sectionTitle, { exact: true })).toHaveCount(1);

  const pageOverflow = await appendixPages
    .locator("[data-preview-page-content]")
    .evaluateAll((contents) =>
      contents.map((content) => content.scrollHeight - content.clientHeight),
    );
  expect(Math.max(...pageOverflow)).toBeLessThanOrEqual(1);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  expect((xml.match(new RegExp(sectionTitle, "g")) ?? []).length).toBe(1);
  expect((xml.match(/>Hasil\/Keterangan<\/w:t>/g) ?? []).length).toBe(2);
});

test("attachment-sized main content moves to the next A4 page instead of clipping", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const longDescription = [
    "Pengajuan pembukaan rekening giro badan yang dilakukan melalui webform, dapat ditindaklanjuti pada aplikasi BDS Web Gen 2.",
    "Adapun prosesnya adalah sebagai berikut:",
    "1. PIC Badan usaha melakukan pengajuan pembukaan rekening Giro Badan melalui webform.",
    "2. Setelah pengajuan pembukaan rekening Giro Badan selesai melalui webform, maka proses pembukaan rekening akan dilanjutkan ke proses verifikasi kelengkapan dan kesesuaian data antar dokumen pengajuan oleh Biro Customer Account and Pooling Services (APV) di aplikasi SEEDS.",
    "3. Setelah verifikasi kelengkapan dan kesesuaian data antar dokumen selesai, maka proses pembukaan rekening akan dilanjutkan ke proses verifikasi keabsahan dokumen oleh unit Pemeriksa Dokumen Legalitas (PDL) di aplikasi BDS Web Gen 2.",
    "4. Setelah verifikasi keabsahan dokumen selesai, maka proses pembukaan rekening akan dilanjutkan di Cabang melalui Aplikasi BDS Web Gen 2 untuk dilanjutkan ke proses verifikasi usaha badan usaha/badan hukum dan dilanjutkan hingga rekening berhasil terbentuk.",
  ].join("\n");
  await importDraft(page, {
    ...completeDraft(),
    recipients: [
      completeDraft().recipients[0],
      { id: "recipient-two", gender: "Ibu", name: "Praptiwi", position: "Experience Design - Loan Operations & Credit Process Bureau Head B" },
      { id: "recipient-three", gender: "Bapak", name: "Customer Account and Pooling Services", position: "Nurmalia" },
    ],
    developmentRows: [{
      id: "attachment-development",
      item: richText("Penambahan alur pembukaan rekening giro badan pada aplikasi BDS Web Gen 2"),
      description: richText(longDescription),
    }],
    activities: [{
      ...completeDraft().activities[0],
      activity: richText(
        "Melakukan verifikasi transaksi sesuai dengan Skenario Pilot Implementasi BDS Web Gen 2 versi 4.3.0 terlampir",
      ),
      owner: "KCU Pluit, Tim PDL, Tim APV, dan UAT A",
    }],
  });

  const mainPages = page.locator('aside article[data-page-kind="main"]');
  expect(await mainPages.count()).toBeGreaterThan(1);
  const pageOverflow = await mainPages
    .locator("[data-preview-page-content]")
    .evaluateAll((contents) =>
      contents.map((content) => content.scrollHeight - content.clientHeight),
    );
  expect(Math.max(...pageOverflow)).toBeLessThanOrEqual(1);
});

test("memo source heading includes the dynamic UAT bureau in preview and DOCX", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    metadata: { ...completeDraft().metadata, bureau: "D" },
  });

  const source = "POL Application & User Acceptance Test Bureau D (UAT D)";
  await expect(page.locator("aside").getByText(source, { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  expect(xml).toContain(source.replace("&", "&amp;"));
});

test("hard-break rich text continues on the next page instead of crossing the A4 boundary", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const symbols = Array.from({ length: 45 }, (_, index) => `${index % 2 ? "@#$" : "$@#"}${index}`);
  const descriptionContent = [
    { type: "text", text: "Penjelasan alur pembukaan rekening dan tahapan verifikasi dokumen. ".repeat(9) },
    ...symbols.flatMap((text) => [
      { type: "hardBreak" },
      { type: "text", text },
    ]),
  ];

  await importDraft(page, {
    ...completeDraft(),
    developmentRows: [{
      id: "hard-break-development",
      item: richText("Penambahan alur pembukaan rekening giro badan pada aplikasi BDS Web Gen 2"),
      description: {
        type: "doc",
        content: [{ type: "paragraph", content: descriptionContent }],
      },
    }],
  });

  const mainPages = page.locator('aside article[data-page-kind="main"]');
  expect(await mainPages.count()).toBeGreaterThan(1);
  const pageOverflow = await mainPages
    .locator("[data-preview-page-content]")
    .evaluateAll((contents) =>
      contents.map((content) => content.scrollHeight - content.clientHeight),
    );
  expect(Math.max(...pageOverflow)).toBeLessThanOrEqual(1);
  await expect(
    page.locator("aside").getByText("Lingkup Pengembangan, Sambungan", { exact: true }).first(),
  ).toBeVisible();
});

test("uses exact continuation wording and only the floating generate button", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...denseAppendixDraft(),
    developmentRows: Array.from({ length: 8 }, (_, index) => ({
      id: `development-footer-${index}`,
      item: richText(`Pengembangan ${index + 1}`),
      description: richText(
        "Keterangan panjang untuk memastikan memo utama berlanjut ke halaman berikut dan footer sambungan ditampilkan.",
      ),
    })),
  });

  await expect(page.getByText("Bersambung ke halaman berikut", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Bersambung ke halaman berikutnya", { exact: true })).toHaveCount(0);
  await expect(page.locator("button").filter({ hasText: "Generate Docx" })).toHaveCount(1);
});

test("labels split development and activity tables as continuations in preview and DOCX", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const longDescription =
    "Keterangan rinci untuk memastikan baris tabel menggunakan beberapa baris dan memicu pemisahan halaman secara konsisten. ";
  await importDraft(page, {
    ...completeDraft(),
    developmentRows: Array.from({ length: 10 }, (_, index) => ({
      id: `development-continuation-${index}`,
      item: richText(`Pengembangan lanjutan ${index + 1}`),
      description: richText(longDescription.repeat(4)),
    })),
    activities: Array.from({ length: 14 }, (_, index) => ({
      id: `activity-continuation-${index}`,
      activity: richText(`Aktivitas lanjutan ${index + 1} ${longDescription.repeat(2)}`),
      owner: `PIC ${index + 1}`,
      startDate: "2026-06-12",
      endDate: "2026-06-19",
    })),
  });

  await expect(
    page.locator("aside").getByText("Lingkup Pengembangan, Sambungan", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.locator("aside").getByText("Aktivitas Cabang dan Unit Kerja, Sambungan", { exact: true }).first(),
  ).toBeVisible();
  const developmentContinuation = page
    .locator("aside h3")
    .filter({ hasText: "Lingkup Pengembangan, Sambungan" })
    .first();
  const activityContinuation = page
    .locator("aside h3")
    .filter({ hasText: "Aktivitas Cabang dan Unit Kerja, Sambungan" })
    .first();
  await expect(developmentContinuation.locator("strong")).toHaveText("Lingkup Pengembangan");
  await expect(developmentContinuation.locator("span")).toHaveText(", Sambungan");
  await expect(activityContinuation.locator("strong")).toHaveText(
    "Aktivitas Cabang dan Unit Kerja",
  );
  await expect(activityContinuation.locator("span")).toHaveText(", Sambungan");
  const pageOverflow = await page
    .locator('aside article[data-page-kind="main"] [data-preview-page-content]')
    .evaluateAll((contents) =>
      contents.map((content) => content.scrollHeight - content.clientHeight),
    );
  expect(Math.max(...pageOverflow)).toBeLessThanOrEqual(1);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  const plainXmlText = xml.replace(/<[^>]+>/g, "");
  expect(plainXmlText).toContain("Lingkup Pengembangan, Sambungan");
  expect(plainXmlText).toContain("Aktivitas Cabang dan Unit Kerja, Sambungan");
  expect((xml.match(/<w:tblW w:type="dxa" w:w="9266"\/>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  expect((xml.match(/<w:gridCol w:w="1800"\/>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  expect((xml.match(/<w:gridCol w:w="300"\/>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  expect((xml.match(/<w:tblInd w:type="dxa" w:w="2100"\/>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  expect(xml).toMatch(
    /<w:b\/>[\s\S]{0,300}<w:t[^>]*>Lingkup Pengembangan<\/w:t><\/w:r><w:r>[\s\S]{0,300}<w:t[^>]*>, Sambungan<\/w:t>/,
  );
});

test("repeats development scope when a long description splits to continuation pages", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    developmentRows: [{
      id: "development-split-repeat",
      item: richText("Pengembangan Split Repeat"),
      description: richText(
        "Keterangan sangat panjang yang memaksa satu baris lingkup pengembangan terpecah ke halaman berikutnya. ".repeat(90),
      ),
    }],
  });

  const continuationSection = page
    .locator("aside h3")
    .filter({ hasText: "Lingkup Pengembangan, Sambungan" })
    .first()
    .locator("xpath=ancestor::section[1]");

  await expect(continuationSection.getByText("Pengembangan Split Repeat", { exact: true }).first()).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  const plainXmlText = xml.replace(/<[^>]+>/g, "");
  expect((plainXmlText.match(/Pengembangan Split Repeat/g) ?? []).length).toBeGreaterThanOrEqual(2);
});

test("does not duplicate development scope inside the same continued table", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    developmentRows: [{
      id: "development-no-same-page-duplicate",
      item: richText("Pengembangan Tidak Dobel"),
      description: richTextWithHardBreaks(
        Array.from({ length: 34 }, (_, index) => `Keterangan baris ${index + 1}`),
      ),
    }],
  });

  const firstDevelopmentSection = page
    .locator("aside h3")
    .filter({ hasText: "Lingkup Pengembangan" })
    .first()
    .locator("xpath=ancestor::section[1]");

  await expect(
    firstDevelopmentSection.getByText("Pengembangan Tidak Dobel", { exact: true }),
  ).toHaveCount(1);
});

test("appendix rows with import-style bullet lists stay inside preview pages", async ({ page }) => {
  const base = completeDraft();
  const scenarioBase = base.appendixScenarios[0];
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...base,
    appendixScenarios: [{
      ...scenarioBase,
      id: "appendix-import-list-overflow",
      scenario: richText("Verifikasi tampilan field setelah import XLSX"),
      expectedResult: richList(
        "bulletList",
        Array.from({ length: 42 }, (_, index) => `Field hasil import ${index + 1}`),
      ),
      pic: "PIC Import",
    }],
  });

  const pageOverflow = await page
    .locator('aside article[data-page-kind="appendix"] [data-preview-page-content]')
    .evaluateAll((contents) =>
      contents.map((content) => content.scrollHeight - content.clientHeight),
  );
  expect(Math.max(...pageOverflow)).toBeLessThanOrEqual(1);
});

test("appendix split rows repeat activity on continuation pages and stay merged per page", async ({ page }) => {
  const base = completeDraft();
  const scenarioBase = base.appendixScenarios[0];
  const repeatedActivity = "Aktivitas Split Repeat";
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...base,
    appendixScenarios: [{
      ...scenarioBase,
      id: "appendix-split-repeat",
      scenario: richText(repeatedActivity),
      expectedResult: richList(
        "bulletList",
        Array.from({ length: 88 }, (_, index) => `Field hasil sambungan ${index + 1}`),
      ),
      pic: "PIC Split",
    }],
  });

  const appendixPages = page.locator('aside article[data-page-kind="appendix"]');
  expect(await appendixPages.count()).toBeGreaterThan(1);

  const pageTexts = await appendixPages.allTextContents();
  const activityCount = pageTexts.join("\n").match(new RegExp(repeatedActivity, "g"))?.length ?? 0;
  expect(activityCount).toBeGreaterThanOrEqual(2);
  for (const text of pageTexts) {
    expect(text.match(new RegExp(repeatedActivity, "g"))?.length ?? 0).toBeLessThanOrEqual(1);
  }
  await expect(
    appendixPages.first().locator("td[rowspan]").filter({ hasText: "1." }).first(),
  ).toBeVisible();
  await expect(
    appendixPages.first().locator("td[rowspan]").filter({ hasText: "Field hasil sambungan" }).first(),
  ).toBeVisible();

  const pageOverflow = await appendixPages
    .locator("[data-preview-page-content]")
    .evaluateAll((contents) =>
      contents.map((content) => content.scrollHeight - content.clientHeight),
    );
  expect(Math.max(...pageOverflow)).toBeLessThanOrEqual(1);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  const plainXmlText = xml.replace(/<[^>]+>/g, "");
  expect((plainXmlText.match(new RegExp(repeatedActivity, "g")) ?? []).length).toBeGreaterThanOrEqual(2);
});

test("DOCX validation expands a collapsed mandatory appendix field before focusing it", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    appendixScenarios: [{
      ...completeDraft().appendixScenarios[0],
      pic: "",
    }],
  });

  const panel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Lampiran Skenario" }) })
    .first();
  await panel.getByRole("button", { name: "Collapse All" }).click();
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();

  await expect(panel.locator("details[open]")).toHaveCount(3);
  await expect(page.locator('[data-field-id="scenario-pic-scenario-test"]')).toHaveClass(/field-jump-highlight/);
  await expect(page.locator('[data-field-id="scenario-pic-scenario-test"] textarea')).toBeFocused();
});

test("omits empty appendix pages from generated DOCX", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    appendixScenarios: [],
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const download = await downloadPromise;
  const xml = await documentXmlFrom(download);

  expect(xml).not.toContain("Lampiran - Skenario");
});

test("blocks DOCX export when mandatory fields are empty", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const downloadPromise = page.waitForEvent("download", { timeout: 1000 }).catch(() => null);
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();

  await expect(page.getByText("Generate Docx ditahan")).toBeVisible();
  await expect(page.locator('[data-field-id="projectName"]')).toHaveClass(/field-jump-highlight/);
  expect(await downloadPromise).toBeNull();
});

test("tembusan shows mandatory markers", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const ccPanel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Tembusan" }) })
    .first();

  await expect(ccPanel).toContainText("Jabatan / Unit *");
  await expect(ccPanel).not.toContainText("Sapaan *");
  const salutation = ccPanel.getByLabel("Sapaan");
  const placeholder = salutation.locator('option[value=""]');
  await expect(placeholder).not.toHaveAttribute("disabled", "");
  await expect(placeholder).not.toHaveAttribute("hidden", "");
  await expect(salutation).toHaveClass(/text-slate-400/);

  await salutation.selectOption("Bapak");
  await expect(salutation).toHaveClass(/text-slate-900/);
  await salutation.selectOption("");
  await expect(salutation).toHaveValue("");
  await expect(salutation).toHaveClass(/text-slate-400/);
});

test("all salutation fields start with the Sapaan placeholder", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const recipientPanels = [
    page.locator("section").filter({ has: page.getByRole("heading", { name: "Kepada" }) }).first(),
    page.locator("section").filter({ has: page.getByRole("heading", { name: "Tembusan" }) }).first(),
  ];

  for (const panel of recipientPanels) {
    const salutation = panel.getByLabel("Sapaan");
    await expect(salutation).toHaveValue("");
    await expect(salutation).toHaveClass(/text-slate-400/);
    expect(
      await salutation.evaluate((element) => getComputedStyle(element).color),
    ).toBe("rgb(148, 163, 184)");
    const placeholder = salutation.locator('option[value=""]');
    await expect(placeholder).toHaveText("Sapaan");
    await expect(placeholder).not.toHaveAttribute("disabled", "");
    await expect(placeholder).not.toHaveAttribute("hidden", "");
    expect(
      await salutation.evaluate((element) =>
        (element as HTMLSelectElement).selectedOptions[0]?.textContent,
      ),
    ).toBe("Sapaan");
    await expect(salutation.locator('option[value="Yth."]')).toHaveCount(0);
    await expect(salutation.locator("option")).toHaveText([
      "Sapaan",
      "Bapak",
      "Ibu",
      "Tim",
    ]);
    await salutation.selectOption("Ibu");
    await expect(salutation).toHaveValue("Ibu");
    await salutation.selectOption("");
    await expect(salutation).toHaveValue("");
  }
});

test("tembusan can be generated without a salutation", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    ccRecipients: [{
      id: "cc-without-salutation",
      gender: "",
      name: "Verry Iskandar",
      position: "Kepala KCU Pluit",
    }],
  });

  const ccAttention = page.locator("aside p").filter({ hasText: "Verry Iskandar" }).first();
  await expect(ccAttention).toHaveText("U.p. Yth. Verry Iskandar");
  expect(await ccAttention.textContent()).toBe("U.p. Yth. Verry Iskandar");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  expect(xml).toContain("U.p. Yth. Verry Iskandar");
});

test("kepada can be generated without a salutation", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    recipients: [{
      ...completeDraft().recipients[0],
      gender: "",
    }],
  });

  const recipientPanel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Kepada" }) })
    .first();
  await expect(recipientPanel).not.toContainText("Sapaan *");
  await expect(recipientPanel.getByLabel("Sapaan")).toHaveValue("");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  expect(xml).toContain("U.p. Yth. Agustina");
});

test("closing wording stays directly after PIC and only later blocks continue", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    metadata: {
      ...completeDraft().metadata,
      accessLinkEnabled: false,
      accessLink: "",
    },
    developmentRows: [],
    activities: [],
    attachmentsEnabled: false,
    attachments: "",
    ccRecipients: Array.from({ length: 20 }, (_, index) => ({
      id: `cc-closing-${index}`,
      gender: "",
      name: `Penerima ${index + 1}`,
      position: `Unit Kerja ${index + 1}`,
    })),
  });

  const mainPages = page.locator('aside article[data-page-kind="main"]');
  const contactPage = mainPages.filter({
    has: page.getByRole("heading", { name: "PIC yang Dapat Dihubungi", exact: true }),
  });
  await expect(contactPage).toHaveCount(1);
  await expect(
    contactPage.getByText(
      "Demikian informasi ini kami sampaikan, atas perhatian Bapak/Ibu kami ucapkan terima kasih.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(contactPage.getByText("SIGNER - Jabatan", { exact: true })).toBeVisible();

  const pageOverflow = await mainPages
    .locator("[data-preview-page-content]")
    .evaluateAll((contents) =>
      contents.map((content) => content.scrollHeight - content.clientHeight),
    );
  expect(Math.max(...pageOverflow)).toBeLessThanOrEqual(1);

  const ccContinuationPage = mainPages.filter({
    has: page.getByText("Unit Kerja 1", { exact: true }),
  });
  await expect(ccContinuationPage).toHaveCount(1);
  const ccContinuationRule = ccContinuationPage.locator("div.h-px");
  await expect(ccContinuationRule).toHaveCount(1);
  const ccContinuationRuleBox = await ccContinuationRule.boundingBox();
  const ccTitleBox = await ccContinuationPage
    .getByText("Tembusan:", { exact: true })
    .boundingBox();
  expect(ccContinuationRuleBox).toBeTruthy();
  expect(ccTitleBox).toBeTruthy();
  expect((ccTitleBox?.y ?? 0) - ((ccContinuationRuleBox?.y ?? 0) + (ccContinuationRuleBox?.height ?? 0)))
    .toBeLessThanOrEqual(40);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  const contactIndex = xml.indexOf("PIC yang Dapat Dihubungi");
  const closingIndex = xml.indexOf("Demikian informasi ini kami sampaikan");
  const ccRecipient16Index = xml.indexOf("Unit Kerja 16");
  const ccRecipient17Index = xml.indexOf("Unit Kerja 17");
  expect(contactIndex).toBeGreaterThan(-1);
  expect(closingIndex).toBeGreaterThan(contactIndex);
  expect(xml.slice(contactIndex, closingIndex)).not.toContain("<w:pageBreakBefore/>");
  expect(ccRecipient16Index).toBeGreaterThan(closingIndex);
  expect(ccRecipient17Index).toBeGreaterThan(ccRecipient16Index);
  expect(xml.slice(ccRecipient16Index, ccRecipient17Index)).toContain("<w:pageBreakBefore/>");
  expect(xml.slice(ccRecipient16Index, ccRecipient17Index)).toContain("Perihal:");
  expect(xml.slice(ccRecipient16Index, ccRecipient17Index)).toContain("Sambungan");
  const continuationCcContext = xml.slice(
    xml.lastIndexOf("Perihal:  </w:t>", ccRecipient17Index),
    ccRecipient17Index,
  );
  expect(continuationCcContext).not.toContain('w:before="260"');
  expect(continuationCcContext).not.toContain('w:before="120"');
});

test("closing blocks use one-line spacing and continuation content starts compactly", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    metadata: {
      ...completeDraft().metadata,
      accessLinkEnabled: false,
      accessLink: "",
    },
    developmentRows: Array.from({ length: 12 }, (_, index) => ({
      id: `spacing-development-${index}`,
      item: richText(`Pengembangan ${index + 1}`),
      description: richText("Keterangan untuk mengisi halaman pertama memo."),
    })),
    activities: [],
    attachmentsEnabled: false,
    attachments: "",
  });

  const mainPages = page.locator('aside article[data-page-kind="main"]');
  const contactPage = mainPages.filter({
    has: page.getByRole("heading", { name: "PIC yang Dapat Dihubungi", exact: true }),
  });
  await expect(contactPage).toHaveCount(1);
  const schedulePage = mainPages.filter({
    has: page.getByRole("heading", { name: "Jadwal Pilot Implementasi", exact: true }),
  });
  await expect(schedulePage).toHaveCount(1);
  await expect(
    schedulePage.getByRole("heading", {
      name: "Perihal: Pilot Implementasi BDS Web Gen 2 versi 4.3.0, Sambungan",
      exact: true,
    }),
  ).toBeVisible();

  const continuationRule = schedulePage.locator("div.h-px");
  await expect(continuationRule).toHaveCount(1);
  const continuationRuleBox = await continuationRule.boundingBox();
  const scheduleTitleBox = await schedulePage
    .getByRole("heading", { name: "Jadwal Pilot Implementasi", exact: true })
    .boundingBox();
  expect(continuationRuleBox).toBeTruthy();
  expect(scheduleTitleBox).toBeTruthy();
  expect(
    (scheduleTitleBox?.y ?? 0) -
      ((continuationRuleBox?.y ?? 0) + (continuationRuleBox?.height ?? 0)),
  ).toBeLessThanOrEqual(32);

  const contactBox = await contactPage
    .getByText("Nama PIC – pic@example.com", { exact: true })
    .boundingBox();
  const closingBox = await contactPage
    .getByText(
      "Demikian informasi ini kami sampaikan, atas perhatian Bapak/Ibu kami ucapkan terima kasih.",
      { exact: true },
    )
    .boundingBox();
  const signerBox = await contactPage
    .getByText("SIGNER - Jabatan", { exact: true })
    .boundingBox();
  const ccTitleBox = await contactPage
    .getByText("Tembusan:", { exact: true })
    .boundingBox();
  const ccAttentionBox = await contactPage
    .getByText("U.p. Yth. Bapak Verry Iskandar", { exact: true })
    .boundingBox();
  const initialsBox = await contactPage
    .getByText("abc/uat-a", { exact: true })
    .boundingBox();

  const gaps = [
    (closingBox?.y ?? 0) - ((contactBox?.y ?? 0) + (contactBox?.height ?? 0)),
    (signerBox?.y ?? 0) - ((closingBox?.y ?? 0) + (closingBox?.height ?? 0)),
    (ccTitleBox?.y ?? 0) - ((signerBox?.y ?? 0) + (signerBox?.height ?? 0)),
    (initialsBox?.y ?? 0) -
      ((ccAttentionBox?.y ?? 0) + (ccAttentionBox?.height ?? 0)),
  ];
  for (const gap of gaps) {
    expect(gap).toBeGreaterThanOrEqual(10);
    expect(gap).toBeLessThanOrEqual(22);
  }

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  const scheduleIndex = xml.indexOf("Jadwal Pilot Implementasi");
  const scheduleContinuationIndex = xml.lastIndexOf("Perihal:  </w:t>", scheduleIndex);
  const scheduleContext = xml.slice(scheduleContinuationIndex, scheduleIndex);
  expect(scheduleContinuationIndex).toBeGreaterThan(-1);
  expect(scheduleContext).toContain('w:before="240"');
  expect(scheduleContext).not.toContain('w:before="120"');

  const closingIndex = xml.indexOf("Demikian informasi ini kami sampaikan");
  const closingContext = xml.slice(Math.max(0, closingIndex - 500), closingIndex + 150);
  expect(closingContext).toContain('w:before="220"');
  expect(closingContext).toContain('w:after="220"');

  const ccIndex = xml.indexOf("Tembusan:", closingIndex);
  const ccContext = xml.slice(Math.max(0, ccIndex - 300), ccIndex + 100);
  expect(ccContext).toContain('w:before="220"');

  const initialsIndex = xml.indexOf("abc/uat-a", ccIndex);
  const initialsContext = xml.slice(Math.max(0, initialsIndex - 300), initialsIndex + 100);
  expect(initialsContext).toContain('w:before="220"');
});

test("consecutive duplicate table values keep each column default alignment", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const duplicateItem = richText("Nilai pengembangan sama");
  const duplicateDescription = richText("Keterangan sama");
  const duplicateActivity = richText("Aktivitas sama");
  const duplicateScenario = richText("Skenario sama");
  const duplicateResult = richText("Hasil sama");
  await importDraft(page, {
    ...completeDraft(),
    developmentRows: [
      { id: "development-merge-1", item: duplicateItem, description: duplicateDescription },
      { id: "development-merge-2", item: duplicateItem, description: duplicateDescription },
    ],
    activities: [
      {
        id: "activity-merge-1",
        startDate: "2026-05-01",
        endDate: "2026-05-01",
        owner: "CTSA",
        activity: duplicateActivity,
      },
      {
        id: "activity-merge-2",
        startDate: "2026-05-01",
        endDate: "2026-05-01",
        owner: "CTSA",
        activity: duplicateActivity,
      },
    ],
    appendixScenarios: [
      {
        ...completeDraft().appendixScenarios[0],
        id: "scenario-merge-1",
        scenario: duplicateScenario,
        expectedResult: duplicateResult,
        pic: "CTSA",
      },
      {
        ...completeDraft().appendixScenarios[0],
        id: "scenario-merge-2",
        scenario: duplicateScenario,
        expectedResult: duplicateResult,
        pic: "CTSA",
        section: "",
      },
    ],
  });

  const mergedCells = page.locator('aside td[rowspan="2"]');
  await expect(mergedCells).toHaveCount(8);
  for (const text of [
    "Nilai pengembangan sama",
    "Keterangan sama",
    "Aktivitas sama",
    "Skenario sama",
    "Hasil sama",
  ]) {
    const cell = page.locator('aside td[rowspan="2"]').filter({ hasText: text });
    await expect(cell).toHaveCount(1);
    await expect(cell).not.toHaveClass(/text-center/);
    await expect(cell).toHaveClass(text === "Nilai pengembangan sama" ? /align-top/ : /align-middle/);
  }

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  expect((xml.match(/<w:vMerge w:val="restart"\/>/g) ?? []).length).toBeGreaterThanOrEqual(8);
  expect((xml.match(/<w:vMerge w:val="continue"\/>/g) ?? []).length).toBeGreaterThanOrEqual(8);
  for (const marker of [">Keterangan</w:t>", ">Waktu</w:t>"]) {
    expectStableTableLevelGrid(documentTableAround(xml, marker));
  }
  expectAppendixTableLevelGrid(documentTableAround(xml, ">Hasil/Keterangan</w:t>"));
  expect(xml).not.toContain('w:val="single" w:color="FFFFFF"');
  expect(xml).toContain('w:color="000000"');
  for (const text of [
    "Nilai pengembangan sama",
    "Keterangan sama",
    "Aktivitas sama",
    "Skenario sama",
    "Hasil sama",
  ]) {
    const textIndex = xml.indexOf(text);
    const cellStart = xml.lastIndexOf("<w:tc>", textIndex);
    const cellEnd = xml.indexOf("</w:tc>", textIndex);
    const cellXml = xml.slice(cellStart, cellEnd);
    expect(cellXml).not.toMatch(/<w:shd\b[^>]*w:fill="FFFFFF"/);
    const paragraphStart = xml.lastIndexOf("<w:p>", textIndex);
    const paragraphEnd = xml.indexOf("</w:p>", textIndex);
    const paragraphXml = xml.slice(paragraphStart, paragraphEnd);
    expect(paragraphXml).not.toContain('<w:jc w:val="center"/>');
  }
});

test("memo and appendix preview use the exact generated A4 paper size without changing validation", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const portrait = await page.locator('aside article[data-page-kind="main"]').first().boundingBox();
  const landscape = await page.locator('aside article[data-page-kind="appendix"]').first().boundingBox();
  const validation = await page.locator('aside article[data-page-kind="validation"]').boundingBox();
  expect(portrait).toBeTruthy();
  expect(landscape).toBeTruthy();
  expect(validation).toBeTruthy();
  expect(portrait?.width).toBeCloseTo((210 / 25.4) * 96, 1);
  expect(portrait?.height).toBeCloseTo((297 / 25.4) * 96, 1);
  expect(landscape?.width).toBeCloseTo((297 / 25.4) * 96, 1);
  expect(landscape?.height).toBeCloseTo((210 / 25.4) * 96, 1);
  expect(validation?.width).toBe(794);
  expect(validation?.height).toBe(1123);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  expect(xml).toContain('<w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>');
  expect(xml).toContain('<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>');
  expect(xml).toContain(
    '<w:pgMar w:top="960" w:right="1200" w:bottom="960" w:left="1440" w:header="840" w:footer="480" w:gutter="0"/>',
  );
});

test("DOCX data tables stay inside the A4 content grid using direct indented grids", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  const titleIndex = xml.indexOf(">Lingkup Pengembangan</w:t>");
  const headerIndex = xml.indexOf(">Pengembangan</w:t>", titleIndex + 1);
  const tableStart = xml.lastIndexOf("<w:tbl>", headerIndex);
  const tableEnd = xml.indexOf("</w:tbl>", headerIndex) + "</w:tbl>".length;
  const developmentTable = xml.slice(tableStart, tableEnd);

  expect(developmentTable).toBeTruthy();
  expect(developmentTable).toMatch(/<w:tblW w:type="dxa" w:w="7080"\/>/);
  expect(developmentTable).toContain('<w:tblInd w:type="dxa" w:w="2100"/>');
  expect((developmentTable?.match(/<w:gridCol /g) ?? []).length).toBe(3);
  expect(developmentTable).toContain('<w:gridCol w:w="570"/>');
  expect(developmentTable).toContain('<w:gridCol w:w="1695"/>');
  expect(developmentTable).toContain('<w:gridCol w:w="4815"/>');
  expect(developmentTable.match(/<w:gridSpan w:val="2"\/>/g) ?? []).toHaveLength(2);

  const appendixTable = documentTableAround(xml, ">Hasil/Keterangan</w:t>");
  expect(appendixTable).toMatch(/<w:tblW w:type="dxa" w:w="15315"\/>/);
  expect((appendixTable.match(/<w:gridCol /g) ?? []).length).toBe(4);
});

test("memo heading adds one full line after the header and keeps its labels left-aligned", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const mainPage = page.locator('aside article[data-page-kind="main"]').first();
  const releaseDate = await mainPage.locator("header span").last().boundingBox();
  const recipientLabel = await mainPage.getByText("Kepada", { exact: true }).boundingBox();
  expect(recipientLabel?.x).toBeCloseTo(releaseDate?.x ?? 0, 0);
  expect((recipientLabel?.y ?? 0) - ((releaseDate?.y ?? 0) + (releaseDate?.height ?? 0))).toBeGreaterThanOrEqual(30);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  const headingTable = documentTableAround(xml, ">Kepada</w:t>");
  const headingTableStart = xml.indexOf(headingTable);
  const spacerStart = xml.lastIndexOf("<w:p>", headingTableStart);
  const spacer = xml.slice(spacerStart, headingTableStart);
  expect(spacer).toContain('w:before="396"');

  const cells = headingTable.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? [];
  expect(cells).toHaveLength(12);
  for (const cell of cells) {
    const margins = cell.match(/<w:tcMar\b[\s\S]*?<\/w:tcMar>/)?.[0] ?? "";
    expect(margins).toBeTruthy();
    expect(margins.match(/w:w="0"/g) ?? []).toHaveLength(4);
  }
});

test("DOCX data tables use one non-overlapping one-point border source", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  for (const marker of [">Keterangan</w:t>", ">Waktu</w:t>"]) {
    expectStableTableLevelGrid(documentTableAround(xml, marker));
  }
  const appendixTable = documentTableAround(xml, ">Hasil/Keterangan</w:t>");
  expectAppendixTableLevelGrid(appendixTable);
  expect(appendixTable).toMatch(/<w:trPr>[\s\S]*?<w:tblHeader\/>[\s\S]*?<\/w:trPr>/);
});

test("DOCX keeps development and activity tables directly after their borderless preview wrapper", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);

  for (const [title, header] of [
    ["Lingkup Pengembangan", "Pengembangan"],
    ["Aktivitas Cabang dan Unit Kerja", "Aktivitas"],
  ]) {
    const titleIndex = xml.indexOf(`>${title}</w:t>`);
    const headerIndex = xml.indexOf(`>${header}</w:t>`, titleIndex + title.length);
    const sectionTableStart = xml.lastIndexOf("<w:tbl>", titleIndex);
    const sectionTableEnd = xml.indexOf("</w:tbl>", titleIndex) + "</w:tbl>".length;
    const targetTableStart = xml.lastIndexOf("<w:tbl>", headerIndex);
    const previewWrapper = xml.slice(sectionTableStart, sectionTableEnd);
    const previewWrapperProperties = previewWrapper.slice(
      0,
      previewWrapper.indexOf("</w:tblPr>") + "</w:tblPr>".length,
    );
    expect(titleIndex).toBeGreaterThan(-1);
    expect(headerIndex).toBeGreaterThan(sectionTableEnd);
    expect(targetTableStart).toBeGreaterThanOrEqual(sectionTableEnd);
    expect(previewWrapper).not.toContain(`>${header}</w:t>`);
    expect(previewWrapperProperties).not.toMatch(/w:val="single"/);
    expect((previewWrapperProperties.match(/w:val="nil"/g) ?? []).length).toBe(6);
  }
});

test("DOCX keeps safe preview spacing before data tables and access links", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);

  for (const text of [
    "Berikut adalah fitur pengembangan pada",
    "Berikut ini adalah aktivitas yang perlu dilakukan",
  ]) {
    const textIndex = xml.indexOf(text);
    const paragraphStart = xml.lastIndexOf("<w:p>", textIndex);
    const paragraphEnd = xml.indexOf("</w:p>", textIndex);
    expect(xml.slice(paragraphStart, paragraphEnd)).toContain('w:after="120"');
  }

  const accessIntroIndex = xml.indexOf("dapat diakses melalui link berikut:");
  const accessUrlIndex = xml.indexOf("https://bdswebg2-pilot", accessIntroIndex);
  expect(xml.lastIndexOf("<w:p>", accessUrlIndex)).toBe(
    xml.lastIndexOf("<w:p>", accessIntroIndex),
  );
});

test("DOCX continuation and section rules share the same A4 content boundary", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    developmentRows: Array.from({ length: 9 }, (_, index) => ({
      id: `rule-development-${index}`,
      item: richText(`Pengembangan ${index + 1}`),
      description: richText(
        "Keterangan panjang untuk membuat halaman memo berlanjut dan menampilkan garis sambungan.",
      ),
    })),
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  const tables = documentTables(xml);
  const continuationRule = tables.find((table) =>
    table.includes("Bersambung ke halaman berikut"),
  );
  const accessSection = tables.find((table) =>
    table.includes(`Akses Link ${completeDraft().metadata.memoType}`),
  ) ?? tables.find((table) => table.includes("Akses Link"));

  expect(continuationRule).toBeTruthy();
  expect(continuationRule).toMatch(/<w:tblW w:type="dxa" w:w="7166"\/>/);
  expect(continuationRule).toContain('<w:tblInd w:type="dxa" w:w="2100"/>');
  expect(accessSection).toBeTruthy();
  expect(accessSection).toMatch(/<w:tblW w:type="dxa" w:w="9266"\/>/);
  expect(accessSection).toContain('<w:gridCol w:w="1800"/>');
  expect(accessSection).toContain('<w:gridCol w:w="300"/>');
  expect(accessSection).toContain('<w:gridCol w:w="7166"/>');
});

test("empty rich text fields start in plain text mode", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const editors = page.locator(".ProseMirror");
  const count = await editors.count();

  for (let index = 0; index < count; index += 1) {
    await editors.nth(index).evaluate((node) => (node as HTMLElement).focus());
    await page.keyboard.type(`plain-${index}`);
  }

  for (let index = 0; index < count; index += 1) {
    const html = await editors.nth(index).evaluate((node) => node.innerHTML);
    expect(html).not.toContain("<strong>");
  }
});

test("enter after bold starts plain text", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const editor = page.locator(".ProseMirror").first();
  await editor.evaluate((node) => (node as HTMLElement).focus());
  await expect(editor).toBeFocused();
  await page.waitForTimeout(100);
  await page.keyboard.press("Control+B");
  await page.waitForTimeout(100);
  await page.keyboard.type("Bold");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Normal");

  await expect(editor).toContainText("Normal");
  const html = await editor.evaluate((node) => node.innerHTML);
  expect(html).toContain("<strong>");
  expect(html).toContain("<p>Normal</p>");
});

test("double click does not enable bold typing", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const editor = page.locator(".ProseMirror").first();
  await editor.click();
  await page.keyboard.type("Plain");
  await editor.dblclick();
  await page.keyboard.type("Still plain");

  const html = await editor.evaluate((node) => node.innerHTML);
  expect(html).not.toContain("<strong>");
});

test("collaboration panel starts a shareable worker room", async ({ page }) => {
  await page.goto("http://localhost:3002");

  await expect(page.getByRole("button", { name: "Start Collab" })).toBeVisible();
  await expect(page.getByText("Personal Draft")).toBeVisible();
  await expect(page.getByText("Offline")).toBeVisible();
  await expect(page.getByText("Users: 1")).toBeVisible();
  await expect(page.getByText("Last synced: -")).toBeVisible();

  await page.getByRole("button", { name: "Start Collab" }).click();
  const identityDialog = page.getByRole("dialog", { name: "Isi nama kolaborator" });
  await expect(identityDialog).toBeVisible();
  await expect(page).not.toHaveURL(/room=/);
  await identityDialog.getByLabel("Nama *").fill("Maker Collab");
  await identityDialog.getByRole("button", { name: "Lanjut" }).click();
  await expect(page.getByRole("button", { name: "Restart Collab" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy Link" })).toBeVisible();
  await expect(page).toHaveURL(/room=/);

  await page.getByRole("button", { name: "Komentar Review" }).click();
  await expect(page.getByRole("heading", { name: "Audit Log" })).toHaveCount(0);
  const popupBox = await page.locator("#review-comments-popup").boundingBox();
  expect(popupBox?.width).toBeGreaterThanOrEqual(600);
  await page.getByRole("button", { name: "Add Comment" }).click();
  await expect(page.getByRole("heading", { name: "Isi nama kolaborator" })).toHaveCount(0);
});

test("collaboration syncs metadata fields between pages", async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  await first.goto("http://localhost:3002");
  await first.getByRole("button", { name: "Start Collab" }).click();
  const firstIdentityDialog = first.getByRole("dialog", { name: "Isi nama kolaborator" });
  await firstIdentityDialog.getByLabel("Nama *").fill("Collaborator One");
  await firstIdentityDialog.getByRole("button", { name: "Lanjut" }).click();
  await expect(first).toHaveURL(/room=/);

  await second.goto(first.url());
  const secondIdentityDialog = second.getByRole("dialog", { name: "Isi nama kolaborator" });
  await expect(secondIdentityDialog).toBeVisible();
  await secondIdentityDialog.getByLabel("Nama *").fill("Collaborator Two");
  await secondIdentityDialog.getByRole("button", { name: "Lanjut" }).click();
  await expect(first.getByText("Users: 2")).toBeVisible({ timeout: 20000 });
  await expect(second.getByText("Users: 2")).toBeVisible({ timeout: 20000 });
  await second.getByLabel("Nama Project").fill("Collab Nama Project");

  await expect(first.getByLabel("Nama Project")).toHaveValue("Collab Nama Project", {
    timeout: 10000,
  });
  await expect(first.locator("aside").getByText("Pilot Implementasi Collab Nama Project").first()).toBeVisible();

  await firstContext.close();
  await secondContext.close();
});

test("collaboration hydrates a joiner from the room owner before allowing writes", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const joinerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const joiner = await joinerContext.newPage();

  await owner.goto("http://localhost:3002");
  await owner.getByLabel("Nama Project").fill("Data Pemilik Room");
  await owner.getByRole("button", { name: "Start Collab" }).click();
  const ownerIdentityDialog = owner.getByRole("dialog", { name: "Isi nama kolaborator" });
  await ownerIdentityDialog.getByLabel("Nama *").fill("Pemilik Room");
  await expect(owner.getByLabel("Nama Project")).toHaveValue("Data Pemilik Room");
  await ownerIdentityDialog.getByRole("button", { name: "Lanjut" }).click();
  await expect(owner).toHaveURL(/room=/);
  await expect(owner.getByText("Saved")).toBeVisible({ timeout: 20000 });
  await expect(owner.getByLabel("Nama Project")).toHaveValue("Data Pemilik Room");

  await joiner.goto("http://localhost:3002");
  await joiner.getByLabel("Nama Project").fill("Draft Lokal Peserta");
  await joiner.waitForTimeout(3500);
  await joiner.goto(owner.url());
  const joinerIdentityDialog = joiner.getByRole("dialog", { name: "Isi nama kolaborator" });
  await joinerIdentityDialog.getByLabel("Nama *").fill("Peserta Baru");
  await joinerIdentityDialog.getByRole("button", { name: "Lanjut" }).click();
  await expect(owner.getByText("Users: 2")).toBeVisible({ timeout: 20000 });
  await expect(joiner.getByText("Users: 2")).toBeVisible({ timeout: 20000 });

  await expect(joiner.getByLabel("Nama Project")).toHaveValue("Data Pemilik Room", {
    timeout: 20000,
  });
  await joiner.waitForTimeout(2000);
  await expect(owner.getByLabel("Nama Project")).toHaveValue("Data Pemilik Room");

  await ownerContext.close();
  await joinerContext.close();
});

test("review comments can be added to a field and focused", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const longComment = `Perbaiki nama project ${"komentarpanjang".repeat(28)}`;

  await page.getByRole("button", { name: "Komentar Review" }).click();
  await page.getByRole("button", { name: "Add Comment" }).click();
  const identityDialog = page.getByRole("dialog", { name: "Isi nama kolaborator" });
  await expect(identityDialog).toBeVisible();
  await identityDialog.getByLabel("Nama *").fill("Reviewer A");
  await identityDialog.getByRole("button", { name: "Lanjut" }).click();
  await page.getByLabel("Nama Project").click();
  await expect(page.getByLabel("Nama Reviewer")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Komentar *" }).fill(longComment);
  await page.getByRole("button", { name: "Simpan" }).click();

  await expect(page.getByRole("button", { name: "Lihat field: Nama Project" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Audit Log" })).toHaveCount(0);
  const commentBody = page.locator("[data-review-comment-body]");
  await expect(commentBody).toHaveCount(1);
  await expect(commentBody).toHaveText(longComment);
  expect(
    await commentBody.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  expect((await commentBody.boundingBox())?.height).toBeGreaterThan(40);
  await page.getByRole("button", { name: "Lihat field: Nama Project" }).click();
  await expect(page.locator('[data-field-id="projectName"]')).toHaveClass(/review-target-highlight/);

  await page.getByRole("button", { name: "Balas komentar" }).click();
  await page.getByRole("textbox", { name: "Balasan *" }).fill("Sudah diperbaiki");
  await page.getByRole("button", { name: "Kirim balasan" }).click();
  await expect(page.getByText("Sudah diperbaiki", { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Komentar Review" }).click();
  await page.getByRole("button", { name: "Add Comment" }).click();
  await expect(page.getByRole("heading", { name: "Isi nama kolaborator" })).toHaveCount(0);
});

test("appendix scenario uses section header numbering", async ({ page }) => {
  await page.goto("http://localhost:3002");

  await page.getByLabel("Nama Project").fill("BDS Web Gen 2 versi 4.3.0");
  await page.getByRole("textbox", { name: "Bagian * A" }).fill("Verifikasi Landing Page Pemol Giro Badan (SEEDS)");

  const appendixTable = page.locator("aside table").last();
  await expect(appendixTable).toContainText("A.Verifikasi Landing Page Pemol Giro Badan (SEEDS)");
  await expect(appendixTable).toContainText("1.");
});

test("lampiran toggle shows attachment list in preview", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const attachmentsPanel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Lampiran", exact: true }) })
    .first();

  await expect(attachmentsPanel.getByLabel("Tidak")).toBeChecked();
  await expect(attachmentsPanel.getByLabel("Daftar lampiran")).toHaveCount(0);

  await attachmentsPanel.getByLabel("Ya").check();
  await attachmentsPanel.getByLabel("Daftar lampiran").fill(
    [
      "Draft SE Perihal: Pengembangan Pembukaan Rekening Giro Badan",
      "Skenario Pilot Implementasi BDS Web Gen 2 versi 4.3.0",
    ].join("\n"),
  );

  await expect(page.locator("aside")).toContainText("Bersama dengan memo ini dilampirkan:");
  await expect(page.locator("aside")).toContainText(
    "•Draft SE Perihal: Pengembangan Pembukaan Rekening Giro Badan",
  );
});

test("appendix hierarchy adds date, section, and scenario in place", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const appendixPanel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Lampiran Skenario" }) })
    .first();

  const sectionInputs = appendixPanel.getByRole("textbox", { name: /Bagian \* [A-Z]+/ });
  await expect(sectionInputs).toHaveCount(1);
  await appendixPanel.getByRole("button", { name: "Bagian", exact: true }).click();
  await expect(sectionInputs).toHaveCount(2);

  await expect(appendixPanel.getByRole("button", { name: "Skenario", exact: true })).toHaveCount(2);
  await appendixPanel.getByRole("button", { name: "Skenario", exact: true }).first().click();
  await expect(appendixPanel.getByText("Skenario 2")).toBeVisible();

  await expect(appendixPanel.getByRole("button", { name: "Tanggal", exact: true })).toHaveCount(1);
  await appendixPanel.getByRole("button", { name: "Tanggal", exact: true }).click();
  await expect(appendixPanel.getByRole("button", { name: "Tanggal", exact: true })).toHaveCount(2);
});

test("Lingkup wording uses only project name and document borders stay PDF-safe", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const wording = "Berikut adalah fitur pengembangan pada BDS Web Gen 2 versi 4.3.0:";
  await expect(page.locator("aside").getByText(wording, { exact: true })).toBeVisible();
  await expect(
    page.locator("aside").getByText(
      "Berikut adalah fitur pengembangan pada Pilot Implementasi BDS Web Gen 2 versi 4.3.0:",
      { exact: true },
    ),
  ).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  expect(xml).toContain(wording);
  expect(xml).not.toContain(
    "Berikut adalah fitur pengembangan pada Pilot Implementasi BDS Web Gen 2 versi 4.3.0:",
  );
  expect(xml).not.toContain('w:val="single" w:color="0F172A" w:sz="6"');
  expect(xml).not.toContain('w:val="single" w:color="1F2937" w:sz="4"');
  const appendixTable = documentTableAround(xml, ">Hasil/Keterangan</w:t>");
  expect(appendixTable).not.toContain("<w:tblCellSpacing");
  expect(appendixTable).not.toMatch(/<w:tblPr>[\s\S]*?<w:shd\b[^>]*w:fill="000000"[^>]*\/>/);
  expect(appendixTable).not.toMatch(
    /<w:(?:top|left|bottom|right|insideH|insideV)\b[^>]*w:val="single"[^>]*w:sz="12"/,
  );
});

test("schedule keeps the complete date range together in preview and DOCX", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    pilotSchedule: { startDate: "2026-06-12", endDate: "2026-06-19" },
  });

  const scheduleSection = page
    .locator("aside section")
    .filter({ has: page.getByRole("heading", { name: "Jadwal Pilot Implementasi", exact: true }) });
  const date = scheduleSection.locator("[data-schedule-date]");
  await expect(date).toHaveText("12 – 19 Juni 2026");
  await expect(date).toHaveClass(/whitespace-nowrap/);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  expect(xml).toContain("12 – 19 Juni 2026");
});

test("all memo calendars render skipped dates as compact ranges in preview and DOCX", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const selectedDates = ["2026-07-03", "2026-07-04", "2026-07-07"];
  const expected = "3 \u2013 4, 7 Juli 2026";
  await importDraft(page, {
    ...completeDraft(),
    pilotSchedule: {
      startDate: "2026-07-03",
      endDate: "2026-07-07",
      dates: selectedDates,
    },
    activities: completeDraft().activities.map((row) => ({
      ...row,
      startDate: "2026-07-03",
      endDate: "2026-07-07",
      dates: selectedDates,
    })),
    appendixScenarios: completeDraft().appendixScenarios.map((row) => ({
      ...row,
      startDate: "2026-07-03",
      endDate: "2026-07-07",
      dates: selectedDates,
    })),
  });

  await expect(page.locator("[data-schedule-date]")).toHaveText(expected);
  await expect(page.locator('aside [data-preview-field-id^="activity-date-"]').filter({ hasText: expected })).toBeVisible();
  await expect(page.locator('aside article[data-page-kind="appendix"]').getByText(expected, { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  const expectedDocx = "3\u00A0\u2013\u00A04,\u00A07\u00A0Juli\u00A02026";
  const expectedDocxAnySpacing = /3(?:\u00A0| )\u2013(?:\u00A0| )4,(?:\u00A0| )7(?:\u00A0| )Juli(?:\u00A0| )2026/g;
  expect(xml).toContain(expectedDocx);
  expect(xml.match(expectedDocxAnySpacing)?.length ?? 0).toBeGreaterThanOrEqual(3);
  expect(xml).not.toContain("3\u00A0\u2013\u00A07\u00A0Juli\u00A02026");
});

test("calendar day clicks keep previous selected dates and compress adjacent days", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    pilotSchedule: {
      startDate: "2026-07-03",
      endDate: "2026-07-03",
      dates: ["2026-07-03"],
    },
  });

  await page.locator('[data-field-id="schedule"] button').click();
  const popup = page.locator("[data-date-range-popup]");
  await popup.getByRole("button", { name: "4", exact: true }).first().click();
  await popup.getByRole("button", { name: "7", exact: true }).first().click();
  await popup.getByRole("button", { name: "Done", exact: true }).click();

  await expect(page.locator("[data-schedule-date]")).toHaveText("3 \u2013 4, 7 Juli 2026");
});

test("table rich text removes trailing empty paragraphs after lists", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    developmentRows: [{
      id: "development-list-trim",
      item: richText("Daftar pengembangan"),
      description: richListWithTrailingEmpty("orderedList", ["Pertama", "Kedua"]),
    }],
  });

  const descriptionCell = page.locator("aside td").filter({ hasText: "Pertama" });
  await expect(descriptionCell).toHaveCount(1);
  await expect(descriptionCell.locator(".preview-rich-text > p")).toHaveCount(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  const secondIndex = xml.indexOf("Kedua");
  const cellEnd = xml.indexOf("</w:tc>", secondIndex);
  const tail = xml.slice(xml.indexOf("</w:p>", secondIndex) + 6, cellEnd);
  expect(tail).not.toContain("<w:p>");
});

test("duplicate scenario dates remain independent range groups", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const scenarioBase = completeDraft().appendixScenarios[0];
  await importDraft(page, {
    ...completeDraft(),
    appendixScenarios: [
      { ...scenarioBase, id: "same-date-1", dateGroupId: "same-date-group-1" },
      {
        ...scenarioBase,
        id: "same-date-2",
        dateGroupId: "same-date-group-2",
        sectionGroupId: "same-date-section-2",
        section: "Bagian kedua",
      },
    ],
  });

  const appendixPanel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Lampiran Skenario" }) })
    .first();
  const dateButtons = appendixPanel.getByRole("button", { name: /Tanggal \d+ \*/ });
  await expect(dateButtons).toHaveCount(2);
  await expect(dateButtons.nth(0)).toContainText("7 – 21 Mei 2026");
  await expect(dateButtons.nth(1)).toContainText("7 – 21 Mei 2026");

  await dateButtons.nth(1).click();
  const popup = page.locator("[data-date-range-popup]");
  await popup.getByRole("button", { name: "24", exact: true }).click();
  await popup.getByRole("button", { name: "25", exact: true }).click();
  await popup.getByRole("button", { name: "Done", exact: true }).click();

  await expect(dateButtons.nth(0)).toContainText("7 – 21 Mei 2026");
  await expect(dateButtons.nth(1)).toContainText("24 – 25 Mei 2026");
});

test("appendix date and section groups expose hierarchy drag handles", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const scenarioBase = completeDraft().appendixScenarios[0];
  await importDraft(page, {
    ...completeDraft(),
    appendixScenarios: [
      {
        ...scenarioBase,
        id: "drag-a",
        dateGroupId: "drag-date-a",
        sectionGroupId: "drag-section-a",
        section: "Bagian Alpha",
      },
      {
        ...scenarioBase,
        id: "drag-b",
        dateGroupId: "drag-date-b",
        sectionGroupId: "drag-section-b",
        startDate: "2026-06-01",
        endDate: "2026-06-02",
        section: "Bagian Beta",
      },
    ],
  });

  const appendixPanel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Lampiran Skenario" }) })
    .first();
  await expect(appendixPanel.getByRole("button", { name: "Ubah urutan tanggal 1" })).toBeVisible();
  await expect(appendixPanel.getByRole("button", { name: "Ubah urutan tanggal 2" })).toBeVisible();
  await expect(appendixPanel.getByRole("button", { name: "Ubah urutan bagian A" })).toHaveCount(2);
  const dateGroups = appendixPanel.locator("[data-scenario-date-group]");
  await expect(dateGroups).toHaveCount(2);
  await expect(dateGroups.nth(0)).toContainText("Bagian Alpha");
  await expect(dateGroups.nth(1)).toContainText("Bagian Beta");
});

test("preview field click and mandatory validation share temporary yellow focus", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const previewProject = page.locator('[data-preview-field-id="projectName"]').first();
  await expect(previewProject).toBeVisible();
  await previewProject.click();
  const projectField = page.locator('[data-field-id="projectName"]');
  await expect(projectField).toHaveClass(/field-jump-highlight/);
  await expect(page.getByLabel("Nama Project")).toBeFocused();
  await expect(projectField).not.toHaveClass(/field-jump-highlight/, { timeout: 3500 });

  await page.getByLabel("Nama Project").fill("");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  await expect(projectField).toHaveClass(/field-jump-highlight/);
  await expect(page.getByLabel("Nama Project")).toBeFocused();
  await expect(projectField).not.toHaveClass(/field-jump-highlight/, { timeout: 3500 });
});

test("review comments layout matches unresolved and resolved references", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const createdAt = "2026-06-18T13:48:00.000Z";
  await importDraft(page, {
    ...completeDraft(),
    reviewComments: [
      {
        id: "review-open",
        type: "field",
        targetId: "projectName",
        targetLabel: "Nama Project",
        path: [],
        text: "Perlu diperbaiki",
        author: "asdas",
        resolved: false,
        createdAt,
        updatedAt: createdAt,
        replies: [{ id: "reply-open", text: "Sudah dicek", author: "asdas", createdAt }],
      },
      {
        id: "review-resolved",
        type: "field",
        targetId: "contact-name-contact-test",
        targetLabel: "PIC",
        path: [],
        text: "asdsadsaa",
        author: "asdas",
        resolved: true,
        createdAt,
        updatedAt: createdAt,
        replies: [],
      },
    ],
    reviewAuditLog: [
      {
        id: "audit-created-open",
        action: "comment-created",
        actor: "asdas",
        description: "Dibuat",
        commentId: "review-open",
        targetLabel: "Nama Project",
        createdAt,
      },
      {
        id: "audit-reply-open",
        action: "comment-replied",
        actor: "asdas",
        description: "Reply dibuat",
        commentId: "review-open",
        targetLabel: "Nama Project",
        createdAt,
      },
      {
        id: "audit-created-resolved",
        action: "comment-created",
        actor: "asdas",
        description: "Dibuat",
        commentId: "review-resolved",
        targetLabel: "PIC",
        createdAt,
      },
      {
        id: "audit-resolved",
        action: "comment-resolved",
        actor: "asdas",
        description: "Solved",
        commentId: "review-resolved",
        targetLabel: "PIC",
        createdAt,
      },
    ],
  });

  await page.getByRole("button", { name: "Komentar Review" }).click();
  const popup = page.locator("#review-comments-popup");
  const box = await popup.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(680);
  await expect(popup.getByText("1 unresolved, 1 resolved", { exact: true })).toBeVisible();
  const addButton = popup.getByRole("button", { name: "Add Comment" });
  expect((await addButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);

  const unresolved = popup.locator('[data-review-comment-status="unresolved"]');
  const resolved = popup.locator('[data-review-comment-status="resolved"]');
  await expect(unresolved).toHaveCount(1);
  await expect(resolved).toHaveCount(1);
  await expect(resolved).toContainText("Solved oleh asdas");
  await expect(resolved.getByRole("button", { name: "Log Comment (2)" })).toBeVisible();
  await resolved.getByRole("button", { name: "Log Comment (2)" }).click();
  await expect(resolved.locator("[data-review-comment-log-entry]")).toHaveCount(2);
  const actions = resolved.locator("[data-review-comment-action]");
  for (let index = 0; index < await actions.count(); index += 1) {
    expect((await actions.nth(index).boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
});

test("scenario header aligns its delete action", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const row = page.locator("[data-scenario-row]").first();
  const header = row.locator("[data-scenario-header]");
  const remove = row.getByRole("button", { name: "Hapus skenario" });
  await expect(row).toHaveCount(1);

  const headerBox = await header.boundingBox();
  const removeBox = await remove.boundingBox();
  expect(headerBox).toBeTruthy();
  expect(removeBox).toBeTruthy();
  expect(Math.abs(
    (headerBox?.y ?? 0) + (headerBox?.height ?? 0) / 2 -
    ((removeBox?.y ?? 0) + (removeBox?.height ?? 0) / 2),
  )).toBeLessThanOrEqual(2);
});

test("appendix sections can move between date groups", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1800 });
  await page.goto("http://localhost:3002");
  const scenarioBase = completeDraft().appendixScenarios[0];
  await importDraft(page, {
    ...completeDraft(),
    appendixScenarios: [
      {
        ...scenarioBase,
        id: "cross-date-alpha",
        dateGroupId: "cross-date-a",
        sectionGroupId: "cross-section-alpha",
        section: "Bagian Alpha",
      },
      {
        ...scenarioBase,
        id: "cross-date-beta",
        dateGroupId: "cross-date-b",
        sectionGroupId: "cross-section-beta",
        startDate: "2026-06-01",
        endDate: "2026-06-02",
        section: "Bagian Beta",
      },
    ],
  });

  const dateGroups = page.locator("[data-scenario-date-group]");
  await expect(dateGroups).toHaveCount(2);
  const source = dateGroups.nth(0).getByRole("button", { name: "Ubah urutan bagian A" });
  const target = dateGroups.nth(1).getByRole("button", { name: "Ubah urutan bagian A" });
  await source.dragTo(target);

  await expect(dateGroups).toHaveCount(1);
  await expect(dateGroups.nth(0)).toContainText("Bagian Alpha");
  await expect(dateGroups.nth(0)).toContainText("Bagian Beta");
});

test("appendix scenarios can move between sections and date groups", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1800 });
  await page.goto("http://localhost:3002");
  const scenarioBase = completeDraft().appendixScenarios[0];
  await importDraft(page, {
    ...completeDraft(),
    appendixScenarios: [
      {
        ...scenarioBase,
        id: "move-scenario-alpha",
        dateGroupId: "move-date-a",
        sectionGroupId: "move-section-a",
        section: "Bagian Alpha",
        pic: "PIC Alpha",
      },
      {
        ...scenarioBase,
        id: "move-scenario-stay",
        dateGroupId: "move-date-a",
        sectionGroupId: "move-section-a",
        section: "Bagian Alpha",
        pic: "PIC Tetap",
      },
      {
        ...scenarioBase,
        id: "move-scenario-beta",
        dateGroupId: "move-date-b",
        sectionGroupId: "move-section-b",
        startDate: "2026-06-01",
        endDate: "2026-06-02",
        section: "Bagian Beta",
        pic: "PIC Beta",
      },
    ],
  });

  const dateGroups = page.locator("[data-scenario-date-group]");
  await expect(dateGroups).toHaveCount(2);
  const source = dateGroups.nth(0).getByRole("button", { name: "Ubah urutan skenario 1" });
  const target = dateGroups.nth(1).getByRole("button", { name: "Ubah urutan skenario 1" });
  await source.dragTo(target);

  await expect(dateGroups.nth(0).locator("[data-scenario-row]")).toHaveCount(1);
  await expect(dateGroups.nth(1).locator("[data-scenario-row]")).toHaveCount(2);
  await expect(dateGroups.nth(1).locator('[data-field-id="scenario-pic-move-scenario-alpha"]')).toHaveCount(1);
});

test("clicking a scenario drag handle does not reorder scenarios", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const scenarioBase = completeDraft().appendixScenarios[0];
  await importDraft(page, {
    ...completeDraft(),
    appendixScenarios: [
      {
        ...scenarioBase,
        id: "click-first",
        sectionGroupId: "click-section",
        pic: "PIC Pertama",
      },
      {
        ...scenarioBase,
        id: "click-second",
        sectionGroupId: "click-section",
        pic: "PIC Kedua",
      },
    ],
  });

  const scenarioRows = page.locator("[data-scenario-row]");
  await page.getByRole("button", { name: "Ubah urutan skenario 1" }).click();

  await expect(
    scenarioRows.nth(0).locator('[data-field-id="scenario-pic-click-first"]'),
  ).toHaveCount(1);
  await expect(
    scenarioRows.nth(1).locator('[data-field-id="scenario-pic-click-second"]'),
  ).toHaveCount(1);
});

test("appendix scenarios can reorder inside the same section", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const scenarioBase = completeDraft().appendixScenarios[0];
  await importDraft(page, {
    ...completeDraft(),
    appendixScenarios: [
      {
        ...scenarioBase,
        id: "reorder-scenario-first",
        dateGroupId: "reorder-date",
        sectionGroupId: "reorder-section",
        pic: "PIC Pertama",
      },
      {
        ...scenarioBase,
        id: "reorder-scenario-second",
        dateGroupId: "reorder-date",
        sectionGroupId: "reorder-section",
        pic: "PIC Kedua",
      },
    ],
  });

  const dateGroup = page.locator("[data-scenario-date-group]").first();
  await dateGroup.getByRole("button", { name: "Ubah urutan skenario 1" }).dragTo(
    dateGroup.getByRole("button", { name: "Ubah urutan skenario 2" }),
  );

  const scenarioRows = dateGroup.locator("[data-scenario-row]");
  await expect(scenarioRows.nth(0).locator('[data-field-id="scenario-pic-reorder-scenario-second"]')).toHaveCount(1);
  await expect(scenarioRows.nth(1).locator('[data-field-id="scenario-pic-reorder-scenario-first"]')).toHaveCount(1);
});

test("editor and preview split can be resized", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://localhost:3002");

  const editor = page.locator("[data-editor-pane]");
  const separator = page.getByRole("separator", { name: "Geser pembagi input dan preview" });
  const before = await editor.boundingBox();
  const separatorBox = await separator.boundingBox();
  expect(before).toBeTruthy();
  expect(separatorBox).toBeTruthy();

  await page.mouse.move(
    (separatorBox?.x ?? 0) + (separatorBox?.width ?? 0) / 2,
    (separatorBox?.y ?? 0) + 120,
  );
  await page.mouse.down();
  await page.mouse.move((separatorBox?.x ?? 0) + 160, (separatorBox?.y ?? 0) + 120);
  await page.mouse.up();

  const after = await editor.boundingBox();
  expect((after?.width ?? 0) - (before?.width ?? 0)).toBeGreaterThan(100);
});

test("closing sections stay together on their dedicated page", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const closing = page.locator("[data-preview-closing]");
  await expect(closing).toHaveCount(1);
  await expect(closing).toHaveCSS("border-top-width", "1px");

  const firstDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const firstXml = await documentXmlFrom(await firstDownloadPromise);
  const firstClosingIndex = firstXml.indexOf("Demikian informasi ini kami sampaikan");
  const firstClosingParagraph = firstXml.slice(
    firstXml.lastIndexOf("<w:p>", firstClosingIndex),
    firstXml.indexOf("</w:p>", firstClosingIndex),
  );
  expect(firstClosingParagraph).toContain("<w:top");
  expect(firstClosingParagraph).toContain('w:before="220"');

  await importDraft(page, {
    ...completeDraft(),
    metadata: {
      ...completeDraft().metadata,
      accessLinkEnabled: false,
      accessLink: "",
    },
    developmentRows: [],
    activities: [],
    attachmentsEnabled: false,
    attachments: "",
  });
  await expect(closing).toHaveCSS("border-top-width", "1px");
});

test("review comments use 18px text throughout", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const createdAt = "2026-06-18T13:48:00.000Z";
  await importDraft(page, {
    ...completeDraft(),
    reviewComments: [{
      id: "review-font",
      type: "field",
      targetId: "projectName",
      targetLabel: "Nama Project",
      path: [],
      text: "Ukuran komentar",
      author: "Reviewer",
      resolved: false,
      createdAt,
      updatedAt: createdAt,
      replies: [{ id: "reply-font", text: "Ukuran balasan", author: "Reviewer", createdAt }],
    }],
  });

  await page.getByRole("button", { name: "Komentar Review" }).click();
  const popup = page.locator("#review-comments-popup");
  for (const target of [
    popup.getByRole("heading", { name: "Komentar Review" }),
    popup.locator("[data-review-comment-body]"),
    popup.locator("[data-review-reply-body]"),
    popup.getByRole("button", { name: "Lihat field: Nama Project" }),
  ]) {
    await expect(target).toHaveCSS("font-size", "18px");
  }
});

test("DOCX keeps one non-overlapping grid for Word PDF/XPS", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, pdfBorderStressDraft());

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  for (const marker of [">Keterangan</w:t>", ">Waktu</w:t>"]) {
    expectStableTableLevelGrid(documentTableAround(xml, marker));
  }

  const appendixTable = documentTableAround(xml, ">Hasil/Keterangan</w:t>");
  expectAppendixTableLevelGrid(appendixTable);
  const rowAround = (text: string) => {
    const textIndex = appendixTable.indexOf(text);
    expect(textIndex).toBeGreaterThan(-1);
    return appendixTable.slice(
      appendixTable.lastIndexOf("<w:tr", textIndex),
      appendixTable.indexOf("</w:tr>", textIndex) + "</w:tr>".length,
    );
  };
  const dateRow = rowAround("9 – 10 Juli 2026");
  expect(dateRow.match(/<w:tc\b/g) ?? []).toHaveLength(1);
  expect(dateRow).toContain('<w:gridSpan w:val="4"/>');
  expect(dateRow).toMatch(/<w:shd\b[^>]*w:fill="D9D9D9"/);
  const sectionRow = rowAround("Bagian Alpha");
  expect(sectionRow.match(/<w:tc\b/g) ?? []).toHaveLength(2);
  expect(sectionRow).toContain('<w:gridSpan w:val="3"/>');
  expect(sectionRow.match(/<w:shd\b[^>]*w:fill="D9D9D9"/g) ?? []).toHaveLength(2);
  const scenarioRow = rowAround("Skenario Alpha 1");
  expect(scenarioRow.match(/<w:tc\b/g) ?? []).toHaveLength(4);
  expect(scenarioRow).not.toContain("<w:gridSpan");
  expect(scenarioRow).not.toContain("<w:shd");

  for (const marker of [
    ">Pengantar</w:t>",
    ">Jadwal Pilot Implementasi</w:t>",
    ">Akses Link Pilot Implementasi",
    ">Lampiran</w:t>",
    ">PIC yang Dapat Dihubungi</w:t>",
  ]) {
    const layoutTable = documentTableAround(xml, marker);
    const layoutTableProperties = layoutTable.slice(
      0,
      layoutTable.indexOf("</w:tblPr>") + "</w:tblPr>".length,
    );
    expect(layoutTableProperties).not.toMatch(/<w:tblBorders>[\s\S]*?w:val="single"/);
  }

  for (const marker of [">Kepada</w:t>", ">Nomor Dokumen</w:t>", ">Ditujukan Kepada</w:t>"]) {
    const layoutTable = documentTableAround(xml, marker);
    const layoutTableProperties = layoutTable.slice(
      0,
      layoutTable.indexOf("</w:tblPr>") + "</w:tblPr>".length,
    );
    expect(layoutTableProperties).not.toMatch(/<w:tblBorders>[\s\S]*?w:val="single"/);
    expect(layoutTable).not.toMatch(/<w:tcBorders>[\s\S]*?w:val="single"/);
  }
});

test("DOCX target tables are flat leaf tables with one DXA grid", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, pdfBorderStressDraft());

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);

  const targetTables = [
    { marker: ">Keterangan</w:t>", width: 7080, grid: [570, 1695, 4815] },
    { marker: ">Waktu</w:t>", width: 7080, grid: [570, 3405, 1485, 1620] },
    { marker: ">Hasil/Keterangan</w:t>", width: 15315, grid: [765, 6435, 6435, 1680] },
  ];

  for (const { marker, width, grid } of targetTables) {
    const markerIndex = xml.indexOf(marker);
    expect(markerIndex).toBeGreaterThan(-1);
    const prefix = xml.slice(0, markerIndex);
    const tableDepth =
      (prefix.match(/<w:tbl(?=[\s>])/g) ?? []).length -
      (prefix.match(/<\/w:tbl>/g) ?? []).length;
    expect(tableDepth).toBe(1);

    const targetTable = documentTableAround(xml, marker);
    expect(targetTable.match(/<w:tbl(?=[\s>])/g) ?? []).toHaveLength(1);
    expect(targetTable).not.toContain("<w:tblCellSpacing");
    expect(targetTable).not.toMatch(/<w:tcW\b[^>]*w:type="pct"/);
    expect(targetTable).toContain(`<w:tblW w:type="dxa" w:w="${width}"/>`);
    expect(
      [...targetTable.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((match) => Number(match[1])),
    ).toEqual(grid);
    if (marker === ">Hasil/Keterangan</w:t>") {
      expectAppendixTableLevelGrid(targetTable);
    } else {
      expectStableTableLevelGrid(targetTable);
    }
  }

  for (const [sectionMarker, targetMarker] of [
    [">Lingkup Pengembangan</w:t>", ">Keterangan</w:t>"],
    [">Aktivitas Cabang dan Unit Kerja</w:t>", ">Waktu</w:t>"],
  ]) {
    const wrapperTable = documentTableAround(xml, sectionMarker);
    expect(wrapperTable).not.toContain(targetMarker);
    const wrapperProperties = wrapperTable.match(/<w:tblPr\b[\s\S]*?<\/w:tblPr>/)?.[0] ?? "";
    expect(wrapperProperties).not.toContain("<w:tblCellSpacing");
    expect(wrapperProperties).not.toMatch(/<w:shd\b[^>]*w:fill="000000"/);
    for (const edge of ["top", "left", "bottom", "right", "insideH", "insideV"]) {
      expect(wrapperProperties).toMatch(new RegExp(`<w:${edge}\\b[^>]*w:val="nil"`));
    }
  }

  const visibleTableBorders = (xml.match(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/g) ?? [])
    .filter((borders) => /w:val="single"/.test(borders));
  expect(visibleTableBorders).toHaveLength(0);
  expect(xml.match(/<w:tblCellSpacing\b/g) ?? []).toHaveLength(0);
  expect(xml.match(/<w:tblPr>[\s\S]*?<w:shd\b[^>]*w:fill="000000"[^>]*\/>/g) ?? []).toHaveLength(0);
});

test("DOCX defines Times New Roman as the default main-document font", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const { styles } = await docxPartsFrom(await downloadPromise);
  const defaults = styles.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/)?.[0] ?? "";

  expect(defaults).toBeTruthy();
  for (const attribute of ["ascii", "hAnsi", "eastAsia", "cs"]) {
    expect(defaults).toMatch(new RegExp(`w:${attribute}="Times New Roman"`));
  }
});

test("DOCX appendix rows keep compact margins after the PDF-safe border increase", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  const appendixTable = documentTableAround(xml, ">Hasil/Keterangan</w:t>");

  expect(appendixTable).toContain('<w:top w:type="dxa" w:w="30"/>');
  expect(appendixTable).toContain('<w:bottom w:type="dxa" w:w="30"/>');
  expect(appendixTable).not.toContain('<w:top w:type="dxa" w:w="35"/>');
  expect(appendixTable).not.toContain('<w:bottom w:type="dxa" w:w="35"/>');
});

test("appendix hierarchy wraps section metadata and supports expand or collapse all", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    appendixScenarios: completeDraft().appendixScenarios.map((row) => ({
      ...row,
      section: "Verifikasi setoran tunai di BDS IDS dengan menggunakan menu yang sangat panjang untuk cabang",
    })),
  });

  const panel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Lampiran Skenario" }) })
    .first();
  const title = panel.locator("[data-scenario-section-title]").first();
  const count = panel.locator("[data-scenario-section-count]").first();
  const titleBox = await title.boundingBox();
  const countBox = await count.boundingBox();
  expect(titleBox).toBeTruthy();
  expect(countBox).toBeTruthy();
  expect(countBox?.y).toBeGreaterThan((titleBox?.y ?? 0) + 8);

  const toggleAll = panel.locator("[data-appendix-toggle-all]");
  await expect(toggleAll).toHaveCount(1);
  await expect(toggleAll).toHaveAccessibleName("Collapse All");
  await expect(toggleAll).toHaveAttribute("aria-expanded", "true");
  await toggleAll.click();
  await expect(panel.locator("details[open]")).toHaveCount(0);
  await expect(toggleAll).toHaveAccessibleName("Expand All");
  await expect(toggleAll).toHaveAttribute("aria-expanded", "false");
  await toggleAll.click();
  await expect(panel.locator("details[open]")).toHaveCount(await panel.locator("details").count());
  await expect(toggleAll).toHaveAccessibleName("Collapse All");
});

test("a newly added scenario stays expanded", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const panel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Lampiran Skenario" }) })
    .first();
  await panel.getByRole("button", { name: "Skenario", exact: true }).click();

  const scenarios = panel.locator("details[data-scenario-row]");
  await expect(scenarios).toHaveCount(2);
  await expect(scenarios.last()).toHaveAttribute("open", "");
});

test("preview navigation reveals a collapsed appendix field before highlighting it", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const panel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Lampiran Skenario" }) })
    .first();
  await panel.getByRole("button", { name: "Collapse All" }).click();
  await page.locator('aside [data-preview-field-id="scenario-text-scenario-test"]').click();

  await expect(panel.locator("details[open]")).toHaveCount(3);
  await expect(page.locator('[data-field-id="scenario-text-scenario-test"]')).toHaveClass(/field-jump-highlight/);
  await expect(page.locator('[data-field-id="scenario-text-scenario-test"] .ProseMirror')).toBeFocused();
});

test("comment mode accepts preview hyperlinks and uses clean scenario labels", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  await page.getByRole("button", { name: "Komentar Review" }).click();
  await page.getByRole("button", { name: "Add Comment" }).click();
  const identityDialog = page.getByRole("dialog", { name: "Isi nama kolaborator" });
  await identityDialog.getByLabel("Nama *").fill("Reviewer Hyperlink");
  await identityDialog.getByRole("button", { name: "Lanjut" }).click();

  await page.locator('aside [data-preview-field-id="accessLink"] a').click();
  const commentDialog = page.getByRole("dialog", { name: "Tambah komentar" });
  await expect(commentDialog).toContainText("URL Akses");
  await commentDialog.getByRole("button", { name: "Batal" }).click();

  await page.locator('[data-field-id="scenario-text-scenario-test"] .ProseMirror').click();
  await expect(page.getByRole("dialog", { name: "Tambah komentar" })).toContainText("Skenario");
  await expect(page.getByRole("dialog", { name: "Tambah komentar" })).not.toContainText("scenario-text-scenario-test");
});

test("save draft uses the project name followed by MEMO", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save" }).click();
  await expect((await downloadPromise).suggestedFilename()).toBe("BDS Web Gen 2 versi 4.3.0_MEMO.json");
});

test("memo list bullets, appendix title, signer wrapping, and DOCX borders follow the document rules", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const longTitle = "Kepala Sub-Divisi/Senior Adviser/Adviser/Senior Officer/Officer untuk Operasional Nasional";
  const longName = "NAMA PEJABAT DENGAN EMPAT KATA";
  await importDraft(page, {
    ...completeDraft(),
    contacts: [
      { id: "contact-a", name: "Nama A", email: "a@example.com" },
      { id: "contact-b", name: "Nama B", email: "b@example.com" },
    ],
    signers: [
      { id: "signer-short", name: "SILVIAN", title: "Application & User Acceptance Test Bureau Head A" },
      { id: "signer-long", name: longName, title: longTitle },
    ],
  });

  await expect(page.locator('aside [data-memo-list-marker="bullet"]')).toHaveCount(4);
  await expect(page.locator('aside [data-memo-list-marker="bullet"]').first()).toHaveText("•");
  await expect(page.locator('aside article[data-page-kind="appendix"] h2').first()).toHaveCSS("font-size", "13.33px");
  const signerRows = page.locator("aside [data-preview-signer-row]");
  await expect(signerRows).toHaveCount(2);
  const firstNameBox = await signerRows.nth(0).locator("strong").boundingBox();
  const secondNameBox = await signerRows.nth(1).locator("strong").boundingBox();
  const firstSeparatorBox = await signerRows.nth(0).locator("span").nth(0).boundingBox();
  const firstTitleBox = await signerRows.nth(0).locator("[data-preview-signer-title]").boundingBox();
  const secondTitleBox = await signerRows.nth(1).locator("[data-preview-signer-title]").boundingBox();
  expect((firstSeparatorBox?.x ?? 0) - ((firstNameBox?.x ?? 0) + (firstNameBox?.width ?? 0))).toBeGreaterThanOrEqual(2);
  expect((firstTitleBox?.x ?? 0) - ((firstSeparatorBox?.x ?? 0) + (firstSeparatorBox?.width ?? 0))).toBeGreaterThanOrEqual(2);
  expect((secondTitleBox?.x ?? 0) - (firstTitleBox?.x ?? 0)).toBeGreaterThan(40);
  expect(secondNameBox?.height).toBeLessThanOrEqual(firstNameBox?.height ?? 0);
  expect(secondTitleBox?.height).toBeGreaterThan(20);

  const pageWidths = await page.locator("aside [data-preview-page-content]").evaluateAll((nodes) =>
    nodes.map((node, index) => {
      const pageRect = node.getBoundingClientRect();
      const offenders = Array.from(node.querySelectorAll("*")).flatMap((child) => {
        const rect = child.getBoundingClientRect();
        return rect.right > pageRect.right + 1
          ? [`${child.tagName}.${child.className}: ${Math.round(rect.right - pageRect.right)}`]
          : [];
      });
      return { index, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth, offenders: offenders.slice(0, 8) };
    }),
  );
  expect(pageWidths.filter(({ clientWidth, scrollWidth }) => scrollWidth > clientWidth + 1), JSON.stringify(pageWidths)).toEqual([]);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  expect(xml.match(/(?:•|&#x2022;)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  const appendixTable = documentTableAround(xml, ">Hasil/Keterangan</w:t>");
  expectAppendixTableLevelGrid(appendixTable);
  expect(appendixTable).not.toContain("<w:tblCellSpacing");

  const appendixTitleIndex = xml.indexOf("Lampiran - Skenario");
  const appendixTitleParagraph = xml.slice(
    xml.lastIndexOf("<w:p>", appendixTitleIndex),
    xml.indexOf("</w:p>", appendixTitleIndex),
  );
  expect(appendixTitleParagraph).toContain('<w:sz w:val="20"/>');
  expect(appendixTitleParagraph).not.toContain('<w:sz w:val="22"/>');

  const signerIndex = xml.indexOf("SILVIAN");
  const signerParagraph = xml.slice(
    xml.lastIndexOf("<w:p>", signerIndex),
    xml.indexOf("</w:p>", signerIndex),
  );
  expect(signerParagraph).toContain("Application &amp; User Acceptance Test Bureau Head A");
  expect(xml).toContain(longName.replaceAll(" ", "\u00A0"));
  expect(xml.lastIndexOf("<w:tbl>", signerIndex)).toBeLessThan(
    xml.lastIndexOf("</w:tbl>", signerIndex),
  );
});

test("DOCX signer title wraps with a hanging indent aligned like preview", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const signerName = "PUTRI RIAWAN PATAMORGANA ERIKA NINDATI";
  const signerTitle = `Officer ${"d".repeat(80)}`;
  await importDraft(page, {
    ...completeDraft(),
    signers: [{ id: "signer-pdf-wrap", name: signerName, title: signerTitle }],
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  const normalizedName = signerName.replaceAll(" ", "\u00A0");
  const signerIndex = xml.indexOf("PUTRI");
  const titleIndex = xml.indexOf("Officer", signerIndex);
  expect(signerIndex).toBeGreaterThan(-1);
  expect(titleIndex).toBeGreaterThan(signerIndex);
  expect(xml).toContain(normalizedName);
  const signerParagraph = xml.slice(
    xml.lastIndexOf("<w:p>", signerIndex),
    xml.indexOf("</w:p>", signerIndex) + "</w:p>".length,
  );
  const indent = signerParagraph.match(/<w:ind\b[^>]*\/>/)?.[0] ?? "";
  const left = Number(indent.match(/w:left="(\d+)"/)?.[1]);
  const hanging = Number(indent.match(/w:hanging="(\d+)"/)?.[1]);

  expect(indent).toContain("w:hanging");
  expect(left - hanging).toBe(2100);
  expect(signerParagraph.replaceAll("\u200B", "")).toContain(signerTitle);
});

test("closing, tembusan, and initials use the same page when they fit", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    contacts: Array.from({ length: 6 }, (_, index) => ({
      id: `contact-pack-${index}`,
      name: `PIC ${index + 1}`,
      email: `pic${index + 1}@example.com`,
    })),
    signers: [
      { id: "signer-pack-a", name: "SILVIAN", title: "Application & User Acceptance Test Bureau Head A" },
      { id: "signer-pack-b", name: `ASD${"D".repeat(55)}`, title: "Senior Officer Application & User Acceptance Test Bureau A" },
      { id: "signer-pack-c", name: "TAZYA", title: "Officer Application & User Acceptance Test Bureau A" },
    ],
    ccRecipients: Array.from({ length: 15 }, (_, index) => ({
      id: `cc-pack-${index}`,
      gender: "",
      name: "",
      position: `Unit Kerja Tembusan ${index + 1}`,
    })),
  });

  const closingPage = page.locator('aside article[data-page-kind="main"]').filter({
    has: page.locator("[data-preview-closing]"),
  });
  await expect(closingPage).toHaveCount(1);
  await expect(closingPage.getByText("Tembusan:", { exact: true })).toHaveCount(1);
  await expect(closingPage.getByText("abc/uat-a", { exact: true })).toHaveCount(1);
});

test("all rendered mandatory fields block DOCX generation when empty", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const empty = richText("");
  await importDraft(page, {
    ...completeDraft(),
    metadata: {
      ...completeDraft().metadata,
      memoType: "",
      bureau: "",
      projectName: "",
      autoPerihal: false,
      perihal: "",
      accessLink: "",
    },
    recipients: [{ ...completeDraft().recipients[0], position: "", gender: "" }],
    ccRecipients: [{ ...completeDraft().ccRecipients[0], position: "" }],
    developmentRows: [{ ...completeDraft().developmentRows[0], item: empty, description: empty }],
    pilotSchedule: { startDate: "", endDate: "", dates: [] },
    activities: [{ ...completeDraft().activities[0], startDate: "", endDate: "", dates: [], owner: "", activity: empty }],
    contacts: [{ ...completeDraft().contacts[0], name: "", email: "" }],
    signers: [{ ...completeDraft().signers[0], name: "", title: "" }],
    initials: "",
    initialsBureau: "",
    appendixScenarios: [{
      ...completeDraft().appendixScenarios[0],
      startDate: "",
      endDate: "",
      dates: [],
      section: "",
      scenario: empty,
      expectedResult: empty,
      pic: "",
    }],
  });

  const downloadPromise = page.waitForEvent("download", { timeout: 1200 }).catch(() => null);
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  expect(await downloadPromise).toBeNull();
  for (const id of [
    "memoType",
    "bureau",
    "projectName",
    "perihal",
    "recipient-recipient-test",
    "development-item-development-test",
    "development-description-development-test",
    "schedule",
    "activity-date-activity-test",
    "activity-owner-activity-test",
    "activity-text-activity-test",
    "accessLink",
    "contact-name-contact-test",
    "contact-email-contact-test",
    "signer-name-signer-test",
    "signer-title-signer-test",
    "recipient-cc-test",
    "initials",
    "initialsBureau",
    "scenario-date-scenario-test",
    "scenario-section-scenario-test",
    "scenario-pic-scenario-test",
    "scenario-text-scenario-test",
    "scenario-expected-scenario-test",
  ]) {
    await expect(page.locator(`[data-validation-issue-id="${id}"]`)).toHaveCount(1);
  }
});

test("newly added mandatory appendix fields also block DOCX generation", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const appendixPanel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Lampiran Skenario" }) })
    .first();
  await appendixPanel.getByRole("button", { name: "Bagian", exact: true }).click();

  const downloadPromise = page.waitForEvent("download", { timeout: 1200 }).catch(() => null);
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  expect(await downloadPromise).toBeNull();
  await expect(
    page.locator("[data-validation-panel]").getByText(/Lampiran Skenario 2: Bagian/),
  ).toHaveCount(1);
});

test("every newly added repeatable mandatory row blocks DOCX generation while empty", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const panel = (heading: string) => page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: heading, exact: true }) })
    .first();
  await panel("Kepada").getByRole("button", { name: "Tambah baris" }).click();
  await panel("Lingkup Pengembangan").getByRole("button", { name: "Row", exact: true }).click();
  await panel("Aktivitas Cabang dan Unit Kerja").getByRole("button", { name: "Aktivitas", exact: true }).click();
  await panel("PIC yang Dapat Dihubungi").getByRole("button", { name: "PIC", exact: true }).click();
  await panel("Signature").getByRole("button", { name: "Signer", exact: true }).click();
  await panel("Tembusan").getByRole("button", { name: "Tambah baris" }).click();

  const downloadPromise = page.waitForEvent("download", { timeout: 1200 }).catch(() => null);
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  expect(await downloadPromise).toBeNull();

  const validation = page.locator("[data-validation-panel]");
  for (const label of [
    "Kepada 2: Jabatan / Unit",
    "Lingkup Pengembangan 2: Item",
    "Lingkup Pengembangan 2: Keterangan",
    "Aktivitas 2: Tanggal",
    "Aktivitas 2: PIC",
    "Aktivitas 2: Aktivitas",
    "PIC yang Dapat Dihubungi 2: Nama",
    "PIC yang Dapat Dihubungi 2: Email",
    "Signature 2: Nama",
    "Signature 2: Jabatan",
    "Tembusan 2: Jabatan / Unit",
  ]) {
    await expect(validation.getByText(label)).toHaveCount(1);
  }
});

test("top-level and conditional mandatory fields block DOCX generation", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    metadata: {
      ...completeDraft().metadata,
      bureau: "",
      memoType: "Nasional",
    },
    referenceEnabled: true,
    reference: richText(""),
    initialsBureau: "",
  });

  const downloadPromise = page.waitForEvent("download", { timeout: 1200 }).catch(() => null);
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  expect(await downloadPromise).toBeNull();
  for (const id of ["bureau", "reference", "initialsBureau"]) {
    await expect(page.locator(`[data-validation-issue-id="${id}"]`)).toHaveCount(1);
  }
});

test("Nasional reference editor creates a new bullet when Enter is pressed", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, {
    ...completeDraft(),
    metadata: {
      ...completeDraft().metadata,
      memoType: "Nasional",
    },
    referenceEnabled: true,
    reference: richText(""),
  });

  const field = page.locator('[data-field-id="reference"]');
  const editor = field.locator(".ProseMirror");
  await expect(editor).toBeVisible();
  await editor.click();
  await field.getByRole("button", { name: "Bullet list" }).click();
  await page.keyboard.type("Referensi pertama");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Referensi kedua");

  await expect(field.locator("ul li")).toHaveCount(2);
  const previewItems = page.locator('aside [data-preview-field-id="reference"] ul li');
  await expect(previewItems).toHaveText(["Referensi pertama", "Referensi kedua"]);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  expect(xml).toContain("• Referensi pertama");
  expect(xml).toContain("• Referensi kedua");
});

test("editable multi-line fields auto-resize without oversized empty space", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const activityEditor = page.locator('[data-field-id="activity-text-activity-test"] .ProseMirror');
  const before = await activityEditor.boundingBox();
  expect(before?.height).toBeLessThan(80);
  await activityEditor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Baris 1\nBaris 2\nBaris 3\nBaris 4\nBaris 5\nBaris 6");
  const after = await activityEditor.boundingBox();
  expect(after?.height).toBeGreaterThan((before?.height ?? 0) + 30);

  const attachments = page.getByLabel("Daftar lampiran");
  const attachmentBefore = await attachments.boundingBox();
  await attachments.fill("Satu\nDua\nTiga\nEmpat\nLima\nEnam");
  const attachmentAfter = await attachments.boundingBox();
  expect(attachmentAfter?.height).toBeGreaterThan(attachmentBefore?.height ?? 0);
});

test("review popup uses a stable opaque surface during collaboration updates", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await page.getByRole("button", { name: "Komentar Review" }).click();
  const popup = page.locator("#review-comments-popup");
  await expect(popup).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(popup).toHaveCSS("backdrop-filter", "none");
});

test("cross-date dragging exposes a visible drop target before release", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.goto("http://localhost:3002");
  const scenarioBase = completeDraft().appendixScenarios[0];
  await importDraft(page, {
    ...completeDraft(),
    appendixScenarios: [
      { ...scenarioBase, id: "drag-feedback-a", dateGroupId: "drag-feedback-date-a", sectionGroupId: "drag-feedback-section-a", section: "Bagian Alpha" },
      { ...scenarioBase, id: "drag-feedback-b", dateGroupId: "drag-feedback-date-b", sectionGroupId: "drag-feedback-section-b", startDate: "2026-06-01", endDate: "2026-06-02", section: "Bagian Beta" },
    ],
  });

  const groups = page.locator("[data-scenario-date-group]");
  const source = groups.nth(0).getByRole("button", { name: "Ubah urutan bagian A" });
  const target = groups.nth(1).getByRole("button", { name: "Ubah urutan bagian A" });
  await page.evaluate(() => {
    (window as typeof window & { __dropTargetSeen?: boolean }).__dropTargetSeen = false;
    (window as typeof window & { __maxDropTargets?: number }).__maxDropTargets = 0;
    const observer = new MutationObserver(() => {
      const activeTargets = document.querySelectorAll('[data-drop-target-active="true"]');
      if (activeTargets.length) {
        (window as typeof window & { __dropTargetSeen?: boolean }).__dropTargetSeen = true;
      }
      const state = window as typeof window & { __maxDropTargets?: number };
      state.__maxDropTargets = Math.max(state.__maxDropTargets ?? 0, activeTargets.length);
    });
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
  });
  await source.dragTo(target);
  expect(await page.evaluate(() =>
    (window as typeof window & { __dropTargetSeen?: boolean }).__dropTargetSeen,
  )).toBe(true);
  expect(await page.evaluate(() =>
    (window as typeof window & { __maxDropTargets?: number }).__maxDropTargets,
  )).toBe(1);
});
