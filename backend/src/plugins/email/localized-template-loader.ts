import { promises as fs } from "node:fs";
import path from "node:path";
import type { Injector, RequestContext } from "@vendure/core";
import type { LoadTemplateInput, Partial, TemplateLoader } from "@vendure/email-plugin";
import { FileBasedTemplateLoader } from "@vendure/email-plugin";
import { messageLanguage } from "../../shared/messages";

/**
 * Per-language order emails (ADR 0015 decision 5): tries the language
 * variant `<templateName>.<lang>.hbs` first and falls back to the base
 * template, which is Hungarian.
 */
export class LocaleTemplateLoader implements TemplateLoader {
  readonly #fallback: FileBasedTemplateLoader;

  constructor(private readonly templatePath: string) {
    this.#fallback = new FileBasedTemplateLoader(templatePath);
  }

  async loadTemplate(
    _injector: Injector,
    ctx: RequestContext,
    input: LoadTemplateInput
  ): Promise<string> {
    const lang = messageLanguage(ctx.languageCode);
    const localized = input.templateName.replace(/(\.hbs)$/, `.${lang}$1`);
    const localizedPath = path.join(this.templatePath, input.type, localized);

    try {
      return await fs.readFile(localizedPath, "utf8");
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT") {
        throw error;
      }

      return this.#fallback.loadTemplate(_injector, ctx, input);
    }
  }

  loadPartials(): Promise<Partial[]> {
    return this.#fallback.loadPartials();
  }
}
