/**
 * Builds `memo-generator.html`: the whole static export inlined into one file
 * (CSS, JS chunks, favicon, and template assets as data URLs) so it can be
 * opened straight from disk with no server.
 *
 * The build must use webpack (`next build --webpack`). Turbopack's runtime
 * reads the chunk origin from the `src` attribute, which an inlined script does
 * not have, so a Turbopack artifact never hydrates.
 *
 * Usage:
 *   npm run build:offline-html
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "out");
const TARGET = path.join(ROOT, "memo-generator.html");

const DATA_URL_MEDIA_TYPES = {
  ".css": "text/css",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const TEMPLATE_ASSET_PATHS = [
  "template-assets/validation-template.docx",
  "template-assets/validation-watermark-source-pale.png",
  "template-assets/Template%20Skenario%20untuk%20MEMO_AXM.xlsx",
];

/** Holds the chunk URL of the chunk script that is currently executing. */
const INLINE_CHUNK_SRC_GLOBAL = "__MEMO_INLINE_CHUNK_SRC__";

function readOut(relativePath) {
  return readFile(path.join(OUT_DIR, relativePath), "utf8");
}

function mediaTypeFor(relativePath) {
  const mediaType = DATA_URL_MEDIA_TYPES[path.extname(relativePath).toLowerCase()];
  if (!mediaType) {
    throw new Error(`No data URL media type registered for ${relativePath}`);
  }
  return mediaType;
}

async function dataUrlFor(relativePath) {
  const bytes = await readFile(path.join(OUT_DIR, relativePath));
  return `data:${mediaTypeFor(relativePath)};base64,${bytes.toString("base64")}`;
}

/** `/_next/static/chunks/x.css` -> `_next/static/chunks/x.css` */
function toOutRelative(href) {
  return decodeURIComponent(href.replace(/^\//, "").split("?")[0]);
}

/**
 * Inlining escapes the sequences that would otherwise close the host tag from
 * inside a string literal (the React bundle contains "</script>").
 */
function escapeForInlineScript(script) {
  return script.replace(/<\/script/gi, "<\\/script");
}

function escapeForInlineStyle(style) {
  return style.replace(/<\/style/gi, "<\\/style");
}

function inlineStyleTags(html, stylesheetContents) {
  let index = 0;
  return html.replace(
    /<link rel="stylesheet" href="[^"]+"[^>]*\/>/g,
    () => `<style>${escapeForInlineStyle(stylesheetContents[index++])}</style>`,
  );
}

function inlineScriptTags(html, scriptContents) {
  let index = 0;
  return html.replace(
    /<script src="([^"]+)"[^>]*><\/script>/g,
    (_match, src) => {
      const content = scriptContents[index++];
      // Each chunk keeps its real chunk URL so the runtime can key chunk
      // records and derive module URLs exactly like the external build.
      const chunkUrl = `window.${INLINE_CHUNK_SRC_GLOBAL}=${JSON.stringify(src)};`;
      return `<script>${chunkUrl}${escapeForInlineScript(content)}</script>`;
    },
  );
}

/**
 * Inlined chunks have no `src`, but the Next.js runtime reads
 * `document.currentScript.src` while loading them, and it re-appends
 * stylesheet/favicon links that must resolve to the embedded bytes. Both
 * shims below are required for the artifact to hydrate from `file://`.
 */
function standaloneRuntimeShim(embedded) {
  return `<script>(function () {
  function inlineChunkUrl() {
    return new URL(globalThis.${INLINE_CHUNK_SRC_GLOBAL} || "./_next/static/chunks/inline.js", document.baseURI).href;
  }
  var descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "currentScript");
  if (descriptor && typeof descriptor.get === "function") {
    Object.defineProperty(Document.prototype, "currentScript", {
      configurable: true,
      get: function () {
        var element = descriptor.get.call(this);
        if (!element || element.src) return element;
        try {
          Object.defineProperty(element, "src", {
            configurable: true,
            get: function () { return inlineChunkUrl(); }
          });
        } catch (error) {}
        return element;
      }
    });
  }
  var embedded = ${JSON.stringify(embedded)};
  function repoint(node) {
    if (!node || node.tagName !== "LINK") return node;
    var href = node.getAttribute("href");
    if (!href) return node;
    try {
      var next = embedded[new URL(href, document.baseURI).pathname];
      if (next) node.setAttribute("href", next);
    } catch (error) {}
    return node;
  }
  var appendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function (node) { return appendChild.call(this, repoint(node)); };
  var insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (node, reference) {
    return insertBefore.call(this, repoint(node), reference);
  };
})();</script>`;
}

async function main() {
  let html = await readOut("index.html");

  const stylesheetHrefs = [
    ...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g),
  ].map((match) => match[1]);
  const scriptSrcs = [...html.matchAll(/<script src="([^"]+)"/g)].map(
    (match) => match[1],
  );
  const iconHref = html.match(/<link rel="icon" href="([^"]+)"/)?.[1];
  if (!iconHref) throw new Error("out/index.html has no favicon link to inline");

  const [stylesheetContents, scriptContents, iconDataUrl] = await Promise.all([
    Promise.all(stylesheetHrefs.map(async (href) => readOut(toOutRelative(href)))),
    Promise.all(scriptSrcs.map(async (src) => readOut(toOutRelative(src)))),
    dataUrlFor(toOutRelative(iconHref)),
  ]);

  html = inlineStyleTags(html, stylesheetContents);
  html = inlineScriptTags(html, scriptContents);
  // Inline scripts must lose `async`/`nomodule`/`id` attributes: the runtime
  // reads back the executing element, and attribute-free inline scripts keep
  // the same execution order the external ones had.
  html = html.replace(/<script(?![^>]*\bsrc=)[^>]*>/g, "<script>");
  html = html.replace(
    /<link rel="icon" href="[^"]+"([^>]*)\/>/,
    `<link rel="icon" href="${iconDataUrl}"$1/>`,
  );
  // Preload hints for the now-inlined chunks would only re-request files that
  // do not exist next to a standalone artifact.
  html = html.replace(/<link rel="preload"[^>]*href="\/_next\/[^"]*"[^>]*\/>/g, "");

  const embeddedLinks = {
    ...Object.fromEntries(
      stylesheetHrefs.map((href, index) => [
        `/${href.replace(/^\//, "").split("?")[0]}`,
        `data:text/css;base64,${Buffer.from(stylesheetContents[index], "utf8").toString("base64")}`,
      ]),
    ),
    [new URL(iconHref, "https://example.invalid/").pathname]: iconDataUrl,
  };
  html = html.replace("<head>", `<head>${standaloneRuntimeShim(embeddedLinks)}`);

  // Template assets are fetched or linked at runtime; swap each path for the
  // inlined bytes so the artifact never touches the network.
  for (const assetPath of TEMPLATE_ASSET_PATHS) {
    const dataUrl = await dataUrlFor(decodeURIComponent(assetPath));
    if (!html.includes(`/${assetPath}`)) {
      throw new Error(`memo-generator.html: expected a reference to /${assetPath}`);
    }
    html = html.split(`/${assetPath}`).join(dataUrl);
  }

  const leftovers = [...html.matchAll(/(?<![.\w])(?:src|href)="\/(?!\/)[^"]*"/g)].map(
    (match) => match[0],
  );
  if (leftovers.length) {
    throw new Error(
      `memo-generator.html: unresolved root-relative references remain: ${leftovers
        .slice(0, 5)
        .join(", ")}`,
    );
  }

  await writeFile(TARGET, html);
  console.log(
    `Wrote memo-generator.html (${(html.length / 1024 / 1024).toFixed(2)} MB): ` +
      `${stylesheetContents.length} stylesheet(s), ${scriptContents.length} script(s), ` +
      `${TEMPLATE_ASSET_PATHS.length} template asset(s) inlined.`,
  );
}

await main();
