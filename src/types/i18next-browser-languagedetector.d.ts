declare module "i18next-browser-languagedetector" {
  export interface LanguageDetectorOptions {
    order?: string[];
    caches?: string[] | false;
    [key: string]: unknown;
  }

  export default class LanguageDetector {
    constructor(services?: unknown, options?: LanguageDetectorOptions);
    init(options?: LanguageDetectorOptions): void;
    detect(): string | string[] | undefined;
  }
}
