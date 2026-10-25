import Handlebars from "handlebars";
import type { EmailGenerator, EmailPluginOptions } from "@vendure/email-plugin";

// Same handlebars pipeline as HandlebarsMjmlGenerator, minus the MJML step:
// our templates are plain HTML.
export class HandlebarsHtmlGenerator implements EmailGenerator {
  async onInit(options: EmailPluginOptions): Promise<void> {
    const partials = await options.templateLoader?.loadPartials?.();
    if (partials) {
      for (const { name, content } of partials) {
        Handlebars.registerPartial(name, content);
      }
    }
  }

  generate(
    from: string,
    subject: string,
    body: string,
    templateVars: { [key: string]: unknown }
  ): { from: string; subject: string; body: string } {
    const templateOptions = { allowProtoPropertiesByDefault: true };
    return {
      from: Handlebars.compile(from, { noEscape: true })(templateVars, templateOptions),
      subject: Handlebars.compile(subject)(templateVars, templateOptions),
      body: Handlebars.compile(body)(templateVars, templateOptions),
    };
  }
}
