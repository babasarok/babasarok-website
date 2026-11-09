import type { TranslatableString } from "./translatable-strings";
import type { TranslationFile } from "./upload-plan";

/**
 * What a (partial) upload broke: a written string whose live value is not the
 * file's translation, or any other string whose Hungarian source or
 * target-language text changed. Empty when the catalog is as planned.
 */
export function verificationProblems(
  before: readonly TranslatableString[],
  after: readonly TranslatableString[],
  file: TranslationFile,
  written: ReadonlySet<string>
): string[] {
  const problems: string[] = [];
  const afterByKey = new Map(after.map((string) => [string.key, string]));

  for (const entry of file.strings.filter((e) => written.has(e.key))) {
    const live = afterByKey.get(entry.key);

    if (live?.current !== entry.translation) {
      problems.push(
        `${entry.key}: live ${JSON.stringify(live?.current)}, expected ${JSON.stringify(entry.translation)}.`
      );
    }
  }

  for (const previous of before.filter((string) => !string.derived)) {
    const live = afterByKey.get(previous.key);

    if (live === undefined) {
      problems.push(`${previous.key}: disappeared from the live catalog.`);
      continue;
    }

    if (live.source !== previous.source) {
      problems.push(
        `${previous.key}: Hungarian changed ${JSON.stringify(previous.source)} → ${JSON.stringify(live.source)}.`
      );
    }

    if (!written.has(previous.key) && live.current !== previous.current) {
      problems.push(
        `${previous.key}: ${file.language} changed ${JSON.stringify(previous.current)} → ${JSON.stringify(live.current)} without being written.`
      );
    }
  }

  return problems;
}
