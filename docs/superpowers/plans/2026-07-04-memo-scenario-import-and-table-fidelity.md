# Memo Scenario Import and Table Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Append legacy MOM `lampiranState` data only to the memo appendix, make salutations clearable, stop click-only drag reordering, and render DOCX/PDF tables with one consistent 1 pt grid.

**Architecture:** Add a focused MOM-to-`ScenarioRow[]` adapter and call it only from a dedicated appendix import control. Preserve the existing memo draft and append the returned rows atomically. Keep drag behavior in the shared sortable abstraction and table-border ownership in the DOCX table layer so each fix has one source of truth.

**Tech Stack:** Next.js 16.2.6 App Router, React 19, TypeScript, Zustand, dnd-kit, docx 9, Playwright, Tailwind CSS, Cloudflare Pages.

---

## File structure

- Create `src/utils/importMomScenarios.ts`: validate `lampiranState`, parse MOM dates, and return fresh `ScenarioRow[]` values without constructing a memo draft.
- Modify `src/features/memo-builder/MemoBuilderApp.tsx`: add the appendix-local file input, append handler, button, and accessible error state; tag the global draft input for stable tests.
- Modify `src/components/RecipientList.tsx`: make the empty salutation option selectable.
- Modify `src/components/DragDropList.tsx`: require deliberate pointer movement before activating drag.
- Modify `src/docx/generateDocx.ts`: set the canonical data-table border to 1 pt.
- Modify `src/docx/spliceValidationTemplate.ts`: keep right-border normalization at the same 1 pt fallback.
- Modify `e2e/memo-builder.spec.ts`: add regression tests and update the draft-import selector and border assertions.
- Create `tmp/qa-generate-docx.mjs` only during QA, then delete it before commit: download a representative generated DOCX for raster inspection.

### Task 1: Appendix-only MOM scenario import

**Files:**
- Create: `src/utils/importMomScenarios.ts`
- Modify: `src/features/memo-builder/MemoBuilderApp.tsx`
- Test: `e2e/memo-builder.spec.ts`

- [ ] **Step 1: Add the failing import and error regressions**

Update the existing helper to target the global input explicitly:

```ts
async function importDraft(page: Page, payload: unknown) {
  await page.locator('[data-draft-import-input]').setInputFiles({
    name: "draft.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}
```

Add a MOM fixture shaped like the supplied export and tests that import a complete memo first, upload through `[data-scenario-import-input]`, and assert that the original memo fields remain unchanged while rows are appended:

```ts
function momScenarioPayload() {
  return {
    version: "mom-generator-draft-v1",
    projectName: "MUST NOT REPLACE MEMO",
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
  await expect(page.locator("[data-scenario-row]")).toHaveCount(originalRows + 3);
  await expect(page.getByRole("textbox", { name: /Bagian \* [A-Z]+/ }).nth(1)).toHaveValue("Fitur Alpha");
  await expect(page.locator('[data-field-id^="scenario-pic-"] textarea').last()).toHaveValue("");
  await expect(page.getByRole("button", { name: /Tanggal \d+ \*/ }).last()).toContainText("8 – 9 Juli 2026");
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
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run the dev server on port 3002 and execute:

```powershell
rtk npx playwright test -g "MOM scenario import"
```

Expected: FAIL because `[data-scenario-import-input]` and the appendix-only adapter do not exist.

- [ ] **Step 3: Implement the focused adapter**

Create `src/utils/importMomScenarios.ts` with a public function:

```ts
import type { ScenarioRow } from "@/types/memo";
import { paragraphRichText } from "@/types/richText";
import { createScenarioRow } from "@/templates/bcaMemoTemplate";
import { createId } from "@/utils/ids";

type LooseRecord = Record<string, unknown>;

function record(value: unknown): LooseRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as LooseRecord
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isoDate(value: string) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());
  if (!match) return "";
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) || date.getFullYear() !== Number(year) || date.getMonth() + 1 !== Number(month) || date.getDate() !== Number(day)
    ? ""
    : iso;
}

function dateRange(value: unknown) {
  const parts = text(value).split(/\s+-\s+/);
  const startDate = isoDate(parts[0] ?? "");
  const endDate = isoDate(parts[1] ?? parts[0] ?? "");
  if (!startDate || !endDate) throw new Error("Tanggal Lampiran Skenario MOM tidak valid.");
  return { startDate, endDate };
}

export function importMomScenarioRows(input: unknown): ScenarioRow[] {
  const root = record(input);
  if (!Array.isArray(root.lampiranState)) {
    throw new Error("File MOM tidak memiliki lampiranState yang valid.");
  }

  const rows: ScenarioRow[] = [];
  for (const dateValue of root.lampiranState) {
    const date = record(dateValue);
    const range = dateRange(date.date);
    const dateGroupId = createId("scenario-date");
    for (const featureValue of Array.isArray(date.features) ? date.features : []) {
      const feature = record(featureValue);
      const sectionGroupId = createId("scenario-section");
      for (const scenarioValue of Array.isArray(feature.scenarios) ? feature.scenarios : []) {
        const scenario = record(scenarioValue);
        rows.push(createScenarioRow({
          ...range,
          dateGroupId,
          sectionGroupId,
          section: text(feature.title),
          scenario: paragraphRichText(text(scenario.activity)),
          expectedResult: paragraphRichText(text(scenario.result)),
          pic: "",
        }));
      }
    }
  }

  if (!rows.length) throw new Error("File MOM tidak memiliki skenario yang dapat diimport.");
  return rows;
}
```

- [ ] **Step 4: Implement the appendix-local control**

Inside `AppendixPanel`, add a `useRef<HTMLInputElement>`, an error string state, and this handler:

```ts
async function handleScenarioImport(event: React.ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const importedRows = importMomScenarioRows(JSON.parse(await file.text()));
    setRows([...rows, ...importedRows], true);
    setScenarioImportError("");
  } catch (error) {
    setScenarioImportError(error instanceof Error ? error.message : "File MOM tidak dapat dibaca.");
  } finally {
    event.target.value = "";
  }
}
```

Render a hidden input with `data-scenario-import-input`, put an `Import Skenario` icon button immediately before the collapse button, render the error with `role="alert"`, `aria-live="polite"`, and `data-scenario-import-error`, and add `data-draft-import-input` to the existing global JSON input.

- [ ] **Step 5: Verify GREEN and mandatory PIC behavior**

Run:

```powershell
rtk npx playwright test -g "MOM scenario import|imported MOM PIC"
```

Expected: all focused import tests PASS; exporting after import is blocked with an appendix PIC validation issue until PIC is filled.

- [ ] **Step 6: Commit the import feature**

```powershell
rtk git add src/utils/importMomScenarios.ts src/features/memo-builder/MemoBuilderApp.tsx e2e/memo-builder.spec.ts
rtk git commit -m "feat: import MOM appendix scenarios"
```

### Task 2: Reversible salutation dropdowns

**Files:**
- Modify: `src/components/RecipientList.tsx`
- Test: `e2e/memo-builder.spec.ts`

- [ ] **Step 1: Change the existing salutation tests to require reselection**

After selecting `Bapak`, select the empty option and assert the empty value and placeholder styling:

```ts
await salutation.selectOption("Bapak");
await expect(salutation).toHaveValue("Bapak");
await salutation.selectOption("");
await expect(salutation).toHaveValue("");
await expect(salutation).toHaveClass(/text-slate-400/);
await expect(placeholder).not.toHaveAttribute("disabled", "");
```

- [ ] **Step 2: Run the focused tests and verify RED**

```powershell
rtk npx playwright test -g "salutation|tembusan shows mandatory markers"
```

Expected: FAIL because the empty option is disabled.

- [ ] **Step 3: Make the placeholder option selectable**

Replace the disabled option with:

```tsx
<option value="">{genderPlaceholder}</option>
```

Do not change required-field validation.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
rtk npx playwright test -g "salutation|tembusan shows mandatory markers"
rtk git add src/components/RecipientList.tsx e2e/memo-builder.spec.ts
rtk git commit -m "fix: allow clearing salutations"
```

Expected: all focused salutation tests PASS.

### Task 3: Drag handles require an actual drag

**Files:**
- Modify: `src/components/DragDropList.tsx`
- Test: `e2e/memo-builder.spec.ts`

- [ ] **Step 1: Add a failing click-only regression**

Import two scenarios in one section with distinct PIC values, click `Ubah urutan skenario 1`, and assert the first row remains first:

```ts
test("clicking a scenario drag handle does not reorder scenarios", async ({ page }) => {
  await page.goto("http://localhost:3002");
  const base = completeDraft().appendixScenarios[0];
  await importDraft(page, {
    ...completeDraft(),
    appendixScenarios: [
      { ...base, id: "click-first", sectionGroupId: "click-section", pic: "PIC Pertama" },
      { ...base, id: "click-second", sectionGroupId: "click-section", pic: "PIC Kedua" },
    ],
  });
  const rows = page.locator("[data-scenario-row]");
  await page.getByRole("button", { name: "Ubah urutan skenario 1" }).click();
  await expect(rows.nth(0).locator('[data-field-id="scenario-pic-click-first"]')).toHaveCount(1);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
rtk npx playwright test -g "clicking a scenario drag handle"
```

Expected: FAIL because the click moves the first scenario behind the second.

- [ ] **Step 3: Add the pointer activation threshold**

```ts
useSensor(PointerSensor, {
  activationConstraint: { distance: 8 },
}),
```

Keep the `KeyboardSensor` unchanged.

- [ ] **Step 4: Verify click and real drag behavior, then commit**

```powershell
rtk npx playwright test -g "clicking a scenario drag handle|appendix scenarios can reorder|appendix scenarios can move"
rtk git add src/components/DragDropList.tsx e2e/memo-builder.spec.ts
rtk git commit -m "fix: require deliberate scenario dragging"
```

Expected: click-only and existing drag tests PASS.

### Task 4: Canonical 1 pt DOCX table borders

**Files:**
- Modify: `src/docx/generateDocx.ts`
- Modify: `src/docx/spliceValidationTemplate.ts`
- Test: `e2e/memo-builder.spec.ts`

- [ ] **Step 1: Change border regressions to the 1 pt contract**

Update data-table assertions to require `w:sz="8"`, reject `w:sz="12"`, and retain the assertion that no visible `<w:tcBorders>` grid exists.

- [ ] **Step 2: Run the border tests and verify RED**

```powershell
rtk npx playwright test -g "DOCX data tables|document borders stay|DOCX borders follow"
```

Expected: FAIL because production currently emits size `12` (1.5 pt).

- [ ] **Step 3: Implement exactly one 1 pt table-level grid**

Set the data-table `border.size` in `generateDocx.ts` from `12` to `8`. Set the fallback in `visibleTableBorderXml` from `"12"` to `"8"`. Do not add borders to individual cells and do not change `sectionTopBorder`.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
rtk npx playwright test -g "DOCX data tables|document borders stay|DOCX borders follow"
rtk git add src/docx/generateDocx.ts src/docx/spliceValidationTemplate.ts e2e/memo-builder.spec.ts
rtk git commit -m "fix: render one-point DOCX table grids"
```

Expected: all focused XML border tests PASS and every visible table owns one table-level 1 pt grid.

### Task 5: Integrated application and document verification

**Files:**
- Temporary create/delete: `tmp/qa-generate-docx.mjs`
- Verify: all modified production and test files

- [ ] **Step 1: Run static and focused checks**

```powershell
rtk npm run lint
rtk npm run build
rtk npx playwright test -g "MOM scenario import|salutation|clicking a scenario drag handle|appendix scenarios can reorder|appendix scenarios can move|DOCX data tables|document borders stay|DOCX borders follow"
```

Expected: exit 0 for every command.

- [ ] **Step 2: Run the full Playwright suite**

```powershell
rtk npx playwright test
```

Expected target behavior: all task-related tests PASS. Compare any failures against the documented baseline of two collaboration WebSocket timeouts; do not classify those baseline failures as introduced by this change without new evidence.

- [ ] **Step 3: Generate and structurally inspect the QA DOCX**

Use Playwright in `tmp/qa-generate-docx.mjs` to load a complete draft containing development, activity, and multi-date appendix tables, click `Buat dokumen Word cepat`, and save the download as `tmp/docx/memo-table-qa.docx`. Inspect `word/document.xml` and assert all three visible tables have `w:sz="8"` table borders and no visible cell borders.

- [ ] **Step 4: Render DOCX and PDF page images**

Render the DOCX with the packaged documents renderer into `tmp/docx/rendered/`. Convert the same DOCX with LibreOffice into `tmp/pdfs/memo-table-qa.pdf`, then use Poppler to rasterize every PDF page into `tmp/pdfs/rendered/`.

Inspect every DOCX and PDF page image at 100% zoom. Confirm consistent single table edges and intersections, no doubled cell strokes, no clipping, no overlap, stable merged rows, and correct appendix borders.

- [ ] **Step 5: Remove QA-only scripts and intermediates from git scope**

Delete `tmp/qa-generate-docx.mjs` after inspection and confirm `git status --short` contains only intended source, test, and documentation changes. Keep rendered QA artifacts untracked.

### Task 6: Integrate to GitHub main and deploy Cloudflare

**Files:**
- Verify: `package.json`, `next.config.ts`, `.github/workflows/*` if present, Cloudflare configuration and generated `out/`

- [ ] **Step 1: Re-fetch and verify main ancestry**

```powershell
rtk git fetch origin
rtk git merge-base --is-ancestor origin/main HEAD
rtk git status --short --branch
```

Expected: exit 0 and clean worktree. If `origin/main` advanced, rebase the task branch and rerun Task 5 checks.

- [ ] **Step 2: Run the final evidence gate**

```powershell
rtk npm run lint
rtk npm run build
```

Run the complete focused Playwright command from Task 5 again and confirm the final rendered DOCX/PDF images still match the 1 pt contract.

- [ ] **Step 3: Push the verified HEAD directly to GitHub main**

```powershell
rtk git push origin HEAD:main
```

Expected: the remote `main` ref advances to the verified commit.

- [ ] **Step 4: Verify or trigger Cloudflare Pages production deployment**

If the Pages project is Git-connected, monitor the production deployment created by the main push. If it is not Git-connected, deploy the static `out/` directory with the authenticated Wrangler project configuration.

- [ ] **Step 5: Smoke-test production**

Open the production URL, confirm the page loads without a fatal console error, verify `Import Skenario` is immediately left of `Collapse All`, upload the MOM fixture, confirm existing scenarios are preserved, clear a salutation, click a scenario drag handle without movement, and download a DOCX whose table XML/render still uses the 1 pt canonical grid.

- [ ] **Step 6: Report release evidence**

Report the final commit, GitHub `main` push, Cloudflare production URL/deployment, lint/build/test counts, the two known baseline collaboration timeouts if still present, and the DOCX/PDF visual QA result.
