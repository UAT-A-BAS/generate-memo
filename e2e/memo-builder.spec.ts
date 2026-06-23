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

async function importDraft(page: Page, payload: unknown) {
  await page.locator('input[type="file"]').setInputFiles({
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

async function docxPartsFrom(download: Download) {
  const path = await download.path();
  expect(path).toBeTruthy();

  const zip = await JSZip.loadAsync(await readFile(path as string));
  const xml = await zip.file("word/document.xml")?.async("string");
  const rels = await zip.file("word/_rels/document.xml.rels")?.async("string");
  expect(xml).toBeTruthy();
  expect(rels).toBeTruthy();
  return { xml: xml as string, rels: rels as string };
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
  await expect(placeholder).toHaveAttribute("disabled", "");
  await expect(placeholder).not.toHaveAttribute("hidden", "");
  await expect(salutation).toHaveClass(/text-slate-400/);

  await salutation.selectOption("Bapak");
  await expect(salutation).toHaveClass(/text-slate-900/);
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
    await expect(placeholder).toHaveAttribute("disabled", "");
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

  const contactPage = page.locator('aside article[data-page-kind="main"]').filter({
    has: page.getByRole("heading", { name: "PIC yang Dapat Dihubungi", exact: true }),
  });
  await expect(contactPage).toHaveCount(1);
  await expect(
    contactPage.getByRole("heading", {
      name: "Perihal: Pilot Implementasi BDS Web Gen 2 versi 4.3.0, Sambungan",
      exact: true,
    }),
  ).toBeVisible();

  const continuationRule = contactPage.locator("div.h-px");
  await expect(continuationRule).toHaveCount(1);
  const continuationRuleBox = await continuationRule.boundingBox();
  const scheduleTitleBox = await contactPage
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
    await expect(cell).toHaveClass(/align-middle/);
  }

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  expect((xml.match(/<w:vMerge w:val="restart"\/>/g) ?? []).length).toBeGreaterThanOrEqual(8);
  expect((xml.match(/<w:vMerge w:val="continue"\/>/g) ?? []).length).toBeGreaterThanOrEqual(8);
  expect(xml).not.toContain('w:val="single" w:color="FFFFFF"');
  expect(xml).toContain('w:color="0F172A"');
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
    expect(xml.slice(cellStart, cellEnd)).not.toContain('w:val="nil"');
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

test("DOCX data tables use the A4 content grid without spacer columns", async ({ page }) => {
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
  expect(developmentTable).toMatch(/<w:tblW w:type="dxa" w:w="7166"\/>/);
  expect(developmentTable).not.toContain("<w:tblInd");
  expect((developmentTable?.match(/<w:gridCol /g) ?? []).length).toBe(2);
  expect(developmentTable).toContain('<w:gridCol w:w="2006"/>');
  expect(developmentTable).toContain('<w:gridCol w:w="5160"/>');
});

test("DOCX data tables close the right border", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  const rightBorder = /<w:right w:val="single"[^>]*w:color="0F172A"[^>]*\/>/;

  for (const marker of [
    ">Keterangan</w:t>",
    ">Waktu</w:t>",
    ">Hasil/Keterangan</w:t>",
  ]) {
    const table = documentTableAround(xml, marker);
    expect(table).toMatch(rightBorder);
    expect(table).not.toContain('<w:right w:val="nil"');
  }
});

test("DOCX keeps development and activity tables inside their preview section grid", async ({ page }) => {
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
    const sectionTableEnd = xml.indexOf("</w:tbl>", titleIndex);
    expect(titleIndex).toBeGreaterThan(-1);
    expect(headerIndex).toBeGreaterThan(titleIndex);
    expect(headerIndex).toBeLessThan(sectionTableEnd);
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
    "- Draft SE Perihal: Pengembangan Pembukaan Rekening Giro Badan",
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

test("Lingkup wording uses only project name and document borders stay thin", async ({ page }) => {
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
  expect(xml).toContain('w:val="single" w:color="0F172A" w:sz="4"');
  expect(xml).not.toContain('w:val="single" w:color="0F172A" w:sz="6"');
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

test("closing rule is omitted only when closing starts a page", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const closing = page.locator("[data-preview-closing]");
  await expect(closing).toHaveCount(1);
  await expect(closing).toHaveCSS("border-top-width", "0px");

  const firstDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const firstXml = await documentXmlFrom(await firstDownloadPromise);
  const firstClosingIndex = firstXml.indexOf("Demikian informasi ini kami sampaikan");
  const firstClosingParagraph = firstXml.slice(
    firstXml.lastIndexOf("<w:p>", firstClosingIndex),
    firstXml.indexOf("</w:p>", firstClosingIndex),
  );
  expect(firstClosingParagraph).not.toContain("<w:top");
  expect(firstClosingParagraph).toContain('w:before="0"');
  expect(firstClosingParagraph).not.toContain('w:before="220"');

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
