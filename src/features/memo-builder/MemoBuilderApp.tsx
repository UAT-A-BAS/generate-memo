"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Check,
  Copy,
  Download,
  FileJson,
  FileText,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCcw,
  Share2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type {
  ActivityRow,
  Bureau,
  DevelopmentRow,
  MemoDraft,
  MemoMetadata,
  MemoType,
  ReviewComment,
  ScenarioRow,
} from "@/types/memo";
import { DateRangePicker } from "@/components/DateRangePicker";
import { DragDropList } from "@/components/DragDropList";
import { RecipientList } from "@/components/RecipientList";
import { SectionTitle } from "@/components/SectionTitle";
import { RichTextEditor } from "@/editor/RichTextEditor";
import { paragraphRichText } from "@/types/richText";
import { richTextToPlainText } from "@/utils/richText";
import {
  createActivityRow,
  createContactRow,
  createDevelopmentRow,
  createScenarioRow,
  createSignerRow,
} from "@/templates/bcaMemoTemplate";
import { generateMemoDocxBlob, memoDocxFileName } from "@/docx/generateDocx";
import { paginateMemoDraft } from "@/pagination/paginate";
import { useMemoDraftStore } from "@/store/useMemoDraftStore";
import { generateMomJsonToMemoDraft } from "@/utils/generateMomJsonToMemoDraft";
import { MemoPreview } from "@/preview/MemoPreview";
import { useMemoCollaboration } from "@/collaboration/useMemoCollaboration";
import { createId } from "@/utils/ids";

const memoTypes: MemoType[] = [
  "Pilot",
  "Nasional",
];

const bureaus: Bureau[] = [
  "A",
  "B",
  "C",
  "D",
];

function scheduleTitle(type: MemoType) {
  return type === "Pilot" ? "Jadwal Pilot Implementasi" : "Jadwal Implementasi";
}

function alphaIndex(index: number) {
  let value = index + 1;
  let result = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }

  return result;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function FieldLabel({
  label,
  children,
  required = false,
  fieldId,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  fieldId?: string;
}) {
  return (
    <label
      className="grid content-start gap-1 text-[13px] font-semibold text-slate-700"
      data-field-id={fieldId}
    >
      <span>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

type ValidationIssue = {
  id: string;
  label: string;
};

function hasText(value?: string) {
  return Boolean(value?.trim());
}

function hasRichText(value: Parameters<typeof richTextToPlainText>[0]) {
  return hasText(richTextToPlainText(value));
}

function validateMemoDraft(draft: MemoDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (id: string, label: string) => issues.push({ id, label });

  if (!hasText(draft.metadata.memoType)) add("memoType", "Jenis Implementasi");
  if (!hasText(draft.metadata.bureau)) add("bureau", "Bureau UAT");
  if (!hasText(draft.metadata.projectName)) add("projectName", "Nama Project");
  if (!hasText(draft.metadata.perihal)) add("perihal", "Perihal");

  draft.recipients.forEach((recipient, index) => {
    if (!hasText(recipient.position)) add(`recipient-${recipient.id}`, `Kepada ${index + 1}: Jabatan / Unit`);
    if (!hasText(recipient.gender)) add(`recipient-gender-${recipient.id}`, `Kepada ${index + 1}: Sapaan`);
  });

  draft.ccRecipients.forEach((recipient, index) => {
    if (!hasText(recipient.position)) add(`recipient-${recipient.id}`, `Tembusan ${index + 1}: Jabatan / Unit`);
    if (!hasText(recipient.gender)) add(`recipient-gender-${recipient.id}`, `Tembusan ${index + 1}: Sapaan`);
  });

  if (draft.metadata.memoType === "Nasional" && draft.referenceEnabled && !hasRichText(draft.reference)) {
    add("reference", "Daftar Referensi");
  }

  draft.developmentRows.forEach((row, index) => {
    if (!hasRichText(row.item)) add(`development-item-${row.id}`, `Lingkup Pengembangan ${index + 1}: Item`);
    if (!hasRichText(row.description)) add(`development-description-${row.id}`, `Lingkup Pengembangan ${index + 1}: Keterangan`);
  });

  if (!hasText(draft.pilotSchedule.startDate) || !hasText(draft.pilotSchedule.endDate)) {
    add("schedule", `${scheduleTitle(draft.metadata.memoType)}: Tanggal`);
  }

  draft.activities.forEach((row, index) => {
    if (!hasText(row.startDate) || !hasText(row.endDate)) add(`activity-date-${row.id}`, `Aktivitas ${index + 1}: Tanggal`);
    if (!hasText(row.owner)) add(`activity-owner-${row.id}`, `Aktivitas ${index + 1}: PIC`);
    if (!hasRichText(row.activity)) add(`activity-text-${row.id}`, `Aktivitas ${index + 1}: Aktivitas`);
  });

  if (draft.metadata.accessLinkEnabled && !hasText(draft.metadata.accessLink)) {
    add("accessLink", "URL Akses");
  }

  draft.contacts.forEach((contact, index) => {
    if (!hasText(contact.name)) add(`contact-name-${contact.id}`, `PIC yang Dapat Dihubungi ${index + 1}: Nama`);
    if (!hasText(contact.email)) add(`contact-email-${contact.id}`, `PIC yang Dapat Dihubungi ${index + 1}: Email`);
  });

  draft.signers.forEach((signer, index) => {
    if (!hasText(signer.name)) add(`signer-name-${signer.id}`, `Signature ${index + 1}: Nama`);
    if (!hasText(signer.title)) add(`signer-title-${signer.id}`, `Signature ${index + 1}: Jabatan`);
  });

  if (!hasText(draft.initials)) add("initials", "Inisial");
  if (!hasText(draft.initialsBureau)) add("initialsBureau", "UAT");

  let effectiveSection = "";
  draft.appendixScenarios.forEach((row, index) => {
    if (hasText(row.section)) effectiveSection = row.section;
    if (!hasText(row.startDate) || !hasText(row.endDate)) add(`scenario-date-${row.id}`, `Lampiran Skenario ${index + 1}: Tanggal`);
    if (!hasText(effectiveSection)) add(`scenario-section-${row.id}`, `Lampiran Skenario ${index + 1}: Bagian`);
    if (!hasText(row.pic)) add(`scenario-pic-${row.id}`, `Lampiran Skenario ${index + 1}: PIC`);
    if (!hasRichText(row.scenario)) add(`scenario-text-${row.id}`, `Lampiran Skenario ${index + 1}: Skenario`);
    if (!hasRichText(row.expectedResult)) add(`scenario-expected-${row.id}`, `Lampiran Skenario ${index + 1}: Expected Result`);
  });

  return issues;
}

function jumpToValidationIssue(issues: ValidationIssue[]) {
  document
    .querySelectorAll(".validation-jump-highlight")
    .forEach((element) => element.classList.remove("validation-jump-highlight"));

  const target = issues
    .map((issue) => document.querySelector<HTMLElement>(`[data-field-id="${issue.id}"]`))
    .find(Boolean);

  if (!target) {
    document.querySelector("[data-validation-panel]")?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    return;
  }

  target.classList.add("validation-jump-highlight");
  target.scrollIntoView({ block: "center", behavior: "smooth" });

  const focusTarget = target.matches("input, textarea, select, .ProseMirror")
    ? target
    : target.querySelector<HTMLElement>("input, textarea, select, .ProseMirror");
  window.setTimeout(() => focusTarget?.focus(), 250);
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-lg border border-[#c6d3e1] bg-white p-3 shadow-sm xl:p-4 ${className}`}>
      {children}
    </section>
  );
}

function IconButton({
  children,
  onClick,
  variant = "secondary",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "word";
  disabled?: boolean;
}) {
  const variants = {
    primary: "border-slate-900 bg-slate-900 text-white hover:bg-slate-800",
    secondary: "border-slate-400 bg-white text-slate-700 hover:bg-slate-50",
    danger: "border-rose-200 bg-white text-rose-600 hover:bg-rose-50",
    word: "border-[#185abd] bg-[#185abd] text-white hover:bg-[#124078]",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

function AppleToolbarButton({
  children,
  onClick,
  disabled,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
}) {
  const tones = {
    default:
      "border-white/70 bg-white/70 text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.06)] hover:bg-white",
    primary:
      "border-[#007aff]/20 bg-[#007aff]/10 text-[#0057b8] shadow-[0_1px_2px_rgba(0,122,255,0.08),0_8px_24px_rgba(0,122,255,0.08)] hover:bg-[#007aff]/15",
    danger:
      "border-rose-200/80 bg-rose-50/80 text-rose-700 shadow-[0_1px_2px_rgba(190,18,60,0.06),0_8px_24px_rgba(190,18,60,0.06)] hover:bg-rose-100/90",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 text-[13px] font-semibold leading-none backdrop-blur-xl transition duration-200 ease-out hover:-translate-y-px focus:outline-none focus:ring-2 focus:ring-[#007aff]/20 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function SyncPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "live" | "saved" | "syncing" | "offline";
}) {
  const toneClass = {
    neutral: "border-white/70 bg-white/55 text-slate-600",
    live: "border-emerald-200/80 bg-emerald-50/80 text-emerald-800",
    saved: "border-emerald-200/80 bg-emerald-50/80 text-emerald-800",
    syncing: "border-amber-200/80 bg-amber-50/85 text-amber-800",
    offline: "border-rose-200/80 bg-rose-50/85 text-rose-700",
  }[tone];
  const dotClass = {
    neutral: "bg-slate-400/80",
    live: "bg-emerald-600",
    saved: "bg-emerald-600",
    syncing: "bg-amber-400",
    offline: "bg-rose-600",
  }[tone];

  return (
    <span
      className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-[12px] font-semibold leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur-xl ${toneClass}`}
      role="status"
      aria-live="polite"
    >
      <span className={`h-2.5 w-2.5 rounded-full shadow-[0_0_0_3px_rgba(255,255,255,0.7)] ${dotClass}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function CollaborationPanel({
  collaboration,
}: {
  collaboration: ReturnType<typeof useMemoCollaboration>;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await collaboration.copyLink();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const syncTone =
    collaboration.status === "saved"
      ? "saved"
      : collaboration.status === "offline"
        ? "offline"
        : "syncing";

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-[22px] border border-white/70 bg-white/45 p-1.5 shadow-[0_12px_36px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-2xl"
      aria-label="Kolaborasi realtime"
      data-review-ignore
    >
      <AppleToolbarButton
        onClick={() => {
          collaboration.start();
          setCopied(false);
        }}
        tone="primary"
      >
        <Share2 size={16} />
        {collaboration.active ? "Restart Collab" : "Start Collab"}
      </AppleToolbarButton>
      {collaboration.active ? (
        <AppleToolbarButton onClick={copyLink}>
          <Copy size={16} />
          {copied ? "Copied" : "Copy Link"}
        </AppleToolbarButton>
      ) : null}
      <SyncPill label={collaboration.modeLabel} tone={collaboration.active ? "live" : "neutral"} />
      <SyncPill label={collaboration.syncLabel} tone={syncTone} />
      <SyncPill label={`Users: ${Math.max(1, collaboration.collaborators.length)}`} tone="neutral" />
      <SyncPill label={`Last synced: ${collaboration.lastSyncedAt ?? "-"}`} tone="neutral" />
    </div>
  );
}

type ReviewTarget = Pick<ReviewComment, "type" | "targetId" | "targetLabel" | "path">;

type CommentDialogState = {
  mode: "add" | "edit";
  target: ReviewTarget;
  commentId?: string;
};

function cleanTargetLabel(value: string) {
  return value
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function elementPathFrom(root: HTMLElement, element: HTMLElement) {
  const path: number[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== root) {
    const parentElement: HTMLElement | null = current.parentElement;
    if (!parentElement) return [];
    path.unshift(Array.from(parentElement.children).indexOf(current));
    current = parentElement;
  }

  return current === root ? path : [];
}

function elementFromPath(root: HTMLElement, path: number[]) {
  return path.reduce<Element | null>((node, index) => node?.children.item(index) ?? null, root);
}

function targetLabelFromElement(element: HTMLElement) {
  const fieldLabel = element.closest("label");
  const labelText = fieldLabel?.querySelector("span")?.textContent ?? fieldLabel?.textContent;
  if (labelText) return cleanTargetLabel(labelText);

  const sectionTitle = element.closest("section")?.querySelector("h2, h3")?.textContent;
  if (sectionTitle) return cleanTargetLabel(sectionTitle);

  return element.dataset.fieldId ?? "Area terkait";
}

function reviewTargetFromElement(element: HTMLElement, root: HTMLElement): ReviewTarget | null {
  const target = element.closest<HTMLElement>("[data-field-id]");
  if (!target) return null;

  return {
    type: "field",
    targetId: target.dataset.fieldId ?? "",
    targetLabel: targetLabelFromElement(target),
    path: elementPathFrom(root, target),
  };
}

function findReviewTargetElement(comment: ReviewComment, root: HTMLElement) {
  if (comment.targetId) {
    const byFieldId = root.querySelector<HTMLElement>(`[data-field-id="${CSS.escape(comment.targetId)}"]`);
    if (byFieldId) return byFieldId;
  }

  if (comment.path.length) {
    const byPath = elementFromPath(root, comment.path);
    if (byPath instanceof HTMLElement) return byPath;
  }

  return null;
}

function focusReviewTarget(comment: ReviewComment, root: HTMLElement | null) {
  if (!root) return;
  document
    .querySelectorAll(".review-target-highlight")
    .forEach((element) => element.classList.remove("review-target-highlight"));

  const target = findReviewTargetElement(comment, root);
  if (!target) return;

  target.classList.add("review-target-highlight");
  target.scrollIntoView({ block: "center", behavior: "smooth", inline: "nearest" });
  const focusTarget = target.matches("input, textarea, select, .ProseMirror")
    ? target
    : target.querySelector<HTMLElement>("input, textarea, select, .ProseMirror");
  window.setTimeout(() => focusTarget?.focus({ preventScroll: true }), 250);
  window.setTimeout(() => target.classList.remove("review-target-highlight"), 4500);
}

function formatCommentTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReviewCommentsPopup({
  open,
  comments,
  commentMode,
  onToggleOpen,
  onToggleCommentMode,
  onFocus,
  onEdit,
  onToggleResolve,
  onDelete,
}: {
  open: boolean;
  comments: ReviewComment[];
  commentMode: boolean;
  onToggleOpen: () => void;
  onToggleCommentMode: () => void;
  onFocus: (comment: ReviewComment) => void;
  onEdit: (comment: ReviewComment) => void;
  onToggleResolve: (comment: ReviewComment) => void;
  onDelete: (comment: ReviewComment) => void;
}) {
  const sortedComments = [...comments].sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
  });

  return (
    <div data-review-ignore>
      {open ? (
        <section
          id="review-comments-popup"
          className="fixed bottom-[96px] right-4 z-50 grid max-h-[70dvh] w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-[#c6d3e1] bg-white shadow-2xl"
          aria-labelledby="review-comments-title"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 id="review-comments-title" className="text-sm font-bold text-[#0f2d4a]">
                Komentar Review
              </h2>
              <p className="text-xs font-semibold text-slate-500">
                {comments.length} komentar
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onToggleCommentMode}
                aria-pressed={commentMode}
                className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-bold transition focus:outline-none focus:ring-2 focus:ring-slate-900/10 ${
                  commentMode
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <MessageSquare size={15} />
                Add Comment
              </button>
              <button
                type="button"
                onClick={onToggleOpen}
                className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Tutup komentar review"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="overflow-auto p-3">
            {sortedComments.length ? (
              <div className="grid gap-2">
                {sortedComments.map((comment) => (
                  <article
                    key={comment.id}
                    className={`rounded-md border p-3 ${
                      comment.resolved
                        ? "border-slate-200 bg-slate-50 text-slate-500"
                        : "border-[#c6d3e1] bg-white text-slate-900"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
                      <span className={comment.resolved ? "text-slate-500" : "text-emerald-700"}>
                        {comment.resolved ? "Resolved" : "Unresolved"}
                      </span>
                      <span className="text-slate-400">/</span>
                      <span>{comment.author || "Reviewer"}</span>
                      <span className="text-slate-400">/</span>
                      <span>{formatCommentTime(comment.updatedAt || comment.createdAt)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onFocus(comment)}
                      className="mt-2 text-left text-sm font-bold text-[#185abd] underline-offset-2 hover:underline"
                    >
                      Lihat field: {comment.targetLabel}
                    </button>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-5">{comment.text}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onToggleResolve(comment)}
                        className="grid h-8 w-8 place-items-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                        aria-label={comment.resolved ? "Reopen komentar" : "Resolve komentar"}
                        title={comment.resolved ? "Reopen komentar" : "Resolve komentar"}
                      >
                        {comment.resolved ? <RefreshCcw size={14} /> : <Check size={15} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => onEdit(comment)}
                        className="grid h-8 w-8 place-items-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
                        aria-label={comment.resolved ? "Follow up komentar" : "Edit komentar"}
                        title={comment.resolved ? "Follow up komentar" : "Edit komentar"}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(comment)}
                        className="grid h-8 w-8 place-items-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                        aria-label="Hapus komentar"
                        title="Hapus komentar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm font-semibold text-slate-500">
                Belum ada komentar review.
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ReviewCommentDialog({
  state,
  author,
  text,
  onAuthorChange,
  onTextChange,
  onCancel,
  onSave,
}: {
  state: CommentDialogState | null;
  author: string;
  text: string;
  onAuthorChange: (value: string) => void;
  onTextChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  if (!state) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 px-4" data-review-ignore>
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#0f2d4a]">
              {state.mode === "edit" ? "Edit komentar" : "Tambah komentar"}
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">{state.target.targetLabel}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label="Tutup komentar"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          <FieldLabel label="Nama Reviewer" required>
            <input
              value={author}
              onChange={(event) => onAuthorChange(event.target.value)}
              className="h-10 rounded-md border border-slate-400 px-3 text-[15px] font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              autoFocus
            />
          </FieldLabel>
          <FieldLabel label="Komentar" required>
            <textarea
              value={text}
              rows={4}
              onChange={(event) => onTextChange(event.target.value)}
              className="min-h-28 resize-y rounded-md border border-slate-400 px-3 py-2 text-[15px] font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
          </FieldLabel>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <IconButton onClick={onCancel}>Batal</IconButton>
          <IconButton onClick={onSave} variant="primary">Simpan</IconButton>
        </div>
      </section>
    </div>
  );
}

function MetadataPanel({
  metadata,
  updateMetadata,
}: {
  metadata: MemoMetadata;
  updateMetadata: (patch: Partial<MemoMetadata>) => void;
}) {
  const { register, reset } = useForm<MemoMetadata>({
    defaultValues: metadata,
  });

  useEffect(() => {
    reset(metadata);
  }, [metadata, reset]);

  function registerField<K extends keyof MemoMetadata>(name: K) {
    const field = register(name);
    return {
      ...field,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        field.onChange(event);
        const target = event.target;
        const value =
          target instanceof HTMLInputElement && target.type === "checkbox"
            ? target.checked
            : target.value;

        updateMetadata({ [name]: value } as Partial<MemoMetadata>);
      },
    };
  }

  return (
    <Panel>
      <SectionTitle title="Metadata" />
      <div className="mt-5 grid gap-5">
        <div className="grid gap-3 md:grid-cols-2">
          <FieldLabel label="Jenis Implementasi" fieldId="memoType" required>
            <select
              {...registerField("memoType")}
              className="h-10 rounded-md border border-slate-400 bg-white px-3 text-[15px] font-medium text-slate-950 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            >
              {memoTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </FieldLabel>
          <FieldLabel label="Bureau UAT" fieldId="bureau" required>
            <select
              {...registerField("bureau")}
              className="h-10 rounded-md border border-slate-400 bg-white px-3 text-[15px] font-medium text-slate-950 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            >
              {bureaus.map((bureau) => (
                <option key={bureau}>{bureau}</option>
              ))}
            </select>
          </FieldLabel>
        </div>
        <FieldLabel label="Nama Project" fieldId="projectName" required>
          <input
            {...registerField("projectName")}
            className="h-10 rounded-md border border-slate-400 px-3 text-[15px] font-medium text-slate-950 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
        </FieldLabel>
        <div className="grid gap-2">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              {...registerField("autoPerihal")}
              className="h-4 w-4 rounded border-slate-400 text-slate-900 focus:ring-slate-900"
            />
            Perihal otomatis
          </label>
          {metadata.autoPerihal ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
              {metadata.perihal}
            </div>
          ) : (
            <FieldLabel label="Perihal" fieldId="perihal" required>
              <input
                {...registerField("perihal")}
                className="h-10 rounded-md border border-slate-400 px-3 text-[15px] font-medium text-slate-950 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              />
            </FieldLabel>
          )}
        </div>
      </div>
    </Panel>
  );
}

function DevelopmentPanel({
  rows,
  updateDraft,
}: {
  rows: DevelopmentRow[];
  updateDraft: (updater: (draft: MemoDraft) => MemoDraft) => void;
}) {
  function setRows(nextRows: DevelopmentRow[]) {
    updateDraft((draft) => ({ ...draft, developmentRows: nextRows }));
  }

  return (
    <Panel>
      <SectionTitle title="Lingkup Pengembangan" />
      <div className="mt-4">
        <DragDropList
          items={rows}
          onReorder={setRows}
          itemLabel={(_, index) => `lingkup ${index + 1}`}
          renderItem={(row, index) => (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">Baris {index + 1}</p>
                <button
                  type="button"
                  onClick={() => {
                    const nextRows = rows.filter((item) => item.id !== row.id);
                    setRows(nextRows.length ? nextRows : [createDevelopmentRow()]);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                  aria-label="Hapus lingkup"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="grid items-start gap-3 xl:grid-cols-2">
                <FieldLabel label="Item" fieldId={`development-item-${row.id}`} required>
                  <RichTextEditor
                    value={row.item}
                    minHeight={92}
                    onChange={(value) =>
                      setRows(rows.map((item) => (item.id === row.id ? { ...item, item: value } : item)))
                    }
                  />
                </FieldLabel>
                <FieldLabel label="Keterangan" fieldId={`development-description-${row.id}`} required>
                  <RichTextEditor
                    value={row.description}
                    minHeight={92}
                    onChange={(value) =>
                      setRows(
                        rows.map((item) =>
                          item.id === row.id ? { ...item, description: value } : item,
                        ),
                      )
                    }
                  />
                </FieldLabel>
              </div>
            </div>
          )}
        />
      </div>
      <div className="mt-3 flex justify-end">
        <IconButton onClick={() => setRows([...rows, createDevelopmentRow()])}>
          <Plus size={16} />
          Row
        </IconButton>
      </div>
    </Panel>
  );
}

function ActivitiesPanel({
  rows,
  updateDraft,
}: {
  rows: ActivityRow[];
  updateDraft: (updater: (draft: MemoDraft) => MemoDraft) => void;
}) {
  function setRows(nextRows: ActivityRow[]) {
    updateDraft((draft) => ({ ...draft, activities: nextRows }));
  }

  return (
    <Panel>
      <SectionTitle title="Aktivitas Cabang dan Unit Kerja" />
      <div className="mt-4">
        <DragDropList
          items={rows}
          onReorder={setRows}
          itemLabel={(row, index) => row.owner || `aktivitas ${index + 1}`}
          renderItem={(row) => (
            <div className="grid gap-3">
              <div className="grid items-end gap-3 xl:grid-cols-[minmax(220px,1fr)_minmax(180px,0.8fr)_38px]">
                <FieldLabel label="Tanggal" fieldId={`activity-date-${row.id}`} required>
                  <DateRangePicker
                    compact
                    startDate={row.startDate}
                    endDate={row.endDate}
                    onChange={(value) =>
                      setRows(rows.map((item) => (item.id === row.id ? { ...item, ...value } : item)))
                    }
                  />
                </FieldLabel>
                <FieldLabel label="PIC" fieldId={`activity-owner-${row.id}`} required>
                  <input
                    value={row.owner}
                    onChange={(event) =>
                      setRows(
                        rows.map((item) =>
                          item.id === row.id ? { ...item, owner: event.target.value } : item,
                        ),
                      )
                    }
                    className="h-10 rounded-md border border-slate-400 px-3 text-[15px] font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  />
                </FieldLabel>
                <button
                  type="button"
                  onClick={() => setRows(rows.filter((item) => item.id !== row.id))}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                  aria-label="Hapus aktivitas"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <FieldLabel label="Aktivitas" fieldId={`activity-text-${row.id}`} required>
                <RichTextEditor
                  value={row.activity}
                  minHeight={92}
                  onChange={(value) =>
                    setRows(rows.map((item) => (item.id === row.id ? { ...item, activity: value } : item)))
                  }
                />
              </FieldLabel>
            </div>
          )}
        />
      </div>
      <div className="mt-3 flex justify-end">
        <IconButton onClick={() => setRows([...rows, createActivityRow()])}>
          <Plus size={16} />
          Aktivitas
        </IconButton>
      </div>
    </Panel>
  );
}

function ReferencePanel({
  draft,
  updateDraft,
}: {
  draft: MemoDraft;
  updateDraft: (updater: (draft: MemoDraft) => MemoDraft) => void;
}) {
  if (draft.metadata.memoType !== "Nasional") return null;

  return (
    <Panel>
      <SectionTitle title="Referensi" />
      <div className="mt-6 grid gap-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={draft.referenceEnabled}
            onChange={(event) =>
              updateDraft((current) => ({ ...current, referenceEnabled: event.target.checked }))
            }
            className="h-4 w-4 rounded border-slate-400 text-slate-900 focus:ring-slate-900"
          />
          Tampilkan Referensi
        </label>
        {draft.referenceEnabled ? (
          <div className="grid gap-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              Memorandum ini mengacu pada.
            </div>
            <FieldLabel label="Daftar Referensi" fieldId="reference" required>
              <textarea
                value={richTextToPlainText(draft.reference)}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    reference: paragraphRichText(event.target.value),
                  }))
                }
                rows={5}
                className="min-h-28 rounded-md border border-slate-400 bg-white px-3 py-2 text-[15px] font-medium text-slate-950 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              />
            </FieldLabel>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function ContactsPanel({
  draft,
  updateDraft,
}: {
  draft: MemoDraft;
  updateDraft: (updater: (draft: MemoDraft) => MemoDraft) => void;
}) {
  function setRows(contacts: MemoDraft["contacts"]) {
    updateDraft((current) => ({ ...current, contacts }));
  }

  return (
    <Panel>
      <SectionTitle title="PIC yang Dapat Dihubungi" />
      <div className="mt-4">
        <DragDropList
          items={draft.contacts}
          onReorder={setRows}
          itemLabel={(contact, index) => contact.name || `PIC ${index + 1}`}
          renderItem={(contact) => (
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_40px]">
              <FieldLabel label="Nama" fieldId={`contact-name-${contact.id}`} required>
                <input
                  value={contact.name}
                  onChange={(event) =>
                    setRows(
                      draft.contacts.map((item) =>
                        item.id === contact.id ? { ...item, name: event.target.value } : item,
                      ),
                    )
                  }
                  className="h-10 rounded-md border border-slate-400 px-3 text-[15px] font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </FieldLabel>
              <FieldLabel label="Email" fieldId={`contact-email-${contact.id}`} required>
                <input
                  value={contact.email}
                  onChange={(event) =>
                    setRows(
                      draft.contacts.map((item) =>
                        item.id === contact.id ? { ...item, email: event.target.value } : item,
                      ),
                    )
                  }
                  className="h-10 rounded-md border border-slate-400 px-3 text-[15px] font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </FieldLabel>
              <button
                type="button"
                onClick={() => setRows(draft.contacts.filter((item) => item.id !== contact.id))}
                className="mt-5 flex h-10 w-10 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                aria-label="Hapus PIC"
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}
        />
      </div>
      <div className="mt-3 flex justify-end">
        <IconButton
          onClick={() =>
            updateDraft((current) => ({
              ...current,
              contacts: [...current.contacts, createContactRow()],
            }))
          }
        >
          <Plus size={16} />
          PIC
        </IconButton>
      </div>
    </Panel>
  );
}

function AttachmentsPanel({
  enabled,
  attachments,
  updateDraft,
}: {
  enabled: boolean;
  attachments: string;
  updateDraft: (updater: (draft: MemoDraft) => MemoDraft) => void;
}) {
  return (
    <Panel>
      <SectionTitle title="Lampiran" />
      <div className="mt-6 grid gap-3">
        <fieldset className="grid gap-2">
          <legend className="text-xs font-medium text-slate-600">Memo memiliki Lampiran?</legend>
          <div className="flex gap-2">
            {[
              ["Tidak", false],
              ["Ya", true],
            ].map(([label, value]) => (
              <label
                key={String(label)}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-400 bg-white px-3 text-sm font-medium text-slate-700"
              >
                <input
                  type="radio"
                  checked={enabled === value}
                  onChange={() =>
                    updateDraft((current) => ({ ...current, attachmentsEnabled: Boolean(value) }))
                  }
                  className="h-4 w-4 border-slate-400 text-slate-900 focus:ring-slate-900"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        {enabled ? (
          <FieldLabel label="Daftar lampiran" fieldId="attachments">
            <textarea
              value={attachments}
              rows={5}
              onChange={(event) =>
                updateDraft((current) => ({ ...current, attachments: event.target.value }))
              }
              className="min-h-28 w-full resize-y rounded-md border border-slate-400 bg-white px-3 py-2 text-[15px] font-medium text-slate-950 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
          </FieldLabel>
        ) : null}
      </div>
    </Panel>
  );
}

type ScenarioDateGroup = {
  id: string;
  startDate: string;
  endDate: string;
  rows: ScenarioRow[];
};

type ScenarioSectionGroup = {
  id: string;
  marker: string;
  title: string;
  rows: ScenarioRow[];
};

function scenarioDateKey(row: ScenarioRow) {
  return row.startDate || row.endDate
    ? `date:${row.startDate}:${row.endDate}`
    : `group:${row.dateGroupId ?? row.id}`;
}

function scenarioDateGroups(rows: ScenarioRow[]) {
  const groups: ScenarioDateGroup[] = [];
  const indexByKey = new Map<string, number>();

  rows.forEach((row) => {
    const key = scenarioDateKey(row);
    const existingIndex = indexByKey.get(key);

    if (existingIndex !== undefined) {
      groups[existingIndex].rows.push(row);
      return;
    }

    indexByKey.set(key, groups.length);
    groups.push({
      id: row.dateGroupId ?? createId("scenario-date"),
      startDate: row.startDate,
      endDate: row.endDate,
      rows: [row],
    });
  });

  return groups;
}

function scenarioSectionGroups(rows: ScenarioRow[]) {
  const sections: ScenarioSectionGroup[] = [];
  const indexByKey = new Map<string, number>();

  rows.forEach((row) => {
    const title = row.section.trim();
    const key = title ? `section:${title}` : `group:${row.sectionGroupId ?? row.id}`;
    const existingIndex = indexByKey.get(key);

    if (existingIndex !== undefined) {
      sections[existingIndex].rows.push(row);
      return;
    }

    indexByKey.set(key, sections.length);
    sections.push({
      id: row.sectionGroupId ?? row.id,
      marker: alphaIndex(sections.length),
      title: row.section,
      rows: [row],
    });
  });

  return sections;
}

function AppendixPanel({
  rows,
  updateDraft,
  onGenerateDocx,
  isExporting,
  validationIssues,
}: {
  rows: ScenarioRow[];
  updateDraft: (updater: (draft: MemoDraft) => MemoDraft) => void;
  onGenerateDocx: () => void;
  isExporting: boolean;
  validationIssues: ValidationIssue[];
}) {
  function setRows(nextRows: ScenarioRow[]) {
    updateDraft((draft) => ({ ...draft, appendixScenarios: nextRows }));
  }

  const groups = scenarioDateGroups(rows);

  function updateGroupDates(group: ScenarioDateGroup, value: { startDate: string; endDate: string }) {
    const ids = new Set(group.rows.map((row) => row.id));
    setRows(
      rows.map((row) =>
        ids.has(row.id)
          ? { ...row, dateGroupId: group.id, startDate: value.startDate, endDate: value.endDate }
          : row,
      ),
    );
  }

  function replaceSectionRows(section: ScenarioSectionGroup, nextSectionRows: ScenarioRow[]) {
    const ids = new Set(section.rows.map((row) => row.id));
    let inserted = false;
    const nextRows = rows.flatMap((row) => {
      if (!ids.has(row.id)) return [row];
      if (inserted) return [];
      inserted = true;
      return nextSectionRows;
    });

    setRows(nextRows.length ? nextRows : [createScenarioRow()]);
  }

  function updateSectionTitle(section: ScenarioSectionGroup, title: string) {
    const ids = new Set(section.rows.map((row) => row.id));
    setRows(rows.map((row) => (ids.has(row.id) ? { ...row, section: title } : row)));
  }

  function addScenarioToSection(group: ScenarioDateGroup, section: ScenarioSectionGroup) {
    const ids = new Set(section.rows.map((row) => row.id));
    let lastIndex = -1;
    rows.forEach((row, index) => {
      if (ids.has(row.id)) lastIndex = index;
    });

    const nextRow = createScenarioRow({
      dateGroupId: group.id,
      sectionGroupId: section.id,
      startDate: group.startDate,
      endDate: group.endDate,
      section: section.title,
    });

    setRows([
      ...rows.slice(0, lastIndex + 1),
      nextRow,
      ...rows.slice(lastIndex + 1),
    ]);
  }

  function addSectionToGroup(group: ScenarioDateGroup) {
    const ids = new Set(group.rows.map((row) => row.id));
    let lastIndex = -1;
    rows.forEach((row, index) => {
      if (ids.has(row.id)) lastIndex = index;
    });

    const nextRow = createScenarioRow({
      dateGroupId: group.id,
      startDate: group.startDate,
      endDate: group.endDate,
    });

    setRows([
      ...rows.slice(0, lastIndex + 1),
      nextRow,
      ...rows.slice(lastIndex + 1),
    ]);
  }

  function addDateAfterGroup(group: ScenarioDateGroup) {
    const ids = new Set(group.rows.map((row) => row.id));
    let lastIndex = -1;
    rows.forEach((row, index) => {
      if (ids.has(row.id)) lastIndex = index;
    });

    setRows([
      ...rows.slice(0, lastIndex + 1),
      createScenarioRow({ dateGroupId: createId("scenario-date") }),
      ...rows.slice(lastIndex + 1),
    ]);
  }

  return (
    <Panel>
      <SectionTitle title="Lampiran Skenario" />
      <div className="mt-4 grid gap-4">
        {groups.map((group, groupIndex) => (
          <section key={group.id} className="rounded-md border border-slate-300 bg-slate-50 p-3">
            <div className="mb-3 grid items-end gap-3 md:grid-cols-[minmax(220px,0.9fr)_1fr]">
              <FieldLabel label={`Tanggal ${groupIndex + 1}`} fieldId={`scenario-date-${group.rows[0]?.id}`} required>
                <DateRangePicker
                  compact
                  startDate={group.startDate}
                  endDate={group.endDate}
                  onChange={(value) => updateGroupDates(group, value)}
                />
              </FieldLabel>
            </div>
            <div className="grid gap-3">
              {scenarioSectionGroups(group.rows).map((section) => (
                <section key={section.id} className="rounded-md border border-slate-300 bg-white p-3">
                  <FieldLabel label="Bagian" fieldId={`scenario-section-${section.rows[0]?.id}`} required>
                    <div className="grid grid-cols-[42px_1fr] overflow-hidden rounded-md border border-slate-400 bg-white focus-within:border-slate-900 focus-within:ring-2 focus-within:ring-slate-900/10">
                      <span className="flex items-center justify-center border-r border-slate-300 bg-slate-100 text-sm font-bold text-[#0f2d4a]">
                        {section.marker}
                      </span>
                      <textarea
                        value={section.title}
                        rows={1}
                        onChange={(event) => updateSectionTitle(section, event.target.value)}
                        className="min-h-10 resize-y border-0 px-3 py-[11px] text-[15px] font-medium leading-[18px] outline-none"
                      />
                    </div>
                  </FieldLabel>
                  <div className="mt-3">
                    <DragDropList
                      items={section.rows}
                      onReorder={(nextSectionRows) => replaceSectionRows(section, nextSectionRows)}
                      itemLabel={(_, index) => `skenario ${index + 1}`}
                      renderItem={(row, rowIndex) => (
                        <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-900">
                              Skenario {rowIndex + 1}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                const nextRows = rows.filter((item) => item.id !== row.id);
                                setRows(nextRows.length ? nextRows : [createScenarioRow()]);
                              }}
                              className="flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 bg-white text-rose-600 hover:bg-rose-50"
                              aria-label="Hapus skenario"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(160px,0.62fr)]">
                            <FieldLabel label="Skenario" fieldId={`scenario-text-${row.id}`} required>
                              <RichTextEditor
                                value={row.scenario}
                                minHeight={92}
                                onChange={(value) =>
                                  setRows(rows.map((item) => (item.id === row.id ? { ...item, scenario: value } : item)))
                                }
                              />
                            </FieldLabel>
                            <FieldLabel label="Expected Result" fieldId={`scenario-expected-${row.id}`} required>
                              <RichTextEditor
                                value={row.expectedResult}
                                minHeight={92}
                                onChange={(value) =>
                                  setRows(
                                    rows.map((item) =>
                                      item.id === row.id ? { ...item, expectedResult: value } : item,
                                    ),
                                  )
                                }
                              />
                            </FieldLabel>
                            <FieldLabel label="PIC" fieldId={`scenario-pic-${row.id}`} required>
                              <textarea
                                value={row.pic}
                                rows={5}
                                onChange={(event) =>
                                  setRows(rows.map((item) => (item.id === row.id ? { ...item, pic: event.target.value } : item)))
                                }
                                className="min-h-[132px] resize-y rounded-md border border-slate-400 bg-white px-3 py-2 text-[15px] font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                              />
                            </FieldLabel>
                          </div>
                        </div>
                      )}
                    />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <IconButton onClick={() => addScenarioToSection(group, section)}>
                      <Plus size={16} />
                      Skenario
                    </IconButton>
                  </div>
                </section>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <IconButton onClick={() => addDateAfterGroup(group)}>
                <Plus size={16} />
                Tanggal
              </IconButton>
              <IconButton onClick={() => addSectionToGroup(group)}>
                <Plus size={16} />
                Bagian
              </IconButton>
            </div>
          </section>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
        <span />
        <IconButton onClick={onGenerateDocx} disabled={isExporting} variant="word">
          <Download size={16} />
          Generate Docx
        </IconButton>
      </div>
      {validationIssues.length ? (
        <div
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
          aria-live="polite"
          data-validation-panel
        >
          <p className="font-bold">Generate Docx ditahan. Field mandatory berikut masih kosong:</p>
          <ul className="mt-2 grid gap-1">
            {validationIssues.slice(0, 8).map((issue) => (
              <li key={issue.id}>- {issue.label}</li>
            ))}
          </ul>
          {validationIssues.length > 8 ? (
            <p className="mt-2 font-semibold">+ {validationIssues.length - 8} field lain.</p>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

export function MemoBuilderApp() {
  const appRootRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [commentMode, setCommentMode] = useState(false);
  const [commentDialog, setCommentDialog] = useState<CommentDialogState | null>(null);
  const [commentAuthor, setCommentAuthor] = useState("");
  const [commentText, setCommentText] = useState("");
  const draft = useMemoDraftStore((state) => state.draft);
  const hasLoaded = useMemoDraftStore((state) => state.hasLoaded);
  const updateDraft = useMemoDraftStore((state) => state.updateDraft);
  const updateMetadata = useMemoDraftStore((state) => state.updateMetadata);
  const replaceDraft = useMemoDraftStore((state) => state.replaceDraft);
  const loadFromLocal = useMemoDraftStore((state) => state.loadFromLocal);
  const saveToLocal = useMemoDraftStore((state) => state.saveToLocal);
  const importDraft = useMemoDraftStore((state) => state.importDraft);
  const resetDraft = useMemoDraftStore((state) => state.resetDraft);
  const collaboration = useMemoCollaboration(draft, replaceDraft);

  const pages = useMemo(() => paginateMemoDraft(draft), [draft]);

  useEffect(() => {
    loadFromLocal();
  }, [loadFromLocal]);

  useEffect(() => {
    if (!hasLoaded) return;
    const timer = window.setInterval(saveToLocal, 3000);
    return () => window.clearInterval(timer);
  }, [hasLoaded, saveToLocal]);

  useEffect(() => {
    document.body.classList.toggle("is-review-commenting", commentMode);
    return () => document.body.classList.remove("is-review-commenting");
  }, [commentMode]);

  function saveDraftData() {
    downloadBlob(
      new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
      `memo-draft-${draft.id}.json`,
    );
  }

  function handleResetDraft() {
    if (
      collaboration.active &&
      !window.confirm("Reset akan menghapus data shared room untuk semua user. Lanjutkan?")
    ) {
      return;
    }
    resetDraft();
    setValidationIssues([]);
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const payload = JSON.parse(text);
    const mapped =
      payload.appendixScenarios || payload.metadata ? payload : generateMomJsonToMemoDraft(payload);

    importDraft(mapped);
    setValidationIssues([]);
    event.target.value = "";
  }

  async function exportDocx() {
    const issues = validateMemoDraft(draft);
    setValidationIssues(issues);
    if (issues.length) {
      window.requestAnimationFrame(() => jumpToValidationIssue(issues));
      return;
    }

    setIsExporting(true);
    try {
      const blob = await generateMemoDocxBlob(draft);
      downloadBlob(blob, memoDocxFileName(draft));
      setValidationIssues([]);
    } finally {
      setIsExporting(false);
    }
  }

  function openCommentDialog(target: ReviewTarget) {
    setReviewOpen(true);
    setCommentAuthor("");
    setCommentText("");
    setCommentDialog({ mode: "add", target });
  }

  function openEditComment(comment: ReviewComment) {
    setReviewOpen(true);
    setCommentMode(false);
    setCommentAuthor(comment.author);
    setCommentText(comment.text);
    setCommentDialog({
      mode: "edit",
      commentId: comment.id,
      target: {
        type: comment.type,
        targetId: comment.targetId,
        targetLabel: comment.targetLabel,
        path: comment.path,
      },
    });
  }

  function handleReviewTargetClick(event: React.MouseEvent<HTMLElement>) {
    if (!commentMode || !appRootRef.current) return;
    const element = event.target instanceof HTMLElement ? event.target : null;
    if (!element || element.closest("[data-review-ignore]")) return;

    const target = reviewTargetFromElement(element, appRootRef.current);
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();
    openCommentDialog(target);
  }

  function updateReviewComments(updater: (comments: ReviewComment[]) => ReviewComment[]) {
    updateDraft((current) => ({
      ...current,
      reviewComments: updater(current.reviewComments ?? []),
    }));
  }

  function saveReviewComment() {
    if (!commentDialog) return;

    const author = commentAuthor.trim();
    const text = commentText.trim();
    if (!author || !text) return;

    const now = new Date().toISOString();

    updateReviewComments((comments) => {
      if (commentDialog.mode === "edit" && commentDialog.commentId) {
        return comments.map((comment) =>
          comment.id === commentDialog.commentId
            ? {
                ...comment,
                ...commentDialog.target,
                author,
                text,
                resolved: false,
                updatedAt: now,
              }
            : comment,
        );
      }

      return [
        ...comments,
        {
          id: createId("comment"),
          ...commentDialog.target,
          author,
          text,
          resolved: false,
          createdAt: now,
          updatedAt: now,
        },
      ];
    });

    setCommentDialog(null);
    setCommentMode(false);
    setReviewOpen(true);
  }

  function toggleResolveComment(comment: ReviewComment) {
    const now = new Date().toISOString();
    updateReviewComments((comments) =>
      comments.map((item) =>
        item.id === comment.id
          ? { ...item, resolved: !item.resolved, updatedAt: now }
          : item,
      ),
    );
  }

  function deleteReviewComment(comment: ReviewComment) {
    updateReviewComments((comments) => comments.filter((item) => item.id !== comment.id));
  }

  const unresolvedReviewCount = (draft.reviewComments ?? []).filter((comment) => !comment.resolved).length;

  if (!hasLoaded) {
    return (
      <main className="grid min-h-dvh place-items-center bg-slate-100">
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-600 shadow-sm">
          Memuat draft lokal...
        </div>
      </main>
    );
  }

  return (
    <main
      ref={appRootRef}
      onClickCapture={handleReviewTargetClick}
      className="min-h-dvh bg-slate-100 text-slate-950"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImport}
      />
      <header className="sticky top-0 z-30 border-b border-[#d8e2ec] bg-white/95 backdrop-blur">
        <div className="flex w-full flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between xl:px-6">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-[#0f2d4a]">Memo Generator</h1>
            <p className="hidden">
              {draft.metadata.perihal} - {pages.length} preview pages -{" "}
              {" "}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2" data-review-ignore>
            <CollaborationPanel collaboration={collaboration} />
            <AppleToolbarButton onClick={saveDraftData}>
              <FileJson size={16} />
              Save
            </AppleToolbarButton>
            <AppleToolbarButton onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
              Load
            </AppleToolbarButton>
            <AppleToolbarButton onClick={handleResetDraft} tone="danger">
              <RefreshCcw size={16} />
              Reset
            </AppleToolbarButton>
          </div>
        </div>
      </header>

      <div className="grid w-full gap-3 px-3 py-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] xl:px-4">
        <div className="grid min-w-0 content-start gap-3">
          <Panel>
            <SectionTitle title="Kepada" />
            <div className="mt-6">
              <RecipientList
                recipients={draft.recipients}
                onChange={(recipients) => updateDraft((current) => ({ ...current, recipients }))}
              />
            </div>
          </Panel>

          <MetadataPanel
            key={draft.id}
            metadata={draft.metadata}
            updateMetadata={updateMetadata}
          />

          <ReferencePanel draft={draft} updateDraft={updateDraft} />

          <DevelopmentPanel rows={draft.developmentRows} updateDraft={updateDraft} />

          <Panel>
            <SectionTitle title={scheduleTitle(draft.metadata.memoType)} />
            <div className="mt-6">
              <FieldLabel label="Tanggal" fieldId="schedule" required>
                <DateRangePicker
                  startDate={draft.pilotSchedule.startDate}
                  endDate={draft.pilotSchedule.endDate}
                  onChange={(pilotSchedule) =>
                    updateDraft((current) => ({ ...current, pilotSchedule }))
                  }
                />
              </FieldLabel>
            </div>
          </Panel>

          <ActivitiesPanel rows={draft.activities} updateDraft={updateDraft} />

          <Panel>
            <SectionTitle title="Akses Link" />
            <div className="mt-6 grid gap-3">
              <fieldset className="grid gap-2">
                <legend className="text-xs font-medium text-slate-600">Memo memerlukan Akses Link?</legend>
                <div className="flex gap-2">
                  {[
                    ["Tidak", false],
                    ["Ya", true],
                  ].map(([label, value]) => (
                    <label
                      key={String(label)}
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-400 bg-white px-3 text-sm font-medium text-slate-700"
                    >
                      <input
                        type="radio"
                        checked={draft.metadata.accessLinkEnabled === value}
                        onChange={() => updateMetadata({ accessLinkEnabled: Boolean(value) })}
                        className="h-4 w-4 border-slate-400 text-slate-900 focus:ring-slate-900"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <FieldLabel label="URL Akses" fieldId="accessLink" required={draft.metadata.accessLinkEnabled}>
                <input
                  value={draft.metadata.accessLink}
                  disabled={!draft.metadata.accessLinkEnabled}
                  onChange={(event) => updateMetadata({ accessLink: event.target.value })}
                  className="h-10 rounded-md border border-slate-400 px-3 text-[15px] font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100 disabled:text-slate-400"
                />
              </FieldLabel>
            </div>
          </Panel>

          <AttachmentsPanel
            enabled={draft.attachmentsEnabled}
            attachments={draft.attachments}
            updateDraft={updateDraft}
          />

          <ContactsPanel draft={draft} updateDraft={updateDraft} />

          <Panel>
            <SectionTitle title="Signature" />
            <div className="mt-6 grid gap-3">
              {draft.signers.map((signer) => (
                <div key={signer.id} className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-[1fr_1fr_40px]">
                  <FieldLabel label="Nama" fieldId={`signer-name-${signer.id}`} required>
                    <input
                      value={signer.name}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          signers: current.signers.map((item) =>
                            item.id === signer.id ? { ...item, name: event.target.value } : item,
                          ),
                        }))
                      }
                      className="h-10 rounded-md border border-slate-400 px-3 text-[15px] font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    />
                  </FieldLabel>
                  <FieldLabel label="Jabatan" fieldId={`signer-title-${signer.id}`} required>
                    <input
                      value={signer.title}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          signers: current.signers.map((item) =>
                            item.id === signer.id ? { ...item, title: event.target.value } : item,
                          ),
                        }))
                      }
                      className="h-10 rounded-md border border-slate-400 px-3 text-[15px] font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    />
                  </FieldLabel>
                  <button
                    type="button"
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        signers: current.signers.filter((item) => item.id !== signer.id),
                      }))
                    }
                    className="mt-5 flex h-10 w-10 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                    aria-label="Hapus signer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <IconButton
                onClick={() =>
                  updateDraft((current) => ({
                    ...current,
                    signers: [...current.signers, createSignerRow()],
                  }))
                }
              >
                <Plus size={16} />
                Signer
              </IconButton>
            </div>
          </Panel>

          <Panel>
            <SectionTitle title="Tembusan" />
            <div className="mt-6">
              <RecipientList
                recipients={draft.ccRecipients}
                onChange={(ccRecipients) =>
                  updateDraft((current) => ({ ...current, ccRecipients }))
                }
              />
            </div>
          </Panel>

          <Panel>
            <SectionTitle title="Inisial" />
            <div className="mt-6 grid items-end gap-3 md:grid-cols-[1fr_140px]">
              <FieldLabel label="Inisial" fieldId="initials" required>
                <input
                  value={draft.initials}
                  onChange={(event) =>
                    updateDraft((current) => ({ ...current, initials: event.target.value }))
                  }
                  className="h-10 w-full rounded-md border border-slate-400 px-3 text-[15px] font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </FieldLabel>
              <FieldLabel label="UAT" fieldId="initialsBureau" required>
                <select
                  value={draft.initialsBureau}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      initialsBureau: event.target.value as Bureau,
                    }))
                  }
                  className="h-10 rounded-md border border-slate-400 bg-white px-3 text-[15px] font-medium text-slate-950 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                >
                  {bureaus.map((bureau) => (
                    <option key={bureau} value={bureau}>UAT {bureau}</option>
                  ))}
                </select>
              </FieldLabel>
            </div>
          </Panel>

          <AppendixPanel
            rows={draft.appendixScenarios}
            updateDraft={updateDraft}
            onGenerateDocx={exportDocx}
            isExporting={isExporting}
            validationIssues={validationIssues}
          />
        </div>

        <aside
          className="sticky top-[76px] max-h-[calc(100dvh-92px)] min-w-0 self-start overflow-hidden rounded-lg border border-[#d8e2ec] bg-[#edf4fb]"
        >
          <div className="max-h-[calc(100dvh-92px)] overflow-auto">
            <div className="flex items-center justify-between border-b border-[#d8e2ec] bg-white px-5 py-3">
              <div>
                <h2 className="text-sm font-bold text-[#0f2d4a]">Preview</h2>
              </div>
              <span className="inline-flex items-center gap-2 rounded-md bg-[#edf4fb] px-2.5 py-1 text-xs font-medium text-[#0f2d4a] ring-1 ring-[#c6d3e1]">
                <FileText size={14} />
                {pages.length} pages
              </span>
            </div>
            <div className="min-w-[1144px]">
              <MemoPreview draft={draft} />
            </div>
          </div>
        </aside>
      </div>
      <footer className="px-4 pb-7 pt-1 text-center text-xs font-semibold tracking-[0.02em] text-slate-500/80">
        Developed by Alex Surya Marcelo (UAT - A) &bull; Memo Generator
      </footer>
      <ReviewCommentsPopup
        open={reviewOpen}
        comments={draft.reviewComments ?? []}
        commentMode={commentMode}
        onToggleOpen={() => setReviewOpen((current) => !current)}
        onToggleCommentMode={() => {
          setReviewOpen(true);
          setCommentMode((current) => !current);
        }}
        onFocus={(comment) => focusReviewTarget(comment, appRootRef.current)}
        onEdit={openEditComment}
        onToggleResolve={toggleResolveComment}
        onDelete={deleteReviewComment}
      />
      <ReviewCommentDialog
        state={commentDialog}
        author={commentAuthor}
        text={commentText}
        onAuthorChange={setCommentAuthor}
        onTextChange={setCommentText}
        onCancel={() => setCommentDialog(null)}
        onSave={saveReviewComment}
      />
      <div
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-[26px] border border-white/70 bg-white/55 p-1.5 shadow-[0_18px_46px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-2xl"
        data-review-ignore
      >
        <button
          type="button"
          onClick={exportDocx}
          disabled={isExporting}
          aria-label="Buat dokumen Word cepat"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#007aff]/20 bg-[#007aff]/10 px-4 text-[13px] font-semibold leading-none text-[#0057b8] shadow-[0_1px_2px_rgba(0,122,255,0.08),0_8px_24px_rgba(0,122,255,0.08)] backdrop-blur-xl transition duration-200 ease-out hover:-translate-y-px hover:bg-[#007aff]/15 focus:outline-none focus:ring-2 focus:ring-[#007aff]/20 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          data-floating-generate
        >
          <Download size={16} />
          Generate Docx
          <span className="rounded-full border border-white/70 bg-white/70 px-2 py-1 text-[11px] font-bold leading-none text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
            {pages.length} pages
          </span>
        </button>
        <button
          type="button"
          onClick={() => setReviewOpen((current) => !current)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/70 bg-white/70 px-4 text-[13px] font-semibold leading-none text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl transition duration-200 ease-out hover:-translate-y-px hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#007aff]/20 active:translate-y-0 active:scale-[0.98]"
          aria-expanded={reviewOpen}
          aria-controls="review-comments-popup"
        >
          <MessageSquare size={16} />
          Komentar Review
          {unresolvedReviewCount ? (
            <span className="rounded-full bg-rose-600 px-2 py-1 text-[11px] font-bold leading-none text-white shadow-[0_4px_12px_rgba(225,29,72,0.25)]">{unresolvedReviewCount}</span>
          ) : null}
        </button>
      </div>
    </main>
  );
}
