"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { useEffect } from "react";

interface NoteEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  minRows?: number;
}

export default function NoteEditor({ value, onChange, placeholder = "Key insight, approach, edge cases… (Markdown supported)", minRows = 4 }: NoteEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate({ editor }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onChange((editor.storage as any).markdown.getMarkdown());
    },
    editorProps: {
      attributes: {
        class: "outline-none min-h-[var(--editor-min-h)] px-3 py-2 text-sm",
      },
    },
  });

  // Sync external value changes (e.g. form reset)
  useEffect(() => {
    if (!editor) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = (editor.storage as any).markdown.getMarkdown();
    if (value !== current) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  const minH = `${minRows * 1.625}rem`;

  return (
    <div
      className="textarea textarea-bordered w-full p-0 h-auto cursor-text overflow-auto note-editor"
      style={{ "--editor-min-h": minH } as React.CSSProperties}
      onClick={() => editor?.commands.focus()}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
