"use client";

import { Plus, Trash2 } from "lucide-react";
import type { Recipient } from "@/types/memo";
import { createRecipient } from "@/templates/bcaMemoTemplate";
import { DragDropList } from "./DragDropList";

type RecipientListProps = {
  recipients: Recipient[];
  onChange: (recipients: Recipient[], options?: { recordHistory?: boolean }) => void;
  minRows?: number;
  required?: boolean;
  genderRequired?: boolean;
  genderPlaceholder?: string;
  defaultGender?: Recipient["gender"];
};

const genderOptions: Recipient["gender"][] = ["Bapak", "Ibu", "Tim"];
const fieldClass =
  "h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";

function RequiredMark() {
  return <span className="text-red-600">*</span>;
}

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
            <div className="grid min-w-0 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(96px,0.42fr)] xl:grid-cols-[minmax(0,1.1fr)_minmax(96px,0.42fr)_minmax(0,1fr)_40px]">
              <label
                className="grid min-w-0 gap-1 text-xs font-medium text-slate-600"
                data-field-id={`recipient-${recipient.id}`}
              >
                <span>Jabatan / Unit {required ? <RequiredMark /> : null}</span>
                <input
                  value={recipient.position}
                  onChange={(event) => updateRecipient(recipient.id, { position: event.target.value })}
                  className={`${fieldClass} text-slate-900`}
                />
              </label>
              <label
                className="grid min-w-0 gap-1 text-xs font-medium text-slate-600"
                data-field-id={`recipient-gender-${recipient.id}`}
              >
                <span>Sapaan {genderRequired ? <RequiredMark /> : null}</span>
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
                  data-placeholder-selected={recipient.gender ? "false" : "true"}
                >
                  {genderPlaceholder ? (
                    <option value="" disabled>
                      {genderPlaceholder}
                    </option>
                  ) : null}
                  {genderOptions.map((option) => (
                    <option key={option} value={option} className="text-slate-900">
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label
                className="grid min-w-0 gap-1 text-xs font-medium text-slate-600"
                data-field-id={`recipient-name-${recipient.id}`}
              >
                <span>Nama opsional</span>
                <input
                  value={recipient.name ?? ""}
                  onChange={(event) => updateRecipient(recipient.id, { name: event.target.value })}
                  placeholder="Nama penerima"
                  className={`${fieldClass} text-slate-900 placeholder:text-slate-400`}
                />
              </label>
              <button
                type="button"
                onClick={() => removeRecipient(recipient.id)}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-rose-200 text-rose-600 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500/20 sm:self-end"
                aria-label="Hapus penerima"
              >
                <Trash2 size={16} />
              </button>
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
