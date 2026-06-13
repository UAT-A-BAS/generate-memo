"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import UnderlineExtension from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Underline } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import type { RichTextDoc } from "@/types/richText";

type RichTextEditorProps = {
  value: RichTextDoc;
  onChange: (value: RichTextDoc) => void;
  minHeight?: number;
};

function preserveEditorSelection(event: React.MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

const EnterWithoutMarks = Extension.create({
  name: "enterWithoutMarks",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (this.editor.isActive("bulletList") || this.editor.isActive("orderedList")) {
          return false;
        }

        return this.editor.commands.first(({ commands }) => [
          () => commands.newlineInCode(),
          () => commands.createParagraphNear(),
          () => commands.liftEmptyBlock(),
          () => commands.splitBlock({ keepMarks: false }),
        ]);
      },
    };
  },
});

export function RichTextEditor({ value, onChange, minHeight = 120 }: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  const pendingChangeRef = useRef<{ value: RichTextDoc; serialized: string } | null>(null);
  const changeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmittedValueRef = useRef<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const flushPendingChange = useCallback(() => {
    if (changeTimerRef.current) {
      clearTimeout(changeTimerRef.current);
      changeTimerRef.current = null;
    }

    const pending = pendingChangeRef.current;
    if (!pending) return;

    pendingChangeRef.current = null;
    lastEmittedValueRef.current = pending.serialized;
    onChangeRef.current(pending.value);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ underline: false }),
      UnderlineExtension,
      EnterWithoutMarks,
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none outline-none text-slate-950 prose-p:my-1 prose-ul:my-1 prose-ol:my-1",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const nextValue = currentEditor.getJSON() as RichTextDoc;
      pendingChangeRef.current = {
        value: nextValue,
        serialized: JSON.stringify(nextValue),
      };
      if (changeTimerRef.current) {
        clearTimeout(changeTimerRef.current);
      }
      changeTimerRef.current = setTimeout(flushPendingChange, 40);
    },
    onBlur: flushPendingChange,
  });

  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(value);
    if (current === next) {
      if (lastEmittedValueRef.current === next) {
        lastEmittedValueRef.current = null;
      }
      return;
    }
    if (
      lastEmittedValueRef.current === next ||
      pendingChangeRef.current ||
      editor.view.hasFocus()
    ) {
      return;
    }
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  useEffect(
    () => () => {
      if (changeTimerRef.current) {
        clearTimeout(changeTimerRef.current);
      }
    },
    [],
  );

  if (!editor) {
    return (
      <div
        className="rounded-md border border-slate-200 bg-slate-50"
        style={{ minHeight }}
      />
    );
  }

  const buttonClass =
    "flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-900/10";
  const activeClass = "bg-slate-900 text-white hover:bg-slate-800 hover:text-white";

  return (
    <div className="overflow-hidden rounded-md border border-slate-400 bg-white focus-within:border-slate-900 focus-within:ring-2 focus-within:ring-slate-900/10">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-300 bg-slate-50 px-2 py-1">
        <button
          type="button"
          className={`${buttonClass} ${editor.isActive("bold") ? activeClass : ""}`}
          onMouseDown={preserveEditorSelection}
          onClick={() => {
            editor.view.focus();
            editor.commands.toggleBold();
          }}
          aria-label="Bold"
          title="Bold"
        >
          <Bold size={15} />
        </button>
        <button
          type="button"
          className={`${buttonClass} ${editor.isActive("italic") ? activeClass : ""}`}
          onMouseDown={preserveEditorSelection}
          onClick={() => {
            editor.view.focus();
            editor.commands.toggleItalic();
          }}
          aria-label="Italic"
        >
          <Italic size={15} />
        </button>
        <button
          type="button"
          className={`${buttonClass} ${editor.isActive("underline") ? activeClass : ""}`}
          onMouseDown={preserveEditorSelection}
          onClick={() => {
            editor.view.focus();
            editor.commands.toggleUnderline();
          }}
          aria-label="Underline"
        >
          <Underline size={15} />
        </button>
        <span className="mx-1 h-5 w-px bg-slate-200" />
        <button
          type="button"
          className={`${buttonClass} ${editor.isActive("bulletList") ? activeClass : ""}`}
          onMouseDown={preserveEditorSelection}
          onClick={() => {
            editor.view.focus();
            editor.commands.toggleBulletList();
          }}
          aria-label="Bullet list"
        >
          <List size={15} />
        </button>
        <button
          type="button"
          className={`${buttonClass} ${editor.isActive("orderedList") ? activeClass : ""}`}
          onMouseDown={preserveEditorSelection}
          onClick={() => {
            editor.view.focus();
            editor.commands.toggleOrderedList();
          }}
          aria-label="Numbered list"
        >
          <ListOrdered size={15} />
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
