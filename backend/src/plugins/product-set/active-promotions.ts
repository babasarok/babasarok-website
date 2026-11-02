export interface PromotionWindow {
  deletedAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  channels: ReadonlyArray<{ id: unknown }>;
  conditions: ReadonlyArray<{ code: string }>;
}

export function countActivePromotionsUsing(
  promotions: readonly PromotionWindow[],
  conditionCode: string,
  channelId: unknown,
  now: Date
): number {
  return promotions.filter(
    (promotion) =>
      promotion.deletedAt === null &&
      (promotion.startsAt === null || promotion.startsAt <= now) &&
      (promotion.endsAt === null || promotion.endsAt > now) &&
      promotion.channels.some((channel) => channel.id === channelId) &&
      promotion.conditions.some((condition) => condition.code === conditionCode)
  ).length;
}
