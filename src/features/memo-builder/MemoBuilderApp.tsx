"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  Check,
  ChevronDown,
  ChevronRight,
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
  ReviewAuditAction,
  ReviewAuditLogEntry,
  ReviewComment,
  ScenarioHeading,
  ScenarioRow,
} from "@/types/memo";
import { DateRangePicker, type DateRangeValue } from "@/components/DateRangePicker";
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
import { importMomScenarioRows } from "@/utils/importMomScenarios";
import { importScenarioWorkbook, type ScenarioWorkbookPreview, type ScenarioWorkbookSheet } from "@/utils/importScenarioWorkbook";
import {
  buildScenarioHierarchy,
  flattenScenarioHierarchy,
  scenarioHeadingName,
  scenarioHeadingPath,
  type ScenarioHierarchyNode,
  withScenarioHeadingPath,
} from "@/utils/scenarioHierarchy";
import { ScenarioImportDialog } from "./ScenarioImportDialog";
import { MemoPreview } from "@/preview/MemoPreview";
import { useMemoCollaboration } from "@/collaboration/useMemoCollaboration";
import {
  getStoredCollaboratorIdentity,
  saveCollaboratorIdentity,
} from "@/collaboration/collaboratorIdentity";
import { createId } from "@/utils/ids";
import { formatDateRangeID } from "@/utils/formatDateRangeID";
import { focusEditorField, revealEditorTarget } from "@/utils/fieldNavigation";

const memoTypes: MemoType[] = [
  "Pilot",
  "Nasional",
];

const FIELD_NAVIGATION_EVENT = "memo-builder:navigate-field";

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

function safeFilePart(value: string) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "") || "Memo";
}

function fitTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${Math.max(42, element.scrollHeight)}px`;
}

function AutoResizeTextarea({
  onInput,
  style,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    fitTextarea(ref.current);
  }, [props.value]);

  return (
    <textarea
      {...props}
      ref={ref}
      style={{ ...style, overflowY: "hidden", resize: "none" }}
      onInput={(event) => {
        fitTextarea(event.currentTarget);
        onInput?.(event);
      }}
    />
  );
}

function FieldLabel({
  label,
  children,
  required = false,
  fieldId,
  asGroup = false,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  fieldId?: string;
  asGroup?: boolean;
}) {
  const Root = asGroup ? "div" : "label";

  return (
    <Root
      className="grid content-start gap-1 text-[13px] font-semibold text-slate-700"
      data-field-id={fieldId}
      data-field-label={label}
    >
      <span>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
    </Root>
  );
}

type DraftUpdater = (
  updater: (draft: MemoDraft) => MemoDraft,
  recordHistory?: boolean,
) => void;

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
  });

  draft.ccRecipients.forEach((recipient, index) => {
    if (!hasText(recipient.position)) add(`recipient-${recipient.id}`, `Tembusan ${index + 1}: Jabatan / Unit`);
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

  const validatedDateGroups = new Set<string>();
  const validatedHeadingGroups = new Set<string>();
  draft.appendixScenarios.forEach((row, index) => {
    const dateGroupKey = row.dateGroupId ?? row.id;
    if (!validatedDateGroups.has(dateGroupKey)) {
      validatedDateGroups.add(dateGroupKey);
      if (!hasText(row.startDate) || !hasText(row.endDate)) {
        add(`scenario-date-${row.id}`, `Lampiran Skenario ${index + 1}: Tanggal`);
      }
    }
    scenarioHeadingPath(row).forEach((heading, headingIndex) => {
      if (validatedHeadingGroups.has(heading.id)) return;
      validatedHeadingGroups.add(heading.id);
      if (!hasText(heading.title)) {
        add(
          headingIndex === 0 ? `scenario-section-${row.id}` : `scenario-heading-${heading.id}`,
          `Lampiran Skenario ${index + 1}: ${scenarioHeadingName(headingIndex + 1)}`,
        );
      }
    });
    if (!hasText(row.pic)) add(`scenario-pic-${row.id}`, `Lampiran Skenario ${index + 1}: PIC`);
    if (!hasRichText(row.scenario)) add(`scenario-text-${row.id}`, `Lampiran Skenario ${index + 1}: Skenario`);
    if (!hasRichText(row.expectedResult)) add(`scenario-expected-${row.id}`, `Lampiran Skenario ${index + 1}: Expected Result`);
  });

  return issues;
}

function jumpToValidationIssue(issues: ValidationIssue[]) {
  const firstIssue = issues[0];
  if (!firstIssue) return;

  if (focusEditorField(firstIssue.id)) return;

  window.dispatchEvent(new CustomEvent(FIELD_NAVIGATION_EVENT, { detail: { fieldId: firstIssue.id } }));
  window.setTimeout(() => {
    if (!focusEditorField(firstIssue.id)) {
      document.querySelector("[data-validation-panel]")?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  }, 120);
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-[22px] border border-[#c9d3df] bg-white/95 p-4 shadow-[0_18px_40px_rgba(31,45,61,0.08)] xl:p-5 ${className}`}>
      {children}
    </section>
  );
}

function IconButton({
  children,
  onClick,
  variant = "secondary",
  disabled,
  className = "",
  ...buttonProps
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "word";
  disabled?: boolean;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onClick" | "disabled">) {
  const variants = {
    primary: "border-[#1b4d78] bg-[#1b4d78] text-white shadow-[0_10px_24px_rgba(27,77,120,0.18)] hover:bg-[#163754]",
    secondary: "border-[#c9d3df] bg-[#eef4fa] text-[#1b4d78] hover:bg-[#e3edf7]",
    danger: "border-rose-200 bg-white text-rose-600 hover:bg-rose-50",
    word: "border-[#1b4d78] bg-[#1b4d78] text-white hover:bg-[#163754]",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...buttonProps}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-[14px] border px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#1b4d78]/15 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
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
      "border-white/25 bg-white/10 text-white shadow-none hover:bg-white/16",
    primary:
      "border-white/70 bg-white/92 text-[#1b4d78] shadow-none hover:bg-white",
    danger:
      "border-white/25 bg-white/10 text-white shadow-none hover:bg-white/16",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] border px-4 text-[13px] font-semibold leading-none backdrop-blur transition duration-200 ease-out hover:-translate-y-px focus:outline-none focus:ring-2 focus:ring-white/25 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 ${tones[tone]}`}
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
    neutral: "border-white/18 bg-white/10 text-white/88",
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
      className={`inline-flex min-h-10 items-center gap-2 rounded-[12px] border px-3.5 text-[12px] font-semibold leading-none shadow-none backdrop-blur ${toneClass}`}
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
  onStart,
}: {
  collaboration: ReturnType<typeof useMemoCollaboration>;
  onStart: () => void;
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
      className="flex flex-wrap items-center gap-2 rounded-[16px] border border-white/18 bg-white/10 p-1.5 shadow-none backdrop-blur"
      aria-label="Kolaborasi realtime"
      data-review-ignore
    >
      <AppleToolbarButton
        onClick={() => {
          onStart();
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
  mode: "add" | "edit" | "reply";
  target: ReviewTarget;
  commentId?: string;
};

type IdentityDialogAction = "add-comment" | "start-collab" | "join-collab";

type IdentityDialogState = {
  action: IdentityDialogAction;
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
  const explicitLabel = element.closest<HTMLElement>("[data-field-label]")?.dataset.fieldLabel;
  if (explicitLabel) return cleanTargetLabel(explicitLabel);

  const fieldLabel = element.closest("label");
  const labelText = fieldLabel?.querySelector("span")?.textContent ?? fieldLabel?.textContent;
  if (labelText) return cleanTargetLabel(labelText);

  const sectionTitle = element.closest("section")?.querySelector("h2, h3")?.textContent;
  if (sectionTitle) return cleanTargetLabel(sectionTitle);

  return element.dataset.fieldId ?? "Area terkait";
}

function reviewTargetFromElement(element: HTMLElement, root: HTMLElement): ReviewTarget | null {
  const target = element.closest<HTMLElement>("[data-field-id]");
  if (target) {
    return {
      type: "field",
      targetId: target.dataset.fieldId ?? "",
      targetLabel: targetLabelFromElement(target),
      path: elementPathFrom(root, target),
    };
  }

  const previewTarget = element.closest<HTMLElement>("[data-preview-field-id]");
  const previewFieldId = previewTarget?.dataset.previewFieldId;
  if (!previewFieldId) return null;

  const editorTarget = root.querySelector<HTMLElement>(
    `[data-field-id="${CSS.escape(previewFieldId)}"]`,
  );
  if (!editorTarget) return null;

  return {
    type: "field",
    targetId: previewFieldId,
    targetLabel: targetLabelFromElement(editorTarget),
    path: elementPathFrom(root, editorTarget),
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

  revealEditorTarget(target);
  target.classList.add("review-target-highlight");
  target.scrollIntoView({ block: "center", behavior: "smooth", inline: "nearest" });
  const focusTarget = target.matches("input, textarea, select, .ProseMirror")
    ? target
    : target.querySelector<HTMLElement>(".ProseMirror") ??
      target.querySelector<HTMLElement>("input, textarea, select");
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
  auditLog,
  commentMode,
  onToggleOpen,
  onToggleCommentMode,
  onFocus,
  onReply,
  onEdit,
  onToggleResolve,
  onDelete,
}: {
  open: boolean;
  comments: ReviewComment[];
  auditLog: ReviewAuditLogEntry[];
  commentMode: boolean;
  onToggleOpen: () => void;
  onToggleCommentMode: () => void;
  onFocus: (comment: ReviewComment) => void;
  onReply: (comment: ReviewComment) => void;
  onEdit: (comment: ReviewComment) => void;
  onToggleResolve: (comment: ReviewComment) => void;
  onDelete: (comment: ReviewComment) => void;
}) {
  const sortedComments = [...comments].sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
  });
  const [filter, setFilter] = useState<"all" | "unresolved" | "resolved">("all");
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const unresolvedCount = comments.filter((comment) => !comment.resolved).length;
  const resolvedCount = comments.length - unresolvedCount;
  const visibleComments = sortedComments.filter((comment) => {
    if (filter === "unresolved") return !comment.resolved;
    if (filter === "resolved") return comment.resolved;
    return true;
  });
  const commentAuditEntries = (comment: ReviewComment) =>
    auditLog.filter((entry) => entry.commentId === comment.id);
  const statusAuditEntry = (comment: ReviewComment) =>
    [...commentAuditEntries(comment)]
      .reverse()
      .find((entry) =>
        comment.resolved
          ? entry.action === "comment-resolved"
          : entry.action === "comment-replied" || entry.action === "comment-reopened",
      );
  const toggleLog = (commentId: string) => {
    setExpandedLogs((current) => {
      const next = new Set(current);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  return (
    <div data-review-ignore>
      {open ? (
        <section
          id="review-comments-popup"
          className="review-comments-font fixed bottom-[78px] right-[18px] z-50 isolate grid max-h-[min(680px,calc(100dvh-110px))] w-[min(720px,calc(100vw-36px))] grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-xl border border-[#b9c9dc] bg-white p-3.5 shadow-[0_18px_42px_rgba(31,45,61,0.18)] [backdrop-filter:none] [contain:layout_paint]"
          aria-labelledby="review-comments-title"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 id="review-comments-title" className="text-sm font-bold text-[#1c2734]">
                Komentar Review
              </h2>
              <p className="mt-0.5 text-xs font-extrabold text-[#5b6778]">
                {unresolvedCount} unresolved, {resolvedCount} resolved
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleOpen}
              className="grid h-11 w-11 place-items-center rounded-lg border border-[#c9d3df] bg-white text-[#5b6778] shadow-sm transition hover:bg-[#f7f9fc] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20"
              aria-label="Tutup komentar review"
              title="Tutup komentar"
            >
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-[1fr_minmax(118px,auto)] items-center gap-2">
            <button
              type="button"
              onClick={onToggleCommentMode}
              aria-pressed={commentMode}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 ${
                commentMode
                  ? "border-[#2563eb] bg-[#1b4d78] text-white shadow-[0_10px_22px_rgba(27,77,120,0.18)]"
                  : "border-[#c9d3df] bg-white text-[#163754] hover:bg-[#eef6ff]"
              }`}
            >
              {commentMode ? <Check size={15} /> : <MessageSquare size={15} />}
              Add Comment
            </button>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as "all" | "unresolved" | "resolved")}
              aria-label="Filter komentar"
              className="min-h-11 rounded-lg border border-[#c9d3df] bg-white px-3 text-xs font-extrabold text-[#1c2734] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
            >
              <option value="all">All</option>
              <option value="unresolved">Unresolved</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div className="min-h-0 overflow-auto">
            {visibleComments.length ? (
              <div className="grid gap-2">
                {visibleComments.map((comment) => {
                  const entries = commentAuditEntries(comment);
                  const statusEntry = statusAuditEntry(comment);
                  const logExpanded = expandedLogs.has(comment.id);

                  return (
                    <article
                      key={comment.id}
                      data-review-comment-status={comment.resolved ? "resolved" : "unresolved"}
                      className={`grid min-w-0 gap-2 rounded-xl border border-[#b9c9dc] border-l-[5px] p-3.5 ${
                        comment.resolved
                          ? "border-l-[#4ba37a] bg-[#f8fbfa] text-[#1c2734]"
                          : "border-l-[#0b84d8] bg-gradient-to-b from-white to-[#f8fbff] text-[#1c2734]"
                      }`}
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-extrabold text-[#163754]">
                        <span className={`inline-flex min-h-[24px] items-center rounded-full px-2.5 text-[11px] font-black ${
                          comment.resolved
                            ? "bg-[#e7f6ee] text-[#2f8b64]"
                            : "bg-[#fff200] text-[#5c4300]"
                        }`}>
                          {comment.resolved ? "Resolved" : "Unresolved"}
                        </span>
                        <span>{comment.author || "Reviewer"}</span>
                        <span>{comment.replies.length} reply</span>
                        <span>{formatCommentTime(comment.updatedAt || comment.createdAt)}</span>
                      </div>

                      {statusEntry ? (
                        <p className="text-[11px] font-bold text-[#7a8596]">
                          {comment.resolved ? "Solved" : "Reply dibuat"} oleh {statusEntry.actor || "Reviewer"},{" "}
                          {formatCommentTime(statusEntry.createdAt)}
                        </p>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => onFocus(comment)}
                        className="w-fit rounded-full bg-[#d9e8f5] px-2.5 py-1.5 text-left text-xs font-black text-[#163754] transition hover:bg-[#c8deef] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20"
                      >
                        Lihat field: {comment.targetLabel}
                      </button>
                      <p
                        data-review-comment-body
                        className="m-0 min-h-11 whitespace-pre-wrap break-words text-[13px] leading-[1.4] text-[#1c2734] [overflow-wrap:anywhere]"
                      >
                        {comment.text}
                      </p>

                      {comment.replies.length ? (
                        <div className="grid gap-2 border-l-2 border-[#c8deef] pl-3">
                          {comment.replies.map((reply) => (
                            <div key={reply.id} className="rounded-lg bg-[#eef6ff] px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2 text-[11px] font-extrabold text-[#5b6778]">
                                <span>Reply</span>
                                <span className="text-[#163754]">{reply.author || "Reviewer"}</span>
                                <span>{formatCommentTime(reply.createdAt)}</span>
                              </div>
                              <p
                                data-review-reply-body
                                className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-[1.4] text-[#1c2734] [overflow-wrap:anywhere]"
                              >
                                {reply.text}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => toggleLog(comment.id)}
                        className="flex min-h-8 w-fit items-center gap-1 text-xs font-extrabold text-[#40566e] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/20"
                        aria-expanded={logExpanded}
                        aria-label={`Log Comment (${entries.length})`}
                      >
                        {logExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        Log Comment ({entries.length})
                      </button>
                      {logExpanded ? (
                        <ol className="grid gap-1 pl-5 text-[11px] font-bold text-[#7a8596]">
                          {entries.map((entry, index) => (
                            <li key={entry.id} data-review-comment-log-entry>
                              {index + 1}. {entry.description} oleh {entry.actor || "Reviewer"},{" "}
                              {formatCommentTime(entry.createdAt)}
                            </li>
                          ))}
                        </ol>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          data-review-comment-action
                          onClick={() => onToggleResolve(comment)}
                          className="grid h-11 w-11 place-items-center rounded-lg border border-[#c9d3df] bg-white text-[#163754] transition hover:bg-[#f7f9fc] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20"
                          aria-label={comment.resolved ? "Reopen komentar" : "Resolve komentar"}
                          title={comment.resolved ? "Reopen komentar" : "Resolve komentar"}
                        >
                          {comment.resolved ? <RefreshCcw size={15} /> : <Check size={16} />}
                        </button>
                        <button
                          type="button"
                          data-review-comment-action
                          onClick={() => onReply(comment)}
                          className="grid h-11 w-11 place-items-center rounded-lg border border-[#c9d3df] bg-white text-[#163754] transition hover:bg-[#f7f9fc] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20"
                          aria-label="Balas komentar"
                          title="Balas komentar"
                        >
                          <MessageSquare size={15} />
                        </button>
                        <button
                          type="button"
                          data-review-comment-action
                          onClick={() => onEdit(comment)}
                          className="grid h-11 w-11 place-items-center rounded-lg border border-[#c9d3df] bg-white text-[#163754] transition hover:bg-[#f7f9fc] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20"
                          aria-label={comment.resolved ? "Follow up komentar" : "Edit komentar"}
                          title={comment.resolved ? "Follow up komentar" : "Edit komentar"}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          data-review-comment-action
                          onClick={() => onDelete(comment)}
                          className="grid h-11 w-11 place-items-center rounded-lg border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                          aria-label="Hapus komentar"
                          title="Hapus komentar"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-[#c9d3df] p-3 text-center text-[13px] font-bold text-[#5b6778]">
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
  actor,
  text,
  onTextChange,
  onCancel,
  onSave,
}: {
  state: CommentDialogState | null;
  actor: string;
  text: string;
  onTextChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  if (!state) return null;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/40 p-[18px]" data-review-ignore>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-comment-dialog-title"
        className="grid w-[min(460px,100%)] gap-3 rounded-[10px] bg-white p-[18px] shadow-[0_22px_54px_rgba(23,32,42,0.24)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="review-comment-dialog-title" className="m-0 text-base font-bold text-[#1c2734]">
              {state.mode === "edit"
                ? "Edit komentar"
                : state.mode === "reply"
                  ? "Balas komentar"
                  : "Tambah komentar"}
            </h2>
            <p className="m-0 mt-1 text-[13px] font-bold text-[#5b6778]">Reviewer: {actor || "-"}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="grid h-9 w-9 place-items-center rounded-md border border-[#c9d3df] bg-white text-[#5b6778] transition hover:bg-[#f7f9fc]"
            aria-label="Tutup komentar"
            title="Tutup komentar"
          >
            <X size={16} />
          </button>
        </div>
        <p className="rounded-lg bg-[#eef2f6] px-2.5 py-2 text-xs font-extrabold text-[#163754]">
          {state.target.targetLabel}
        </p>
        <label className="grid gap-1.5 text-[13px] font-extrabold text-[#1c2734]">
          <span>{state.mode === "reply" ? "Balasan" : "Komentar"} <span className="text-[#b42318]">*</span></span>
          <AutoResizeTextarea
            value={text}
            rows={3}
            onChange={(event) => onTextChange(event.target.value)}
            className="min-h-28 resize-y rounded-md border border-[#c9d3df] px-3 py-2 text-[15px] font-semibold text-[#1c2734] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
            placeholder="Tulis catatan reviewer"
            autoFocus
            required
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-[#c9d3df] bg-white px-3 text-[13px] font-extrabold text-[#1c2734] transition hover:bg-[#f7f9fc]"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onSave}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-[#1b4d78] bg-[#1b4d78] px-3 text-[13px] font-extrabold text-white transition hover:bg-[#163754]"
          >
            {state.mode === "reply" ? "Kirim balasan" : "Simpan"}
          </button>
        </div>
      </section>
    </div>
  );
}

function CollaboratorIdentityDialog({
  state,
  name,
  onNameChange,
  onCancel,
  onContinue,
}: {
  state: IdentityDialogState | null;
  name: string;
  onNameChange: (value: string) => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  if (!state) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/40 px-4" data-review-ignore>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="collaborator-identity-title"
        className="w-full max-w-[504px] rounded-xl border border-slate-200 bg-white p-[18px] shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          onContinue();
        }}
      >
        <h2 id="collaborator-identity-title" className="text-[15px] font-bold text-slate-900">
          Isi nama kolaborator
        </h2>
        <p className="mt-4 text-[13px] font-semibold text-slate-500">
          Nama dipakai untuk presence dan audit log komentar review.
        </p>
        <label className="mt-4 grid gap-1.5 text-xs font-bold text-slate-800">
          <span>Nama <span className="text-red-600">*</span></span>
          <input
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Nama reviewer / maker"
            className="h-12 rounded-lg border border-slate-400 px-3 text-[15px] font-medium text-slate-950 outline-none placeholder:text-slate-400 focus:border-[#1f5d8a] focus:ring-4 focus:ring-[#1f5d8a]/15"
            autoFocus
          />
        </label>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#1f5d8a] px-4 text-xs font-bold text-white hover:bg-[#174d74] focus:outline-none focus:ring-2 focus:ring-[#1f5d8a]/25 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Lanjut
          </button>
        </div>
      </form>
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
  updateDraft: DraftUpdater;
}) {
  function setRows(nextRows: DevelopmentRow[], recordHistory = false) {
    updateDraft((draft) => ({ ...draft, developmentRows: nextRows }), recordHistory);
  }

  return (
    <Panel>
      <SectionTitle title="Lingkup Pengembangan" />
      <div className="mt-4">
        <DragDropList
          items={rows}
          onReorder={(nextRows) => setRows(nextRows, true)}
          itemLabel={(_, index) => `lingkup ${index + 1}`}
          renderItem={(row, index) => (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">Baris {index + 1}</p>
                <button
                  type="button"
                  onClick={() => {
                    const nextRows = rows.filter((item) => item.id !== row.id);
                    setRows(nextRows.length ? nextRows : [createDevelopmentRow()], true);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                  aria-label="Hapus lingkup"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="grid items-start gap-3 xl:grid-cols-2">
                <FieldLabel label="Item" fieldId={`development-item-${row.id}`} required asGroup>
                  <RichTextEditor
                    value={row.item}
                    minHeight={48}
                    onChange={(value) =>
                      setRows(rows.map((item) => (item.id === row.id ? { ...item, item: value } : item)))
                    }
                  />
                </FieldLabel>
                <FieldLabel label="Keterangan" fieldId={`development-description-${row.id}`} required asGroup>
                  <RichTextEditor
                    value={row.description}
                    minHeight={48}
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
        <IconButton onClick={() => setRows([...rows, createDevelopmentRow()], true)}>
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
  updateDraft: DraftUpdater;
}) {
  function setRows(nextRows: ActivityRow[], recordHistory = false) {
    updateDraft((draft) => ({ ...draft, activities: nextRows }), recordHistory);
  }

  return (
    <Panel>
      <SectionTitle title="Aktivitas Cabang dan Unit Kerja" />
      <div className="mt-4">
        <DragDropList
          items={rows}
          onReorder={(nextRows) => setRows(nextRows, true)}
          itemLabel={(row, index) => row.owner || `aktivitas ${index + 1}`}
          renderItem={(row) => (
            <div className="grid gap-3">
              <div className="grid items-end gap-3 xl:grid-cols-[minmax(220px,1fr)_minmax(180px,0.8fr)_38px]">
                <FieldLabel label="Tanggal" fieldId={`activity-date-${row.id}`} required>
                  <DateRangePicker
                    compact
                    startDate={row.startDate}
                    endDate={row.endDate}
                    dates={row.dates}
                    onChange={(value) =>
                      setRows(
                        rows.map((item) =>
                          item.id === row.id ? { ...item, ...value } : item,
                        ),
                        true,
                      )
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
                  onClick={() => setRows(rows.filter((item) => item.id !== row.id), true)}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                  aria-label="Hapus aktivitas"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <FieldLabel label="Aktivitas" fieldId={`activity-text-${row.id}`} required asGroup>
                <RichTextEditor
                  value={row.activity}
                  minHeight={48}
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
        <IconButton onClick={() => setRows([...rows, createActivityRow()], true)}>
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
  updateDraft: DraftUpdater;
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
              <AutoResizeTextarea
                value={richTextToPlainText(draft.reference)}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    reference: paragraphRichText(event.target.value),
                  }))
                }
                rows={2}
                className="min-h-11 rounded-md border border-slate-400 bg-white px-3 py-2 text-[15px] font-medium text-slate-950 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
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
  updateDraft: DraftUpdater;
}) {
  function setRows(contacts: MemoDraft["contacts"], recordHistory = false) {
    updateDraft((current) => ({ ...current, contacts }), recordHistory);
  }

  return (
    <Panel>
      <SectionTitle title="PIC yang Dapat Dihubungi" />
      <div className="mt-4">
        <DragDropList
          items={draft.contacts}
          onReorder={(contacts) => setRows(contacts, true)}
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
                onClick={() => setRows(draft.contacts.filter((item) => item.id !== contact.id), true)}
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
            }), true)
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
  updateDraft: DraftUpdater;
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
            <AutoResizeTextarea
              value={attachments}
              rows={2}
              onChange={(event) =>
                updateDraft((current) => ({ ...current, attachments: event.target.value }))
              }
              className="min-h-11 w-full rounded-md border border-slate-400 bg-white px-3 py-2 text-[15px] font-medium text-slate-950 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
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
  dates?: string[];
  rows: ScenarioRow[];
};

const SCENARIO_LIST_PREFIX = "scenario-section:";

type ScenarioSectionGroup = {
  id: string;
  marker: string;
  title: string;
  rows: ScenarioRow[];
};

function scenarioListId(sectionId: string) {
  return `${SCENARIO_LIST_PREFIX}${sectionId}`;
}

function scenarioDateGroups(rows: ScenarioRow[]) {
  const groups: ScenarioDateGroup[] = [];
  const indexByKey = new Map<string, number>();

  rows.forEach((row) => {
    const key = row.dateGroupId ?? row.id;
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
      dates: row.dates,
      rows: [row],
    });
  });

  return groups;
}

function scenarioSectionGroups(rows: ScenarioRow[]) {
  const sections: ScenarioSectionGroup[] = [];
  const indexByKey = new Map<string, number>();

  rows.forEach((row) => {
    const firstHeading = scenarioHeadingPath(row)[0];
    if (!firstHeading) return;
    const key = firstHeading?.id ?? row.sectionGroupId ?? row.id;
    const existingIndex = indexByKey.get(key);
    if (existingIndex !== undefined) {
      sections[existingIndex].rows.push(row);
      return;
    }
    indexByKey.set(key, sections.length);
    sections.push({
      id: key,
      marker: alphaIndex(sections.length),
      title: firstHeading?.title ?? row.section,
      rows: [row],
    });
  });

  return sections;
}

function scenarioRowsAreCompletelyEmpty(rows: ScenarioRow[]) {
  return rows.length === 0 || rows.every((row) =>
    !hasText(row.startDate) &&
    !hasText(row.endDate) &&
    !(row.dates ?? []).some(hasText) &&
    !hasText(row.section) &&
    !hasRichText(row.scenario) &&
    !hasRichText(row.expectedResult) &&
    !hasText(row.pic) &&
    !hasRichText(row.notes)
  );
}

function AppendixPanel({
  rows,
  updateDraft,
  validationIssues,
}: {
  rows: ScenarioRow[];
  updateDraft: DraftUpdater;
  validationIssues: ValidationIssue[];
}) {
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [mountedScenarioEditors, setMountedScenarioEditors] = useState<Record<string, boolean>>({});
  const [scenarioImportError, setScenarioImportError] = useState("");
  const [workbookPreview, setWorkbookPreview] = useState<ScenarioWorkbookPreview | null>(null);
  const [selectedWorkbookSheet, setSelectedWorkbookSheet] = useState("");
  const scenarioImportInputRef = useRef<HTMLInputElement>(null);

  function setRows(nextRows: ScenarioRow[], recordHistory = false) {
    updateDraft((draft) => ({ ...draft, appendixScenarios: nextRows }), recordHistory);
  }

  async function handleScenarioImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      if (/\.xlsx$/i.test(file.name)) {
        const preview = await importScenarioWorkbook(file);
        setWorkbookPreview(preview);
        setSelectedWorkbookSheet(preview.activeSheetName);
        setScenarioImportError("");
        return;
      }
      const importedRows = importMomScenarioRows(JSON.parse(await file.text()));
      setRows(
        scenarioRowsAreCompletelyEmpty(rows) ? importedRows : [...rows, ...importedRows],
        true,
      );
      setScenarioImportError("");
    } catch (error) {
      setScenarioImportError(
        error instanceof Error ? error.message : "File MOM tidak dapat dibaca.",
      );
    } finally {
      event.target.value = "";
    }
  }

  function applyWorkbookImport(sheet: ScenarioWorkbookSheet) {
    setRows(
      scenarioRowsAreCompletelyEmpty(rows) ? sheet.rows : [...rows, ...sheet.rows],
      true,
    );
    setExpandedDetails({});
    setMountedScenarioEditors((current) => {
      const next = { ...current };
      sheet.rows.forEach((row) => {
        next[row.id] = false;
      });
      return next;
    });
    setWorkbookPreview(null);
    setSelectedWorkbookSheet("");
    setScenarioImportError("");
  }

  const groups = scenarioDateGroups(rows);

  useEffect(() => {
    function openField(event: Event) {
      const fieldId = (event as CustomEvent<{ fieldId?: string }>).detail?.fieldId;
      if (!fieldId?.startsWith("scenario-")) return;

      const rowId = fieldId.match(/^scenario-(?:date|section|text|expected|pic)-(.+)$/)?.[1];
      const row = rows.find((item) => item.id === rowId) ??
        rows.find((item) =>
          scenarioHeadingPath(item).some((heading) => `scenario-heading-${heading.id}` === fieldId),
        );
      if (!row) return;

      setExpandedDetails((current) => {
        const next = { ...current };
        next[`date:${row.dateGroupId ?? row.id}`] = true;
        const path = scenarioHeadingPath(row);
        const sectionId = path[0]?.id ?? row.sectionGroupId ?? row.id;
        next[`section:${sectionId}`] = true;
        path.forEach((heading) => {
          next[`heading:${heading.id}`] = true;
        });
        next[`scenario:${row.id}`] = true;
        return next;
      });
      setMountedScenarioEditors((current) => ({ ...current, [row.id]: true }));

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => focusEditorField(fieldId));
      });
    }

    window.addEventListener(FIELD_NAVIGATION_EVENT, openField);
    return () => window.removeEventListener(FIELD_NAVIGATION_EVENT, openField);
  }, [rows]);

  function detailOpen(id: string, initialOpen: boolean) {
    return expandedDetails[id] ?? initialOpen;
  }

  function rememberDetailState(id: string, event: React.SyntheticEvent<HTMLDetailsElement>) {
    const open = event.currentTarget.open;
    setExpandedDetails((current) => current[id] === open ? current : { ...current, [id]: open });
  }

  function setAllDetails(open: boolean) {
    const next: Record<string, boolean> = {};
    groups.forEach((group) => {
      next[`date:${group.id}`] = open;
      scenarioSectionGroups(group.rows).forEach((section) => {
        next[`section:${section.id}`] = open;
        section.rows.forEach((row) => {
          next[`scenario:${row.id}`] = open;
        });
      });
    });
    setExpandedDetails(next);
  }

  const allDetailsOpen = groups.length > 0 && groups.every((group) =>
    detailOpen(`date:${group.id}`, true) &&
    scenarioSectionGroups(group.rows).every((section) =>
      detailOpen(`section:${section.id}`, true) &&
      section.rows.every((row) =>
        detailOpen(`scenario:${row.id}`, true),
      ),
    ),
  );

  function reorderDateGroups(nextGroups: ScenarioDateGroup[]) {
    setRows(nextGroups.flatMap((group) => group.rows), true);
  }

  function moveSectionAcrossDates(event: DragEndEvent) {
    if (!event.over) return;
    const sourceGroup = groups.find((group) => group.id === event.active.data.current?.listId);
    const targetGroupId = event.over.data.current?.listId === "scenario-dates"
      ? String(event.over.id)
      : String(event.over.data.current?.listId ?? "");
    const targetGroup = groups.find((group) => group.id === targetGroupId);
    const sourceSection = sourceGroup
      ? scenarioSectionGroups(sourceGroup.rows).find((section) => section.id === event.active.id)
      : undefined;
    if (!sourceGroup || !targetGroup || !sourceSection) return;

    if (sourceGroup.id === targetGroup.id) {
      const sections = scenarioSectionGroups(sourceGroup.rows);
      const from = sections.findIndex((section) => section.id === sourceSection.id);
      const to = sections.findIndex((section) => section.id === event.over?.id);
      if (from < 0 || to < 0 || from === to) return;
      const next = [...sections];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      reorderSections(sourceGroup, next);
      return;
    }

    const movedIds = new Set(sourceSection.rows.map((row) => row.id));
    const remaining = rows.filter((row) => !movedIds.has(row.id));
    const movedRows = sourceSection.rows.map((row) => ({
      ...row,
      dateGroupId: targetGroup.id,
      startDate: targetGroup.startDate,
      endDate: targetGroup.endDate,
      dates: targetGroup.dates,
    }));
    const targetSectionId = event.over.data.current?.listId === targetGroup.id
      ? String(event.over.id)
      : "";
    const targetIndex = targetSectionId
      ? remaining.findIndex((row) => (row.sectionGroupId ?? row.id) === targetSectionId)
      : -1;
    const insertAt = targetIndex >= 0
      ? targetIndex
      : remaining.reduce(
          (last, row, index) => (row.dateGroupId === targetGroup.id ? index + 1 : last),
          remaining.length,
        );
    setRows([
      ...remaining.slice(0, insertAt),
      ...movedRows,
      ...remaining.slice(insertAt),
    ], true);
  }

  function moveScenarioAcrossHierarchy(event: DragEndEvent) {
    if (!event.over) return;
    const activeId = String(event.active.id);
    const sourceRow = rows.find((row) => row.id === activeId);
    if (!sourceRow) return;

    const targetRow = rows.find((row) => row.id === String(event.over?.id));
    const overListId = String(event.over.data.current?.listId ?? "");
    const targetSectionId = overListId.startsWith(SCENARIO_LIST_PREFIX)
      ? overListId.slice(SCENARIO_LIST_PREFIX.length)
      : targetRow?.sectionGroupId ?? String(event.over.id);
    let targetGroup: ScenarioDateGroup | undefined;
    let targetSection: ScenarioSectionGroup | undefined;

    for (const group of groups) {
      const sections = scenarioSectionGroups(group.rows);
      const section = sections.find((candidate) =>
        candidate.id === targetSectionId || candidate.rows.some((row) => row.id === targetRow?.id),
      );
      if (section) {
        targetGroup = group;
        targetSection = section;
        break;
      }
    }

    if (!targetSection) {
      targetGroup = groups.find((group) =>
        group.id === String(event.over?.id) || group.id === overListId,
      );
      targetSection = targetGroup
        ? scenarioSectionGroups(targetGroup.rows)[0]
        : undefined;
    }
    if (!targetGroup || !targetSection) return;

    const sourceSectionId = sourceRow.sectionGroupId ?? sourceRow.id;
    if (sourceSectionId === targetSection.id) {
      const sectionRows = [...targetSection.rows];
      const from = sectionRows.findIndex((row) => row.id === activeId);
      const to = targetRow
        ? sectionRows.findIndex((row) => row.id === targetRow.id)
        : sectionRows.length - 1;
      if (from < 0 || to < 0 || from === to) return;
      const [moved] = sectionRows.splice(from, 1);
      sectionRows.splice(to, 0, moved);
      replaceSectionRows(targetSection, sectionRows);
      return;
    }

    const remaining = rows.filter((row) => row.id !== activeId);
    const movedRow: ScenarioRow = {
      ...sourceRow,
      dateGroupId: targetGroup.id,
      sectionGroupId: targetSection.id,
      startDate: targetGroup.startDate,
      endDate: targetGroup.endDate,
      dates: targetGroup.dates,
      section: targetSection.title,
    };
    const targetIndex = targetRow
      ? remaining.findIndex((row) => row.id === targetRow.id)
      : remaining.reduce(
          (last, row, index) =>
            (row.sectionGroupId ?? row.id) === targetSection.id ? index + 1 : last,
          remaining.length,
        );
    const insertAt = targetIndex >= 0 ? targetIndex : remaining.length;
    setRows([
      ...remaining.slice(0, insertAt),
      movedRow,
      ...remaining.slice(insertAt),
    ], true);
  }

  function moveAppendixItem(event: DragEndEvent) {
    const sourceListId = String(event.active.data.current?.listId ?? "");
    if (sourceListId.startsWith(SCENARIO_LIST_PREFIX)) {
      moveScenarioAcrossHierarchy(event);
      return;
    }
    moveSectionAcrossDates(event);
  }

  function reorderSections(
    group: ScenarioDateGroup,
    nextSections: ScenarioSectionGroup[],
  ) {
    const groupRowIds = new Set(group.rows.map((row) => row.id));
    const reorderedRows = nextSections.flatMap((section) => section.rows);
    let inserted = false;
    const nextRows = rows.flatMap((row) => {
      if (!groupRowIds.has(row.id)) return [row];
      if (inserted) return [];
      inserted = true;
      return reorderedRows;
    });
    setRows(nextRows, true);
  }

  function updateGroupDates(group: ScenarioDateGroup, value: DateRangeValue) {
    const ids = new Set(group.rows.map((row) => row.id));
    setRows(
      rows.map((row) =>
        ids.has(row.id)
          ? {
              ...row,
              dateGroupId: group.id,
              startDate: value.startDate,
              endDate: value.endDate,
              dates: value.dates,
            }
          : row,
      ),
      true,
    );
  }

  function replaceGroupRows(group: ScenarioDateGroup, nextGroupRows: ScenarioRow[]) {
    const ids = new Set(group.rows.map((row) => row.id));
    let inserted = false;
    const nextRows = rows.flatMap((row) => {
      if (!ids.has(row.id)) return [row];
      if (inserted) return [];
      inserted = true;
      return nextGroupRows;
    });

    setRows(nextRows.length ? nextRows : [createScenarioRow()], true);
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

    setRows(nextRows.length ? nextRows : [createScenarioRow()], true);
  }

  function findHierarchyNode(
    hierarchy: ReturnType<typeof buildScenarioHierarchy>,
    path: ScenarioHeading[],
  ) {
    let nodes = hierarchy.children;
    let target: ScenarioHierarchyNode | undefined;
    for (const heading of path) {
      target = nodes.find((node) => node.id === heading.id);
      if (!target) return undefined;
      nodes = target.children;
    }
    return target;
  }

  function scenarioRowForPath(group: ScenarioDateGroup, headingPath: ScenarioHeading[]) {
    return createScenarioRow({
      dateGroupId: group.id,
      headingPath,
      startDate: group.startDate,
      endDate: group.endDate,
      dates: group.dates,
    });
  }

  function expandNewScenario(row: ScenarioRow) {
    setExpandedDetails((current) => ({
      ...current,
      [`scenario:${row.id}`]: true,
    }));
    setMountedScenarioEditors((current) => ({
      ...current,
      [row.id]: true,
    }));
  }

  function updateSectionTitle(section: ScenarioSectionGroup, title: string) {
    setRows(rows.map((row) => {
      const path = scenarioHeadingPath(row);
      if (!path.some((heading) => heading.id === section.id)) return row;
      return withScenarioHeadingPath(
        row,
        path.map((heading) => heading.id === section.id ? { ...heading, title } : heading),
      );
    }));
  }

  function addScenarioToSection(group: ScenarioDateGroup, section: ScenarioSectionGroup) {
    const hierarchy = buildScenarioHierarchy(section.rows);
    const sectionPath = scenarioHeadingPath(section.rows[0] ?? createScenarioRow({
      sectionGroupId: section.id,
      section: section.title,
    })).slice(0, 1);
    const target = findHierarchyNode(hierarchy, sectionPath);
    const nextRow = scenarioRowForPath(group, sectionPath);

    if (!target) {
      replaceSectionRows(section, [...section.rows, nextRow]);
    } else {
      target.rows.push(nextRow);
      replaceSectionRows(section, flattenScenarioHierarchy(hierarchy));
    }
    expandNewScenario(nextRow);
  }

  function addSectionToGroup(group: ScenarioDateGroup) {
    const hierarchy = buildScenarioHierarchy(group.rows);
    const heading = { id: createId("scenario-heading-1"), title: "" };
    const nextRow = scenarioRowForPath(group, [heading]);

    hierarchy.children.push({
      id: heading.id,
      title: heading.title,
      depth: 1,
      label: "",
      path: [heading],
      rows: [nextRow],
      children: [],
    });

    setExpandedDetails((current) => ({
      ...current,
      [`heading:${heading.id}`]: true,
      [`scenario:${nextRow.id}`]: true,
    }));
    replaceGroupRows(group, flattenScenarioHierarchy(hierarchy));
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
    ], true);
  }

  function updateHeadingTitle(headingId: string, title: string) {
    setRows(rows.map((row) => {
      const path = scenarioHeadingPath(row);
      if (!path.some((heading) => heading.id === headingId)) return row;
      return withScenarioHeadingPath(
        row,
        path.map((heading) => heading.id === headingId ? { ...heading, title } : heading),
      );
    }));
  }

  function addScenarioAtPath(
    group: ScenarioDateGroup,
    section: ScenarioSectionGroup,
    headingPath: ScenarioHeading[],
  ) {
    if (!headingPath.length) {
      addRootScenario(group);
      return;
    }

    const hierarchy = buildScenarioHierarchy(section.rows);
    const target = findHierarchyNode(hierarchy, headingPath);
    const nextRow = scenarioRowForPath(group, headingPath);

    if (!target) {
      replaceSectionRows(section, [...section.rows, nextRow]);
    } else {
      target.rows.push(nextRow);
      replaceSectionRows(section, flattenScenarioHierarchy(hierarchy));
    }
    expandNewScenario(nextRow);
  }

  function addChildHeading(
    group: ScenarioDateGroup,
    section: ScenarioSectionGroup,
    parentPath: ScenarioHeading[],
  ) {
    if (parentPath.length >= 3) return;
    const heading = { id: createId(`scenario-heading-${parentPath.length + 1}`), title: "" };
    const nextPath = [...parentPath, heading];
    const nextRow = scenarioRowForPath(group, nextPath);
    const hierarchy = buildScenarioHierarchy(section.rows);
    const parent = findHierarchyNode(hierarchy, parentPath);

    if (!parent) {
      addScenarioAtPath(group, section, nextPath);
      return;
    }

    parent.children.push({
      id: heading.id,
      title: heading.title,
      depth: nextPath.length,
      label: "",
      path: nextPath,
      rows: [nextRow],
      children: [],
    });
    setExpandedDetails((current) => ({
      ...current,
      [`heading:${heading.id}`]: true,
      [`scenario:${nextRow.id}`]: true,
    }));
    replaceSectionRows(section, flattenScenarioHierarchy(hierarchy));
  }

  function replaceNodeRows(node: ScenarioHierarchyNode, nextRows: ScenarioRow[]) {
    const ids = new Set(node.rows.map((row) => row.id));
    let inserted = false;
    const next = rows.flatMap((row) => {
      if (!ids.has(row.id)) return [row];
      if (inserted) return [];
      inserted = true;
      return nextRows;
    });
    setRows(next.length ? next : [createScenarioRow()], true);
  }

  function addRootScenario(group: ScenarioDateGroup) {
    const hierarchy = buildScenarioHierarchy(group.rows);
    const nextRow = scenarioRowForPath(group, []);
    hierarchy.rows.push(nextRow);
    expandNewScenario(nextRow);
    replaceGroupRows(group, flattenScenarioHierarchy(hierarchy));
  }

  function replaceRootRows(group: ScenarioDateGroup, nextRootRows: ScenarioRow[]) {
    const rootRows = buildScenarioHierarchy(group.rows).rows;
    const ids = new Set(rootRows.map((row) => row.id));
    let inserted = false;
    const next = rows.flatMap((row) => {
      if (!ids.has(row.id)) return [row];
      if (inserted) return [];
      inserted = true;
      return nextRootRows;
    });
    setRows(next.length ? next : [createScenarioRow()], true);
  }

  function scenarioEditor(row: ScenarioRow, rowIndex: number) {
    const scenarioOpen = detailOpen(`scenario:${row.id}`, true);
    const editorMounted = mountedScenarioEditors[row.id] ?? true;
    const mountEditor = (fieldId: string) => {
      setMountedScenarioEditors((current) => ({ ...current, [row.id]: true }));
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => focusEditorField(fieldId));
      });
    };
    const lightRichField = (
      fieldId: string,
      value: ScenarioRow["scenario"],
      placeholder: string,
    ) => (
      <button
        type="button"
        onClick={() => mountEditor(fieldId)}
        className="min-h-11 rounded-lg border border-slate-400 bg-white px-3 py-2 text-left text-[15px] font-medium leading-[1.35] text-slate-900 outline-none hover:bg-slate-50 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
      >
        <span className="block whitespace-pre-wrap">
          {richTextToPlainText(value) || placeholder}
        </span>
      </button>
    );

    return (
      <details
        open={scenarioOpen}
        onToggle={(event) => rememberDetailState(`scenario:${row.id}`, event)}
        data-scenario-row
        className="rounded-lg border border-slate-200 bg-slate-50"
      >
        <summary data-scenario-header className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1b4d78]/25">
          <span>Skenario {rowIndex + 1}</span>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs font-medium text-slate-500">{row.pic || "PIC belum diisi"}</span>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const nextRows = rows.filter((item) => item.id !== row.id);
                setRows(nextRows.length ? nextRows : [createScenarioRow()], true);
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              aria-label="Hapus skenario"
            >
              <Trash2 size={15} />
            </button>
          </span>
        </summary>
        {scenarioOpen ? (
          <div className="grid gap-3 border-t border-slate-200 p-3">
            <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(160px,0.62fr)]">
              <FieldLabel label="Skenario" fieldId={`scenario-text-${row.id}`} required asGroup>
                {editorMounted ? (
                  <RichTextEditor
                    value={row.scenario}
                    minHeight={48}
                    onChange={(value) => setRows(rows.map((item) => item.id === row.id ? { ...item, scenario: value } : item))}
                  />
                ) : lightRichField(`scenario-text-${row.id}`, row.scenario, "Klik untuk edit skenario")}
              </FieldLabel>
              <FieldLabel label="Expected Result" fieldId={`scenario-expected-${row.id}`} required asGroup>
                {editorMounted ? (
                  <RichTextEditor
                    value={row.expectedResult}
                    minHeight={48}
                    onChange={(value) => setRows(rows.map((item) => item.id === row.id ? { ...item, expectedResult: value } : item))}
                  />
                ) : lightRichField(`scenario-expected-${row.id}`, row.expectedResult, "Klik untuk edit hasil")}
              </FieldLabel>
              <FieldLabel label="PIC" fieldId={`scenario-pic-${row.id}`} required>
                <AutoResizeTextarea
                  value={row.pic}
                  rows={2}
                  onChange={(event) => setRows(rows.map((item) => item.id === row.id ? { ...item, pic: event.target.value } : item))}
                  className="min-h-11 rounded-lg border border-slate-400 bg-white px-3 py-2 text-[15px] font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </FieldLabel>
            </div>
          </div>
        ) : null}
      </details>
    );
  }

  function nestedHeadingEditor(
    group: ScenarioDateGroup,
    section: ScenarioSectionGroup,
    node: ScenarioHierarchyNode,
  ) {
    return (
      <section
        data-scenario-heading-level={node.depth}
        className="rounded-lg border border-slate-200 bg-slate-50/70 p-2"
      >
        <details
          open={detailOpen(`heading:${node.id}`, true)}
          onToggle={(event) => rememberDetailState(`heading:${node.id}`, event)}
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[13px] font-bold text-[#0f2d4a] hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1b4d78]/25">
            <span>{scenarioHeadingName(node.depth)} {node.label}</span>
            <span className="text-xs font-semibold text-slate-500">{node.rows.length} skenario</span>
          </summary>
          <div className="mt-2 grid gap-3">
            <FieldLabel
              label={scenarioHeadingName(node.depth)}
              fieldId={`scenario-heading-${node.id}`}
              required
            >
              <div className="grid grid-cols-[64px_1fr] overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-[#1b4d78] focus-within:ring-2 focus-within:ring-[#1b4d78]/15">
                <span className="flex items-center justify-center border-r border-slate-200 bg-slate-50 text-xs font-bold text-[#0f2d4a]">{node.label}</span>
                <AutoResizeTextarea
                  value={node.title}
                  rows={1}
                  onChange={(event) => updateHeadingTitle(node.id, event.target.value)}
                  className="min-h-10 border-0 px-3 py-[11px] text-sm font-medium leading-[18px] outline-none"
                />
              </div>
            </FieldLabel>

            {node.rows.length ? (
              <DragDropList
                items={node.rows}
                onReorder={(nextRows) => replaceNodeRows(node, nextRows)}
                itemLabel={(_, index) => `skenario ${index + 1}`}
                renderItem={scenarioEditor}
              />
            ) : null}

            {node.children.length ? (
              <DragDropList
                items={node.children}
                onReorder={(nextChildren) => {
                  const hierarchy = buildScenarioHierarchy(section.rows);
                  const target = hierarchy.children
                    .flatMap(function walk(item): ScenarioHierarchyNode[] { return [item, ...item.children.flatMap(walk)]; })
                    .find((item) => item.id === node.id);
                  if (!target) return;
                  target.children = nextChildren;
                  replaceSectionRows(section, flattenScenarioHierarchy(hierarchy));
                }}
                itemLabel={(child) => `${scenarioHeadingName(child.depth).toLowerCase()} ${child.label}`}
                renderItem={(child) => nestedHeadingEditor(group, section, child)}
              />
            ) : null}

            <div className="flex flex-wrap justify-end gap-1.5">
              <IconButton
                aria-label="Tambah skenario"
                onClick={() => addScenarioAtPath(group, section, node.path)}
                data-scenario-add={`heading-${node.depth}-scenario`}
              >
                <Plus size={16} /> Skenario
              </IconButton>
              {node.depth < 3 ? (
                <IconButton
                  aria-label={`Tambah ${scenarioHeadingName(node.depth + 1).toLowerCase()}`}
                  onClick={() => addChildHeading(group, section, node.path)}
                  data-scenario-add={`heading-${node.depth + 1}`}
                >
                  <Plus size={16} /> {scenarioHeadingName(node.depth + 1)}
                </IconButton>
              ) : null}
            </div>
          </div>
        </details>
      </section>
    );
  }

  return (
    <Panel>
      <SectionTitle
        title="Lampiran Skenario"
        action={(
          <div className="flex flex-wrap items-center justify-end gap-2" data-review-ignore>
            <input
              ref={scenarioImportInputRef}
              type="file"
              accept="application/json,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"
              className="hidden"
              onChange={handleScenarioImport}
              data-scenario-import-input
            />
            <IconButton
              onClick={() => scenarioImportInputRef.current?.click()}
              className="h-11"
            >
              <Upload size={16} />
              Import Skenario
            </IconButton>
            <IconButton
              onClick={() => setAllDetails(!allDetailsOpen)}
              aria-expanded={allDetailsOpen}
              aria-controls="appendix-scenario-groups"
              data-appendix-toggle-all
              className="h-11"
            >
              {allDetailsOpen ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              {allDetailsOpen ? "Collapse All" : "Expand All"}
            </IconButton>
          </div>
        )}
      />
      {scenarioImportError ? (
        <div
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
          role="alert"
          aria-live="polite"
          data-scenario-import-error
        >
          {scenarioImportError}
        </div>
      ) : null}
      <div id="appendix-scenario-groups" className="mt-4">
        <DragDropList
          items={groups}
          onReorder={reorderDateGroups}
          listId="scenario-dates"
          onCrossReorder={moveAppendixItem}
          itemLabel={(_, index) => `tanggal ${index + 1}`}
          renderItem={(group, groupIndex) => (
            <section
              data-scenario-date-group={group.id}
              className="rounded-xl border border-[#c9d3df] bg-[#f7f9fc] p-2"
            >
              <details
                open={detailOpen(`date:${group.id}`, true)}
                onToggle={(event) => rememberDetailState(`date:${group.id}`, event)}
                className="group/date"
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm font-bold text-[#0f2d4a] hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1b4d78]/25">
                  <span>Tanggal {groupIndex + 1}</span>
                  <span className="text-xs font-semibold text-[#5b6778]">
                    {formatDateRangeID(group.startDate, group.endDate, group.dates)} · {group.rows.length} skenario
                  </span>
                </summary>
                <div className="mt-2 grid gap-3">
                  <FieldLabel
                    label={`Tanggal ${groupIndex + 1}`}
                    fieldId={`scenario-date-${group.rows[0]?.id}`}
                    required
                  >
                    <DateRangePicker
                      compact
                      startDate={group.startDate}
                      endDate={group.endDate}
                      dates={group.dates}
                      onChange={(value) => updateGroupDates(group, value)}
                    />
                  </FieldLabel>

                  {buildScenarioHierarchy(group.rows).rows.length ? (
                    <DragDropList
                      items={buildScenarioHierarchy(group.rows).rows}
                      onReorder={(nextRows) => replaceRootRows(group, nextRows)}
                      itemLabel={(_, index) => `skenario ${index + 1}`}
                      renderItem={scenarioEditor}
                    />
                  ) : null}

                  <DragDropList
                    items={scenarioSectionGroups(group.rows)}
                    onReorder={(nextSections) => reorderSections(group, nextSections)}
                    listId={group.id}
                    withContext={false}
                    itemLabel={(section) => `bagian ${section.marker}`}
                    renderItem={(section) => (
                      <section data-scenario-heading-level="1" className="rounded-xl border border-[#d8e1eb] bg-white p-2">
                        <details
                          open={detailOpen(`section:${section.id}`, true)}
                          onToggle={(event) => rememberDetailState(`section:${section.id}`, event)}
                          className="group/section"
                        >
                          <summary className="grid min-h-11 cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg px-2 py-1.5 text-sm font-bold text-[#0f2d4a] hover:bg-[#f7f9fc] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1b4d78]/25">
                            <span>Bagian {section.marker}</span>
                            <span className="min-w-0 text-right text-xs font-semibold text-[#5b6778]">
                              <span data-scenario-section-title className="block break-words">
                                {section.title || "Belum diberi nama"}
                              </span>
                              <span data-scenario-section-count className="mt-0.5 block whitespace-nowrap">
                                {section.rows.length} skenario
                              </span>
                            </span>
                          </summary>
                          <div className="mt-2">
                            <FieldLabel
                              label="Bagian"
                              fieldId={`scenario-section-${section.rows[0]?.id}`}
                              required
                            >
                              <div className="grid grid-cols-[42px_1fr] overflow-hidden rounded-lg border border-slate-400 bg-white focus-within:border-slate-900 focus-within:ring-2 focus-within:ring-slate-900/10">
                                <span className="flex items-center justify-center border-r border-slate-300 bg-slate-100 text-sm font-bold text-[#0f2d4a]">
                                  {section.marker}
                                </span>
                                <AutoResizeTextarea
                                  value={section.title}
                                  rows={1}
                                  onChange={(event) => updateSectionTitle(section, event.target.value)}
                                  className="min-h-10 border-0 px-3 py-[11px] text-[15px] font-medium leading-[18px] outline-none"
                                />
                              </div>
                            </FieldLabel>

                            <div className="mt-3">
                              <DragDropList
                                items={buildScenarioHierarchy(section.rows).children.find((node) => node.id === section.id)?.rows ?? []}
                                onReorder={(nextSectionRows) => {
                                  const node = buildScenarioHierarchy(section.rows).children.find((item) => item.id === section.id);
                                  if (node) replaceNodeRows(node, nextSectionRows);
                                }}
                                listId={scenarioListId(section.id)}
                                withContext={false}
                                itemLabel={(_, index) => `skenario ${index + 1}`}
                                renderItem={(row, rowIndex) => scenarioEditor(row, rowIndex)}
                              />
                            </div>

                            {(() => {
                              const sectionNode = buildScenarioHierarchy(section.rows).children.find((node) => node.id === section.id);
                              if (!sectionNode?.children.length) return null;
                              return (
                                <div className="mt-3">
                                  <DragDropList
                                    items={sectionNode.children}
                                    onReorder={(nextChildren) => {
                                      const hierarchy = buildScenarioHierarchy(section.rows);
                                      const target = hierarchy.children.find((node) => node.id === section.id);
                                      if (!target) return;
                                      target.children = nextChildren;
                                      replaceSectionRows(section, flattenScenarioHierarchy(hierarchy));
                                    }}
                                    itemLabel={(node) => `${scenarioHeadingName(node.depth).toLowerCase()} ${node.label}`}
                                    renderItem={(node) => nestedHeadingEditor(group, section, node)}
                                  />
                                </div>
                              );
                            })()}

                            <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                              <IconButton
                                onClick={() => addScenarioToSection(group, section)}
                                data-scenario-add="section-scenario"
                              >
                                <Plus size={16} />
                                Skenario
                              </IconButton>
                              <IconButton
                                aria-label="Tambah subbagian"
                                onClick={() => {
                                  const path = scenarioHeadingPath(section.rows[0] ?? createScenarioRow()).slice(0, 1);
                                  addChildHeading(group, section, path);
                                }}
                                data-scenario-add="section-subbagian"
                              >
                                <Plus size={16} /> Subbagian
                              </IconButton>
                            </div>
                          </div>
                        </details>
                      </section>
                    )}
                  />

                  <div className="flex flex-wrap gap-2">
                    <IconButton onClick={() => addDateAfterGroup(group)} data-scenario-add="date-date">
                      <Plus size={16} />
                      Tanggal
                    </IconButton>
                    <IconButton onClick={() => addSectionToGroup(group)} data-scenario-add="date-section">
                      <Plus size={16} />
                      Bagian
                    </IconButton>
                    <IconButton
                      aria-label="Tambah skenario tanpa bagian"
                      onClick={() => addRootScenario(group)}
                      data-scenario-add="date-scenario"
                    >
                      <Plus size={16} /> Skenario
                    </IconButton>
                  </div>
                </div>
              </details>
            </section>
          )}
        />
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
            {validationIssues.map((issue) => (
              <li key={issue.id} data-validation-issue-id={issue.id}>- {issue.label}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <ScenarioImportDialog
        preview={workbookPreview}
        selectedSheetName={selectedWorkbookSheet}
        onSelectSheet={setSelectedWorkbookSheet}
        onCancel={() => {
          setWorkbookPreview(null);
          setSelectedWorkbookSheet("");
        }}
        onImport={applyWorkbookImport}
      />
    </Panel>
  );
}

export function MemoBuilderApp() {
  const appRootRef = useRef<HTMLElement>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editControlKeysRef = useRef(new WeakMap<HTMLElement, string>());
  const editControlIndexRef = useRef(0);
  const [isExporting, setIsExporting] = useState(false);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [commentMode, setCommentMode] = useState(false);
  const [commentDialog, setCommentDialog] = useState<CommentDialogState | null>(null);
  const [commentText, setCommentText] = useState("");
  const [collaboratorName, setCollaboratorName] = useState("");
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [identityDialog, setIdentityDialog] = useState<IdentityDialogState | null>(null);
  const [identityInput, setIdentityInput] = useState("");
  const [editorPanePercent, setEditorPanePercent] = useState(40);
  const draft = useMemoDraftStore((state) => state.draft);
  const hasLoaded = useMemoDraftStore((state) => state.hasLoaded);
  const updateDraft = useMemoDraftStore((state) => state.updateDraft);
  const updateMetadata = useMemoDraftStore((state) => state.updateMetadata);
  const replaceDraft = useMemoDraftStore((state) => state.replaceDraft);
  const loadFromLocal = useMemoDraftStore((state) => state.loadFromLocal);
  const saveToLocal = useMemoDraftStore((state) => state.saveToLocal);
  const importDraft = useMemoDraftStore((state) => state.importDraft);
  const resetDraft = useMemoDraftStore((state) => state.resetDraft);
  const undo = useMemoDraftStore((state) => state.undo);
  const beginEditSession = useMemoDraftStore((state) => state.beginEditSession);
  const commitEditSession = useMemoDraftStore((state) => state.commitEditSession);
  const hasActiveEditChanges = useMemoDraftStore(
    (state) => state.hasActiveEditChanges,
  );
  const collaboration = useMemoCollaboration(draft, replaceDraft, collaboratorName);

  const pages = useMemo(() => paginateMemoDraft(draft), [draft]);

  useEffect(() => {
    loadFromLocal();
  }, [loadFromLocal]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const identity = getStoredCollaboratorIdentity();
      setCollaboratorName(identity?.name ?? "");
      setIdentityLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!identityLoaded || collaboratorName.trim() || identityDialog) return;
    const timer = window.setTimeout(() => {
      const roomId = new URL(window.location.href).searchParams.get("room");
      if (roomId) {
        setIdentityInput("");
        setIdentityDialog({ action: "join-collab" });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [collaboratorName, identityDialog, identityLoaded]);

  useEffect(() => {
    if (!hasLoaded) return;
    const timer = window.setInterval(saveToLocal, 3000);
    return () => window.clearInterval(timer);
  }, [hasLoaded, saveToLocal]);

  useEffect(() => {
    document.body.classList.toggle("is-review-commenting", commentMode);
    return () => document.body.classList.remove("is-review-commenting");
  }, [commentMode]);

  useEffect(() => {
    const handleUndo = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "z" ||
        (!event.ctrlKey && !event.metaKey) ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      const nativeInputTypes = new Set([
        "text",
        "search",
        "email",
        "url",
        "tel",
        "password",
        "number",
        "date",
        "datetime-local",
        "month",
        "time",
        "week",
      ]);
      const usesNativeUndo =
        (target instanceof HTMLInputElement && nativeInputTypes.has(target.type)) ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement &&
          (target.isContentEditable || target.closest(".ProseMirror")));
      if (usesNativeUndo && hasActiveEditChanges()) {
        return;
      }

      event.preventDefault();
      undo();
    };

    window.addEventListener("keydown", handleUndo);
    return () => window.removeEventListener("keydown", handleUndo);
  }, [hasActiveEditChanges, undo]);

  function editControlFromTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return null;
    return target.closest<HTMLElement>(
      'input:not([type="file"]), textarea, select, .ProseMirror',
    );
  }

  function editKeyForControl(control: HTMLElement) {
    const existing = editControlKeysRef.current.get(control);
    if (existing) return existing;

    const fieldId = control.closest<HTMLElement>("[data-field-id]")?.dataset.fieldId;
    const key = fieldId
      ? `${fieldId}:${control.tagName.toLowerCase()}`
      : `editable-${++editControlIndexRef.current}`;
    editControlKeysRef.current.set(control, key);
    return key;
  }

  function handleEditFocus(event: React.FocusEvent<HTMLElement>) {
    const control = editControlFromTarget(event.target);
    if (control) beginEditSession(editKeyForControl(control));
  }

  function handleEditBlur(event: React.FocusEvent<HTMLElement>) {
    const control = editControlFromTarget(event.target);
    if (!control) return;
    const key = editKeyForControl(control);
    queueMicrotask(() => commitEditSession(key));
  }

  function saveDraftData() {
    downloadBlob(
      new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
      `${safeFilePart(draft.metadata.projectName)}_MEMO.json`,
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
    setCommentText("");
    setCommentDialog({ mode: "add", target });
  }

  function openEditComment(comment: ReviewComment) {
    setReviewOpen(true);
    setCommentMode(false);
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

  function openReplyComment(comment: ReviewComment) {
    setReviewOpen(true);
    setCommentMode(false);
    setCommentText("");
    setCommentDialog({
      mode: "reply",
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

  function navigatePreviewField(fieldId: string) {
    const focused = focusEditorField(fieldId);
    window.dispatchEvent(new CustomEvent(FIELD_NAVIGATION_EVENT, { detail: { fieldId } }));
    return focused;
  }

  function createAuditEntry(
    action: ReviewAuditAction,
    actor: string,
    description: string,
    options: { commentId?: string; targetLabel?: string } = {},
  ): ReviewAuditLogEntry {
    return {
      id: createId("audit"),
      action,
      actor,
      description,
      commentId: options.commentId,
      targetLabel: options.targetLabel,
      createdAt: new Date().toISOString(),
    };
  }

  function updateReviewState(
    updater: (state: {
      comments: ReviewComment[];
      auditLog: ReviewAuditLogEntry[];
    }) => {
      comments: ReviewComment[];
      auditLog: ReviewAuditLogEntry[];
    },
    recordHistory = false,
  ) {
    updateDraft((current) => {
      const next = updater({
        comments: current.reviewComments ?? [],
        auditLog: current.reviewAuditLog ?? [],
      });
      return {
        ...current,
        reviewComments: next.comments,
        reviewAuditLog: next.auditLog,
      };
    }, recordHistory);
  }

  function appendAuditEntry(entry: ReviewAuditLogEntry) {
    updateReviewState(({ comments, auditLog }) => ({
      comments,
      auditLog: [...auditLog, entry],
    }));
  }

  function startCollaboration(name: string) {
    appendAuditEntry(createAuditEntry(
      "collaboration-started",
      name,
      "memulai kolaborasi",
    ));
    collaboration.start(name);
  }

  function requestStartCollaboration() {
    if (collaboratorName.trim()) {
      startCollaboration(collaboratorName.trim());
      return;
    }
    setIdentityInput("");
    setIdentityDialog({ action: "start-collab" });
  }

  function requestToggleCommentMode() {
    setReviewOpen(true);
    if (commentMode) {
      setCommentMode(false);
      return;
    }
    if (collaboratorName.trim()) {
      setCommentMode(true);
      return;
    }
    setIdentityInput("");
    setIdentityDialog({ action: "add-comment" });
  }

  function continueIdentityDialog() {
    if (!identityDialog) return;
    const cleanName = identityInput.trim();
    if (!cleanName) return;

    saveCollaboratorIdentity(cleanName);
    setCollaboratorName(cleanName);

    if (identityDialog.action === "start-collab") {
      startCollaboration(cleanName);
    } else if (identityDialog.action === "add-comment") {
      setReviewOpen(true);
      setCommentMode(true);
    }

    setIdentityDialog(null);
    setIdentityInput("");
  }

  function cancelIdentityDialog() {
    if (identityDialog?.action === "join-collab") {
      collaboration.leave();
    }
    setIdentityDialog(null);
    setIdentityInput("");
  }

  function saveReviewComment() {
    if (!commentDialog) return;

    const author = collaboratorName.trim();
    const text = commentText.trim();
    if (!author || !text) return;

    const now = new Date().toISOString();

    updateReviewState(({ comments, auditLog }) => {
      if (commentDialog.mode === "edit" && commentDialog.commentId) {
        return {
          comments: comments.map((comment) =>
          comment.id === commentDialog.commentId
            ? {
                ...comment,
                ...commentDialog.target,
                text,
                resolved: false,
                updatedAt: now,
              }
            : comment,
          ),
          auditLog: [
            ...auditLog,
            createAuditEntry(
              "comment-edited",
              author,
              `mengedit komentar pada ${commentDialog.target.targetLabel}`,
              {
                commentId: commentDialog.commentId,
                targetLabel: commentDialog.target.targetLabel,
              },
            ),
          ],
        };
      }

      if (commentDialog.mode === "reply" && commentDialog.commentId) {
        return {
          comments: comments.map((comment) =>
            comment.id === commentDialog.commentId
              ? {
                  ...comment,
                  resolved: false,
                  updatedAt: now,
                  replies: [
                    ...comment.replies,
                    {
                      id: createId("reply"),
                      author,
                      text,
                      createdAt: now,
                    },
                  ],
                }
              : comment,
          ),
          auditLog: [
            ...auditLog,
            createAuditEntry(
              "comment-replied",
              author,
              `membalas komentar pada ${commentDialog.target.targetLabel}`,
              {
                commentId: commentDialog.commentId,
                targetLabel: commentDialog.target.targetLabel,
              },
            ),
          ],
        };
      }

      const commentId = createId("comment");
      return {
        comments: [
          ...comments,
          {
            id: commentId,
            ...commentDialog.target,
            author,
            text,
            resolved: false,
            createdAt: now,
            updatedAt: now,
            replies: [],
          },
        ],
        auditLog: [
          ...auditLog,
          createAuditEntry(
            "comment-created",
            author,
            `menambahkan komentar pada ${commentDialog.target.targetLabel}`,
            {
              commentId,
              targetLabel: commentDialog.target.targetLabel,
            },
          ),
        ],
      };
    });

    setCommentDialog(null);
    setCommentMode(false);
    setReviewOpen(true);
  }

  function toggleResolveComment(comment: ReviewComment) {
    const now = new Date().toISOString();
    const nextResolved = !comment.resolved;
    updateReviewState(({ comments, auditLog }) => ({
      comments: comments.map((item) =>
        item.id === comment.id
          ? { ...item, resolved: nextResolved, updatedAt: now }
          : item,
      ),
      auditLog: [
        ...auditLog,
        createAuditEntry(
          nextResolved ? "comment-resolved" : "comment-reopened",
          collaboratorName,
          `${nextResolved ? "menyelesaikan" : "membuka kembali"} komentar pada ${comment.targetLabel}`,
          { commentId: comment.id, targetLabel: comment.targetLabel },
        ),
      ],
    }));
  }

  function deleteReviewComment(comment: ReviewComment) {
    updateReviewState(
      ({ comments, auditLog }) => ({
        comments: comments.filter((item) => item.id !== comment.id),
        auditLog: [
          ...auditLog,
          createAuditEntry(
            "comment-deleted",
            collaboratorName,
            `menghapus komentar pada ${comment.targetLabel}`,
            { commentId: comment.id, targetLabel: comment.targetLabel },
          ),
        ],
      }),
      true,
    );
  }

  const unresolvedReviewCount = (draft.reviewComments ?? []).filter((comment) => !comment.resolved).length;

  if (!hasLoaded) {
    return (
      <main className="grid min-h-dvh place-items-center" data-suite-ui>
        <div className="rounded-[22px] border border-[#c9d3df] bg-white px-5 py-4 text-sm font-medium text-[#5b6778] shadow-[0_18px_40px_rgba(31,45,61,0.08)]">
          Memuat draft lokal...
        </div>
      </main>
    );
  }

  return (
    <main
      ref={appRootRef}
      onClickCapture={handleReviewTargetClick}
      onFocusCapture={handleEditFocus}
      onBlurCapture={handleEditBlur}
      className="min-h-dvh bg-slate-100 text-slate-950"
      data-suite-ui
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImport}
        data-draft-import-input
      />
      <header className="sticky z-30 border-b border-[#d8e2ec] bg-white/95 backdrop-blur">
        <div className="flex w-full flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between xl:px-6">
          <div>
            <h1 className="text-[32px] font-bold leading-tight tracking-tight text-[#0f2d4a]">Memo Generator</h1>
            <p className="hidden">
              {draft.metadata.perihal} - {pages.length} preview pages -{" "}
              {" "}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2" data-review-ignore>
            <CollaborationPanel
              collaboration={collaboration}
              onStart={requestStartCollaboration}
            />
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

      <div
        ref={splitContainerRef}
        className="grid w-full gap-4 px-3 py-4 xl:grid-cols-[minmax(0,var(--editor-pane))_12px_minmax(0,var(--preview-pane))] xl:gap-0 xl:px-4"
        style={{
          "--editor-pane": `${editorPanePercent}fr`,
          "--preview-pane": `${100 - editorPanePercent}fr`,
        } as React.CSSProperties}
      >
        <div data-editor-pane className="grid min-w-0 content-start gap-4 xl:pr-2">
          <Panel>
            <SectionTitle title="Kepada" />
            <div className="mt-6">
              <RecipientList
                recipients={draft.recipients}
                onChange={(recipients, options) =>
                  updateDraft(
                    (current) => ({ ...current, recipients }),
                    options?.recordHistory,
                  )
                }
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
                  dates={draft.pilotSchedule.dates}
                  onChange={(pilotSchedule) =>
                    updateDraft((current) => ({ ...current, pilotSchedule }), true)
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
                      }), true)
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
                  }), true)
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
                required
                genderRequired={false}
                genderPlaceholder="Sapaan"
                defaultGender=""
                onChange={(ccRecipients, options) =>
                  updateDraft(
                    (current) => ({ ...current, ccRecipients }),
                    options?.recordHistory,
                  )
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
            validationIssues={validationIssues}
          />
        </div>

        <button
          type="button"
          role="separator"
          aria-label="Geser pembagi input dan preview"
          aria-orientation="vertical"
          aria-valuemin={25}
          aria-valuemax={70}
          aria-valuenow={Math.round(editorPanePercent)}
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            const bounds = splitContainerRef.current?.getBoundingClientRect();
            if (!bounds) return;
            setEditorPanePercent(Math.min(70, Math.max(25, ((event.clientX - bounds.left) / bounds.width) * 100)));
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            setEditorPanePercent((value) => Math.min(70, Math.max(25, value + (event.key === "ArrowRight" ? 2 : -2))));
          }}
          className="group hidden cursor-col-resize touch-none items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1b4d78]/30 xl:flex"
        >
          <span className="h-14 w-1 rounded-full bg-[#b9c9dc] transition group-hover:bg-[#1b4d78]" />
        </button>

        <aside
          data-preview-pane
          className="sticky top-[112px] max-h-[calc(100dvh-128px)] min-w-0 self-start overflow-hidden rounded-[22px] border border-[#c9d3df] bg-[#f7f9fc] shadow-[0_18px_40px_rgba(31,45,61,0.08)] xl:ml-2"
        >
          <div className="max-h-[calc(100dvh-128px)] overflow-auto">
            <div className="flex items-center justify-between border-b border-[#c9d3df] bg-white px-5 py-3">
              <div>
                <h2 className="text-sm font-bold text-[#0f2d4a]">Preview</h2>
              </div>
              <span className="inline-flex items-center gap-2 rounded-[12px] bg-[#d9e8f5] px-2.5 py-1 text-xs font-medium text-[#0f2d4a] ring-1 ring-[#c9d3df]">
                <FileText size={14} />
                {pages.length} pages
              </span>
            </div>
            <div className="min-w-[1144px]">
              <MemoPreview draft={draft} onNavigateField={navigatePreviewField} />
            </div>
          </div>
        </aside>
      </div>
      <footer className="mx-auto mt-4 w-full px-4 pb-8 pt-4 text-center text-[13px] font-extrabold tracking-[0.02em] text-[#5b6778] before:mx-auto before:mb-3.5 before:block before:h-px before:w-[min(420px,72%)] before:bg-gradient-to-r before:from-transparent before:via-[#c9d3df] before:to-transparent before:content-['']">
        Developed by Alex Surya Marcelo (UAT - A) &bull; Memo Generator
      </footer>
      <ReviewCommentsPopup
        open={reviewOpen}
        comments={draft.reviewComments ?? []}
        auditLog={draft.reviewAuditLog ?? []}
        commentMode={commentMode}
        onToggleOpen={() => setReviewOpen((current) => !current)}
        onToggleCommentMode={requestToggleCommentMode}
        onFocus={(comment) => focusReviewTarget(comment, appRootRef.current)}
        onReply={openReplyComment}
        onEdit={openEditComment}
        onToggleResolve={toggleResolveComment}
        onDelete={deleteReviewComment}
      />
      <ReviewCommentDialog
        state={commentDialog}
        actor={collaboratorName}
        text={commentText}
        onTextChange={setCommentText}
        onCancel={() => setCommentDialog(null)}
        onSave={saveReviewComment}
      />
      <CollaboratorIdentityDialog
        state={identityDialog}
        name={identityInput}
        onNameChange={setIdentityInput}
        onCancel={cancelIdentityDialog}
        onContinue={continueIdentityDialog}
      />
      <div
        className="fixed bottom-[18px] right-[18px] z-40 flex flex-col gap-2 rounded-[10px] border border-[#c9d3df]/90 bg-white/95 p-2 shadow-[0_16px_34px_rgba(23,32,42,0.16)] backdrop-blur max-[760px]:bottom-3 max-[760px]:right-3 max-[760px]:flex-row"
        data-review-ignore
      >
        <button
          type="button"
          onClick={exportDocx}
          disabled={isExporting}
          aria-label="Buat dokumen Word cepat"
          className="inline-flex min-h-10 min-w-32 items-center justify-center gap-2 rounded-md border border-[#1b4d78] bg-[#1b4d78] px-3 text-[13px] font-extrabold leading-none text-white shadow-[0_10px_22px_rgba(27,77,120,0.18)] transition hover:bg-[#163754] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 disabled:cursor-not-allowed disabled:opacity-45 max-[760px]:min-w-0"
          data-floating-generate
        >
          <Download size={16} />
          Generate Docx
          <span className="rounded-full bg-white/20 px-2 py-1 text-[11px] font-black leading-none text-white">
            {pages.length} pages
          </span>
        </button>
        <button
          type="button"
          onClick={() => setReviewOpen((current) => !current)}
          className="inline-flex min-h-10 min-w-32 items-center justify-center gap-2 rounded-md border border-[#1b4d78] bg-[#1b4d78] px-3 text-[13px] font-extrabold leading-none text-white shadow-[0_10px_22px_rgba(27,77,120,0.18)] transition hover:bg-[#163754] focus:outline-none focus:ring-2 focus:ring-[#2563eb]/20 max-[760px]:min-w-0"
          aria-expanded={reviewOpen}
          aria-controls="review-comments-popup"
          aria-label="Komentar Review"
          title="Komentar review"
        >
          <MessageSquare size={16} />
          Comment
          {unresolvedReviewCount ? (
            <span className="rounded-full bg-[#fff200] px-2 py-1 text-[11px] font-black leading-none text-[#5c4300]">{unresolvedReviewCount}</span>
          ) : null}
        </button>
      </div>
    </main>
  );
}
