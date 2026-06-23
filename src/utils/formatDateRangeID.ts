const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const monthYearFormatter = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
});

const dayFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
});

function toDate(value: string) {
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

function isNextDay(previousValue: string, nextValue: string) {
  const previous = toDate(previousValue);
  if (!previous) return false;
  previous.setDate(previous.getDate() + 1);
  return toInputDate(previous) === nextValue;
}

export function normalizeDateSelection(values: readonly string[] | undefined) {
  const unique = new Set<string>();

  for (const value of values ?? []) {
    const date = toDate(value);
    if (!date) continue;
    unique.add(toInputDate(date));
  }

  return Array.from(unique).sort();
}

export function datesFromRange(startValue: string, endValue: string) {
  const start = toDate(startValue);
  const end = toDate(endValue);

  if (!start && !end) return [];
  if (start && !end) return [toInputDate(start)];
  if (!start && end) return [toInputDate(end)];
  if (!start || !end) return [];

  const first = start.getTime() <= end.getTime() ? start : end;
  const last = start.getTime() <= end.getTime() ? end : start;
  const dates: string[] = [];
  const cursor = new Date(first);

  while (cursor.getTime() <= last.getTime()) {
    dates.push(toInputDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function formatDateID(value: string) {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : "-";
}

function compactDateSegments(values: readonly string[]) {
  const dates = normalizeDateSelection(values);
  if (!dates.length) return [];

  const segments: { start: string; end: string }[] = [];
  let start = dates[0];
  let end = dates[0];

  for (const value of dates.slice(1)) {
    if (isNextDay(end, value)) {
      end = value;
      continue;
    }

    segments.push({ start, end });
    start = value;
    end = value;
  }

  segments.push({ start, end });
  return segments;
}

function segmentDayText(segment: { start: string; end: string }) {
  const start = toDate(segment.start);
  const end = toDate(segment.end);
  if (!start || !end) return "";
  if (segment.start === segment.end) return dayFormatter.format(start);
  return `${dayFormatter.format(start)} – ${dayFormatter.format(end)}`;
}

function formatDateSegmentID(segment: { start: string; end: string }) {
  const start = toDate(segment.start);
  const end = toDate(segment.end);
  if (!start || !end) return "-";

  if (segment.start === segment.end) {
    return dateFormatter.format(start);
  }

  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    return `${dayFormatter.format(start)} – ${dayFormatter.format(end)} ${monthYearFormatter.format(end)}`;
  }

  return `${dateFormatter.format(start)} – ${dateFormatter.format(end)}`;
}

export function formatDateSelectionID(values: readonly string[]) {
  const segments = compactDateSegments(values);
  if (!segments.length) return "-";

  const first = toDate(segments[0].start);
  const last = toDate(segments.at(-1)?.end ?? "");
  const sameMonth =
    first &&
    last &&
    first.getMonth() === last.getMonth() &&
    first.getFullYear() === last.getFullYear();

  if (sameMonth) {
    return `${segments.map(segmentDayText).join(", ")} ${monthYearFormatter.format(last)}`;
  }

  return segments.map(formatDateSegmentID).join(", ");
}

export function formatDateRangeID(startValue: string, endValue: string, selectedDates?: readonly string[]) {
  const normalizedSelection = normalizeDateSelection(selectedDates);
  if (normalizedSelection.length) {
    return formatDateSelectionID(normalizedSelection);
  }

  const start = toDate(startValue);
  const end = toDate(endValue);

  if (!start && !end) return "-";
  if (start && !end) return formatDateID(startValue);
  if (!start && end) return formatDateID(endValue);
  if (!start || !end) return "-";

  if (start.toDateString() === end.toDateString()) {
    return dateFormatter.format(start);
  }

  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    return `${dayFormatter.format(start)} – ${dayFormatter.format(end)} ${monthYearFormatter.format(end)}`;
  }

  return `${dateFormatter.format(start)} – ${dateFormatter.format(end)}`;
}

export function formatDateRangeNonBreakingID(startValue: string, endValue: string, selectedDates?: readonly string[]) {
  return formatDateRangeID(startValue, endValue, selectedDates).replaceAll(" ", "\u00A0");
}

export function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}
