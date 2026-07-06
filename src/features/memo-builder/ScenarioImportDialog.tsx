"use client";

import { FileSpreadsheet, X } from "lucide-react";
import type { ScenarioWorkbookPreview, ScenarioWorkbookSheet } from "@/utils/importScenarioWorkbook";

export function ScenarioImportDialog({
  preview,
  selectedSheetName,
  onSelectSheet,
  onCancel,
  onImport,
}: {
  preview: ScenarioWorkbookPreview | null;
  selectedSheetName: string;
  onSelectSheet: (name: string) => void;
  onCancel: () => void;
  onImport: (sheet: ScenarioWorkbookSheet) => void;
}) {
  if (!preview) return null;
  const selected = preview.sheets.find((sheet) => sheet.name === selectedSheetName) ?? preview.sheets[0];

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/45 p-[18px]" data-review-ignore>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="scenario-import-dialog-title"
        className="grid w-[min(520px,100%)] gap-4 rounded-xl border border-slate-200 bg-white p-[18px] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#e8f1f8] text-[#1b4d78]">
              <FileSpreadsheet size={19} />
            </span>
            <div className="min-w-0">
              <h2 id="scenario-import-dialog-title" className="text-base font-bold text-slate-900">
                Preview import skenario
              </h2>
              <p className="mt-1 text-[13px] font-medium text-slate-500">
                Kolom dan hierarki dikenali otomatis. Pilih sheet lalu import.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Tutup preview import"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#1b4d78]/25"
          >
            <X size={17} />
          </button>
        </div>

        <label className="grid gap-1.5 text-[13px] font-bold text-slate-700">
          <span>Sheet</span>
          <select
            value={selected.name}
            onChange={(event) => onSelectSheet(event.target.value)}
            className="h-11 rounded-lg border border-slate-400 bg-white px-3 text-[15px] font-semibold text-slate-900 outline-none focus:border-[#1b4d78] focus:ring-2 focus:ring-[#1b4d78]/20"
          >
            {preview.sheets.map((sheet) => (
              <option key={sheet.name} value={sheet.name}>{sheet.name}</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-live="polite">
          <Metric value={selected.rows.length} label="skenario" />
          <Metric value={selected.hierarchyDepth} label="tingkat hierarki" />
          <Metric value={selected.ignoredRows} label="baris dilewati" />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-[13px] font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => onImport(selected)}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#1b4d78] px-4 text-[13px] font-bold text-white transition hover:bg-[#163754] focus:outline-none focus:ring-2 focus:ring-[#1b4d78]/30 focus:ring-offset-2"
          >
            Import {selected.rows.length} skenario
          </button>
        </div>
      </section>
    </div>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <span className="block text-lg font-bold tabular-nums text-[#0f2d4a]">{value}</span>{" "}
      <span className="block text-xs font-semibold text-slate-500">{label}</span>
    </div>
  );
}
