"use client";

import { Copy, Plus, Trash2 } from "lucide-react";
import type { Recipient } from "@/types/memo";
import { createRecipient } from "@/templates/bcaMemoTemplate";
import { DragDropList } from "./DragDropList";
import { GuidedField } from "./GuidedField";
import { InputSuggestionList } from "./InputSuggestionList";

type RecipientListProps = {
  recipients: Recipient[];
  onChange: (recipients: Recipient[], options?: { recordHistory?: boolean }) => void;
  minRows?: number;
  required?: boolean;
  genderRequired?: boolean;
  genderPlaceholder?: string;
  defaultGender?: Recipient["gender"];
};

const genderOptions: Recipient["gender"][] = ["Bapak", "Ibu", "Tim", "Yth."];
const fieldClass =
  "h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";

export function RecipientList({
  recipients,
  onChange,
  minRows = 1,
  required = true,
  genderRequired = required,
  genderPlaceholder = "Sapaan",
  defaultGender = "",
}: RecipientListProps) {
  function updateRecipient(id: string, patch: Partial<Recipient>) {
    onChange(recipients.map((recipient) => (recipient.id === id ? { ...recipient, ...patch } : recipient)));
  }

  function removeRecipient(id: string) {
    const next = recipients.filter((recipient) => recipient.id !== id);
    onChange(
      next.length >= minRows ? next : [createRecipient({ gender: defaultGender })],
      { recordHistory: true },
    );
  }

  function duplicateRecipient(id: string) {
    const index = recipients.findIndex((recipient) => recipient.id === id);
    if (index < 0) return;
    const { id: sourceId, ...seed } = recipients[index];
    void sourceId;
    const next = [...recipients];
    next.splice(index + 1, 0, createRecipient(seed));
    onChange(next, { recordHistory: true });
  }

  return (
    <div className="grid min-w-0 gap-3">
      <DragDropList
        items={recipients}
        onReorder={(nextRecipients) =>
          onChange(nextRecipients, { recordHistory: true })
        }
        itemLabel={(recipient, index) => recipient.name || recipient.position || `penerima ${index + 1}`}
        renderItem={(recipient) => (
          <div className="grid min-w-0 gap-3">
            <div className="grid min-w-0 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(110px,0.45fr)] 2xl:grid-cols-[minmax(0,1.1fr)_minmax(110px,0.42fr)_minmax(0,1fr)_84px]">
              <GuidedField
                label="Jabatan / Unit"
                required={required}
                fieldId={`recipient-${recipient.id}`}
                className="min-w-0"
                helper="Masukkan jabatan atau unit tujuan memo."
              >
                <InputSuggestionList
                  category="positions"
                  value={recipient.position}
                  onValueChange={(position) => updateRecipient(recipient.id, { position })}
                  placeholder="Contoh: Kepala Operasi Cabang Pluit"
                  className={`${fieldClass} text-slate-900 placeholder:text-slate-400`}
                />
              </GuidedField>
              <GuidedField
                label="Sapaan"
                required={genderRequired}
                fieldId={`recipient-gender-${recipient.id}`}
                className="min-w-0"
              >
                <select
                  value={recipient.gender}
                  onChange={(event) =>
                    updateRecipient(recipient.id, {
                      gender: event.target.value as Recipient["gender"],
                    })
                  }
                  className={`${fieldClass} ${
                    recipient.gender ? "text-slate-900" : "text-slate-400"
                  }`}
                  style={{ color: recipient.gender ? "#0f172a" : "#94a3b8" }}
                >
                  {genderPlaceholder ? (
                    <option value="" disabled hidden>
                      {genderPlaceholder}
                    </option>
                  ) : null}
                  {genderOptions.map((option) => (
                    <option key={option} value={option} className="text-slate-900">
                      {option}
                    </option>
                  ))}
                </select>
              </GuidedField>
              <GuidedField
                label="Nama opsional"
                fieldId={`recipient-name-${recipient.id}`}
                className="min-w-0"
                helper="Kosongkan bila memo ditujukan ke unit atau tim."
              >
                <InputSuggestionList
                  category="recipientNames"
                  value={recipient.name ?? ""}
                  onValueChange={(name) => updateRecipient(recipient.id, { name })}
                  placeholder="Nama penerima"
                  className={`${fieldClass} text-slate-900 placeholder:text-slate-400`}
                />
              </GuidedField>
              <div className="flex gap-1 sm:self-end">
                <button
                  type="button"
                  onClick={() => duplicateRecipient(recipient.id)}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  aria-label="Duplikat penerima"
                  title="Duplikat baris"
                >
                  <Copy size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => removeRecipient(recipient.id)}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-rose-200 text-rose-600 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  aria-label="Hapus penerima"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      />
      <button
        type="button"
        onClick={() =>
          onChange(
            [...recipients, createRecipient({ gender: defaultGender })],
            { recordHistory: true },
          )
        }
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
      >
        <Plus size={16} />
        Tambah baris
      </button>
    </div>
  );
}
