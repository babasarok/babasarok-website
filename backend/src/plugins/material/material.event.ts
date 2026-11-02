import { VendureEvent } from "@vendure/core";
import type { RequestContext } from "@vendure/core";

export type MaterialChangeType = "created" | "updated" | "deleted";

/** Published after a material write commits; carries the material's business key. */
export class MaterialEvent extends VendureEvent {
  constructor(
    readonly ctx: RequestContext,
    readonly type: MaterialChangeType,
    readonly materialSlug: string
  ) {
    super();
  }
}
