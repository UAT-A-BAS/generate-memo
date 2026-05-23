import JSZip from "jszip";
import type { MemoDraft, Recipient } from "@/types/memo";

const ALT_CHUNK_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ALT_CHUNK_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/aFChunk";
const ALT_CHUNK_TARGET = "embeddings/validation-template.docx";
const ALT_CHUNK_PART = `/word/${ALT_CHUNK_TARGET}`;

type ValidationValues = {
  noMemo: string;
  releaseDate: string;
  totalPages: string;
  title: string;
  recipients: string;
  division: string;
  ccRecipients: string;
  creatorUnit: string;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getAttr(xml: string, name: string) {
  const match = xml.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match?.[1] ?? "";
}

function maxRelationshipId(relsXml: string) {
  return [...relsXml.matchAll(/<Relationship\b[^>]*\/>/g)].reduce((max, match) => {
    const id = getAttr(match[0], "Id");
    const value = Number(id.replace(/^rId/, ""));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
}

function appendRelationship(relsXml: string, id: string) {
  const relationship = `<Relationship Id="${id}" Type="${ALT_CHUNK_REL_TYPE}" Target="${ALT_CHUNK_TARGET}"/>`;
  return relsXml.replace("</Relationships>", `${relationship}</Relationships>`);
}

function addAltChunkContentType(contentTypesXml: string) {
  if (contentTypesXml.includes(`PartName="${ALT_CHUNK_PART}"`)) return contentTypesXml;

  const override = `<Override PartName="${ALT_CHUNK_PART}" ContentType="${ALT_CHUNK_CONTENT_TYPE}"/>`;
  return contentTypesXml.replace("</Types>", `${override}</Types>`);
}

function bodyInner(documentXml: string) {
  const match = documentXml.match(/<w:body\b[^>]*>([\s\S]*)<\/w:body>/);
  return match?.[1] ?? "";
}

function replaceBodyInner(documentXml: string, inner: string) {
  return documentXml.replace(
    /(<w:body\b[^>]*>)[\s\S]*(<\/w:body>)/,
    (_match, start: string, end: string) => `${start}${inner}${end}`,
  );
}

function extractTrailingSectPr(bodyXml: string) {
  const sectStart = bodyXml.lastIndexOf("<w:sectPr");
  if (sectStart < 0) return { content: bodyXml, sectPr: "" };

  const sectEnd = bodyXml.indexOf("</w:sectPr>", sectStart);
  if (sectEnd < 0) return { content: bodyXml, sectPr: "" };

  const sectCloseEnd = sectEnd + "</w:sectPr>".length;
  const sectPr = bodyXml.slice(sectStart, sectCloseEnd);
  const afterSectPr = bodyXml.slice(sectCloseEnd).trim();

  if (afterSectPr === "</w:pPr></w:p>") {
    const paragraphStarts = [...bodyXml.slice(0, sectStart).matchAll(/<w:p(?=[\s>])/g)];
    const paragraphStart = paragraphStarts.at(-1)?.index;

    if (paragraphStart !== undefined && bodyXml.slice(paragraphStart, sectStart).includes("<w:pPr")) {
      return {
        content: bodyXml.slice(0, paragraphStart),
        sectPr: sectPr.trim(),
      };
    }
  }

  if (!afterSectPr) {
    return {
      content: bodyXml.slice(0, sectStart),
      sectPr: sectPr.trim(),
    };
  }

  return { content: bodyXml, sectPr: "" };
}

function paragraphBlocks(xml: string) {
  return [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((match) => ({
    index: match.index ?? 0,
    xml: match[0],
  }));
}

function normalizeValidationBody(bodyXml: string) {
  const titleIndex = bodyXml.indexOf("Validasi Dokumen");
  const internalIndex = bodyXml.indexOf("NTERNAL BCA");
  const contentAnchor = internalIndex >= 0 ? internalIndex : titleIndex;
  if (contentAnchor < 0) return bodyXml;

  const blocks = paragraphBlocks(bodyXml);
  const contentBlock = blocks.find((block) => {
    const end = block.index + block.xml.length;
    return block.index <= contentAnchor && end >= contentAnchor;
  });
  const validationSectionBlock = blocks
    .filter((block) => block.index < (contentBlock?.index ?? contentAnchor) && block.xml.includes("<w:sectPr"))
    .at(-1);
  const validationSectPr =
    validationSectionBlock?.xml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/)?.[0] ?? "";

  const trimmedBody = bodyXml.slice(contentBlock?.index ?? contentAnchor);
  const { content, sectPr } = extractTrailingSectPr(trimmedBody);

  return `${content}${validationSectPr || sectPr}`;
}

function replaceLiteralText(xml: string, replacements: Record<string, string>) {
  return Object.entries(replacements).reduce(
    (current, [source, replacement]) => current.replaceAll(escapeXml(source), escapeXml(replacement)),
    xml,
  );
}

function replaceSdtContentByAlias(xml: string, alias: string, value: string) {
  return xml.replace(/<w:sdt>[\s\S]*?<\/w:sdt>/g, (sdtXml) => {
    if (!sdtXml.includes(`<w:alias w:val="${alias}"`)) return sdtXml;

    let hasInsertedValue = false;
    return sdtXml
      .replace(/<w:showingPlcHdr\/>/g, "")
      .replace(/<w:dataBinding\b[^>]*\/>/g, "")
      .replace(
        /<w:sdtContent>[\s\S]*?<\/w:sdtContent>/,
        (contentXml) =>
          contentXml.replace(/<w:t\b([^>]*)>[\s\S]*?<\/w:t>/g, (_textXml, attributes: string) => {
            if (hasInsertedValue) return `<w:t${attributes}></w:t>`;
            hasInsertedValue = true;
            const spacing = /^\s|\s$/.test(value) && !attributes.includes("xml:space")
              ? `${attributes} xml:space="preserve"`
              : attributes;
            return `<w:t${spacing}>${escapeXml(value)}</w:t>`;
          }),
      );
  });
}

function addDefaultRunSize(xml: string) {
  return xml.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/g, (runProperties, inner) => {
    if (inner.includes("<w:sz")) return runProperties;
    return `<w:rPr>${inner}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`;
  });
}

function flattenSdtContent(xml: string) {
  return xml.replace(
    /<w:sdt>[\s\S]*?<w:sdtContent>([\s\S]*?)<\/w:sdtContent>[\s\S]*?<\/w:sdt>/g,
    "$1",
  );
}

function recipientSummary(recipients: Recipient[]) {
  const values = recipients
    .map((recipient) => recipient.position || recipient.name || recipient.bureau || "")
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? values.join("; ") : "[Kepada]";
}

function divisionSummary(recipients: Recipient[]) {
  const values = recipients
    .map((recipient) => recipient.bureau || recipient.position || "")
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? [...new Set(values)].join("; ") : "[Divisi]";
}

function validationValues(draft: MemoDraft, totalPages: number): ValidationValues {
  return {
    noMemo: draft.metadata.noMemo || "[No Memo]",
    releaseDate: draft.metadata.releaseDate || "[Tanggal Rilis]",
    totalPages: String(totalPages),
    title: draft.metadata.perihal || "[Judul Request]",
    recipients: recipientSummary(draft.recipients),
    division: divisionSummary(draft.recipients),
    ccRecipients: recipientSummary(draft.ccRecipients).replace("[Kepada]", "[Tembusan]"),
    creatorUnit: `POL Application & User Acceptance Test Bureau ${draft.metadata.bureau}`,
  };
}

function applyValidationValues(xml: string, values: ValidationValues) {
  const unboundXml = xml.replace(/<w:dataBinding\b[^>]*\/>/g, "");
  const replacedXml = replaceLiteralText(unboundXml, {
    "[No Memo]": values.noMemo,
    "[Tanggal Rilis]": values.releaseDate,
    "[Total Lembar]": values.totalPages,
    "[Judul Request]": values.title,
    "[Kepada]": values.recipients,
    "[Divisi]": values.division,
    "[Tembusan]": values.ccRecipients,
    "[Unit Pembuat]": values.creatorUnit,
  });

  const boundValues: Record<string, string> = {
    Nomor: values.noMemo,
    TanggalRelease: values.releaseDate,
    TotalHalaman: values.totalPages,
    Judul: values.title,
    Requester: "[Request Log]",
    Approval: "[Approval Log]",
    Release: "[Release Log]",
    Kepada: values.recipients,
    Divisi: values.division,
    Tembusan: values.ccRecipients,
    BiroPembuat: values.creatorUnit,
  };

  const withBoundValues = Object.entries(boundValues).reduce(
    (current, [alias, value]) => replaceSdtContentByAlias(current, alias, value),
    replacedXml,
  );

  return addDefaultRunSize(flattenSdtContent(withBoundValues));
}

function altChunkBlock(relationshipId: string) {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p><w:altChunk r:id="${relationshipId}"/>`;
}

async function buildValidationChunk(validationTemplate: ArrayBuffer, values: ValidationValues) {
  const templateZip = await JSZip.loadAsync(validationTemplate);
  const templateDocument = templateZip.file("word/document.xml");
  if (!templateDocument) return new Uint8Array(validationTemplate);

  const templateDocumentXml = await templateDocument.async("text");
  const validationBody = normalizeValidationBody(bodyInner(templateDocumentXml));
  templateZip.file("word/document.xml", applyValidationValues(replaceBodyInner(templateDocumentXml, validationBody), values));

  const partNames = Object.keys(templateZip.files).filter((name) =>
    /^word\/(header|footer)\d+\.xml$/.test(name),
  );

  await Promise.all(
    partNames.map(async (partName) => {
      const part = templateZip.file(partName);
      if (!part) return;
      templateZip.file(partName, applyValidationValues(await part.async("text"), values));
    }),
  );

  return templateZip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export async function spliceValidationTemplate(
  generatedDocx: Blob,
  validationTemplate: ArrayBuffer,
  draft: MemoDraft,
  totalPages: number,
) {
  const outputZip = await JSZip.loadAsync(generatedDocx);
  const outputDocument = outputZip.file("word/document.xml");
  const outputRels = outputZip.file("word/_rels/document.xml.rels");
  const contentTypes = outputZip.file("[Content_Types].xml");

  if (!outputDocument || !outputRels || !contentTypes) {
    return generatedDocx;
  }

  const values = validationValues(draft, totalPages);
  const validationChunk = await buildValidationChunk(validationTemplate, values);
  const relationshipId = `rId${maxRelationshipId(await outputRels.async("text")) + 1}`;

  const outputDocumentXml = await outputDocument.async("text");
  const outputBody = bodyInner(outputDocumentXml);
  const { content, sectPr } = extractTrailingSectPr(outputBody);
  const mergedBody = `${content}${altChunkBlock(relationshipId)}${sectPr}`;

  outputZip.file("word/document.xml", replaceBodyInner(outputDocumentXml, mergedBody));
  outputZip.file("word/_rels/document.xml.rels", appendRelationship(await outputRels.async("text"), relationshipId));
  outputZip.file("[Content_Types].xml", addAltChunkContentType(await contentTypes.async("text")));
  outputZip.file(`word/${ALT_CHUNK_TARGET}`, validationChunk);

  return outputZip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}
