import assert from "node:assert/strict";
import test from "node:test";

import {
  formatActivityDateRangeID,
  formatDateRangeID,
  formatDateRangeNonBreakingID,
} from "../src/utils/formatDateRangeID.ts";

const days = (start, end) => {
  const dates = [];
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, "0");
    const d = String(cursor.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const cases = [
  // Contiguous runs that cross a month name both months once.
  [days("2026-10-26", "2026-11-03"), "26 Oktober - 3 November 2026"],
  [[...days("2026-10-26", "2026-11-01"), "2026-11-03"], "26 Oktober - 1 dan 3 November 2026"],
  [[...days("2026-10-26", "2026-11-01"), ...days("2026-11-03", "2026-11-05")], "26 Oktober - 1 dan 3-5 November 2026"],
  [["2026-10-20", ...days("2026-10-26", "2026-11-03")], "20 dan 26 Oktober - 3 November 2026"],
  [["2026-10-20", ...days("2026-10-26", "2026-11-01"), "2026-11-03"], "20, 26 Oktober - 1 dan 3 November 2026"],
  [days("2026-07-23", "2026-08-04"), "23 Juli - 4 Agustus 2026"],
  [["2026-08-31", "2026-09-01"], "31 Agustus - 1 September 2026"],
  [days("2026-10-30", "2026-12-02"), "30 Oktober - 2 Desember 2026"],
  [["2026-12-31", "2027-01-01"], "31 Desember 2026 - 1 Januari 2027"],
  [[...days("2026-12-30", "2027-01-02"), "2027-01-05"], "30 Desember 2026 - 2 dan 5 Januari 2027"],
  // Existing grouping rules stay as they were.
  [days("2026-08-10", "2026-08-12"), "10-12 Agustus 2026"],
  [["2026-08-10", "2026-08-12"], "10 dan 12 Agustus 2026"],
  [["2026-08-14", "2026-08-10", "2026-08-12", "2026-08-12"], "10, 12, dan 14 Agustus 2026"],
  [["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-14"], "10-12 dan 14 Agustus 2026"],
  [["2026-08-11", "2026-08-12", "2026-09-21", "2026-09-22", "2026-09-23"], "11-12 Agustus dan 21-23 September 2026"],
  [["2026-08-11", "2026-08-12", "2026-09-11", "2026-10-30"], "11-12 Agustus, 11 September, dan 30 Oktober 2026"],
  [["2026-08-11", "2026-08-12", "2026-08-22", "2026-08-23", "2026-08-25", "2026-08-27"], "11-12, 22-23, 25, dan 27 Agustus 2026"],
  [["2026-08-05", "2026-08-06", "2026-08-07", "2026-08-15", "2026-08-20", "2026-08-28", "2026-09-04"], "5-7, 15, 20, 28 Agustus, dan 4 September 2026"],
  [["2026-08-05", "2026-09-01", "2026-09-03"], "5 Agustus, 1 dan 3 September 2026"],
  [["2026-12-30", "2027-01-05"], "30 Desember 2026 dan 5 Januari 2027"],
  [["10/08/2026", "11/08/2026", "12/08/2026"], "10-12 Agustus 2026"],
];

for (const [dates, expected] of cases) {
  test(`${dates.join(",")} -> ${expected}`, () => {
    assert.equal(formatActivityDateRangeID(dates[0], dates.at(-1), dates), expected);
  });
}

test("start/end range without explicit dates crosses months the same way", () => {
  assert.equal(formatDateRangeID("2026-10-26", "2026-11-03"), "26 Oktober - 3 November 2026");
  assert.equal(formatActivityDateRangeID("26/10/2026", "03/11/2026"), "26 Oktober - 3 November 2026");
  assert.equal(formatDateRangeID("2026-11-03", "2026-11-03"), "3 November 2026");
  assert.equal(formatDateRangeID("", ""), "-");
});

test("Word output keeps the cross-month range on one line", () => {
  assert.equal(
    formatDateRangeNonBreakingID("2026-10-26", "2026-11-03"),
    "26 Oktober ‑ 3 November 2026",
  );
});
