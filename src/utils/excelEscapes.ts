// Excel stores control characters as _xHHHH_ escapes; _x005F_ escapes a literal underscore.
export function decodeExcelEscapes(text: string) {
  return text
    .replace(/_x(000d|000a|0009|005f)_/gi, (_, code: string) =>
      String.fromCharCode(parseInt(code, 16)),
    )
    .replace(/\r\n?/g, "\n");
}

// Drafts saved before XLSX import decoded escapes still carry raw _x000D_ text.
// Their line break already follows as "\n" or a hardBreak node, so the CR is dropped.
export function stripExcelCarriageReturns(text: string) {
  return text.replace(/(?<!_x005F)_x000D_/gi, "").replace(/\r\n?/g, "\n");
}

export function parseJsonStrippingExcelCarriageReturns(text: string): unknown {
  return JSON.parse(text, (_key, value) =>
    typeof value === "string" ? stripExcelCarriageReturns(value) : value,
  );
}
