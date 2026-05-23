"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Copy,
  Download,
  FileJson,
  FileText,
  Link,
  Plus,
  RefreshCcw,
  Share2,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import type {
  ActivityRow,
  Bureau,
  DevelopmentRow,
  MemoDraft,
  MemoMetadata,
  MemoType,
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
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid content-start gap-1 text-xs font-medium text-slate-600">
      {label}
      {children}
    </label>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-[#d8e2ec] bg-white p-8 shadow-sm ${className}`}>
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
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  const variants = {
    primary: "border-slate-900 bg-slate-900 text-white hover:bg-slate-800",
    secondary: "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
    danger: "border-rose-200 bg-white text-rose-600 hover:bg-rose-50",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

function parseRoomInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    return url.searchParams.get("room") ?? trimmed;
  } catch {
    return trimmed;
  }
}

function CollaborationModal({
  open,
  onClose,
  collaboration,
}: {
  open: boolean;
  onClose: () => void;
  collaboration: ReturnType<typeof useMemoCollaboration>;
}) {
  const [joinValue, setJoinValue] = useState("");
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  async function copyLink() {
    await collaboration.copyLink();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-[#0f2d4a]">Collab</h2>
            <p className="text-xs text-slate-500">
              {collaboration.active ? `Room ${collaboration.roomId}` : "Buat room atau join dari link"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label="Tutup collaboration"
          >
            <X size={16} />
          </button>
        </div>
        <div className="grid gap-5 px-5 py-5">
          <div className="grid gap-2">
            <IconButton
              onClick={() => {
                collaboration.start();
                setCopied(false);
              }}
              variant="primary"
            >
              <Share2 size={16} />
              {collaboration.active ? "Buat Room Baru" : "Buat Room"}
            </IconButton>
          </div>

          <div className="grid gap-2">
            <label className="text-xs font-medium text-slate-600" htmlFor="join-room">Join room</label>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                id="join-room"
                value={joinValue}
                placeholder="Kode room atau link"
                onChange={(event) => setJoinValue(event.target.value)}
                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              />
              <IconButton
                onClick={() => {
                  const roomId = parseRoomInput(joinValue);
                  if (roomId) collaboration.join(roomId);
                }}
              >
                <Link size={16} />
                Join
              </IconButton>
            </div>
          </div>

          {collaboration.active ? (
            <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
              <input
                readOnly
                value={collaboration.shareLink}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-700 outline-none"
                aria-label="Share link"
              />
              <div className="flex flex-wrap gap-2">
                <IconButton onClick={copyLink}>
                  <Copy size={16} />
                  {copied ? "Copied" : "Copy Link"}
                </IconButton>
                <IconButton onClick={() => collaboration.leave()} variant="danger">
                  <X size={16} />
                  Leave
                </IconButton>
              </div>
              <p className="text-xs text-slate-500">
                {collaboration.statusLabel} - {Math.max(1, collaboration.collaborators.length)} user -{" "}
                {collaboration.lastSyncedAt ?? "-"}
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function CollaborationStatusBar({
  collaboration,
}: {
  collaboration: ReturnType<typeof useMemoCollaboration>;
}) {
  const statusColor =
    collaboration.status === "connected"
      ? "bg-emerald-500"
      : collaboration.status === "reconnecting"
        ? "bg-amber-500"
        : "bg-slate-400";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex h-8 items-center gap-2 rounded-full border border-[#c6d3e1] bg-[#edf4fb] px-3 text-xs font-medium text-[#0f2d4a]">
        <span className={`h-2 w-2 rounded-full ${statusColor}`} />
        {collaboration.statusLabel}
      </span>
      {collaboration.active ? (
        <span className="inline-flex h-8 items-center gap-2 rounded-full border border-[#c6d3e1] bg-[#edf4fb] px-3 text-xs font-medium text-[#0f2d4a]">
          <Users size={14} />
          {Math.max(1, collaboration.collaborators.length)} user
        </span>
      ) : null}
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
  const { register } = useForm<MemoMetadata>({
    defaultValues: metadata,
  });
  const [autoPerihal, setAutoPerihal] = useState(metadata.autoPerihal);

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

        if (name === "autoPerihal") {
          setAutoPerihal(Boolean(value));
        }

        updateMetadata({ [name]: value } as Partial<MemoMetadata>);
      },
    };
  }

  return (
    <Panel>
      <SectionTitle title="Metadata" />
      <div className="mt-5 grid gap-5">
        <div className="grid gap-3 md:grid-cols-2">
          <FieldLabel label="Jenis Implementasi">
            <select
              {...registerField("memoType")}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            >
              {memoTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </FieldLabel>
          <FieldLabel label="Bureau UAT">
            <select
              {...registerField("bureau")}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            >
              {bureaus.map((bureau) => (
                <option key={bureau}>{bureau}</option>
              ))}
            </select>
          </FieldLabel>
        </div>
        <FieldLabel label="Nama Project">
          <input
            {...registerField("projectName")}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
        </FieldLabel>
        <div className="grid gap-2">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              {...registerField("autoPerihal")}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
            Perihal otomatis
          </label>
          {autoPerihal ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
              {metadata.perihal}
            </div>
          ) : (
            <input
              {...registerField("perihal")}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
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
      <SectionTitle
        title="Lingkup Pengembangan"
        action={
          <IconButton onClick={() => setRows([...rows, createDevelopmentRow()])}>
            <Plus size={16} />
            Row
          </IconButton>
        }
      />
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
              <div className="grid items-start gap-3 lg:grid-cols-2">
                <FieldLabel label="Item">
                  <RichTextEditor
                    value={row.item}
                    minHeight={105}
                    onChange={(value) =>
                      setRows(rows.map((item) => (item.id === row.id ? { ...item, item: value } : item)))
                    }
                  />
                </FieldLabel>
                <FieldLabel label="Keterangan">
                  <RichTextEditor
                    value={row.description}
                    minHeight={105}
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
      <SectionTitle
        title="Aktivitas Cabang dan Unit Kerja"
        action={
          <IconButton onClick={() => setRows([...rows, createActivityRow()])}>
            <Plus size={16} />
            Aktivitas
          </IconButton>
        }
      />
      <div className="mt-4">
        <DragDropList
          items={rows}
          onReorder={setRows}
          itemLabel={(row, index) => row.owner || `aktivitas ${index + 1}`}
          renderItem={(row) => (
            <div className="grid gap-3">
              <div className="grid items-end gap-3 lg:grid-cols-[minmax(280px,1fr)_minmax(280px,1fr)_42px]">
                <DateRangePicker
                  compact
                  startDate={row.startDate}
                  endDate={row.endDate}
                  onChange={(value) =>
                    setRows(rows.map((item) => (item.id === row.id ? { ...item, ...value } : item)))
                  }
                />
                <FieldLabel label="PIC">
                  <input
                    value={row.owner}
                    onChange={(event) =>
                      setRows(
                        rows.map((item) =>
                          item.id === row.id ? { ...item, owner: event.target.value } : item,
                        ),
                      )
                    }
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  />
                </FieldLabel>
                <button
                  type="button"
                  onClick={() => setRows(rows.filter((item) => item.id !== row.id))}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                  aria-label="Hapus aktivitas"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <FieldLabel label="Aktivitas">
                <RichTextEditor
                  value={row.activity}
                  minHeight={100}
                  onChange={(value) =>
                    setRows(rows.map((item) => (item.id === row.id ? { ...item, activity: value } : item)))
                  }
                />
              </FieldLabel>
            </div>
          )}
        />
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
            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
          />
          Tampilkan Referensi
        </label>
        {draft.referenceEnabled ? (
          <div className="grid gap-3">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
              Memorandum ini mengacu pada.
            </div>
            <FieldLabel label="Daftar Referensi">
              <textarea
                value={richTextToPlainText(draft.reference)}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    reference: paragraphRichText(event.target.value),
                  }))
                }
                rows={5}
                className="min-h-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
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
      <SectionTitle
        title="PIC yang Dapat Dihubungi"
        action={
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
        }
      />
      <div className="mt-4">
        <DragDropList
          items={draft.contacts}
          onReorder={setRows}
          itemLabel={(contact, index) => contact.name || `PIC ${index + 1}`}
          renderItem={(contact) => (
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_40px]">
              <FieldLabel label="Nama">
                <input
                  value={contact.name}
                  onChange={(event) =>
                    setRows(
                      draft.contacts.map((item) =>
                        item.id === contact.id ? { ...item, name: event.target.value } : item,
                      ),
                    )
                  }
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </FieldLabel>
              <FieldLabel label="Email">
                <input
                  value={contact.email}
                  onChange={(event) =>
                    setRows(
                      draft.contacts.map((item) =>
                        item.id === contact.id ? { ...item, email: event.target.value } : item,
                      ),
                    )
                  }
                  className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
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
    </Panel>
  );
}

function AppendixPanel({
  rows,
  updateDraft,
}: {
  rows: ScenarioRow[];
  updateDraft: (updater: (draft: MemoDraft) => MemoDraft) => void;
}) {
  function setRows(nextRows: ScenarioRow[]) {
    updateDraft((draft) => ({ ...draft, appendixScenarios: nextRows }));
  }

  return (
    <Panel>
      <SectionTitle
        title="Lampiran Skenario"
        action={
          <IconButton onClick={() => setRows([...rows, createScenarioRow()])}>
            <Plus size={16} />
            Skenario
          </IconButton>
        }
      />
      <div className="mt-4">
        <DragDropList
          items={rows}
          onReorder={setRows}
          itemLabel={(row, index) => row.section || `skenario ${index + 1}`}
          renderItem={(row) => (
            <div className="grid gap-3">
              <div className="grid items-end gap-3 lg:grid-cols-[minmax(240px,0.9fr)_minmax(220px,1fr)_minmax(220px,1fr)_42px]">
                <FieldLabel label="Tanggal">
                  <DateRangePicker
                    compact
                    startDate={row.startDate}
                    endDate={row.endDate}
                    onChange={(value) =>
                      setRows(rows.map((item) => (item.id === row.id ? { ...item, ...value } : item)))
                    }
                  />
                </FieldLabel>
                <FieldLabel label="Bagian">
                  <input
                    value={row.section}
                    onChange={(event) =>
                      setRows(
                        rows.map((item) =>
                          item.id === row.id ? { ...item, section: event.target.value } : item,
                        ),
                      )
                    }
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  />
                </FieldLabel>
                <FieldLabel label="PIC">
                  <input
                    value={row.pic}
                    onChange={(event) =>
                      setRows(rows.map((item) => (item.id === row.id ? { ...item, pic: event.target.value } : item)))
                    }
                    className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  />
                </FieldLabel>
                <button
                  type="button"
                  onClick={() => {
                    const nextRows = rows.filter((item) => item.id !== row.id);
                    setRows(nextRows.length ? nextRows : [createScenarioRow()]);
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
                  aria-label="Hapus skenario"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                <FieldLabel label="Skenario">
                  <RichTextEditor
                    value={row.scenario}
                    minHeight={110}
                    onChange={(value) =>
                      setRows(rows.map((item) => (item.id === row.id ? { ...item, scenario: value } : item)))
                    }
                  />
                </FieldLabel>
                <FieldLabel label="Expected Result">
                  <RichTextEditor
                    value={row.expectedResult}
                    minHeight={110}
                    onChange={(value) =>
                      setRows(
                        rows.map((item) =>
                          item.id === row.id ? { ...item, expectedResult: value } : item,
                        ),
                      )
                    }
                  />
                </FieldLabel>
                <FieldLabel label="Catatan">
                  <RichTextEditor
                    value={row.notes}
                    minHeight={110}
                    onChange={(value) =>
                      setRows(rows.map((item) => (item.id === row.id ? { ...item, notes: value } : item)))
                    }
                  />
                </FieldLabel>
              </div>
            </div>
          )}
        />
      </div>
    </Panel>
  );
}

export function MemoBuilderApp() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [collaborationOpen, setCollaborationOpen] = useState(false);
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
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const payload = JSON.parse(text);
    const mapped =
      payload.appendixScenarios || payload.metadata ? payload : generateMomJsonToMemoDraft(payload);

    importDraft(mapped);
    event.target.value = "";
  }

  async function exportDocx() {
    setIsExporting(true);
    try {
      const blob = await generateMemoDocxBlob(draft);
      downloadBlob(blob, memoDocxFileName(draft));
    } finally {
      setIsExporting(false);
    }
  }

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
    <main className="min-h-dvh bg-slate-100 text-slate-950">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImport}
      />
      <header className="sticky top-0 z-30 border-b border-[#d8e2ec] bg-white/95 backdrop-blur">
        <div className="flex w-full flex-col gap-3 px-10 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-[#0f2d4a]">Memo Generator</h1>
            <div className="mt-2">
              <CollaborationStatusBar collaboration={collaboration} />
            </div>
            <p className="hidden">
              {draft.metadata.perihal} - {pages.length} preview pages -{" "}
              {" "}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <IconButton onClick={() => setCollaborationOpen(true)}>
              <Share2 size={16} />
              Collaboration
            </IconButton>
            <IconButton onClick={saveDraftData}>
              <FileJson size={16} />
              Save Draft Data
            </IconButton>
            <IconButton onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
              Load Draft Data
            </IconButton>
            <IconButton onClick={exportDocx} disabled={isExporting} variant="primary">
              <Download size={16} />
              {isExporting ? "Exporting" : "DOCX"}
            </IconButton>
            <IconButton onClick={handleResetDraft}>
              <RefreshCcw size={16} />
              Reset Draft
            </IconButton>
          </div>
        </div>
      </header>

      <CollaborationModal
        open={collaborationOpen}
        onClose={() => setCollaborationOpen(false)}
        collaboration={collaboration}
      />

      <div className="grid w-full gap-4 px-6 py-5 xl:grid-cols-[minmax(0,40%)_minmax(0,60%)]">
        <div className="grid min-w-0 content-start gap-4">
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
              <DateRangePicker
                startDate={draft.pilotSchedule.startDate}
                endDate={draft.pilotSchedule.endDate}
                onChange={(pilotSchedule) =>
                  updateDraft((current) => ({ ...current, pilotSchedule }))
                }
              />
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
                      className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
                    >
                      <input
                        type="radio"
                        checked={draft.metadata.accessLinkEnabled === value}
                        onChange={() => updateMetadata({ accessLinkEnabled: Boolean(value) })}
                        className="h-4 w-4 border-slate-300 text-slate-900 focus:ring-slate-900"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <input
                value={draft.metadata.accessLink}
                disabled={!draft.metadata.accessLinkEnabled}
                onChange={(event) => updateMetadata({ accessLink: event.target.value })}
                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>
          </Panel>

          <ContactsPanel draft={draft} updateDraft={updateDraft} />

          <Panel>
            <SectionTitle
              title="Signature"
              action={
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
              }
            />
            <div className="mt-6 grid gap-3">
              {draft.signers.map((signer) => (
                <div key={signer.id} className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-[1fr_1fr_40px]">
                  <FieldLabel label="Nama">
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
                      className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    />
                  </FieldLabel>
                  <FieldLabel label="Jabatan">
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
                      className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
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
              <FieldLabel label="Inisial">
                <input
                  value={draft.initials}
                  onChange={(event) =>
                    updateDraft((current) => ({ ...current, initials: event.target.value }))
                  }
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
              </FieldLabel>
              <FieldLabel label="UAT">
                <select
                  value={draft.initialsBureau}
                  onChange={(event) =>
                    updateDraft((current) => ({
                      ...current,
                      initialsBureau: event.target.value as Bureau,
                    }))
                  }
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                >
                  {bureaus.map((bureau) => (
                    <option key={bureau} value={bureau}>UAT {bureau}</option>
                  ))}
                </select>
              </FieldLabel>
            </div>
          </Panel>

          <AppendixPanel rows={draft.appendixScenarios} updateDraft={updateDraft} />
        </div>

        <aside
          className="sticky top-[88px] max-h-[calc(100dvh-112px)] min-w-0 self-start overflow-hidden rounded-lg border border-[#d8e2ec] bg-[#edf4fb]"
        >
          <div className="max-h-[calc(100dvh-112px)] overflow-auto">
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
    </main>
  );
}
