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

function validationFailure(code, field, error, details = {}) {
  return {
    ok: false,
    code,
    field,
    error,
    ...(Number.isFinite(details.actual) ? { actual: details.actual } : {}),
    ...(Number.isFinite(details.limit) ? { limit: details.limit } : {}),
  };
}

function isRecord(value) {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function isString(value, maxLength = MAX_STRING_LENGTH) {
  return typeof value === "string" && value.length <= maxLength;
}

function findJsonValueError(value, field = "draft", depth = 0) {
  if (depth > MAX_DEPTH) {
    return validationFailure(
      "json_depth_limit",
      field,
      "Kedalaman struktur draft melebihi batas.",
      { actual: depth, limit: MAX_DEPTH },
    );
  }
  if (value === null || typeof value === "boolean") return null;
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? null
      : validationFailure("number_invalid", field, "Nilai angka draft tidak valid.");
  }
  if (typeof value === "string") {
    return value.length <= MAX_STRING_LENGTH
      ? null
      : validationFailure(
          "string_limit",
          field,
          "Panjang teks draft melebihi batas.",
          { actual: value.length, limit: MAX_STRING_LENGTH },
        );
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) {
      return validationFailure(
        "array_limit",
        field,
        "Jumlah item draft melebihi batas umum.",
        { actual: value.length, limit: MAX_ARRAY_LENGTH },
      );
    }
    for (let index = 0; index < value.length; index += 1) {
      const error = findJsonValueError(value[index], `${field}[${index}]`, depth + 1);
      if (error) return error;
    }
    return null;
  }
  if (!isRecord(value)) {
    return validationFailure("value_type_invalid", field, "Tipe nilai draft tidak valid.");
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) {
    return validationFailure(
      "object_key_limit",
      field,
      "Jumlah field pada objek draft melebihi batas.",
      { actual: entries.length, limit: MAX_OBJECT_KEYS },
    );
  }
  for (const [key, item] of entries) {
    if (key.length > 128) {
      return validationFailure(
        "object_key_length_limit",
        field,
        "Panjang nama field draft melebihi batas.",
        { actual: key.length, limit: 128 },
      );
    }
    const error = findJsonValueError(item, `${field}.${key}`, depth + 1);
    if (error) return error;
  }
  return null;
}

function validateJsonValue(value, depth = 0) {
  return findJsonValueError(value, "value", depth) === null;
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

function validateDraftCollection(field, value, limit, validator) {
  if (!Array.isArray(value)) {
    return validationFailure(
      "collection_type_invalid",
      field,
      "Koleksi draft harus berupa array.",
    );
  }
  if (value.length > limit) {
    return validationFailure(
      "collection_limit",
      field,
      "Jumlah item pada koleksi draft melebihi batas.",
      { actual: value.length, limit },
    );
  }
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    const rowField = `${field}[${index}]`;
    if (!isRecord(row)) {
      return validationFailure(
        "row_type_invalid",
        rowField,
        "Baris draft harus berupa objek.",
      );
    }
    if (!validator(row)) {
      return validationFailure(
        "row_format_invalid",
        rowField,
        "Format baris draft tidak valid.",
      );
    }
  }
  return null;
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
  if (!isRecord(draft)) {
    return validationFailure(
      "draft_type_invalid",
      "draft",
      "Draft harus berupa objek JSON yang valid.",
    );
  }
  const jsonError = findJsonValueError(draft);
  if (jsonError) return jsonError;
  if (typeof draft.id !== "string") {
    return validationFailure("field_type_invalid", "id", "ID draft harus berupa teks.");
  }
  if (draft.id.length > 256) {
    return validationFailure(
      "string_limit",
      "id",
      "Panjang ID draft melebihi batas.",
      { actual: draft.id.length, limit: 256 },
    );
  }
  if (draft.version !== 1) {
    return validationFailure(
      "version_invalid",
      "version",
      "Versi draft tidak didukung.",
    );
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
    return validationFailure("field_format_invalid", "metadata", "Metadata draft tidak valid.");
  }
  if (!validateRichText(draft.introduction)) {
    return validationFailure(
      "rich_text_invalid",
      "introduction",
      "Konten rich text pengantar tidak valid.",
    );
  }
  if (!validateRichText(draft.reference)) {
    return validationFailure(
      "rich_text_invalid",
      "reference",
      "Konten rich text referensi tidak valid.",
    );
  }
  if (typeof draft.referenceEnabled !== "boolean" ||
    typeof draft.attachmentsEnabled !== "boolean" ||
    !isString(draft.attachments) ||
    !isString(draft.initials) ||
    !isString(draft.initialsBureau) ||
    !isString(draft.updatedAt)) {
    return validationFailure("field_format_invalid", "draft", "Field utama draft tidak valid.");
  }
  if (!isRecord(draft.pilotSchedule) ||
    !validateStringFields(draft.pilotSchedule, ["startDate", "endDate"]) ||
    !validateOptionalDates(draft.pilotSchedule)) {
    return validationFailure(
      "field_format_invalid",
      "pilotSchedule",
      "Jadwal pilot tidak valid.",
    );
  }

  const collectionRules = [
    ["recipients", draft.recipients, ARRAY_LIMITS.recipients, validateRecipient],
    ["developmentRows", draft.developmentRows, ARRAY_LIMITS.developmentRows, validateDevelopment],
    ["activities", draft.activities, ARRAY_LIMITS.activities, validateActivity],
    ["contacts", draft.contacts, ARRAY_LIMITS.contacts, (row) =>
      validateStringFields(row, ["id", "name", "email"])],
    ["signers", draft.signers, ARRAY_LIMITS.signers, (row) =>
      validateStringFields(row, ["id", "name", "title"])],
    ["ccRecipients", draft.ccRecipients, ARRAY_LIMITS.ccRecipients, validateRecipient],
    ["appendixScenarios", draft.appendixScenarios, ARRAY_LIMITS.appendixScenarios, validateScenario],
    ["reviewComments", draft.reviewComments, ARRAY_LIMITS.reviewComments, validateComment],
    ["reviewAuditLog", draft.reviewAuditLog, ARRAY_LIMITS.reviewAuditLog, (row) =>
      validateStringFields(row, [
        "id",
        "action",
        "actor",
        "description",
        "commentId",
        "targetLabel",
        "createdAt",
      ])],
  ];

  for (const [field, value, limit, validator] of collectionRules) {
    const error = validateDraftCollection(field, value, limit, validator);
    if (error) return error;
  }

  return { ok: true };
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
