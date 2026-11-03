import { OnApplicationBootstrap } from "@nestjs/common";
import {
  Channel,
  ChannelService,
  Country,
  CountryService,
  PluginCommonModule,
  PromotionService,
  RequestContext,
  RequestContextService,
  ShippingMethodService,
  TransactionalConnection,
  VendurePlugin,
  Zone,
  ZoneService,
} from "@vendure/core";
import { env } from "../../env";
import { seedDelivery } from "./delivery-seed";
import type { ID } from "@vendure/common/lib/shared-types";

// Vendure refuses price calculations without channel default tax/shipping
// zones, and ships with none configured. Give the default channel an HU zone
// (idempotent; both roles point at the same zone until delivery lands).
const ZONE_NAME = "babasarok-default";

@VendurePlugin({ imports: [PluginCommonModule] })
export class ChannelSetupPlugin implements OnApplicationBootstrap {
  constructor(
    private connection: TransactionalConnection,
    private channelService: ChannelService,
    private countryService: CountryService,
    private zoneService: ZoneService,
    private requestContextService: RequestContextService,
    private shippingMethodService: ShippingMethodService,
    private promotionService: PromotionService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const ctx = await this.requestContextService.create({ apiType: "admin" });
    const channel = await this.channelService.getDefaultChannel(ctx);

    // Prices are stored gross (consumer prices, ÁFA-inclusive) everywhere:
    // definitions, quotes, order lines. Vendure's default channel treats
    // stored prices as net and would add 27% on top once a TaxRate exists.
    // With pricesIncludeTax the tax portion is extracted (×100/127) and
    // totals stay equal to the stored prices. Must happen before real orders
    // carry native totals: OrderLine snapshots listPriceIncludesTax at
    // add-to-order, so flipping later would mix semantics across lines. The
    // 27% HU TaxRate itself lands with payments/invoicing (roadmap epic 7).
    if (!channel.pricesIncludeTax) {
      await this.channelService.update(ctx, { id: channel.id, pricesIncludeTax: true });
    }

    await this.ensureZones(ctx, channel);
    await seedDelivery(this.connection, this.shippingMethodService, this.promotionService, ctx);
  }

  private async ensureZones(ctx: RequestContext, channel: Channel): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the zone relations are typed non-null but sit unset on a fresh database, which is exactly what this guard handles
    if (channel.defaultTaxZone && channel.defaultShippingZone) {
      return;
    }

    let country = await this.connection
      .getRepository(ctx, Country)
      .findOne({ where: { code: env.shopCountryCode } });
    if (!country) {
      country = await this.countryService.create(ctx, {
        code: env.shopCountryCode,
        enabled: true,
        translations: [{ languageCode: ctx.languageCode, name: env.shopCountryName }],
      });
    }
    const zone = await this.getOrCreateZone(ctx, country.id);
    await this.channelService.update(ctx, {
      id: channel.id,
      defaultTaxZoneId: zone.id,
      defaultShippingZoneId: zone.id,
    });
  }

  private async getOrCreateZone(ctx: RequestContext, countryId: ID): Promise<Zone> {
    const zone = await this.connection
      .getRepository(ctx, Zone)
      .findOne({ where: { name: ZONE_NAME }, relations: { members: true } });
    if (!zone) {
      const created = await this.zoneService.create(ctx, { name: ZONE_NAME });
      return this.zoneService.addMembersToZone(ctx, { zoneId: created.id, memberIds: [countryId] });
    }
    if (zone.members.some((member) => member.id === countryId)) {
      return zone;
    }
    return this.zoneService.addMembersToZone(ctx, { zoneId: zone.id, memberIds: [countryId] });
  }
}
