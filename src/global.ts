declare global {
    interface Window {
        fbq?: (name: "track", event: "Purchase", params: { currency: string; value: number }) => void;
    }
}

export {};
