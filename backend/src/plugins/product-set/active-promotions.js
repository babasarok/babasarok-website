export function countActivePromotionsUsing(promotions, conditionCode, channelId, now) {
    return promotions.filter((promotion) => promotion.deletedAt === null &&
        (promotion.startsAt === null || promotion.startsAt <= now) &&
        (promotion.endsAt === null || promotion.endsAt > now) &&
        promotion.channels.some((channel) => channel.id === channelId) &&
        promotion.conditions.some((condition) => condition.code === conditionCode)).length;
}
