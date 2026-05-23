import { expect, test } from "@playwright/test";

test("updates generated perihal from metadata", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await page.getByLabel("Nama Project").fill("Project Smoke Test");

  await expect(page.locator("aside").getByText("Pilot Implementasi Project Smoke Test").first()).toBeVisible();
});

test("exports DOCX from current draft", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Generate Docx" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^Memo .+\.docx$/);
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
  await page.getByLabel("Bagian").fill("Verifikasi Landing Page Pemol Giro Badan (SEEDS)");

  const appendixTable = page.locator("aside table").last();
  await expect(appendixTable).toContainText("A.Verifikasi Landing Page Pemol Giro Badan (SEEDS)");
  await expect(appendixTable).toContainText("1.");
});
