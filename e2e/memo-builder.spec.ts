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
  expect(xml).toMatch(/<w:t[^>]*>- {6}Draft SE Perihal: Pengembangan Pembukaan Rekening Giro Badan<\/w:t>/);
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

test("bold toolbar button toggles bold and paragraph toolbar button is removed", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const editor = page.locator(".ProseMirror").first();
  const editorShell = editor.locator("..").locator("..");
  await editor.click();
  await editorShell.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type("Tebal");

  expect(await editor.evaluate((node) => node.innerHTML)).toContain("<strong>Tebal</strong>");
  await expect(page.getByRole("button", { name: "Paragraph" })).toHaveCount(0);
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

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Buat dokumen Word cepat" }).click();
  const xml = await documentXmlFrom(await downloadPromise);
  expect(xml).toContain("Lingkup Pengembangan, Sambungan");
  expect(xml).toContain("Aktivitas Cabang dan Unit Kerja, Sambungan");
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
  await expect(page.locator('[data-field-id="projectName"]')).toHaveClass(/validation-jump-highlight/);
  expect(await downloadPromise).toBeNull();
});

test("tembusan shows mandatory markers", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const ccPanel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Tembusan" }) })
    .first();

  await expect(ccPanel).toContainText("Jabatan / Unit *");
  await expect(ccPanel).toContainText("Sapaan *");
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
  await expect(page.getByRole("button", { name: "Restart Collab" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy Link" })).toBeVisible();
  await expect(page).toHaveURL(/room=/);
});

test("collaboration syncs metadata fields between pages", async ({ browser }) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();

  await first.goto("http://localhost:3002");
  await first.getByRole("button", { name: "Start Collab" }).click();
  await expect(first).toHaveURL(/room=/);

  await second.goto(first.url());
  await second.getByLabel("Nama Project").fill("Collab Nama Project");

  await expect(first.getByLabel("Nama Project")).toHaveValue("Collab Nama Project", {
    timeout: 10000,
  });
  await expect(first.locator("aside").getByText("Pilot Implementasi Collab Nama Project").first()).toBeVisible();

  await context.close();
});

test("review comments can be added to a field and focused", async ({ page }) => {
  await page.goto("http://localhost:3002");

  await page.getByRole("button", { name: "Komentar Review" }).click();
  await page.getByRole("button", { name: "Add Comment" }).click();
  await page.getByLabel("Nama Project").click();
  await page.getByLabel("Nama Reviewer").fill("Reviewer A");
  await page.getByRole("textbox", { name: "Komentar *" }).fill("Perbaiki nama project");
  await page.getByRole("button", { name: "Simpan" }).click();

  await expect(page.getByRole("button", { name: "Lihat field: Nama Project" })).toBeVisible();
  await page.getByRole("button", { name: "Lihat field: Nama Project" }).click();
  await expect(page.locator('[data-field-id="projectName"]')).toHaveClass(/review-target-highlight/);

  await page.getByRole("button", { name: "Add Comment" }).click();
  await page.getByLabel("Nama Project").click();
  await expect(page.getByLabel("Nama Reviewer")).toHaveValue("");
});

test("appendix scenario uses section header numbering", async ({ page }) => {
  await page.goto("http://localhost:3002");

  await page.getByLabel("Nama Project").fill("BDS Web Gen 2 versi 4.3.0");
  await page.getByLabel("Bagian").first().fill("Verifikasi Landing Page Pemol Giro Badan (SEEDS)");

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

  await expect(appendixPanel.getByLabel("Bagian")).toHaveCount(1);
  await appendixPanel.getByRole("button", { name: "Bagian" }).click();
  await expect(appendixPanel.getByLabel("Bagian")).toHaveCount(2);

  await expect(appendixPanel.getByRole("button", { name: "Skenario", exact: true })).toHaveCount(2);
  await appendixPanel.getByRole("button", { name: "Skenario", exact: true }).first().click();
  await expect(appendixPanel.getByText("Skenario 2")).toBeVisible();

  await expect(appendixPanel.getByRole("button", { name: "Tanggal", exact: true })).toHaveCount(1);
  await appendixPanel.getByRole("button", { name: "Tanggal", exact: true }).click();
  await expect(appendixPanel.getByRole("button", { name: "Tanggal", exact: true })).toHaveCount(2);
});
