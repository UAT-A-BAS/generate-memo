# Excel Scenario Hierarchy Design

## Goal

Allow users to import scenario workbooks into Lampiran Skenario and manually build optional Bagian, Subbagian, and Sub-subbagian levels without making the editor visually heavy.

## Agreed behavior

- Excel import accepts `.xlsx` from the existing Import Skenario action.
- The active visible worksheet is selected automatically. A compact preview dialog lets the user choose another visible worksheet before importing.
- Column mapping is automatic from common headers such as `No`, `Aktivitas`/`Skenario`, `Hasil`/`Expected`, `PIC`, and `Tanggal`.
- Repeated page titles, table headers, and `sambungan` rows are ignored.
- Heading rows such as `A`, `A.1`, and `A.1.1` create up to three optional hierarchy levels. Workbooks may stop at any level or contain no headings.
- Imported scenarios append to existing scenarios. A completely empty placeholder is replaced.
- A Bagian may contain direct scenarios and Subbagian at the same time; a Subbagian may likewise contain direct scenarios and Sub-subbagian.
- Numbering is derived from current sibling order, so drag-and-drop automatically changes `A`, `A.1`, and `A.1.1` labels.

## UX

Actions are contextual and visually quiet:

- Tanggal: `+ Bagian` and `+ Skenario`.
- Bagian: `+ Skenario` and `+ Subbagian`.
- Subbagian: `+ Skenario` and `+ Sub-subbagian`.
- Sub-subbagian: `+ Skenario`.

The controls use compact text buttons with a single plus icon, 44px minimum hit areas, visible keyboard focus, and progressive disclosure inside the relevant expanded card. Users never choose a parent from a separate form.

## Data model

Each scenario may carry a `headingPath` array of up to three `{ id, title }` nodes. Existing `sectionGroupId` and `section` fields remain readable and normalize into a one-node path, preserving old drafts and collaboration payloads.

The UI derives a tree per date group from scenario paths. Nodes do not store numbering; labels are calculated from sibling order. Direct scenarios belong to the current node or the date root.

## Excel parsing

The browser reads the XLSX zip with the existing JSZip dependency. It resolves workbook relationships, visible sheets, shared strings, cached values, date styles, merged cells, and worksheet rows. Heading recognition requires an outline marker at the start of the first logical column and a title. Scenario rows require a number plus scenario content.

Dates accept Excel serials and common Indonesian/English text formats. Merged date and PIC cells are expanded before rows are mapped. Unrecognized decorative rows are skipped and reported in the preview summary.

## Output and validation

Preview and DOCX emit one header row for each newly entered hierarchy node. Scenario numbering resets within its immediate parent. Empty heading titles are validated only for headings that exist; root-level scenarios do not require an artificial Bagian.

## Error handling

Malformed workbooks, missing usable columns, or sheets without scenarios leave the draft untouched and show a recovery message beside the import action. The preview identifies the selected sheet and parsed counts before mutation.

