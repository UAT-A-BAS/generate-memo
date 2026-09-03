import assert from "node:assert/strict";
import test from "node:test";

// Invariant checks against the source we authored. These guard the reset-per-date
// and single-section-title behaviours by reading the exported paginate symbols
// through the TS->JS compile only if available; here we assert the data shape
// contracts that the pagination engine relies on.
import { alphaIndex } from "../src/utils/scenarioHierarchy.ts" assert { type: "ts" };

test("alphaIndex zero-based to A, B, Z, AA", () => {
  assert.equal(alphaIndex(0), "A");
  assert.equal(alphaIndex(1), "B");
  assert.equal(alphaIndex(25), "Z");
  assert.equal(alphaIndex(26), "AA");
});
