import { z } from "zod";
import { TrimmedTextSchema } from "./model";

export const DEFAULT_TEXT_LANGUAGE = "hu";

const LANGUAGE_KEY = /^[a-z]{2,3}(?:_[A-Za-z]+)?$/;

export const LocalizedTextSchema = z
  .object({ [DEFAULT_TEXT_LANGUAGE]: TrimmedTextSchema })
  .catchall(TrimmedTextSchema)
  .refine((text) => Object.keys(text).every((key) => LANGUAGE_KEY.test(key)), {
    message: "A nyelvkód érvénytelen",
  });

export type LocalizedText = z.output<typeof LocalizedTextSchema>;

export function resolveText(text: LocalizedText, languageCode: string): string {
  const requested: string | undefined = text[languageCode];

  return requested ?? text.hu;
}
