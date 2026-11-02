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
import { assetIdOfUrl, displayUrlOf, loadAssetUrls } from "./asset-lookup";
import { assetIdsIn, isBlankMarkdown } from "./markdown-assets";

const storedMarkdown = z
  .string()
  .nullish()
  .transform((value) => value ?? "");

const contentClasses = [
  "min-h-32 max-h-[500px] overflow-y-auto px-3 py-2 text-sm outline-none",
  "[&_h1]:my-3 [&_h1]:text-2xl [&_h1]:font-bold",
  "[&_h2]:my-3 [&_h2]:text-xl [&_h2]:font-semibold",
  "[&_h3]:my-3 [&_h3]:text-lg [&_h3]:font-semibold",
  "[&_p]:my-2",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:italic",
  "[&_a]:text-primary [&_a]:underline",
  "[&_img]:my-2 [&_img]:inline-block [&_img]:max-w-full [&_img]:rounded",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3",
  "[&_hr]:my-4",
  "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse",
  "[&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1",
].join(" ");

function createExtensions(): Extensions {
  return [
    StarterKit.configure({
      underline: false,
      link: { openOnClick: false, validate: (href) => /^(https?:\/\/|\/)/.test(href) },
    }),
    // Markdown has no underline; the toolbar button needs the command, so the
    // mark stays and serializes as plain text.
    Underline.extend({ renderMarkdown: (node, helpers) => helpers.renderChildren(node) }),
    createAssetImage(displayUrlOf),
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

function linkImagesToAssets(editor: Editor): void {
  editor.state.doc.descendants((node, pos) => {
    const { src, assetId } = node.attrs;

    if (node.type.name !== "image" || assetId || typeof src !== "string") {
      return;
    }

    void assetIdOfUrl(src).then((resolved) => {
      if (!resolved || editor.isDestroyed) {
        return;
      }

      if (editor.state.doc.nodeAt(pos)?.attrs.src !== src) {
        return;
      }

      editor.view.dispatch(editor.state.tr.setNodeAttribute(pos, "assetId", resolved));
    });
  });
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
    editorProps: { attributes: { class: contentClasses } },
    onUpdate: ({ editor: updated }) => {
      linkImagesToAssets(updated);
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

    let cancelled = false;

    void loadAssetUrls(assetIdsIn(markdown)).then(() => {
      if (cancelled || editor.isDestroyed) {
        return;
      }

      lastEmitted.current = markdown;
      setMarkdown(editor, markdown);
    });

    return () => {
      cancelled = true;
    };
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
 * Visual editor that stores markdown. Images are stored as `asset:<id>`
 * references and shown through the asset server.
 */
export const MarkdownEditor: DashboardFormComponent = ({ value, onChange, disabled }) => {
  const markdown = storedMarkdown.parse(value);
  const initialMarkdown = useRef(markdown);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadAssetUrls(assetIdsIn(initialMarkdown.current)).finally(() => {
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
