import {
  Allow,
  Asset,
  Ctx,
  FacetValue,
  Permission,
  RequestContext,
  TransactionalConnection,
  TranslatorService,
} from "@vendure/core";
import { Query, Resolver } from "@nestjs/graphql";
import { THREAD_COLOR_FACET_CODE } from "./facet-codes";

interface ShopThreadColor {
  id: string;
  label: string;
  hex: string | null;
  swatch: Asset | null;
}

@Resolver()
export class ShopThreadColorResolver {
  constructor(
    private connection: TransactionalConnection,
    private translator: TranslatorService
  ) {}

  /** Reads the private thread-color facet directly: the facet itself stays
   * hidden from the shop's `facets` (ADR 0011 decision 3). */
  @Query()
  @Allow(Permission.Public)
  async threadColors(@Ctx() ctx: RequestContext): Promise<ShopThreadColor[]> {
    const values = await this.connection.getRepository(ctx, FacetValue).find({
      where: { facet: { code: THREAD_COLOR_FACET_CODE } },
      relations: { translations: true, customFields: { swatch: true } },
      order: { id: "ASC" },
    });

    return values.map((value) => ({
      id: value.code,
      label: this.translator.translate(value, ctx).name,
      hex: value.customFields.hex,
      swatch: value.customFields.swatch,
    }));
  }
}

export const shopThreadColorTypes = `
  type ThreadColor {
    id: String!
    label: String!
    hex: String
    swatch: Asset
  }

  extend type Query {
    threadColors: [ThreadColor!]!
  }
`;
