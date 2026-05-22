export type RichTextMark = {
  type: "bold" | "italic" | "underline" | "strike" | string;
  attrs?: Record<string, unknown>;
};

export type RichTextNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: RichTextMark[];
  content?: RichTextNode[];
};

export type RichTextDoc = {
  type: "doc";
  content: RichTextNode[];
};

export const emptyRichText = (): RichTextDoc => ({
  type: "doc",
  content: [{ type: "paragraph", content: [] }],
});

export const paragraphRichText = (text: string): RichTextDoc => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: text ? [{ type: "text", text }] : [],
    },
  ],
});

