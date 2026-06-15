"use client";

import { ArrowDown, Check, Save, Sparkles } from "lucide-react";

export function FormCompletionBar({
  completed,
  total,
  issueCount,
  profileAvailable,
  profileNotice,
  onJumpToNext,
  onSaveProfile,
  onApplyProfile,
}: {
  completed: number;
  total: number;
  issueCount: number;
  profileAvailable: boolean;
  profileNotice?: string;
  onJumpToNext: () => void;
  onSaveProfile: () => void;
  onApplyProfile: () => void;
}) {
  const percentage = total ? Math.round((completed / total) * 100) : 100;

  return (
    <section className="sticky top-[78px] z-20 rounded-xl border border-[#bdd2e5] bg-white/95 p-3 shadow-[0_10px_30px_rgba(15,45,74,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center justify-between gap-3 text-xs font-bold text-[#0f2d4a]">
            <span>Kelengkapan input</span>
            <span>{completed}/{total} field</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${
                issueCount ? "bg-[#1f5d8a]" : "bg-emerald-500"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500" aria-live="polite">
            {issueCount
              ? `${issueCount} field masih perlu dilengkapi atau diperbaiki.`
              : "Semua field mandatory siap digenerate."}
            {profileNotice ? ` ${profileNotice}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {issueCount ? (
            <button
              type="button"
              onClick={onJumpToNext}
              className="inline-flex min-h-9 items-center gap-2 rounded-md bg-[#1f5d8a] px-3 text-xs font-bold text-white hover:bg-[#174d74]"
            >
              <ArrowDown size={14} />
              Ke field berikutnya
            </button>
          ) : (
            <span className="inline-flex min-h-9 items-center gap-2 rounded-md bg-emerald-50 px-3 text-xs font-bold text-emerald-700">
              <Check size={14} />
              Siap
            </span>
          )}
          <button
            type="button"
            onClick={onSaveProfile}
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <Save size={14} />
            Rekam profil input
          </button>
          <button
            type="button"
            onClick={onApplyProfile}
            disabled={!profileAvailable}
            className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles size={14} />
            Isi dari profil
          </button>
        </div>
      </div>
    </section>
  );
}
