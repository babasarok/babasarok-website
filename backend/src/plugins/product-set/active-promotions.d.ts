export interface PromotionWindow {
    deletedAt: Date | null;
    startsAt: Date | null;
    endsAt: Date | null;
    channels: ReadonlyArray<{
        id: unknown;
    }>;
    conditions: ReadonlyArray<{
        code: string;
    }>;
}
export declare function countActivePromotionsUsing(promotions: readonly PromotionWindow[], conditionCode: string, channelId: unknown, now: Date): number;
