import { Ctx, RequestContext } from "@vendure/core";
import type { OrderLine } from "@vendure/core";
import { Parent, ResolveField, Resolver } from "@nestjs/graphql";
import gql from "graphql-tag";
import type { LineInvalidReason } from "./line-invalid-reason";
import { LineInvalidReasonService } from "./line-invalid-reason.service";

@Resolver("OrderLine")
export class OrderLineInvalidReasonResolver {
  constructor(private service: LineInvalidReasonService) {}

  @ResolveField()
  async invalidReason(
    @Ctx() ctx: RequestContext,
    @Parent() line: OrderLine
  ): Promise<LineInvalidReason | null> {
    return (await this.service.reasonForLine(ctx, line.id)) ?? null;
  }
}

/** The refusal (a `Refusal` object: code plus values) blocking the line, or null. */
export const lineInvalidReasonSchema = gql`
  extend type OrderLine {
    invalidReason: JSON
  }
`;
