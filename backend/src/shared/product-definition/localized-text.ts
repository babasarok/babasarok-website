import { z } from "zod";

export const DEFAULT_TEXT_LANGUAGE = "hu";

const TranslationSchema = z
  .string()
  .regex(/^\S(?:[\s\S]*\S)?$/, "Nem lehet üres, és nem kezdődhet vagy végződhet szóközzel");

const LANGUAGE_KEY = /^[a-z]{2,3}(?:_[A-Za-z]+)?$/;

export const LocalizedTextSchema = z
  .object({ [DEFAULT_TEXT_LANGUAGE]: TranslationSchema })
  .catchall(TranslationSchema)
  .refine((text) => Object.keys(text).every((key) => LANGUAGE_KEY.test(key)), {
    message: "A nyelvkód érvénytelen",
  });

export type LocalizedText = z.output<typeof LocalizedTextSchema>;

export function resolveText(text: LocalizedText, languageCode: string): string {
  if (!Object.hasOwn(text, languageCode)) {
    return text.hu;
  }

  return text[languageCode];
}
