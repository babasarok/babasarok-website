declare global {
    interface Window {
        fbq?: (name: "track", event: "Lead", params?: { currency: string; value: number }) => void;
    }
}

export {};
