const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const monthYearFormatter = new Intl.DateTimeFormat("id-ID", {
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

  if (start.getFullYear() === end.getFullYear()) {
    return `${dayFormatter.format(start)} ${monthFormatter.format(start)} – ${dayFormatter.format(end)} ${monthYearFormatter.format(end)}`;
  }

  return `${dateFormatter.format(start)} – ${dateFormatter.format(end)}`;
}

function formatDateSegmentWithoutYear(segment: { start: string; end: string }) {
  const start = toDate(segment.start);
  const end = toDate(segment.end);
  if (!start || !end) return "-";

  if (segment.start === segment.end) {
    return `${dayFormatter.format(start)} ${monthFormatter.format(start)}`;
  }

  if (start.getMonth() === end.getMonth()) {
    return `${dayFormatter.format(start)} – ${dayFormatter.format(end)} ${monthFormatter.format(end)}`;
  }

  return `${dayFormatter.format(start)} ${monthFormatter.format(start)} – ${dayFormatter.format(end)} ${monthFormatter.format(end)}`;
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

  if (first && last && first.getFullYear() === last.getFullYear()) {
    return `${segments.map(formatDateSegmentWithoutYear).join(", ")} ${last.getFullYear()}`;
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

  if (start.getFullYear() === end.getFullYear()) {
    return `${dayFormatter.format(start)} ${monthFormatter.format(start)} – ${dayFormatter.format(end)} ${monthYearFormatter.format(end)}`;
  }

  return `${dateFormatter.format(start)} – ${dateFormatter.format(end)}`;
}

type ActivityMonthGroup = {
  year: number;
  month: number;
  segments: { start: string; end: string }[];
};

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

function activityMonthGroups(values: readonly string[]): ActivityMonthGroup[] {
  const grouped = new Map<string, string[]>();

  normalizeActivityDateSelection(values).forEach((value) => {
    const date = parseDateValue(value);
    if (!date) return;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const dates = grouped.get(key) ?? [];
    dates.push(value);
    grouped.set(key, dates);
  });

  return Array.from(grouped.values()).map((dates) => {
    const first = parseDateValue(dates[0]);
    return {
      year: first?.getFullYear() ?? 0,
      month: first?.getMonth() ?? 0,
      segments: compactDateSegments(dates),
    };
  });
}

function activityGroupDayText(group: ActivityMonthGroup, includeConjunction = true) {
  const parts = group.segments.map((segment) => {
    const start = parseDateValue(segment.start);
    const end = parseDateValue(segment.end);
    if (!start || !end) return "";
    if (segment.start === segment.end) return dayFormatter.format(start);
    return `${dayFormatter.format(start)}-${dayFormatter.format(end)}`;
  }).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? "";
  if (!includeConjunction) return parts.join(", ");
  if (parts.length === 2) return `${parts[0]} dan ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, dan ${parts.at(-1)}`;
}

export function formatActivityDateRangeID(
  startValue: string,
  endValue: string,
  selectedDates?: readonly string[],
) {
  const groups = activityMonthGroups(activityDateValues(startValue, endValue, selectedDates));
  if (!groups.length) return "-";

  const lastGroupHasMultipleSegments = (groups.at(-1)?.segments.length ?? 0) > 1;
  const groupTexts = groups.map((group, index) => {
    const representative = new Date(0);
    representative.setHours(0, 0, 0, 0);
    representative.setFullYear(group.year, group.month, 1);
    const nextGroup = groups[index + 1];
    const showYear = !nextGroup || nextGroup.year !== group.year;
    const isLastGroup = index === groups.length - 1;
    const includeConjunction = groups.length === 1 || (isLastGroup && lastGroupHasMultipleSegments);
    return `${activityGroupDayText(group, includeConjunction)} ${monthFormatter.format(representative)}${
      showYear ? ` ${group.year}` : ""
    }`;
  });

  if (groupTexts.length === 1) return groupTexts[0];
  if (lastGroupHasMultipleSegments) return groupTexts.join(", ");
  if (groupTexts.length === 2) {
    const partCount = groups.reduce((total, group) => total + group.segments.length, 0);
    return `${groupTexts[0]}${partCount >= 3 ? ", dan " : " dan "}${groupTexts[1]}`;
  }
  return `${groupTexts.slice(0, -1).join(", ")}, dan ${groupTexts.at(-1)}`;
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
  return formatDateRangeID(startValue, endValue, selectedDates).replaceAll(" ", "\u00A0");
}

export function todayInputValue() {
  return toInputDate(new Date());
}
