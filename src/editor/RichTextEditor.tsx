"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import BoldExtension from "@tiptap/extension-bold";
import UnderlineExtension from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Pilcrow, Underline } from "lucide-react";
import { useEffect } from "react";
import type { RichTextDoc } from "@/types/richText";

type RichTextEditorProps = {
  value: RichTextDoc;
  onChange: (value: RichTextDoc) => void;
  minHeight?: number;
};

const ManualBold = BoldExtension.extend({
  addInputRules() {
    return [];
  },
  addPasteRules() {
    return [];
  },
});

const EnterWithoutMarks = Extension.create({
  name: "enterWithoutMarks",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: () =>
        this.editor.commands.first(({ commands }) => [
          () => commands.newlineInCode(),
          () => commands.createParagraphNear(),
          () => commands.liftEmptyBlock(),
          () => commands.splitBlock({ keepMarks: false }),
        ]),
    };
  },
});

export function RichTextEditor({ value, onChange, minHeight = 120 }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ bold: false }), ManualBold, UnderlineExtension, EnterWithoutMarks],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none outline-none text-slate-800 prose-p:my-1 prose-ul:my-1 prose-ol:my-1",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getJSON() as RichTextDoc);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(value);
    if (current !== next) {
      editor.commands.setContent(value);
    }
  }, [editor, value]);

  if (!editor) {
    return (
      <div
        className="rounded-md border border-slate-200 bg-slate-50"
        style={{ minHeight }}
      />
    );
  }

  const buttonClass =
    "flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10";
  const activeClass = "bg-slate-900 text-white hover:bg-slate-800 hover:text-white";

  return (
    <div className="overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-slate-900 focus-within:ring-2 focus-within:ring-slate-900/10">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1">
        <button
          type="button"
          className={`${buttonClass} ${editor.isActive("bold") ? activeClass : ""}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Bold"
        >
          <Bold size={15} />
        </button>
        <button
          type="button"
          className={`${buttonClass} ${editor.isActive("italic") ? activeClass : ""}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italic"
        >
          <Italic size={15} />
        </button>
        <button
          type="button"
          className={`${buttonClass} ${editor.isActive("underline") ? activeClass : ""}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          aria-label="Underline"
        >
          <Underline size={15} />
        </button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button
          type="button"
          className={`${buttonClass} ${editor.isActive("bulletList") ? activeClass : ""}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Bullet list"
        >
          <List size={15} />
        </button>
        <button
          type="button"
          className={`${buttonClass} ${editor.isActive("orderedList") ? activeClass : ""}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Numbered list"
        >
          <ListOrdered size={15} />
        </button>
        <button
          type="button"
          className={buttonClass}
          onClick={() => editor.chain().focus().setParagraph().run()}
          aria-label="Paragraph"
        >
          <Pilcrow size={15} />
        </button>
      </div>
      <EditorContent
        editor={editor}
        className="px-3 py-2"
        style={{ minHeight }}
      />
    </div>
  );
}
