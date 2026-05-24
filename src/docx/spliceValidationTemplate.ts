import JSZip from "jszip";

const CONTENT_TYPES: Record<string, string> = {
  footer: "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml",
  header: "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml",
};

const REL_TYPES = {
  footer: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer",
  header: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/header",
  hyperlink: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
  image: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
};

const VALIDATION_BLUE = "1F497D";

type Relationship = {
  raw: string;
  id: string;
  type: string;
  target: string;
  targetMode?: string;
};

function getAttr(xml: string, name: string) {
  const match = xml.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match?.[1] ?? "";
}

function setAttr(xml: string, name: string, value: string) {
  if (new RegExp(`\\s${name}="[^"]*"`).test(xml)) {
    return xml.replace(new RegExp(`\\s${name}="[^"]*"`), ` ${name}="${value}"`);
  }

  return xml.replace(/\/>$/, ` ${name}="${value}"/>`);
}

function parseRelationships(xml: string) {
  return [...xml.matchAll(/<Relationship\b[^>]*\/>/g)].map((match) => {
    const raw = match[0];
    return {
      raw,
      id: getAttr(raw, "Id"),
      type: getAttr(raw, "Type"),
      target: getAttr(raw, "Target"),
      targetMode: getAttr(raw, "TargetMode") || undefined,
    };
  });
}

function maxRelationshipId(relsXml: string) {
  return parseRelationships(relsXml).reduce((max, rel) => {
    const value = Number(rel.id.replace(/^rId/, ""));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
}

function createRelationship(rel: Relationship, id: string, target: string) {
  const mode = rel.targetMode ? ` TargetMode="${rel.targetMode}"` : "";
  return `<Relationship Id="${id}" Type="${rel.type}" Target="${target}"${mode}/>`;
}

function appendRelationships(relsXml: string, relationships: string[]) {
  if (!relationships.length) return relsXml;
  return relsXml.replace("</Relationships>", `${relationships.join("")}</Relationships>`);
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

function rootTag(xml: string) {
  const start = xml.indexOf("<w:document");
  if (start < 0) return "";
  const end = xml.indexOf(">", start);
  return end < 0 ? "" : xml.slice(start, end + 1);
}

function mergeDocumentNamespaces(outputXml: string, templateXml: string) {
  const outputRoot = rootTag(outputXml);
  const templateRoot = rootTag(templateXml);
  if (!outputRoot || !templateRoot) return outputXml;

  const missingAttributes = [...templateRoot.matchAll(/\sxmlns:[\w\d]+="[^"]+"/g)]
    .map((match) => match[0])
    .filter((attribute) => {
      const name = attribute.trim().split("=")[0];
      return !outputRoot.includes(`${name}=`);
    });

  if (!missingAttributes.length) return outputXml;
  return outputXml.replace(outputRoot, outputRoot.replace(/>$/, `${missingAttributes.join("")}>`));
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

function sectionBreakParagraph(sectPr: string) {
  if (!sectPr) {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }

  const normalizedSectPr = /<w:type\b/.test(sectPr)
    ? sectPr.replace(/<w:type\b[^>]*\/>/, '<w:type w:val="nextPage"/>')
    : sectPr.replace(/(<w:pgSz\b)/, '<w:type w:val="nextPage"/>$1');

  return `<w:p><w:pPr>${normalizedSectPr}</w:pPr></w:p>`;
}

function prefixedTarget(target: string) {
  if (target.startsWith("../")) return target;
  const parts = target.split("/");
  const fileName = parts.pop() ?? target;
  const folder = parts.length ? `${parts.join("/")}/` : "";
  return `${folder}validation-${fileName}`;
}

function packagePathFromWordTarget(target: string) {
  if (target.startsWith("../")) return target.replace(/^\.\.\//, "");
  return `word/${target}`;
}

async function copyPart(
  sourceZip: JSZip,
  outputZip: JSZip,
  sourcePath: string,
  targetPath: string,
) {
  const source = sourceZip.file(sourcePath);
  if (!source) return;
  outputZip.file(targetPath, await source.async("uint8array"));
}

async function copyRelatedRels(
  sourceZip: JSZip,
  outputZip: JSZip,
  sourcePartPath: string,
  targetPartPath: string,
) {
  const sourceRelsPath = sourcePartPath.replace(/^word\//, "word/_rels/") + ".rels";
  const sourceRels = sourceZip.file(sourceRelsPath);
  if (!sourceRels) return;

  let relsXml = await sourceRels.async("text");
  const relationships = parseRelationships(relsXml);

  for (const rel of relationships) {
    if (rel.targetMode === "External") continue;
    const sourceTargetPath = packagePathFromWordTarget(rel.target);
    const nextTarget = prefixedTarget(rel.target);
    const nextTargetPath = packagePathFromWordTarget(nextTarget);
    await copyPart(sourceZip, outputZip, sourceTargetPath, nextTargetPath);
    relsXml = relsXml.replace(rel.raw, setAttr(rel.raw, "Target", nextTarget));
  }

  const targetRelsPath = targetPartPath.replace(/^word\//, "word/_rels/") + ".rels";
  outputZip.file(targetRelsPath, relsXml);
}

function addContentType(contentTypesXml: string, partName: string, contentType: string) {
  if (contentTypesXml.includes(`PartName="${partName}"`)) return contentTypesXml;
  const override = `<Override PartName="${partName}" ContentType="${contentType}"/>`;
  return contentTypesXml.replace("</Types>", `${override}</Types>`);
}

function normalizePctWidthAttributes(xml: string) {
  return xml
    .replace(/(w:type="pct"\s+w:w=")(\d+)%"/g, "$1$2\"")
    .replace(/(w:w=")(\d+)(%"\s+w:type="pct")/g, "$1$2\" w:type=\"pct\"");
}

function normalizeValidationColors(xml: string) {
  return xml.replace(/<w:color\b[^>]*\/>/gi, (tag) => {
    const withoutTheme = tag.replace(/\s+w:theme(?:Color|Tint|Shade)="[^"]*"/g, "");
    if (!/w:val="(?:0F243E|1F4E79|003B7A|5B9BD5|1F497D)"/i.test(withoutTheme)) {
      return withoutTheme;
    }

    return withoutTheme.replace(/w:val="[^"]*"/, `w:val="${VALIDATION_BLUE}"`);
  });
}

function styleDefinitions(stylesXml: string) {
  return [...stylesXml.matchAll(/<w:style\b[\s\S]*?<\/w:style>/g)].map((match) => ({
    xml: match[0],
    id: getAttr(match[0], "w:styleId"),
  }));
}

function appendMissingStyles(outputStylesXml: string, templateStylesXml: string) {
  const outputIds = new Set(styleDefinitions(outputStylesXml).map((style) => style.id).filter(Boolean));
  const missingStyles = styleDefinitions(templateStylesXml)
    .filter((style) => style.id && !outputIds.has(style.id))
    .map((style) => style.xml);

  if (!missingStyles.length) return outputStylesXml;
  return outputStylesXml.replace("</w:styles>", `${missingStyles.join("")}</w:styles>`);
}

export async function spliceValidationTemplate(
  generatedDocx: Blob,
  validationTemplate: ArrayBuffer,
) {
  const [outputZip, templateZip] = await Promise.all([
    JSZip.loadAsync(generatedDocx),
    JSZip.loadAsync(validationTemplate),
  ]);

  const outputDocument = outputZip.file("word/document.xml");
  const outputRels = outputZip.file("word/_rels/document.xml.rels");
  const templateDocument = templateZip.file("word/document.xml");
  const templateRels = templateZip.file("word/_rels/document.xml.rels");
  const outputStyles = outputZip.file("word/styles.xml");
  const templateStyles = templateZip.file("word/styles.xml");
  const contentTypes = outputZip.file("[Content_Types].xml");

  if (!outputDocument || !outputRels || !templateDocument || !templateRels || !contentTypes) {
    return generatedDocx;
  }

  let outputDocumentXml = await outputDocument.async("text");
  let outputRelsXml = await outputRels.async("text");
  let contentTypesXml = await contentTypes.async("text");
  let outputStylesXml = outputStyles ? await outputStyles.async("text") : "";
  const templateDocumentXml = await templateDocument.async("text");
  const templateStylesXml = templateStyles ? await templateStyles.async("text") : "";
  let templateBody = normalizeValidationColors(normalizeValidationBody(bodyInner(templateDocumentXml)));
  const templateRelsXml = await templateRels.async("text");

  const idMap = new Map<string, string>();
  const newRelationships: string[] = [];
  let nextRelId = maxRelationshipId(outputRelsXml) + 1;

  for (const rel of parseRelationships(templateRelsXml)) {
    const shouldCopy =
      rel.type === REL_TYPES.header ||
      rel.type === REL_TYPES.footer ||
      rel.type === REL_TYPES.hyperlink ||
      rel.type === REL_TYPES.image;

    if (!shouldCopy || !templateBody.includes(`r:id="${rel.id}"`)) continue;

    const nextId = `rId${nextRelId}`;
    nextRelId += 1;
    idMap.set(rel.id, nextId);

    const target = rel.targetMode === "External"
      ? rel.target
      : prefixedTarget(rel.target);

    newRelationships.push(createRelationship(rel, nextId, target));

    if (rel.targetMode !== "External") {
      const sourcePath = packagePathFromWordTarget(rel.target);
      const targetPath = packagePathFromWordTarget(target);
      await copyPart(templateZip, outputZip, sourcePath, targetPath);
      await copyRelatedRels(templateZip, outputZip, sourcePath, targetPath);

      if (rel.type === REL_TYPES.header) {
        contentTypesXml = addContentType(contentTypesXml, `/${targetPath}`, CONTENT_TYPES.header);
      }

      if (rel.type === REL_TYPES.footer) {
        contentTypesXml = addContentType(contentTypesXml, `/${targetPath}`, CONTENT_TYPES.footer);
      }
    }
  }

  for (const [previousId, nextId] of idMap) {
    templateBody = templateBody.replaceAll(`r:id="${previousId}"`, `r:id="${nextId}"`);
  }

  const outputBody = bodyInner(outputDocumentXml);
  const { content, sectPr } = extractTrailingSectPr(outputBody);
  const mergedBody = `${content}${sectionBreakParagraph(sectPr)}${templateBody}`;

  outputDocumentXml = normalizeValidationColors(
    mergeDocumentNamespaces(replaceBodyInner(outputDocumentXml, mergedBody), templateDocumentXml),
  );
  outputRelsXml = appendRelationships(outputRelsXml, newRelationships);

  outputZip.file("word/document.xml", normalizePctWidthAttributes(outputDocumentXml));
  outputZip.file("word/_rels/document.xml.rels", outputRelsXml);
  if (outputStyles && templateStylesXml) {
    outputStylesXml = appendMissingStyles(outputStylesXml, normalizeValidationColors(templateStylesXml));
    outputStylesXml = normalizeValidationColors(outputStylesXml);
    outputZip.file("word/styles.xml", outputStylesXml);
  }
  outputZip.file("[Content_Types].xml", contentTypesXml);

  return outputZip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}
