import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { Extensions } from "@tiptap/core";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import {
  LinkBubbleMenu,
  ResponsiveToolbar,
  SelectionBubbleMenu,
  TableDeleteMenu,
  TableEditIcons,
  type DashboardFormComponent,
} from "@vendure/dashboard";
import { z } from "zod";
import { createAssetImage } from "./asset-image";
import "./markdown-editor.css";
import { assetPaths, loadAssetPrefix } from "./asset-prefix";
import { isBlankMarkdown } from "./markdown-assets";

const storedMarkdown = z
  .string()
  .nullish()
  .transform((value) => value ?? "");

function createExtensions(): Extensions {
  return [
    StarterKit.configure({
      underline: false,
      link: { openOnClick: false, validate: (href) => /^(https?:\/\/|\/)/.test(href) },
    }),
    // Markdown has no underline; the toolbar button needs the command, so the
    // mark stays and serializes as plain text.
    Underline.extend({ renderMarkdown: (node, helpers) => helpers.renderChildren(node) }),
    createAssetImage(assetPaths),
    TableKit,
    Markdown,
  ];
}

function setMarkdown(editor: Editor, markdown: string): void {
  if (isBlankMarkdown(markdown)) {
    editor.commands.clearContent(false);
    return;
  }

  editor.commands.setContent(markdown, { contentType: "markdown", emitUpdate: false });
}

function MarkdownEditorBody({
  markdown,
  onChange,
  disabled,
}: {
  markdown: string;
  onChange: (markdown: string) => void;
  disabled: boolean;
}): ReactElement {
  const [linkEditToken, setLinkEditToken] = useState(0);
  const lastEmitted = useRef(markdown);
  const extensions = useMemo(createExtensions, []);

  const editor = useEditor({
    extensions,
    content: isBlankMarkdown(markdown) ? "" : markdown,
    contentType: isBlankMarkdown(markdown) ? undefined : "markdown",
    editable: !disabled,
    editorProps: { attributes: { class: "markdown-editor-content" } },
    onUpdate: ({ editor: updated }) => {
      lastEmitted.current = updated.getMarkdown();
      onChange(lastEmitted.current);
    },
  });

  useEffect(() => {
    editor.setEditable(!disabled, false);
  }, [disabled, editor]);

  useEffect(() => {
    if (markdown === lastEmitted.current) {
      return;
    }

    lastEmitted.current = markdown;
    setMarkdown(editor, markdown);
  }, [markdown, editor]);

  const requestLinkEdit = (): void => {
    setLinkEditToken((token) => token + 1);
  };

  return (
    <div
      className="overflow-hidden rounded-md border"
      onKeyDown={(event) => {
        // The app sidebar toggles on a window-level mod+B listener.
        if (event.key === "b" && (event.metaKey || event.ctrlKey)) {
          event.stopPropagation();
        }
      }}
    >
      <ResponsiveToolbar editor={editor} disabled={disabled} onRequestLinkEdit={requestLinkEdit} />
      <EditorContent editor={editor} />
      <SelectionBubbleMenu editor={editor} onRequestLinkEdit={requestLinkEdit} />
      <LinkBubbleMenu editor={editor} editRequestToken={linkEditToken} />
      <TableEditIcons editor={editor} disabled={disabled} />
      <TableDeleteMenu editor={editor} disabled={disabled} />
    </div>
  );
}

/**
 * Visual editor that stores markdown. Images served by the asset server are
 * stored as their host-relative source path (`source/ab/name.jpg`).
 */
export const MarkdownEditor: DashboardFormComponent = ({ value, onChange, disabled }) => {
  const markdown = storedMarkdown.parse(value);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadAssetPrefix().finally(() => {
      setReady(true);
    });
  }, []);

  if (!ready) {
    return null;
  }

  return (
    <MarkdownEditorBody markdown={markdown} onChange={onChange} disabled={disabled ?? false} />
  );
};

MarkdownEditor.metadata = { isFullWidth: true };
