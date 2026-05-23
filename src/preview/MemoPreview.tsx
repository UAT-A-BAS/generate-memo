import { Fragment } from "react";
import type { MemoDraft, Recipient } from "@/types/memo";
import type { PreviewBlock, PreviewPage } from "@/pagination/paginate";
import { paginateMemoDraft } from "@/pagination/paginate";
import { formatDateRangeID } from "@/utils/formatDateRangeID";
import { richTextToHtml } from "@/utils/richText";
import { HeaderFooterRenderer } from "./HeaderFooterRenderer";
import { PageContainer } from "./PageContainer";

function RichTextView({ html }: { html: string }) {
  return (
    <div
      className="preview-rich-text text-[14.67px] leading-[1.45]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function scheduleTitle(draft: MemoDraft) {
  return draft.metadata.memoType === "Pilot" ? "Jadwal Pilot Implementasi" : "Jadwal Implementasi";
}

function initialsText(draft: MemoDraft) {
  const suffix = `/uat-${draft.initialsBureau.toLowerCase()}`;
  return draft.initials ? `${draft.initials}${suffix}` : suffix;
}

function PreviewSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 border-t border-slate-800 pt-3">
      <div className="grid grid-cols-[120px_1fr] gap-5 text-[14.67px] leading-[1.3]">
        <h3 className="text-[13.33px] font-bold leading-[1.25]">{title}</h3>
        <div>{children}</div>
      </div>
    </section>
  );
}

function recipientLine(recipient: Recipient, index: number, total: number) {
  const name = recipient.name?.trim() ? `U.p. Yth. ${recipient.gender} ${recipient.name}` : "";
  const prefix = total > 1 ? "- " : "";
  return (
    <div className="grid gap-1" key={recipient.id}>
      <p>{prefix}{recipient.position}</p>
      {name ? <p className="pl-5">{name}</p> : null}
    </div>
  );
}

function MemoTable({
  headers,
  columnWidths,
  children,
}: {
  headers: string[];
  columnWidths?: string[];
  children: React.ReactNode;
}) {
  return (
    <table className="memo-preview-table w-full table-fixed border-collapse text-[14.67px] leading-[1.15]">
      {columnWidths ? (
        <colgroup>
          {columnWidths.map((width, index) => (
            <col key={`${width}-${index}`} style={{ width }} />
          ))}
        </colgroup>
      ) : null}
      <thead>
        <tr className="bg-[#d9d9d9]">
          {headers.map((header) => (
            <th key={header} className="border border-slate-900 px-1.5 py-1 text-center font-bold">
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

function renderBlock(draft: MemoDraft, block: PreviewBlock) {
  switch (block.type) {
    case "memo-heading":
      return (
        <div className="mt-14 text-[14.67px] leading-[1.45]">
          <div className="grid grid-cols-[92px_14px_1fr] gap-x-2">
            <span>Kepada</span>
            <span>:</span>
            <div className="grid gap-1">
              {draft.recipients.map((recipient, index) => recipientLine(recipient, index, draft.recipients.length))}
            </div>
            <span className="mt-2">Dari</span>
            <span className="mt-2">:</span>
            <span className="mt-2">POL Application &amp; User Acceptance Test Bureau {draft.metadata.bureau}</span>
            <span>Jenis Informasi</span>
            <span>:</span>
            <span>INTERNAL BCA</span>
            <span className="font-[Arial] text-[14.67px]">Perihal</span>
            <span className="font-[Arial] text-[14.67px]">:</span>
            <span className="font-[Arial] text-[16px] font-bold leading-[1.25]">{draft.metadata.perihal}</span>
          </div>
        </div>
      );
    case "recipients":
      return null;
    case "introduction":
      return (
        <PreviewSection title="Pengantar">
          <p>
            Sehubungan dengan akan dilakukannya {draft.metadata.perihal}, berikut kami sampaikan
            informasi dan tindak lanjut yang harus dilakukan oleh Cabang dan Unit Kerja terkait.
          </p>
        </PreviewSection>
      );
    case "reference":
      return (
        <PreviewSection title="Referensi">
          <RichTextView html={richTextToHtml(draft.reference)} />
        </PreviewSection>
      );
    case "pilot-schedule":
      return (
        <PreviewSection title={scheduleTitle(draft)}>
          <p>
            {draft.metadata.perihal} akan dilaksanakan pada tanggal{" "}
            <strong>{formatDateRangeID(draft.pilotSchedule.startDate, draft.pilotSchedule.endDate)}</strong>.
          </p>
        </PreviewSection>
      );
    case "access-link":
      return (
        <PreviewSection title={`Akses Link ${draft.metadata.perihal}`}>
          <p>{draft.metadata.perihal} dapat diakses melalui link berikut:</p>
          <p className="break-all underline">{draft.metadata.accessLink || "-"}</p>
        </PreviewSection>
      );
    case "contacts":
      return (
        <PreviewSection title="PIC yang Dapat Dihubungi">
          <p>PIC yang dapat dihubungi sehubungan dengan {draft.metadata.perihal} adalah:</p>
          <ul className="mt-1">
            {draft.contacts.map((contact) => (
              <li key={contact.id}>- {contact.name} - {contact.email}</li>
            ))}
          </ul>
        </PreviewSection>
      );
    case "signature":
      return (
        <div className="mt-5 text-[14.67px] leading-[1.45]">
          <p>Demikian informasi ini kami sampaikan, atas perhatian Bapak/Ibu kami ucapkan terima kasih.</p>
          <div className="mt-4">
          {draft.signers.map((signer) => (
            <div key={signer.id}>
              <p><strong>{signer.name.toUpperCase()}</strong> - {signer.title}</p>
            </div>
          ))}
          </div>
        </div>
      );
    case "cc":
      return (
        <div className="mt-5 text-[14.67px] leading-[1.35]">
          <p>Tembusan:</p>
          <div className="grid gap-0.5">
            {draft.ccRecipients.map((recipient) => (
              <div key={recipient.id}>
                <p>- {recipient.position}</p>
                {recipient.name ? <p className="pl-5">U.p. Yth. {recipient.gender} {recipient.name}</p> : null}
              </div>
            ))}
          </div>
        </div>
      );
    case "initials":
      return <p className="mt-5 text-[13.33px]">{initialsText(draft)}</p>;
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
          <div className="relative mx-auto w-[605px]">
            <p className="text-center tracking-[0.16em]">INTERNAL BCA/RAHASIA/SANGAT RAHASIA</p>
            <h2 className="mt-4 text-center text-[24px] font-bold text-[#1f4e79]">Validasi Dokumen</h2>
            <p className="text-center tracking-[0.08em]">Dibuat oleh Document Approval</p>
            <div className="mt-5 grid grid-cols-[160px_12px_1fr] bg-[#f0f0f0] px-2 py-2 text-[#003b7a]">
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
            <div className="mt-8 border-t border-[#1f4e79] pt-3">
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

function renderGroupedBlocks(draft: MemoDraft, blocks: PreviewBlock[]) {
  const rendered: React.ReactNode[] = [];
  let index = 0;

  while (index < blocks.length) {
    const block = blocks[index];

    if (block.type === "development-row") {
      const { rows, nextIndex } = consumeRows(blocks, index, "development-row");
      rendered.push(
        <PreviewSection title="Lingkup Pengembangan" key={`development-${index}`}>
          <p className="mb-2">Berikut adalah fitur pengembangan pada {draft.metadata.perihal}:</p>
          <MemoTable headers={["No.", "Pengembangan", "Keterangan"]} columnWidths={["10%", "42%", "48%"]}>
            {(rows as Extract<PreviewBlock, { type: "development-row" }>[]).map((item) => (
              <tr key={item.id}>
                <td className="w-12 border border-slate-900 px-2 py-1 align-top">{item.index + 1}</td>
                <td className="border border-slate-900 px-2 py-1 align-top">
                  <RichTextView html={richTextToHtml(item.row.item)} />
                </td>
                <td className="border border-slate-900 px-2 py-1 align-top">
                  <RichTextView html={richTextToHtml(item.row.description)} />
                </td>
              </tr>
            ))}
          </MemoTable>
        </PreviewSection>,
      );
      index = nextIndex;
      continue;
    }

    if (block.type === "activity-row") {
      const { rows, nextIndex } = consumeRows(blocks, index, "activity-row");
      rendered.push(
        <PreviewSection title="Aktivitas Cabang dan Unit Kerja" key={`activity-${index}`}>
          <p className="mb-2">Berikut ini adalah aktivitas yang perlu dilakukan oleh Cabang dan Unit Kerja selama {draft.metadata.perihal}:</p>
          <MemoTable headers={["Aktivitas", "PIC", "Waktu"]} columnWidths={["66%", "16%", "18%"]}>
            {(rows as Extract<PreviewBlock, { type: "activity-row" }>[]).map((item) => (
              <tr key={item.id}>
                <td className="border border-slate-900 px-2 py-1 align-top">
                  <RichTextView html={richTextToHtml(item.row.activity)} />
                </td>
                <td className="border border-slate-900 px-2 py-1 align-top">{item.row.owner}</td>
                <td className="border border-slate-900 px-2 py-1 align-top">
                  {formatDateRangeID(item.row.startDate, item.row.endDate)}
                </td>
              </tr>
            ))}
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
          columnWidths={["6%", "40%", "39%", "15%"]}
        >
          {(rows as Extract<PreviewBlock, { type: "appendix-row" }>[]).map((item, rowIndex, allRows) => {
            const dateLabel = formatDateRangeID(item.row.startDate, item.row.endDate);
            const previous = allRows[rowIndex - 1];
            const previousDate = previous ? formatDateRangeID(previous.row.startDate, previous.row.endDate) : "";
            const showDate = dateLabel !== "-" && dateLabel !== previousDate;

            return (
              <Fragment key={item.id}>
                {showDate ? (
                  <tr className="bg-[#d9d9d9] font-bold">
                    <td className="border border-slate-900 px-2 py-1" colSpan={4}>{dateLabel}</td>
                  </tr>
                ) : null}
                <tr>
                  <td className="w-10 border border-slate-900 px-2 py-1 text-center align-top">{item.index + 1}.</td>
                  <td className="border border-slate-900 px-2 py-1 align-top">
                    <p className="font-bold">{item.row.section}</p>
                    <RichTextView html={richTextToHtml(item.row.scenario)} />
                  </td>
                  <td className="border border-slate-900 px-2 py-1 align-top">
                    <RichTextView html={richTextToHtml(item.row.expectedResult)} />
                  </td>
                  <td className="border border-slate-900 px-2 py-1 text-center align-top">{item.row.pic}</td>
                </tr>
              </Fragment>
            );
          })}
        </MemoTable>,
      );
      index = nextIndex;
      continue;
    }

    rendered.push(<div key={block.id}>{renderBlock(draft, block)}</div>);
    index += 1;
  }

  return rendered;
}

function PageContent({ draft, page }: { draft: MemoDraft; page: PreviewPage }) {
  return (
    <div
      className="absolute bottom-16 left-24 right-20"
      style={{ top: page.continuationTitle || page.kind === "appendix" ? 96 : 64 }}
    >
      {page.continuationTitle ? (
        <h2 className="mb-5 border-b border-slate-800 pb-3">
          {page.kind === "appendix" ? (
            <>
              <strong className="text-[13.33px]">{page.continuationTitle.replace(", Sambungan", "")}</strong>
              <span className="text-[13.33px]">, Sambungan</span>
            </>
          ) : (
            <>
              <span className="font-[Arial] text-[14.67px]">Perihal: </span>
              <strong className="font-[Arial] text-[16px]">{draft.metadata.perihal}</strong>
              <span className="font-[Arial] text-[14.67px]">, Sambungan</span>
            </>
          )}
        </h2>
      ) : page.kind === "appendix" ? (
        <h2 className="mb-5 text-[13.33px] font-bold">{page.title}</h2>
      ) : null}
      {renderGroupedBlocks(draft, page.blocks)}
      {page.continues && page.kind === "main" ? (
        <p className="mt-3 border-t border-slate-800 pt-1 text-right text-[13.33px] italic">Bersambung ke halaman berikut</p>
      ) : null}
    </div>
  );
}

export function MemoPreview({ draft }: { draft: MemoDraft }) {
  const pages = paginateMemoDraft(draft);

  return (
    <div className="grid gap-8 py-6">
      {pages.map((page, index) => (
        <div key={page.id} className="origin-top">
          <PageContainer orientation={page.orientation}>
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
