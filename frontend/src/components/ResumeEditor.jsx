import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import { useEffect, useImperativeHandle, forwardRef } from "react";

const ResumeEditor = forwardRef(function ResumeEditor({ content, onChange, editable = true }, ref) {
  const editor = useEditor({
    editable,
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
      }),
      Underline,
      Highlight.configure({
        multicolor: false,
      }),
    ],
    content: content || "<p></p>",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none text-[10pt] leading-relaxed min-h-[297mm] w-[210mm] bg-white shadow-sm p-[15mm] mx-auto",
        style: "font-family: 'Arial', sans-serif;",
      },
    },
  });

  // Update editor content when prop changes
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || "<p></p>");
    }
  }, [content, editor]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    highlightText: (text) => {
      if (!editor || !text) return;
      
      try {
        // Search through the document for the text
        const { doc } = editor.state;
        const searchText = text.trim();
        let found = false;
        
        doc.descendants((node, pos) => {
          if (node.isText && node.text.includes(searchText)) {
            // Found the text node containing our search text
            const index = node.text.indexOf(searchText);
            if (index !== -1) {
              const from = pos + index;
              const to = from + searchText.length;
              
              // Use a transaction to set the selection and highlight
              editor
                .chain()
                .focus()
                .setTextSelection({ from, to })
                .toggleHighlight()
                .run();
              
              found = true;
            }
          }
        });
        
        if (found) {
          console.log("✅ Highlighted suggested text");
        } else {
          console.log("⚠️ Could not find text to highlight:", searchText.substring(0, 50));
        }
      } catch (err) {
        console.error("Error highlighting text:", err);
      }
    },
    clearHighlights: () => {
      if (!editor) return;
      try {
        // Find all nodes with highlight mark and remove it
        const { state, view } = editor;
        const { doc } = state;
        let tr = state.tr;
        let updated = false;
        
        doc.descendants((node, pos) => {
          if (node.marks.some(mark => mark.type.name === 'highlight')) {
            const end = pos + node.nodeSize;
            const hasMark = state.doc.rangeHasMark(pos, end, state.schema.marks.highlight);
            
            if (hasMark) {
              tr.removeMark(pos, end, state.schema.marks.highlight);
              updated = true;
            }
          }
        });
        
        if (updated) {
          view.dispatch(tr);
          console.log("✅ Cleared highlights");
        }
      } catch (err) {
        console.error("Error clearing highlights:", err);
      }
    },
    getEditor: () => editor,
  }));

  if (!editor) {
    return <div>Loading editor...</div>;
  }

  return (
    <div className="flex flex-col h-full border border-slate-300 rounded-md overflow-hidden bg-white">
      {/* Toolbar */}
      {editable && (
        <div className="flex flex-wrap gap-1 bg-slate-50 border-b border-slate-300 p-2">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={!editor.can().chain().focus().toggleBold().run()}
            className={`px-2 py-1 rounded text-xs font-semibold ${
              editor.isActive("bold")
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-300 hover:bg-slate-100"
            }`}
          >
            B
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={!editor.can().chain().focus().toggleItalic().run()}
            className={`px-2 py-1 rounded text-xs italic ${
              editor.isActive("italic")
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-300 hover:bg-slate-100"
            }`}
          >
            I
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            disabled={!editor.can().chain().focus().toggleUnderline().run()}
            className={`px-2 py-1 rounded text-xs underline ${
              editor.isActive("underline")
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-300 hover:bg-slate-100"
            }`}
          >
            U
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            disabled={!editor.can().chain().focus().toggleStrike().run()}
            className={`px-2 py-1 rounded text-xs line-through ${
              editor.isActive("strike")
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-300 hover:bg-slate-100"
            }`}
          >
            S
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="px-2 py-1 rounded text-xs bg-white border border-slate-300 hover:bg-slate-100"
          >
            ─ Line
          </button>

          <div className="w-px bg-slate-300" />

          <button
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            disabled={!editor.can().chain().focus().toggleHeading({ level: 1 }).run()}
            className={`px-2 py-1 rounded text-xs font-bold ${
              editor.isActive("heading", { level: 1 })
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-300 hover:bg-slate-100"
            }`}
          >
            H1
          </button>

          <button
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            disabled={!editor.can().chain().focus().toggleHeading({ level: 2 }).run()}
            className={`px-2 py-1 rounded text-xs font-bold ${
              editor.isActive("heading", { level: 2 })
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-300 hover:bg-slate-100"
            }`}
          >
            H2
          </button>

          <button
            type="button"
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            disabled={!editor.can().chain().focus().toggleHeading({ level: 3 }).run()}
            className={`px-2 py-1 rounded text-xs font-bold ${
              editor.isActive("heading", { level: 3 })
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-300 hover:bg-slate-100"
            }`}
          >
            H3
          </button>

          <div className="w-px bg-slate-300" />

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            disabled={!editor.can().chain().focus().toggleBulletList().run()}
            className={`px-2 py-1 rounded text-xs ${
              editor.isActive("bulletList")
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-300 hover:bg-slate-100"
            }`}
          >
            • List
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            disabled={!editor.can().chain().focus().toggleOrderedList().run()}
            className={`px-2 py-1 rounded text-xs ${
              editor.isActive("orderedList")
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-300 hover:bg-slate-100"
            }`}
          >
            1. List
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            disabled={!editor.can().chain().focus().toggleBlockquote().run()}
            className={`px-2 py-1 rounded text-xs ${
              editor.isActive("blockquote")
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-300 hover:bg-slate-100"
            }`}
          >
            "
          </button>

          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            disabled={!editor.can().chain().focus().toggleCodeBlock().run()}
            className={`px-2 py-1 rounded text-xs font-mono ${
              editor.isActive("codeBlock")
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-300 hover:bg-slate-100"
            }`}
          >
            Code
          </button>

          <div className="w-px bg-slate-300" />

          <button
            type="button"
            onClick={() => {
              const url = prompt("Enter URL:");
              if (url) {
                editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
              }
            }}
            className={`px-2 py-1 rounded text-xs ${
              editor.isActive("link")
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-300 hover:bg-slate-100"
            }`}
          >
            🔗 Link
          </button>

          <div className="w-px bg-slate-300" />

          <button
            type="button"
            onClick={() => editor.chain().focus().clearNodes().run()}
            className="px-2 py-1 rounded text-xs bg-white border border-slate-300 hover:bg-slate-100"
          >
            Clear
          </button>
        </div>
      )}

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="flex-1 overflow-y-auto p-3 [&_*]:cursor-text"
      />
    </div>
  );
});

ResumeEditor.displayName = "ResumeEditor";
export default ResumeEditor;
