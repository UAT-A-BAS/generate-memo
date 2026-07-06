import { Fragment } from "react";
import type { MemoDraft, Recipient } from "@/types/memo";
import type { PreviewBlock, PreviewPage } from "@/pagination/paginate";
import { isTableSectionContinuation, paginateMemoDraft, sourceBlockId } from "@/pagination/paginate";
import type { RichTextDoc } from "@/types/richText";
import { formatDateRangeID } from "@/utils/formatDateRangeID";
import { richTextToHtml, richTextToPlainText } from "@/utils/richText";
import { memoAttachmentItems } from "@/utils/attachments";
import { formatRecipientAttention } from "@/utils/formatRecipient";
import { consecutiveMergeState } from "@/utils/tableMerge";
import {
  ACTIVITY_COLUMN_WIDTHS,
  ACTIVITY_NUMBERED_COLUMN_WIDTHS,
  APPENDIX_COLUMN_WIDTHS,
  APPENDIX_HEADER_FILL,
  DEVELOPMENT_COLUMN_WIDTHS,
  DEVELOPMENT_SINGLE_COLUMN_WIDTHS,
  TABLE_HEADER_FILL,
} from "@/documentLayout";
import { HeaderFooterRenderer } from "./HeaderFooterRenderer";
import { PageContainer } from "./PageContainer";

const VALIDATION_BLUE = "#1F497D";
const APPENDIX_COLUMN_WIDTH_PERCENTAGES = APPENDIX_COLUMN_WIDTHS.map((width) => `${width}%`);
const APPENDIX_HEADER_BACKGROUND = `#${APPENDIX_HEADER_FILL}`;
const DEVELOPMENT_COLUMN_WIDTH_PERCENTAGES = DEVELOPMENT_COLUMN_WIDTHS.map((width) => `${width}%`);
const DEVELOPMENT_SINGLE_COLUMN_WIDTH_PERCENTAGES = DEVELOPMENT_SINGLE_COLUMN_WIDTHS.map((width) => `${width}%`);
const ACTIVITY_COLUMN_WIDTH_PERCENTAGES = ACTIVITY_COLUMN_WIDTHS.map((width) => `${width}%`);
const ACTIVITY_NUMBERED_COLUMN_WIDTH_PERCENTAGES = ACTIVITY_NUMBERED_COLUMN_WIDTHS.map((width) => `${width}%`);
const TABLE_HEADER_BACKGROUND = `#${TABLE_HEADER_FILL}`;

function mergedRichTextDoc<T>(
  rows: T[],
  start: number,
  span: number,
  value: (row: T) => RichTextDoc,
) {
  const seen = new Set<string>();
  return {
    type: "doc" as const,
    content: rows.slice(start, start + span).flatMap((row) => {
      const doc = value(row);
      const key = richTextToPlainText(doc);
      if (key && seen.has(key)) return [];
      seen.add(key);
      return doc.content;
    }),
  };
}

function splitAwareMergeKey(
  row: Extract<PreviewBlock, { type: "appendix-row" }>,
  value: string,
) {
  return /-part-\d+$/.test(row.id) ? sourceBlockId(row.id) : value;
}

function splitAwareRowKey(row: Extract<PreviewBlock, { type: "appendix-row" }>) {
  return /-part-\d+$/.test(row.id) ? sourceBlockId(row.id) : row.id;
}

type SectionRule = "full" | "content" | "none";

function RichTextView({ html }: { html: string }) {
  return (
    <div
      className="preview-rich-text text-[14.67px] leading-[1.08]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function scheduleTitle(draft: MemoDraft) {
  return draft.metadata.memoType === "Pilot" ? "Jadwal Pilot Implementasi" : "Jadwal Implementasi";
}

function initialsText(draft: MemoDraft) {
  const suffix = `/uat-${draft.initialsBureau.toLowerCase()}`;
  if (draft.initials.toLowerCase().includes("/uat-")) return draft.initials;
  return draft.initials ? `${draft.initials}${suffix}` : suffix;
}

function referenceItems(draft: MemoDraft) {
  return richTextToPlainText(draft.reference)
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function PreviewSection({
  title,
  children,
  rule = "content",
  fieldId,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  rule?: SectionRule;
  fieldId?: string;
}) {
  const sectionRuleClass = rule === "full" ? "border-t border-slate-800 pt-2" : "";
  const titleRuleClass = rule === "content" ? "pt-3" : "";
  const contentRuleClass = rule === "content" ? "border-t border-slate-800 pt-3" : "";
  const sectionMarginClass = rule === "full" ? "mt-2" : "mt-4";

  return (
    <section
      className={`${sectionMarginClass} ${sectionRuleClass} ${fieldId ? "preview-field-target" : ""}`}
      data-preview-field-id={fieldId}
      role={fieldId ? "button" : undefined}
      tabIndex={fieldId ? 0 : undefined}
    >
      <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-5 text-[14.67px] leading-[1.08]">
        <h3 className={`${titleRuleClass} text-[13.33px] leading-[1.08]`}>
          {typeof title === "string" ? <strong>{title}</strong> : title}
        </h3>
        <div className={contentRuleClass}>{children}</div>
      </div>
    </section>
  );
}

function BulletAlignedLine({
  children,
  bullet = true,
  marker = "-",
}: {
  children: React.ReactNode;
  bullet?: boolean;
  marker?: "-" | "•";
}) {
  return (
    <p className="grid grid-cols-[1.25rem_minmax(0,1fr)]">
      <span data-memo-list-marker={bullet && marker === "•" ? "bullet" : undefined}>
        {bullet ? marker : ""}
      </span>
      <span>{children}</span>
    </p>
  );
}

function recipientLine(recipient: Recipient, index: number, total: number) {
  const name = formatRecipientAttention(recipient);
  const useBullet = total > 1;

  return (
    <div className="grid gap-[5px]" key={recipient.id}>
      {useBullet ? <BulletAlignedLine>{recipient.position}</BulletAlignedLine> : <p>{recipient.position}</p>}
      {name ? (
        useBullet ? <BulletAlignedLine bullet={false}>{name}</BulletAlignedLine> : <p>{name}</p>
      ) : null}
    </div>
  );
}

function AttachmentContent({ items }: { items: string[] }) {
  if (items.length === 1) {
    return <p>Bersama dengan memo ini dilampirkan {items[0].replace(/[.\s]+$/, "")}.</p>;
  }

  return (
    <>
      <p>Bersama dengan memo ini dilampirkan:</p>
      <div className="mt-1 grid gap-0.5">
        {items.map((item, index) => (
          <BulletAlignedLine key={`${item}-${index}`} marker="•">{item}</BulletAlignedLine>
        ))}
      </div>
    </>
  );
}

function ContactLine({
  children,
  single,
}: {
  children: React.ReactNode;
  single: boolean;
}) {
  return single ? <p>{children}</p> : <BulletAlignedLine marker="•">{children}</BulletAlignedLine>;
}

function CcRecipientLine({ recipient, total }: { recipient: Recipient; total: number }) {
  const name = formatRecipientAttention(recipient);

  if (total === 1) {
    return (
      <div className="grid gap-0.5">
        <p>{recipient.position}</p>
        {name ? <p>{name}</p> : null}
      </div>
    );
  }

  return (
    <div className="grid gap-0.5">
      <BulletAlignedLine>{recipient.position}</BulletAlignedLine>
      {name ? <BulletAlignedLine bullet={false}>{name}</BulletAlignedLine> : null}
    </div>
  );
}

function MemoTable({
  headers,
  columnWidths,
  children,
  compact = false,
}: {
  headers: string[];
  columnWidths?: string[];
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <table className={`memo-preview-table w-full table-fixed border-collapse text-[14.67px] ${compact ? "leading-[1.08]" : "mb-2 leading-[1.15]"}`}>
      {columnWidths ? (
        <colgroup>
          {columnWidths.map((width, index) => (
            <col key={`${width}-${index}`} style={{ width }} />
          ))}
        </colgroup>
      ) : null}
      <thead>
        <tr style={{ backgroundColor: compact ? APPENDIX_HEADER_BACKGROUND : TABLE_HEADER_BACKGROUND }}>
          {headers.map((header) => (
            <th
              key={header}
              className={`border border-slate-900 text-center font-bold ${compact ? "px-1 py-0.5" : "px-1.5 py-1"}`}
              style={{ backgroundColor: compact ? APPENDIX_HEADER_BACKGROUND : TABLE_HEADER_BACKGROUND }}
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function consumeRows(
  blocks: PreviewBlock[],
  start: number,
  type: "development-row" | "activity-row" | "appendix-row",
) {
  const rows: PreviewBlock[] = [];
  let index = start;
  while (blocks[index]?.type === type) {
    rows.push(blocks[index]);
    index += 1;
  }
  return { rows, nextIndex: index };
}

function continuationSectionTitle(title: string, continuation: boolean) {
  if (!continuation) return title;
  return (
    <>
      <strong>{title}</strong>
      <span>, Sambungan</span>
    </>
  );
}

function renderBlock(
  draft: MemoDraft,
  block: PreviewBlock,
  sectionRule: SectionRule = "content",
  firstBlockOnPage = false,
) {
  switch (block.type) {
    case "memo-heading":
      return (
        <div className="mt-10 text-[14.67px] leading-[1.15]">
          <div className="grid grid-cols-[92px_14px_1fr] gap-x-2 gap-y-[5px]">
            <span>Kepada</span>
            <span>:</span>
            <div className="grid gap-[5px]">
              {draft.recipients.map((recipient, index) => recipientLine(recipient, index, draft.recipients.length))}
            </div>
            <span>Dari</span>
            <span>:</span>
            <span>
              POL Application &amp; User Acceptance Test Bureau {draft.metadata.bureau} (UAT {draft.metadata.bureau})
            </span>
            <span>Jenis Informasi</span>
            <span>:</span>
            <span>INTERNAL BCA</span>
            <span className="font-[Arial] text-[14.67px]">Perihal</span>
            <span className="font-[Arial] text-[14.67px]">:</span>
            <span
              className="preview-field-target font-[Arial] text-[16px] font-bold leading-[1.25]"
              data-preview-field-id="projectName"
              role="button"
              tabIndex={0}
            >
              {draft.metadata.perihal}
            </span>
          </div>
        </div>
      );
    case "recipients":
      return null;
    case "introduction":
      return (
        <PreviewSection title="Pengantar" rule={sectionRule} fieldId="projectName">
          <p>
            Sehubungan dengan akan dilakukannya {draft.metadata.perihal}, berikut kami sampaikan
            informasi dan tindak lanjut yang harus dilakukan oleh Cabang dan Unit Kerja terkait.
          </p>
        </PreviewSection>
      );
    case "reference":
      const items = referenceItems(draft);
      return (
        <PreviewSection title="Referensi" rule={sectionRule} fieldId="reference">
          <p>Memorandum ini mengacu pada.</p>
          {items.length ? (
            <ul className="mt-1 list-disc pl-5">
              {items.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          ) : null}
        </PreviewSection>
      );
    case "pilot-schedule":
      return (
        <PreviewSection title={scheduleTitle(draft)} rule={sectionRule} fieldId="schedule">
          <p>
            {draft.metadata.perihal} akan dilaksanakan pada tanggal{" "}
            <strong data-schedule-date className="whitespace-nowrap">
              {formatDateRangeID(draft.pilotSchedule.startDate, draft.pilotSchedule.endDate, draft.pilotSchedule.dates)}
            </strong>.
          </p>
        </PreviewSection>
      );
    case "access-link":
      const accessLink = draft.metadata.accessLink.trim();
      return (
        <PreviewSection title={`Akses Link ${draft.metadata.perihal}`} rule={sectionRule} fieldId="accessLink">
          <p>{draft.metadata.perihal} dapat diakses melalui link berikut:</p>
          {accessLink ? (
            <a
              href={/^[a-z][a-z\d+.-]*:/i.test(accessLink) ? accessLink : `https://${accessLink}`}
              target="_blank"
              rel="noreferrer"
              className="break-all underline"
            >
              {accessLink}
            </a>
          ) : (
            <p>-</p>
          )}
        </PreviewSection>
      );
    case "attachments":
      return (
        <PreviewSection title="Lampiran" rule={sectionRule} fieldId="attachments">
          <AttachmentContent items={memoAttachmentItems(draft.attachments)} />
        </PreviewSection>
      );
    case "contacts":
      return (
        <PreviewSection
          title="PIC yang Dapat Dihubungi"
          rule={sectionRule}
          fieldId={draft.contacts[0] ? `contact-name-${draft.contacts[0].id}` : undefined}
        >
          <p>PIC yang dapat dihubungi sehubungan dengan {draft.metadata.perihal} adalah:</p>
          <div className="mt-1 grid gap-0.5">
            {draft.contacts.map((contact) => (
              <ContactLine key={contact.id} single={draft.contacts.length === 1}>
                {contact.name} – {contact.email}
              </ContactLine>
            ))}
          </div>
        </PreviewSection>
      );
    case "signature":
      return (
        <div
          data-preview-closing
          data-preview-field-id={draft.signers[0] ? `signer-name-${draft.signers[0].id}` : undefined}
          className={`ml-[140px] text-[14.67px] leading-[1.08] ${
            firstBlockOnPage ? "mt-0 pt-0" : "mt-3 border-t border-slate-800 pt-2"
          }`}
        >
          <p>Demikian informasi ini kami sampaikan, atas perhatian Bapak/Ibu kami ucapkan terima kasih.</p>
          <div className="mt-4 grid gap-0.5" data-preview-signers>
            {draft.signers.map((signer) => (
              <div
                key={signer.id}
                className="grid min-w-0 grid-cols-[max-content_auto_minmax(0,1fr)] items-start gap-x-[0.25em]"
                data-preview-signer-row
              >
                <strong className="whitespace-nowrap [overflow-wrap:normal]">
                  {signer.name.toUpperCase()}
                </strong>
                <span> - </span>
                <span
                  className="min-w-0 flex-1 [overflow-wrap:anywhere]"
                  data-preview-signer-title
                >
                  {signer.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    case "cc":
      return (
        <div
          className="ml-[140px] mt-4 text-[14.67px] leading-[1.08]"
          data-preview-field-id={block.recipients[0] ? `recipient-${block.recipients[0].id}` : undefined}
        >
          <p>Tembusan:</p>
          <div className="grid gap-0.5">
            {block.recipients.map((recipient) => (
              <CcRecipientLine
                key={recipient.id}
                recipient={recipient}
                total={block.totalRecipients}
              />
            ))}
          </div>
        </div>
      );
    case "initials":
      return (
        <p
          className="ml-[140px] mt-4 text-[13.33px]"
          data-preview-field-id="initials"
        >
          {initialsText(draft)}
        </p>
      );
    case "validation":
      return (
        <div className="relative h-full overflow-hidden px-2 pt-12 text-[12px] text-[#333]">
          {/* Template watermark extracted from the source DOCX. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/template-assets/validation-watermark-source-pale.png"
            alt=""
            className="pointer-events-none absolute bottom-[-12px] right-[-22px] object-cover object-bottom opacity-95"
            style={{ width: 700, height: 990 }}
          />
          <div className="relative mx-auto mt-5 w-[605px]">
            <p className="text-center tracking-[0.16em]">INTERNAL BCA/RAHASIA/SANGAT RAHASIA</p>
            <h2 className="mt-4 text-center text-[24px] font-bold" style={{ color: VALIDATION_BLUE }}>Validasi Dokumen</h2>
            <p className="text-center tracking-[0.08em]">Dibuat oleh Document Approval</p>
            <div className="mt-5 grid grid-cols-[160px_12px_1fr] bg-[#f0f0f0] px-2 py-2" style={{ color: VALIDATION_BLUE }}>
              <span>Nomor Dokumen</span><span>:</span><span>[No Memo]</span>
              <span>Tanggal Rilis Dokumen</span><span>:</span><span>[Tanggal Rilis]</span>
              <span>Jumlah Lembar Dokumen</span><span>:</span><span>[Total Lembar]</span>
            </div>
            <p className="mt-6 text-[15px]">Document Approval History of</p>
            <p className="mt-2 font-bold">[{draft.metadata.perihal}]</p>
            <div className="mt-7 grid gap-1">
              <p>[Request Log]</p>
              <p>[Approval Log]</p>
              <p>[Release Log]</p>
            </div>
            <p className="mt-5 italic">Disclaimer:</p>
            <p className="mt-5 italic leading-6">
              Validasi dokumen ini dibuat oleh sistem dan didokumentasi secara otomatis di myBCA Portal
              yang dapat diverifikasi pada link berikut:
            </p>
            <p className="text-[#0563c1] underline">https://verifikasi.bca.co.id/document/view/</p>
            <div className="mt-8 border-t pt-3" style={{ borderColor: VALIDATION_BLUE }}>
              <p className="text-[15px] tracking-[0.08em]">Document Details</p>
              <div className="mt-4 grid grid-cols-[155px_10px_1fr]">
                <span>Ditujukan Kepada</span><span>:</span><span>[Kepada]</span>
                <span>Divisi/Biro/Cabang Tujuan</span><span>:</span><span>[Divisi]</span>
                <span>Tembusan</span><span>:</span><span>[Tembusan]</span>
                <span>Unit Pembuat</span><span>:</span><span>[Unit Pembuat]</span>
              </div>
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
}

function isPreviewSectionBlock(block: PreviewBlock) {
  return (
    block.type === "introduction" ||
    block.type === "reference" ||
    block.type === "pilot-schedule" ||
    block.type === "access-link" ||
    block.type === "attachments" ||
    block.type === "contacts"
  );
}

function renderGroupedBlocks(
  draft: MemoDraft,
  blocks: PreviewBlock[],
  suppressFirstSectionRule = false,
) {
  const rendered: React.ReactNode[] = [];
  let index = 0;
  let sectionCount = 0;
  const nextSectionRule = (): SectionRule => {
    if (sectionCount === 0) {
      sectionCount += 1;
      return suppressFirstSectionRule ? "none" : "full";
    }

    sectionCount += 1;
    return "content";
  };

  while (index < blocks.length) {
    const block = blocks[index];

    if (block.type === "development-row") {
      const { rows, nextIndex } = consumeRows(blocks, index, "development-row");
      const developmentRows = rows as Extract<PreviewBlock, { type: "development-row" }>[];
      const numbered = draft.developmentRows.length > 1;
      const continuation = isTableSectionContinuation(developmentRows[0]);
      rendered.push(
          <PreviewSection
            title={continuationSectionTitle("Lingkup Pengembangan", continuation)}
            rule={nextSectionRule()}
            fieldId={`development-item-${developmentRows[0].row.id}`}
          key={`development-${index}`}
        >
          <p className="mb-2">Berikut adalah fitur pengembangan pada {draft.metadata.projectName}:</p>
          <MemoTable
            headers={numbered ? ["No.", "Pengembangan", "Keterangan"] : ["Pengembangan", "Keterangan"]}
            columnWidths={numbered ? DEVELOPMENT_COLUMN_WIDTH_PERCENTAGES : DEVELOPMENT_SINGLE_COLUMN_WIDTH_PERCENTAGES}
          >
            {developmentRows.map((item, rowIndex) => {
              const itemMerge = consecutiveMergeState(
                developmentRows,
                rowIndex,
                (row) => richTextToPlainText(row.row.item),
              );
              const descriptionMerge = consecutiveMergeState(
                developmentRows,
                rowIndex,
                (row) => richTextToPlainText(row.row.description),
              );
              return (
              <tr key={item.id}>
                {numbered ? (
                  <td className="w-12 border border-slate-900 px-2 py-1 text-center align-middle">{item.index + 1}</td>
                ) : null}
                {itemMerge.hidden ? null : (
                  <td
                    className="border border-slate-900 px-2 py-1 align-middle"
                    rowSpan={itemMerge.span}
                    data-preview-field-id={`development-item-${item.row.id}`}
                  >
                    <RichTextView html={richTextToHtml(item.row.item)} />
                  </td>
                )}
                {descriptionMerge.hidden ? null : (
                  <td
                    className="border border-slate-900 px-2 py-1 align-middle"
                    rowSpan={descriptionMerge.span}
                    data-preview-field-id={`development-description-${item.row.id}`}
                  >
                    <RichTextView html={richTextToHtml(item.row.description)} />
                  </td>
                )}
              </tr>
              );
            })}
          </MemoTable>
        </PreviewSection>,
      );
      index = nextIndex;
      continue;
    }

    if (block.type === "activity-row") {
      const { rows, nextIndex } = consumeRows(blocks, index, "activity-row");
      const activityRows = rows as Extract<PreviewBlock, { type: "activity-row" }>[];
      const numbered = draft.activities.length > 1;
      const continuation = isTableSectionContinuation(activityRows[0]);
      rendered.push(
          <PreviewSection
            title={continuationSectionTitle("Aktivitas Cabang dan Unit Kerja", continuation)}
            rule={nextSectionRule()}
            fieldId={`activity-text-${activityRows[0].row.id}`}
          key={`activity-${index}`}
        >
          <p className="mb-2">Berikut ini adalah aktivitas yang perlu dilakukan oleh Cabang dan Unit Kerja selama {draft.metadata.perihal}:</p>
          <MemoTable
            headers={numbered ? ["No.", "Aktivitas", "PIC", "Waktu"] : ["Aktivitas", "PIC", "Waktu"]}
            columnWidths={numbered ? ACTIVITY_NUMBERED_COLUMN_WIDTH_PERCENTAGES : ACTIVITY_COLUMN_WIDTH_PERCENTAGES}
          >
            {activityRows.map((item, rowIndex) => {
              const activityMerge = consecutiveMergeState(
                activityRows,
                rowIndex,
                (row) => richTextToPlainText(row.row.activity),
              );
              const ownerMerge = consecutiveMergeState(
                activityRows,
                rowIndex,
                (row) => row.row.owner,
              );
              const dateMerge = consecutiveMergeState(
                activityRows,
                rowIndex,
                (row) => formatDateRangeID(row.row.startDate, row.row.endDate, row.row.dates),
              );
              return (
              <tr key={item.id}>
                {numbered ? (
                  <td className="border border-slate-900 px-2 py-1 text-center align-middle">{item.index + 1}</td>
                ) : null}
                {activityMerge.hidden ? null : (
                  <td
                    className="border border-slate-900 px-2 py-1 align-middle"
                    rowSpan={activityMerge.span}
                    data-preview-field-id={`activity-text-${item.row.id}`}
                  >
                    <RichTextView html={richTextToHtml(item.row.activity)} />
                  </td>
                )}
                {ownerMerge.hidden ? null : (
                  <td
                    className="border border-slate-900 px-2 py-1 text-center align-middle"
                    rowSpan={ownerMerge.span}
                    data-preview-field-id={`activity-owner-${item.row.id}`}
                  >
                    {item.row.owner}
                  </td>
                )}
                {dateMerge.hidden ? null : (
                  <td
                    className="border border-slate-900 px-2 py-1 text-center align-middle"
                    rowSpan={dateMerge.span}
                    data-preview-field-id={`activity-date-${item.row.id}`}
                  >
                    {formatDateRangeID(item.row.startDate, item.row.endDate, item.row.dates)}
                  </td>
                )}
              </tr>
              );
            })}
          </MemoTable>
        </PreviewSection>,
      );
      index = nextIndex;
      continue;
    }

    if (block.type === "appendix-row") {
      const { rows, nextIndex } = consumeRows(blocks, index, "appendix-row");
      rendered.push(
        <MemoTable
          key={`appendix-${index}`}
          headers={["No", "Aktivitas", "Hasil/Keterangan", "PIC"]}
          columnWidths={APPENDIX_COLUMN_WIDTH_PERCENTAGES}
          compact
        >
          {(rows as Extract<PreviewBlock, { type: "appendix-row" }>[]).map((item, rowIndex, appendixRows) => {
            const startsGroup = (row: typeof item) => row.meta.showDate || row.meta.headingRows.length > 0;
            const sourceMerge = consecutiveMergeState(
              appendixRows,
              rowIndex,
              splitAwareRowKey,
              startsGroup,
            );
            const scenarioMerge = consecutiveMergeState(
              appendixRows,
              rowIndex,
              (row) => splitAwareMergeKey(row, richTextToPlainText(row.row.scenario)),
              startsGroup,
            );
            const resultMerge = consecutiveMergeState(
              appendixRows,
              rowIndex,
              (row) => splitAwareMergeKey(row, richTextToPlainText(row.row.expectedResult)),
              startsGroup,
            );
            const numberMerge = sourceMerge;
            const picMerge = consecutiveMergeState(
              appendixRows,
              rowIndex,
              (row) => row.row.pic,
              startsGroup,
            );
            const scenarioDoc = mergedRichTextDoc(appendixRows, rowIndex, scenarioMerge.span, (row) => row.row.scenario);
            const resultDoc = mergedRichTextDoc(appendixRows, rowIndex, resultMerge.span, (row) => row.row.expectedResult);
            return (
              <Fragment key={item.id}>
                {item.meta.showDate ? (
                  <tr className="font-bold" style={{ backgroundColor: APPENDIX_HEADER_BACKGROUND }}>
                    <td
                      className="border border-slate-900 px-1 py-0.5"
                      colSpan={4}
                      style={{ backgroundColor: APPENDIX_HEADER_BACKGROUND }}
                      data-preview-field-id={`scenario-date-${item.row.id}`}
                    >
                      {item.meta.dateLabel}
                    </td>
                  </tr>
                ) : null}
                {item.meta.headingRows.map((heading) => (
                  <tr key={heading.id} className="font-bold" style={{ backgroundColor: APPENDIX_HEADER_BACKGROUND }}>
                    <td className="border border-slate-900 px-1 py-0.5 text-center align-middle" style={{ backgroundColor: APPENDIX_HEADER_BACKGROUND }}>
                      {heading.label}.
                    </td>
                    <td
                      className="preserve-lines border border-slate-900 px-1 py-0.5 align-middle"
                      colSpan={3}
                      style={{ backgroundColor: APPENDIX_HEADER_BACKGROUND }}
                      data-preview-field-id={heading.depth === 1 ? `scenario-section-${item.row.id}` : `scenario-heading-${heading.id}`}
                    >
                      {heading.title}
                    </td>
                  </tr>
                ))}
                <tr>
                  {numberMerge.hidden ? null : (
                    <td className="w-8 border border-slate-900 px-1 py-0.5 text-center align-middle" rowSpan={numberMerge.span}>
                      {item.meta.number}.
                    </td>
                  )}
                  {scenarioMerge.hidden ? null : (
                    <td
                      className="border border-slate-900 px-1 py-0.5 align-middle"
                      rowSpan={scenarioMerge.span}
                      data-preview-field-id={`scenario-text-${item.row.id}`}
                    >
                      <RichTextView html={richTextToHtml(scenarioDoc)} />
                    </td>
                  )}
                  {resultMerge.hidden ? null : (
                    <td
                      className="border border-slate-900 px-1 py-0.5 align-middle"
                      rowSpan={resultMerge.span}
                      data-preview-field-id={`scenario-expected-${item.row.id}`}
                    >
                      <RichTextView html={richTextToHtml(resultDoc)} />
                    </td>
                  )}
                  {picMerge.hidden ? null : (
                    <td
                      className="preserve-lines border border-slate-900 px-1 py-0.5 text-center align-middle"
                      rowSpan={picMerge.span}
                      data-preview-field-id={`scenario-pic-${item.row.id}`}
                    >
                      {item.row.pic}
                    </td>
                  )}
                </tr>
              </Fragment>
            );
          })}
        </MemoTable>,
      );
      index = nextIndex;
      continue;
    }

    rendered.push(
      <div key={block.id}>
        {renderBlock(
          draft,
          block,
          isPreviewSectionBlock(block) ? nextSectionRule() : "content",
          index === 0,
        )}
      </div>,
    );
    index += 1;
  }

  return rendered;
}

function PageContent({ draft, page }: { draft: MemoDraft; page: PreviewPage }) {
  const isAppendix = page.kind === "appendix";
  const contentTop = page.continuationTitle ? (isAppendix ? 88 : 108) : (isAppendix ? 88 : 64);

  return (
    <div
      data-preview-page-content
      className={`absolute bottom-16 ${isAppendix ? "left-10 right-14" : "left-24 right-20"}`}
      style={{ top: contentTop }}
    >
      {page.continuationTitle ? (
        isAppendix ? (
          <h2 className="mb-4">
            <strong className="text-[13.33px]">{page.continuationTitle.replace(", Sambungan", "")}</strong>
            <span className="text-[13.33px]">, Sambungan</span>
          </h2>
        ) : (
          <div className="mb-3">
            <h2>
              <span className="font-[Arial] text-[14.67px]">Perihal: </span>
              <strong className="font-[Arial] text-[16px]">{draft.metadata.perihal}</strong>
              <span className="font-[Arial] text-[14.67px]">, Sambungan</span>
            </h2>
            <div className="ml-[140px] mt-5 h-px bg-slate-800" />
          </div>
        )
      ) : page.kind === "appendix" ? (
        <h2 className="mb-5 text-[13.33px] font-bold">{page.title}</h2>
      ) : null}
      {renderGroupedBlocks(
        draft,
        page.blocks,
        Boolean(page.continuationTitle && page.kind === "main"),
      )}
      {page.continues && page.kind === "main" ? (
        <p className="ml-[140px] mt-3 border-t border-slate-800 pt-1 text-right text-[13.33px] italic leading-[1.08]">
          Bersambung ke halaman berikut
        </p>
      ) : null}
    </div>
  );
}

export function MemoPreview({
  draft,
  onNavigateField,
}: {
  draft: MemoDraft;
  onNavigateField?: (fieldId: string) => unknown;
}) {
  const pages = paginateMemoDraft(draft);

  function navigateFromPreview(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return;
    const field = target.closest<HTMLElement>("[data-preview-field-id]");
    const fieldId = field?.dataset.previewFieldId;
    if (fieldId) onNavigateField?.(fieldId);
  }

  return (
    <div
      className="grid gap-5 py-4"
      onClick={(event) => navigateFromPreview(event.target)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        navigateFromPreview(event.target);
      }}
    >
      {pages.map((page, index) => (
        <div key={page.id} className="origin-top">
          <PageContainer orientation={page.orientation} kind={page.kind}>
            <HeaderFooterRenderer
              pageNumber={index + 1}
              totalPages={pages.length}
            />
            <PageContent draft={draft} page={page} />
          </PageContainer>
        </div>
      ))}
    </div>
  );
}
