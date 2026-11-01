import { OnApplicationBootstrap } from "@nestjs/common";
import {
  ChannelService,
  Country,
  CountryService,
  PluginCommonModule,
  RequestContext,
  RequestContextService,
  TransactionalConnection,
  VendurePlugin,
  Zone,
  ZoneService,
} from "@vendure/core";
import { env } from "../env";
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
    private requestContextService: RequestContextService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const ctx = await this.requestContextService.create({ apiType: "admin" });
    const channel = await this.channelService.getDefaultChannel(ctx);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- the zone relations are typed non-null but sit unset on a fresh database, which is exactly what this guard handles
    if (channel.defaultTaxZone && channel.defaultShippingZone) {
      return;
    }

    const country =
      (await this.connection
        .getRepository(ctx, Country)
        .findOne({ where: { code: env.shopCountryCode } })) ??
      (await this.countryService.create(ctx, {
        code: env.shopCountryCode,
        enabled: true,
        translations: [{ languageCode: ctx.languageCode, name: env.shopCountryName }],
      }));
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
