"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { formatDateRangeID, todayInputValue } from "@/utils/formatDateRangeID";

type DateRangeValue = { startDate: string; endDate: string };

type DateRangePickerProps = {
  startDate: string;
  endDate: string;
  onChange: (value: DateRangeValue) => void;
  compact?: boolean;
};

type DatePickerMode = "day" | "month" | "year";

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const dayLabels = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function parseInputDate(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sameDay(first: Date, second: Date) {
  return first.toDateString() === second.toDateString();
}

function isBetween(day: Date, start: Date | null, end: Date | null) {
  if (!start || !end) return false;
  const value = day.getTime();
  return value > start.getTime() && value < end.getTime();
}

function calendarDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const firstDay = first.getDay();
  const days: Date[] = [];

  for (let index = firstDay; index > 0; index -= 1) {
    days.push(new Date(year, month, 1 - index));
  }

  const cursor = new Date(year, month, 1);
  while (cursor.getMonth() === month) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  while (days.length % 7 !== 0 || days.length < 42) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  compact,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DatePickerMode>("day");
  const [selectingEnd, setSelectingEnd] = useState(Boolean(startDate && !endDate));
  const anchorRef = useRef<HTMLDivElement>(null);
  const start = parseInputDate(startDate);
  const end = parseInputDate(endDate);
  const initial = start ?? end ?? parseInputDate(todayInputValue()) ?? new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const days = useMemo(() => calendarDays(viewYear, viewMonth), [viewYear, viewMonth]);
  const displayValue = startDate || endDate ? formatDateRangeID(startDate, endDate) : "";
  const yearStart = Math.floor(viewYear / 16) * 16;

  function moveMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function chooseDay(day: Date) {
    const value = toInputDate(day);

    if (!start || !selectingEnd) {
      onChange({ startDate: value, endDate: value });
      setSelectingEnd(true);
      return;
    }

    if (day.getTime() < start.getTime()) {
      onChange({ startDate: value, endDate: startDate });
    } else {
      onChange({ startDate, endDate: value });
    }
    setSelectingEnd(false);
  }

  function clear() {
    onChange({ startDate: "", endDate: "" });
    setSelectingEnd(false);
  }

  function today() {
    const value = todayInputValue();
    const date = parseInputDate(value);
    if (date) {
      setViewYear(date.getFullYear());
      setViewMonth(date.getMonth());
    }
    onChange({ startDate: value, endDate: value });
  }

  return (
    <div ref={anchorRef} className={`relative ${compact ? "" : "max-w-md"}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-[#c6d3e1] bg-white px-3 text-left text-sm text-[#0f2d4a] shadow-sm outline-none transition hover:border-[#0a67b1] focus:border-[#0a67b1] focus:ring-2 focus:ring-[#0a67b1]/15"
      >
        <span className={displayValue ? "" : "text-[#8ca1b8]"}>
          {displayValue || "Pilih rentang tanggal"}
        </span>
        <span className="text-[#0a67b1]">▾</span>
      </button>

      {open ? (
        <div className="absolute left-0 top-12 z-50 w-[292px] rounded-2xl border border-[#c6d3e1] bg-white p-3 text-[#0f2d4a] shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
          <div className="mb-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => (mode === "day" ? moveMonth(-1) : setViewYear(viewYear - (mode === "year" ? 16 : 1)))}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#8ca1b8] hover:bg-[#edf4fb] hover:text-[#0a67b1]"
              aria-label="Sebelumnya"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === "day" ? "month" : "year")}
              className="rounded-md px-3 py-1 text-sm font-bold text-[#0056a8] hover:bg-[#edf4fb]"
            >
              {mode === "day" ? `${monthNames[viewMonth].replace("May", "Mei")} ${viewYear}` : mode === "month" ? viewYear : `${yearStart} - ${yearStart + 15}`}
            </button>
            <button
              type="button"
              onClick={() => (mode === "day" ? moveMonth(1) : setViewYear(viewYear + (mode === "year" ? 16 : 1)))}
              className="flex h-8 w-8 items-center justify-center rounded-md text-[#8ca1b8] hover:bg-[#edf4fb] hover:text-[#0a67b1]"
              aria-label="Berikutnya"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {mode === "day" ? (
            <>
              <p className="mb-2 text-center text-sm font-bold text-[#0056a8]">Pilih rentang tanggal</p>
              <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
                {dayLabels.map((day) => (
                  <div key={day} className="py-1 text-[#8ca1b8]">
                    {day}
                  </div>
                ))}
                {days.map((day) => {
                  const muted = day.getMonth() !== viewMonth;
                  const selected =
                    (start && sameDay(day, start)) || (end && sameDay(day, end));
                  const ranged = isBetween(day, start, end);
                  return (
                    <button
                      type="button"
                      key={day.toISOString()}
                      onClick={() => chooseDay(day)}
                      className={`mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-sm transition ${
                        selected
                          ? "bg-[#0067b1] font-bold text-white"
                          : ranged
                            ? "bg-[#e5eef8] text-[#0f2d4a]"
                            : muted
                              ? "text-[#b3c0ce] hover:bg-[#edf4fb]"
                              : "text-[#0f2d4a] hover:bg-[#edf4fb]"
                      }`}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {mode === "month" ? (
            <div className="grid grid-cols-3 gap-3 py-2 text-center">
              {monthNames.map((month, index) => (
                <button
                  type="button"
                  key={month}
                  onClick={() => {
                    setViewMonth(index);
                    setMode("day");
                  }}
                  className={`h-11 rounded-lg text-sm transition ${
                    index === viewMonth
                      ? "bg-[#0067b1] font-bold text-white"
                      : "text-[#8ca1b8] hover:bg-[#edf4fb] hover:text-[#0f2d4a]"
                  }`}
                >
                  {month}
                </button>
              ))}
            </div>
          ) : null}

          {mode === "year" ? (
            <div className="grid grid-cols-4 gap-3 py-2 text-center">
              {Array.from({ length: 16 }, (_, index) => yearStart + index).map((year) => (
                <button
                  type="button"
                  key={year}
                  onClick={() => {
                    setViewYear(year);
                    setMode("month");
                  }}
                  className={`h-11 rounded-lg text-sm transition ${
                    year === viewYear
                      ? "bg-[#0067b1] font-bold text-white"
                      : "text-[#8ca1b8] hover:bg-[#edf4fb] hover:text-[#0f2d4a]"
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={clear}
              className="h-9 rounded-lg border border-[#c6d3e1] px-3 text-xs font-semibold text-[#0f2d4a] hover:bg-[#edf4fb]"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={today}
              className="h-9 rounded-lg border border-[#c6d3e1] px-3 text-xs font-semibold text-[#0f2d4a] hover:bg-[#edf4fb]"
            >
              Hari ini
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 rounded-lg bg-[#164d7d] px-4 text-xs font-semibold text-white hover:bg-[#0d3f6c]"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SingleDatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <DateRangePicker
      startDate={value}
      endDate={value}
      onChange={(next) => onChange(next.startDate || next.endDate)}
      compact
    />
  );
}
