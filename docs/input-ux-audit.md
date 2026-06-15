# Memo Generator Input Field Audit

Audit date: June 14, 2026

## Existing Strengths

- Visible labels and required markers exist for most fields.
- Preview updates from the same `MemoDraft` used by DOCX generation.
- Rich-text controls, drag reorder, JSON import/export, universal undo, and
  export-time validation already exist.
- Conditional fields for Referensi, Akses Link, and Lampiran reduce some
  unnecessary input.

## High-Leverage Findings

| Priority | Area | Evidence | User Cost | Planned Improvement |
|---|---|---|---|---|
| P1 | Draft recovery | `src/store/useMemoDraftStore.ts`: `saveToLocal` writes the draft, but `loadFromLocal` always creates a blank draft. | A refresh can discard work despite periodic saves. | Parse, normalize, and restore the stored draft; debounce writes and expose status. |
| P1 | Validation timing | `validateMemoDraft` runs only from DOCX export. | Users discover many errors at the end of a long form. | Validate touched fields on blur, reveal all on export, and update completion progress continuously. |
| P1 | Input guidance | Most plain inputs and all rich-text inputs have no placeholder or helper text. | Users must infer expected content and formatting. | Add examples, concise helpers, and rich-text empty-state prompts. |
| P1 | Repeated entry | Add/remove/reorder exists, but clone is absent across repeated collections. | Similar rows must be recreated manually. | Add clone with fresh IDs to all repeated collections. |
| P2 | Reused organizational data | Position, PIC, signer, contact, and appendix fields are plain manual inputs. | Frequent values are repeatedly typed and spelling drifts. | Add bounded browser-local suggestions and a reusable routing profile. |
| P2 | Smart defaults | New activities and date groups start empty even when the memo schedule is known. | Users repeat dates and PIC data. | Inherit schedule dates and previous PIC where context is unambiguous. |
| P2 | Long-form navigation | The form is a long stack and validation summary is at the bottom. | Extra scrolling and weak sense of progress. | Add sticky completion controls and jump-to-next-incomplete behavior. |
| P2 | Format validation | Contact email and enabled access URL are checked only for presence. | Typographical errors can reach preview and DOCX. | Add clear email and URL format rules with recovery text. |
| P3 | Section context | `SectionTitle` declares `description` but does not render it. | Users receive no section-level orientation. | Render short section descriptions using the existing component boundary. |

## Field Inventory

### Tujuan and Routing

- Kepada: position, salutation, optional name
- Metadata: memo type, UAT bureau, project name, auto/manual Perihal
- Tembusan: position, optional salutation, optional name

Primary risks: repeated organizational names, unclear examples, and spelling
drift. Suitable for suggestions and reusable profiles.

### Memo Content

- Referensi for Nasional memos
- Lingkup Pengembangan: item and description rich text
- Implementation schedule
- Aktivitas: date range, PIC, activity rich text
- Optional access URL
- Optional attachments

Primary risks: late validation, repeated dates, unclear rich-text expectations,
and manual row recreation.

### Closing

- Contact PIC name and email
- Signer name and title
- Initials and UAT

Primary risks: frequently reused people data and missing email format feedback.

### Appendix

- date group
- section title
- scenario, expected result, and PIC

Primary risks: dense nested hierarchy, repeated values, and high manual effort.
The existing grouping model should remain unchanged; add contextual defaults and
clone actions rather than introducing a second workflow.

## Considered And Rejected

- Multi-step wizard: rejected because it creates a second form state and hides
  cross-section comparison.
- Collapsible accordion as the default: rejected because it trades scrolling
  for repeated open/close actions and can hide validation context.
- Server-backed directory autocomplete: rejected by the local-only constraint
  and unnecessary for this experiment.
- Changes to `MemoDraft`, preview pagination, or DOCX layout: rejected because
  the requested value is input efficiency, not document redesign.

