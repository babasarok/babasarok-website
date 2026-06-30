declare global {
  interface Window {
    fbq?: (
      name: "track",
      event: "Purchase",
      params: { currency: string; value: number; num_items?: number }
    ) => void;
  }
}

// eslint-disable-next-line unicorn/require-module-specifiers
export {};
