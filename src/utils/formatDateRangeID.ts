const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const monthFormatter = new Intl.DateTimeFormat("id-ID", {
  month: "long",
});

const dayFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
});

function toDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function parseDateValue(value: string) {
  const normalized = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  const localMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(normalized);
  const year = Number(isoMatch?.[1] ?? localMatch?.[3]);
  const month = Number(isoMatch?.[2] ?? localMatch?.[2]);
  const day = Number(isoMatch?.[3] ?? localMatch?.[1]);

  if (!isoMatch && !localMatch) return null;

  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  date.setFullYear(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function isValidDateValue(value: string) {
  return Boolean(parseDateValue(value));
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

export function normalizeActivityDateSelection(values: readonly string[] | undefined) {
  const unique = new Set<string>();

  for (const value of values ?? []) {
    const date = parseDateValue(value);
    if (!date) continue;
    unique.add(toInputDate(date));
  }

  return Array.from(unique).sort();
}

export function isValidInputDate(value: string) {
  return Boolean(toDate(value));
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
  const date = parseDateValue(value);
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

export function formatDateSelectionID(values: readonly string[]) {
  return formatActivityDateRangeID("", "", values);
}

export function formatDateRangeID(startValue: string, endValue: string, selectedDates?: readonly string[]) {
  return formatActivityDateRangeID(startValue, endValue, selectedDates);
}

function activityDatesFromRange(startValue: string, endValue: string) {
  const start = parseDateValue(startValue);
  const end = parseDateValue(endValue);

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

function activityDateValues(
  startValue: string,
  endValue: string,
  selectedDates?: readonly string[],
) {
  if (selectedDates?.length) return normalizeActivityDateSelection(selectedDates);
  return activityDatesFromRange(startValue, endValue);
}

type DatePiece = {
  date: Date;
  segmentIndex: number;
  joiner: "" | "-" | " - ";
};

function monthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function activityDatePieces(values: readonly string[]): DatePiece[] {
  const pieces: DatePiece[] = [];

  compactDateSegments(normalizeActivityDateSelection(values)).forEach((segment, segmentIndex) => {
    const start = parseDateValue(segment.start);
    const end = parseDateValue(segment.end);
    if (!start || !end) return;
    pieces.push({ date: start, segmentIndex, joiner: "" });
    if (segment.start === segment.end) return;
    // A run that crosses into another month names both months: "26 Oktober - 3 November".
    pieces.push({ date: end, segmentIndex, joiner: monthKey(start) === monthKey(end) ? "-" : " - " });
  });

  return pieces;
}

export function formatActivityDateRangeID(
  startValue: string,
  endValue: string,
  selectedDates?: readonly string[],
) {
  const pieces = activityDatePieces(activityDateValues(startValue, endValue, selectedDates));
  if (!pieces.length) return "-";

  const segmentCount = pieces.at(-1)!.segmentIndex + 1;
  const lastMonth = monthKey(pieces.at(-1)!.date);
  const lastMonthSegmentCount = new Set(
    pieces.filter((piece) => monthKey(piece.date) === lastMonth).map((piece) => piece.segmentIndex),
  ).size;
  // "dan" always precedes the last run; the serial comma follows the list it closes:
  // the final month's runs when it holds several, otherwise every run in the memo date.
  const listSize = lastMonthSegmentCount > 1 ? lastMonthSegmentCount : segmentCount;
  const finalConjunction = listSize >= 3 ? ", dan " : " dan ";

  return pieces.map((piece, index) => {
    const next = pieces[index + 1];
    let text = "";
    if (index > 0) {
      if (piece.joiner) text += piece.joiner;
      else text += piece.segmentIndex === segmentCount - 1 ? finalConjunction : ", ";
    }
    text += dayFormatter.format(piece.date);
    if (!next || monthKey(next.date) !== monthKey(piece.date)) {
      text += ` ${monthFormatter.format(piece.date)}`;
    }
    if (!next || next.date.getFullYear() !== piece.date.getFullYear()) {
      text += ` ${piece.date.getFullYear()}`;
    }
    return text;
  }).join("");
}

export function activityDateSelectionError(
  startValue: string,
  endValue: string,
  selectedDates?: readonly string[],
): "empty" | "invalid" | null {
  const sourceValues = selectedDates?.length
    ? selectedDates
    : [startValue, endValue].filter(Boolean);

  if (!sourceValues.length) return "empty";
  if (sourceValues.some((value) => !isValidDateValue(value))) return "invalid";
  return null;
}

export function formatDateRangeNonBreakingID(startValue: string, endValue: string, selectedDates?: readonly string[]) {
  return formatDateRangeID(startValue, endValue, selectedDates)
    .replaceAll("-", "\u2011")
    .replaceAll(" ", "\u00A0");
}

export function todayInputValue() {
  return toInputDate(new Date());
}
