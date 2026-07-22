"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  datesFromRange,
  formatDateRangeID,
  normalizeDateSelection,
  todayInputValue,
} from "@/utils/formatDateRangeID";

export type DateRangeValue = { startDate: string; endDate: string; dates: string[] };

type DateRangePickerProps = {
  startDate: string;
  endDate: string;
  dates?: string[];
  onChange: (value: DateRangeValue) => void;
  compact?: boolean;
};

type DatePickerMode = "day" | "month" | "year";

type DragSelection = {
  pointerId: number;
  startDate: string;
  endDate: string;
  hasMoved: boolean;
};

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
  dates,
  onChange,
  compact,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DatePickerMode>("day");
  const hintId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const dateGridRef = useRef<HTMLDivElement>(null);
  const dragSelectionRef = useRef<DragSelection | null>(null);
  const suppressClickRef = useRef(false);
  const [dragSelection, setDragSelection] = useState<DragSelection | null>(null);
  const [popupPosition, setPopupPosition] = useState({ left: 0, top: 0, maxHeight: 704 });
  const start = parseInputDate(startDate);
  const end = parseInputDate(endDate);
  const selectedDates = useMemo(
    () => normalizeDateSelection(dates?.length ? dates : datesFromRange(startDate, endDate)),
    [dates, endDate, startDate],
  );
  const selectedDateSet = useMemo(() => new Set(selectedDates), [selectedDates]);
  const selectedDatesKey = selectedDates.join("|");
  const initial = parseInputDate(selectedDates[0] ?? "") ?? start ?? end ?? parseInputDate(todayInputValue()) ?? new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const days = useMemo(() => calendarDays(viewYear, viewMonth), [viewYear, viewMonth]);
  const displayValue = selectedDates.length ? formatDateRangeID(startDate, endDate, selectedDates) : "";
  const dragDates = useMemo(
    () =>
      dragSelection?.hasMoved
        ? datesFromRange(dragSelection.startDate, dragSelection.endDate)
        : [],
    [dragSelection],
  );
  const dragDateSet = useMemo(() => new Set(dragDates), [dragDates]);
  const visualDates = useMemo(
    () => normalizeDateSelection([...selectedDates, ...dragDates]),
    [dragDates, selectedDates],
  );
  const visualDateSet = useMemo(() => new Set(visualDates), [visualDates]);
  const dragLabel = dragDates.length
    ? formatDateRangeID(dragDates[0], dragDates.at(-1) ?? dragDates[0], dragDates)
    : "";
  const yearStart = Math.floor(viewYear / 16) * 16;

  const updatePopupPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const viewportPadding = 8;
    const popupWidth = 292;
    const maxHeight = Math.max(240, window.innerHeight - viewportPadding * 2);
    const popupHeight = Math.min(
      popupRef.current?.scrollHeight ?? 420,
      maxHeight,
    );
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - popupWidth - viewportPadding),
    );
    const below = rect.bottom + 8;
    const above = rect.top - popupHeight - 8;
    const preferredTop =
      below + popupHeight <= window.innerHeight - viewportPadding || above < viewportPadding
        ? below
        : above;
    const top = Math.min(
      Math.max(viewportPadding, preferredTop),
      Math.max(viewportPadding, window.innerHeight - popupHeight - viewportPadding),
    );

    setPopupPosition({ left, top, maxHeight });
  }, []);

  useLayoutEffect(() => {
    if (open) updatePopupPosition();
  }, [
    endDate,
    mode,
    open,
    selectedDatesKey,
    startDate,
    updatePopupPosition,
    viewMonth,
    viewYear,
  ]);

  useEffect(() => {
    if (!open) return;

    const reposition = () => updatePopupPosition();
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    };

    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [open, updatePopupPosition]);

  function moveMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function toggleOpen() {
    if (!open) {
      const focusDate = parseInputDate(selectedDates[0] ?? "") ?? parseInputDate(startDate) ?? parseInputDate(endDate);
      if (focusDate) {
        setViewYear(focusDate.getFullYear());
        setViewMonth(focusDate.getMonth());
      }
      setMode("day");
      dragSelectionRef.current = null;
      setDragSelection(null);
    }

    setOpen((value) => !value);
  }

  function commitDates(nextValues: readonly string[]) {
    const nextDates = normalizeDateSelection(nextValues);
    onChange({
      startDate: nextDates[0] ?? "",
      endDate: nextDates.at(-1) ?? "",
      dates: nextDates,
    });
  }

  function chooseDay(day: Date) {
    const value = toInputDate(day);
    const nextDates = selectedDateSet.has(value)
      ? selectedDates.filter((date) => date !== value)
      : normalizeDateSelection([...selectedDates, value]);

    commitDates(nextDates);
  }

  function dateValueAtPoint(clientX: number, clientY: number) {
    const grid = dateGridRef.current;
    const target = document.elementFromPoint(clientX, clientY);
    const dateButton = target instanceof Element
      ? target.closest<HTMLElement>("[data-date-value]")
      : null;

    if (!grid || !dateButton || !grid.contains(dateButton)) return "";
    return dateButton.dataset.dateValue ?? "";
  }

  function beginDragSelection(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const target = event.target;
    const dateButton = target instanceof Element
      ? target.closest<HTMLElement>("[data-date-value]")
      : null;
    const value = dateButton?.dataset.dateValue;
    if (!value || !event.currentTarget.contains(dateButton)) return;

    const nextDrag: DragSelection = {
      pointerId: event.pointerId,
      startDate: value,
      endDate: value,
      hasMoved: false,
    };
    dragSelectionRef.current = nextDrag;
    setDragSelection(nextDrag);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateDragSelection(event: ReactPointerEvent<HTMLDivElement>) {
    const current = dragSelectionRef.current;
    if (!current || current.pointerId !== event.pointerId) return;

    const endDate = dateValueAtPoint(event.clientX, event.clientY);
    if (!endDate || endDate === current.endDate) return;

    const nextDrag = {
      ...current,
      endDate,
      hasMoved: current.hasMoved || endDate !== current.startDate,
    };
    dragSelectionRef.current = nextDrag;
    setDragSelection(nextDrag);
  }

  function finishDragSelection(event: ReactPointerEvent<HTMLDivElement>) {
    const current = dragSelectionRef.current;
    if (!current || current.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    let committed = false;
    if (current.hasMoved) {
      commitDates([
        ...selectedDates,
        ...datesFromRange(current.startDate, current.endDate),
      ]);
      committed = true;
    } else {
      const day = parseInputDate(current.startDate);
      if (day) {
        chooseDay(day);
        committed = true;
      }
    }

    if (committed) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }

    dragSelectionRef.current = null;
    setDragSelection(null);
  }

  function cancelDragSelection(event: ReactPointerEvent<HTMLDivElement>) {
    const current = dragSelectionRef.current;
    if (!current || current.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragSelectionRef.current = null;
    setDragSelection(null);
  }

  function handleDayClick(event: ReactMouseEvent<HTMLButtonElement>, day: Date) {
    if (suppressClickRef.current) {
      event.preventDefault();
      return;
    }
    chooseDay(day);
  }

  function clear() {
    commitDates([]);
  }

  function today() {
    const value = todayInputValue();
    const date = parseInputDate(value);
    if (date) {
      setViewYear(date.getFullYear());
      setViewMonth(date.getMonth());
    }
    onChange({ startDate: value, endDate: value, dates: [value] });
  }

  return (
    <>
      <div ref={anchorRef} className={`relative ${compact ? "" : "max-w-md"}`}>
      <button
        type="button"
        onClick={toggleOpen}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-[#c6d3e1] bg-white px-3 text-left text-sm text-[#0f2d4a] shadow-sm outline-none transition hover:border-[#0a67b1] focus:border-[#0a67b1] focus:ring-2 focus:ring-[#0a67b1]/15"
      >
        <span className={displayValue ? "" : "text-[#8ca1b8]"}>
          {displayValue || "Pilih tanggal"}
        </span>
        <span className="text-[#0a67b1]">▾</span>
      </button>
      </div>

      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={popupRef}
          data-date-range-popup
          className="fixed z-[100] flex w-[292px] flex-col overflow-hidden rounded-2xl border border-[#c6d3e1] bg-white p-3 text-[#0f2d4a] shadow-[0_18px_50px_rgba(15,23,42,0.18)]"
          style={popupPosition}
        >
          <div className="min-h-0 overflow-y-auto pr-1">
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
              <p className="text-center text-sm font-bold text-[#0056a8]">Pilih tanggal</p>
              <div
                id={hintId}
                className={`mb-3 mt-2 rounded-xl border px-3 py-2 text-center transition-colors ${
                  dragSelection
                    ? "border-[#8fc1e5] bg-[#eaf5fc]"
                    : "border-[#d7e5f0] bg-[#f5f9fc]"
                }`}
              >
                <p className="text-[11px] font-semibold leading-4 text-[#164d7d]">
                  {dragSelection?.hasMoved
                    ? `Lepas untuk menambahkan ${dragLabel}`
                    : dragSelection
                      ? "Geser ke tanggal akhir untuk membuat rentang"
                      : "Klik satu tanggal · tahan dan geser untuk rentang"}
                </p>
                {!dragSelection && displayValue ? (
                  <p className="mt-0.5 truncate text-[10px] leading-4 text-[#60758a]" title={displayValue}>
                    Terpilih: {displayValue}
                  </p>
                ) : null}
              </div>
              <div
                ref={dateGridRef}
                data-date-grid
                data-dragging={dragSelection ? "true" : "false"}
                onPointerDown={beginDragSelection}
                onPointerMove={updateDragSelection}
                onPointerUp={finishDragSelection}
                onPointerCancel={cancelDragSelection}
                onDragStart={(event) => event.preventDefault()}
                className="grid touch-none select-none grid-cols-7 gap-y-1 text-center text-xs"
                aria-describedby={hintId}
              >
                {dayLabels.map((day) => (
                  <div key={day} className="py-1 text-[#8ca1b8]">
                    {day}
                  </div>
                ))}
                {days.map((day) => {
                  const muted = day.getMonth() !== viewMonth;
                  const value = toInputDate(day);
                  const selected = selectedDateSet.has(value);
                  const visuallySelected = visualDateSet.has(value);
                  const previewed = dragDateSet.has(value);
                  const parsedValue = parseInputDate(value);
                  const previousDate = parsedValue ? new Date(parsedValue) : null;
                  const nextDate = parsedValue ? new Date(parsedValue) : null;
                  previousDate?.setDate(previousDate.getDate() - 1);
                  nextDate?.setDate(nextDate.getDate() + 1);
                  const connectedBefore = previousDate
                    ? visualDateSet.has(toInputDate(previousDate))
                    : false;
                  const connectedAfter = nextDate
                    ? visualDateSet.has(toInputDate(nextDate))
                    : false;
                  const rangeMiddle = visuallySelected && connectedBefore && connectedAfter;
                  return (
                    <button
                      type="button"
                      key={day.toISOString()}
                      data-date-value={value}
                      onClick={(event) => handleDayClick(event, day)}
                      aria-pressed={selected}
                      title={formatDateRangeID(value, value, [value])}
                      className={`mx-auto flex h-8 w-8 cursor-grab items-center justify-center rounded-lg text-sm outline-none transition-colors duration-75 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-[#0067b1] focus-visible:ring-offset-2 ${
                        previewed && !rangeMiddle
                          ? "bg-[#005a9f] font-bold text-white shadow-[0_2px_7px_rgba(0,90,159,0.28)]"
                          : rangeMiddle
                            ? "bg-[#d8ebf8] font-bold text-[#005a9f]"
                            : visuallySelected
                              ? "bg-[#0067b1] font-bold text-white shadow-[0_2px_7px_rgba(0,103,177,0.22)]"
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
          </div>

          <div className="mt-3 flex shrink-0 items-center justify-between border-t border-[#d8e1eb] bg-white pt-3">
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
        </div>,
        document.body,
      ) : null}
    </>
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
