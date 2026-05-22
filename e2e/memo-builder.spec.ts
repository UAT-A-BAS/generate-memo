import { expect, test } from "@playwright/test";

test("updates generated perihal from metadata", async ({ page }) => {
  await page.goto("http://localhost:3002");
  await page.getByLabel("Nama Project").fill("Project Smoke Test");

  await expect(page.locator("aside").getByText("Pilot Implementasi Project Smoke Test").first()).toBeVisible();
});

test("exports DOCX from current draft", async ({ page }) => {
  await page.goto("http://localhost:3002");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "DOCX" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^Memo .+\.docx$/);
});
