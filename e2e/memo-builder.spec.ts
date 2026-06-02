import { expect, test, type Page } from "@playwright/test";

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

function completeDraft() {
  return {
    metadata: {
      memoType: "Pilot",
      projectName: "BDS Web Gen 2 versi 4.3.0",
      bureau: "A",
      autoPerihal: true,
      accessLinkEnabled: false,
      accessLink: "",
    },
    recipients: [{ id: "recipient-test", gender: "Ibu", name: "Agustina", position: "Kepala Operasi Cabang Pluit" }],
    developmentRows: [{ id: "development-test", item: richText("Pengembangan"), description: richText("Keterangan") }],
    pilotSchedule: { startDate: "2026-05-07", endDate: "2026-05-21" },
    activities: [{ id: "activity-test", startDate: "2026-05-07", endDate: "2026-05-21", owner: "Tim APV", activity: richText("Aktivitas") }],
    contacts: [{ id: "contact-test", name: "Nama PIC", email: "pic@example.com" }],
    signers: [{ id: "signer-test", name: "Signer", title: "Jabatan" }],
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

async function importDraft(page: Page, payload: unknown) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "draft.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}

test("updates generated perihal from metadata", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await page.getByLabel("Nama Project").fill("Project Smoke Test");

  await expect(page.locator("aside").getByText("Pilot Implementasi Project Smoke Test").first()).toBeVisible();
});

test("exports DOCX from current draft", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await importDraft(page, completeDraft());

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Generate Docx" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("Memo Pilot Implementasi (BDS Web Gen 2 versi 4.3.0).docx");
});

test("blocks DOCX export when mandatory fields are empty", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const downloadPromise = page.waitForEvent("download", { timeout: 1000 }).catch(() => null);
  await page.getByRole("button", { name: "Generate Docx" }).click();

  await expect(page.getByText("Generate Docx ditahan")).toBeVisible();
  await expect(page.locator('[data-field-id="projectName"]')).toHaveClass(/validation-jump-highlight/);
  expect(await downloadPromise).toBeNull();
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
  await editor.click();
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

test("collaboration syncs between two browser pages", async ({ browser }) => {
  const context = await browser.newContext();
  const first = await context.newPage();
  const second = await context.newPage();

  await first.goto("http://localhost:3002");
  await first.getByRole("button", { name: "Collaboration" }).click();
  await first.getByRole("button", { name: "Buat Room" }).click();
  const roomUrl = first.url();

  await second.goto(roomUrl);
  await second.getByLabel("Nama Project").fill("Collab Smoke Test");

  await expect(first.locator("aside").getByText("Pilot Implementasi Collab Smoke Test").first()).toBeVisible({
    timeout: 7000,
  });

  await context.close();
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
