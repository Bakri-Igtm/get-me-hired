import { useEffect, useImperativeHandle, forwardRef, useRef } from "react";
import { Editor } from "@tinymce/tinymce-react";

const ResumeEditor = forwardRef(function ResumeEditor({ content, onChange, editable = true }, ref) {
  const editorRef = useRef(null);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    highlightText: (text) => {
      const editor = editorRef.current;
      if (!editor || !text) return;
      
      try {
        const searchText = text.trim();
        const found = editor.plugins.searchreplace.find(searchText);
        
        if (found) {
          // Highlight the found text using yellow background
          editor.execCommand('mceInsertContent', false, 
            `<span style="background-color: yellow;">${searchText}</span>`
          );
          console.log("✅ Highlighted suggested text");
        } else {
          console.log("⚠️ Could not find text to highlight:", searchText.substring(0, 50));
        }
      } catch (err) {
        console.error("Error highlighting text:", err);
      }
    },
    clearHighlights: () => {
      const editor = editorRef.current;
      if (!editor) return;
      
      try {
        // Remove all yellow highlights
        const content = editor.getContent();
        const cleanedContent = content.replace(
          /<span style="background-color: yellow;">([^<]*)<\/span>/gi,
          '$1'
        );
        editor.setContent(cleanedContent);
        console.log("✅ Cleared highlights");
      } catch (err) {
        console.error("Error clearing highlights:", err);
      }
    },
    getEditor: () => editorRef.current,
  }));

  return (
    <div className="flex flex-col h-full border border-slate-300 rounded-md overflow-hidden bg-white">
      <Editor
        apiKey={import.meta.env.VITE_TINYMCE_API_KEY}
        onInit={(evt, editor) => editorRef.current = editor}
        value={content || "<p></p>"}
        onEditorChange={(newContent) => {
          onChange(newContent);
        }}
        disabled={!editable}
        init={{
          height: 750,
          menubar: false,
          plugins: [
            'advlist', 'autolink', 'lists', 'link', 'charmap', 'preview',
            'searchreplace', 'visualblocks', 'code', 'fullscreen',
            'insertdatetime', 'table', 'wordcount', 'hr', 'pagebreak'
          ],
          toolbar: editable
            ? 'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | ' +
              'forecolor backcolor | alignleft aligncenter alignright alignjustify | ' +
              'bullist numlist outdent indent | hr | link table | removeformat'
            : false,
          font_family_formats: 'Arial=arial,helvetica,sans-serif; ' +
            'Calibri=calibri,sans-serif; ' +
            'Times New Roman=times new roman,times,serif; ' +
            'Georgia=georgia,serif; ' +
            'Courier New=courier new,courier,monospace; ' +
            'Verdana=verdana,sans-serif; ' +
            'Tahoma=tahoma,sans-serif',
          font_size_formats: '8pt 9pt 10pt 11pt 12pt 14pt 16pt 18pt 24pt 36pt',
          content_style: `
            body {
              font-family: Arial, sans-serif;
              font-size: 10pt;
              line-height: 1.6;
              padding: 15mm;
              max-width: 210mm;
              min-height: 297mm;
              margin: 0 auto;
              background: white;
            }
            hr {
              border: none;
              border-top: 1px solid #333;
              margin: 12px 0;
            }
            h1 {
              font-size: 18pt;
              margin: 8px 0;
              border-bottom: 2px solid #333;
              padding-bottom: 4px;
            }
            h2 {
              font-size: 14pt;
              margin: 8px 0;
              border-bottom: 1px solid #666;
              padding-bottom: 2px;
            }
            h3 {
              font-size: 12pt;
              margin: 6px 0;
            }
            table {
              border-collapse: collapse;
              width: 100%;
            }
            table td, table th {
              border: 1px solid #ddd;
              padding: 8px;
            }
          `,
          branding: false,
          statusbar: false,
          readonly: !editable,
        }}
      />
    </div>
  );
});

ResumeEditor.displayName = "ResumeEditor";
export default ResumeEditor;
