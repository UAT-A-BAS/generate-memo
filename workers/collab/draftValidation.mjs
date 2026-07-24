export const MAX_HTTP_BODY_BYTES = 1_000_000;
export const MAX_WS_BINARY_BYTES = 256_000;
export const MAX_SNAPSHOTS = 20;
export const MAX_CLOCK_SKEW_MS = 30_000;

const MAX_STRING_LENGTH = 100_000;
const MAX_ARRAY_LENGTH = 5_000;
const MAX_OBJECT_KEYS = 100;
const MAX_DEPTH = 16;

const ARRAY_LIMITS = {
  recipients: 100,
  developmentRows: 250,
  activities: 500,
  contacts: 100,
  signers: 50,
  ccRecipients: 100,
  appendixScenarios: 1_000,
  reviewComments: 1_000,
  reviewAuditLog: 5_000,
};

function isRecord(value) {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function isString(value, maxLength = MAX_STRING_LENGTH) {
  return typeof value === "string" && value.length <= maxLength;
}

function validateJsonValue(value, depth = 0) {
  if (depth > MAX_DEPTH) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.length <= MAX_STRING_LENGTH;
  if (Array.isArray(value)) {
    return value.length <= MAX_ARRAY_LENGTH &&
      value.every((item) => validateJsonValue(item, depth + 1));
  }
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= MAX_OBJECT_KEYS &&
    entries.every(([key, item]) =>
      key.length <= 128 && validateJsonValue(item, depth + 1)
    );
}

function validateRichTextNode(node, budget, depth = 0) {
  if (!isRecord(node) || depth > 12 || !isString(node.type, 64)) return false;
  budget.count += 1;
  if (budget.count > 20_000) return false;
  if (node.text !== undefined && !isString(node.text)) return false;
  if (node.attrs !== undefined && !validateJsonValue(node.attrs, depth + 1)) return false;
  if (node.marks !== undefined) {
    if (!Array.isArray(node.marks) || node.marks.length > 32) return false;
    if (!node.marks.every((mark) =>
      isRecord(mark) &&
      isString(mark.type, 64) &&
      (mark.attrs === undefined || validateJsonValue(mark.attrs, depth + 1))
    )) return false;
  }
  if (node.content !== undefined) {
    if (!Array.isArray(node.content) || node.content.length > 5_000) return false;
    if (!node.content.every((child) => validateRichTextNode(child, budget, depth + 1))) {
      return false;
    }
  }
  return true;
}

function validateRichText(value) {
  return isRecord(value) &&
    value.type === "doc" &&
    Array.isArray(value.content) &&
    validateRichTextNode(value, { count: 0 });
}

function validateStringFields(record, fields) {
  return fields.every((field) =>
    record[field] === undefined || isString(record[field])
  );
}

function validateObjectArray(value, limit, validator) {
  return Array.isArray(value) &&
    value.length <= limit &&
    value.every((item) => isRecord(item) && validator(item));
}

function validateOptionalDates(record) {
  return record.dates === undefined ||
    (Array.isArray(record.dates) &&
      record.dates.length <= 366 &&
      record.dates.every((value) => isString(value, 10)));
}

function validateRecipient(row) {
  return validateStringFields(row, ["id", "gender", "name", "position", "bureau"]);
}

function validateDevelopment(row) {
  return validateStringFields(row, ["id"]) &&
    validateRichText(row.item) &&
    validateRichText(row.description);
}

function validateActivity(row) {
  return validateStringFields(row, ["id", "startDate", "endDate", "owner"]) &&
    validateOptionalDates(row) &&
    validateRichText(row.activity);
}

function validateScenario(row) {
  const headingPathValid = row.headingPath === undefined ||
    validateObjectArray(row.headingPath, 12, (heading) =>
      validateStringFields(heading, ["id", "title"])
    );
  return validateStringFields(row, [
    "id",
    "dateGroupId",
    "sectionGroupId",
    "startDate",
    "endDate",
    "section",
    "pic",
  ]) &&
    validateOptionalDates(row) &&
    headingPathValid &&
    (row.isSectionHeader === undefined || typeof row.isSectionHeader === "boolean") &&
    validateRichText(row.scenario) &&
    validateRichText(row.expectedResult) &&
    validateRichText(row.notes);
}

function validateComment(row) {
  const repliesValid = validateObjectArray(row.replies, 500, (reply) =>
    validateStringFields(reply, ["id", "text", "author", "createdAt"])
  );
  return validateStringFields(row, [
    "id",
    "type",
    "targetId",
    "targetLabel",
    "text",
    "author",
    "createdAt",
    "updatedAt",
  ]) &&
    typeof row.resolved === "boolean" &&
    Array.isArray(row.path) &&
    row.path.length <= 32 &&
    row.path.every(Number.isInteger) &&
    repliesValid;
}

export function validateMemoDraftPayload(draft) {
  if (!isRecord(draft) || !validateJsonValue(draft)) {
    return { ok: false, error: "Draft harus berupa objek JSON yang valid." };
  }
  if (!isString(draft.id, 256) || draft.version !== 1) {
    return { ok: false, error: "Identitas atau versi draft tidak valid." };
  }
  if (!isRecord(draft.metadata) || !validateStringFields(draft.metadata, [
    "noMemo",
    "releaseDate",
    "memoType",
    "projectName",
    "bureau",
    "perihal",
    "accessLink",
  ]) ||
    typeof draft.metadata.autoPerihal !== "boolean" ||
    typeof draft.metadata.accessLinkEnabled !== "boolean") {
    return { ok: false, error: "Metadata draft tidak valid." };
  }
  if (!validateRichText(draft.introduction) || !validateRichText(draft.reference)) {
    return { ok: false, error: "Konten rich text draft tidak valid." };
  }
  if (typeof draft.referenceEnabled !== "boolean" ||
    typeof draft.attachmentsEnabled !== "boolean" ||
    !isString(draft.attachments) ||
    !isString(draft.initials) ||
    !isString(draft.initialsBureau) ||
    !isString(draft.updatedAt)) {
    return { ok: false, error: "Field utama draft tidak valid." };
  }
  if (!isRecord(draft.pilotSchedule) ||
    !validateStringFields(draft.pilotSchedule, ["startDate", "endDate"]) ||
    !validateOptionalDates(draft.pilotSchedule)) {
    return { ok: false, error: "Jadwal pilot tidak valid." };
  }

  const arraysValid =
    validateObjectArray(draft.recipients, ARRAY_LIMITS.recipients, validateRecipient) &&
    validateObjectArray(draft.developmentRows, ARRAY_LIMITS.developmentRows, validateDevelopment) &&
    validateObjectArray(draft.activities, ARRAY_LIMITS.activities, validateActivity) &&
    validateObjectArray(draft.contacts, ARRAY_LIMITS.contacts, (row) =>
      validateStringFields(row, ["id", "name", "email"])
    ) &&
    validateObjectArray(draft.signers, ARRAY_LIMITS.signers, (row) =>
      validateStringFields(row, ["id", "name", "title"])
    ) &&
    validateObjectArray(draft.ccRecipients, ARRAY_LIMITS.ccRecipients, validateRecipient) &&
    validateObjectArray(draft.appendixScenarios, ARRAY_LIMITS.appendixScenarios, validateScenario) &&
    validateObjectArray(draft.reviewComments, ARRAY_LIMITS.reviewComments, validateComment) &&
    validateObjectArray(draft.reviewAuditLog, ARRAY_LIMITS.reviewAuditLog, (row) =>
      validateStringFields(row, [
        "id",
        "action",
        "actor",
        "description",
        "commentId",
        "targetLabel",
        "createdAt",
      ])
    );

  return arraysValid
    ? { ok: true }
    : { ok: false, error: "Koleksi atau baris draft tidak valid." };
}

export function nextServerTimestamp(currentValue, requestedValue, now = Date.now()) {
  const current = Number(currentValue);
  const requested = Number(requestedValue);
  const ceiling = now + MAX_CLOCK_SKEW_MS;
  const safeCurrent = Number.isFinite(current)
    ? Math.min(Math.max(0, current), ceiling)
    : 0;
  const safeRequested = Number.isFinite(requested)
    ? Math.min(Math.max(0, requested), ceiling)
    : now;
  return Math.max(now, safeCurrent + 1, safeRequested);
}

export function snapshotTimestamp(key) {
  if (typeof key !== "string" || !key.startsWith("snapshot:")) return -1;
  const value = Number(key.slice("snapshot:".length).split(":")[0]);
  return Number.isFinite(value) ? value : -1;
}
