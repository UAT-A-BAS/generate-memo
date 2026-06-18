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

export function formatDateID(value: string) {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : "-";
}

export function formatDateRangeID(startValue: string, endValue: string) {
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

export function formatDateRangeNonBreakingID(startValue: string, endValue: string) {
  return formatDateRangeID(startValue, endValue).replaceAll(" ", "\u00A0");
}

export function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}
