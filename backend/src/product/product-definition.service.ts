import { Injectable } from "@nestjs/common";
import { RequestContext, TransactionalConnection, UserInputError } from "@vendure/core";
import type { ProductDefinition as CanonicalProductDefinition } from "@babasarok/product-definition";
import { Material } from "../material/material.entity";
import { validateProductDefinition } from "./product-definition";
import { ProductDefinition } from "./product.entity";

@Injectable()
export class ProductDefinitionService {
  constructor(private connection: TransactionalConnection) {}

  async productDefinitions(ctx: RequestContext): Promise<ProductDefinition[]> {
    return this.connection
      .getRepository(ctx, ProductDefinition)
      .find({ order: { productId: "ASC" } });
  }

  async productDefinition(
    ctx: RequestContext,
    productId: string
  ): Promise<ProductDefinition | null> {
    return this.connection.getRepository(ctx, ProductDefinition).findOneBy({ productId });
  }

  async createProductDefinition(ctx: RequestContext, input: unknown): Promise<ProductDefinition> {
    const definition = await this.validated(input, ctx);
    const repo = this.connection.getRepository(ctx, ProductDefinition);

    if ((await repo.findOneBy({ productId: definition.id })) !== null) {
      throw new UserInputError(`Már létezik termék ezzel az azonosítóval: ${definition.id}`);
    }

    return this.connection.withTransaction(ctx, async (txCtx) => {
      const txRepo = this.connection.getRepository(txCtx, ProductDefinition);
      await txRepo.insert({ productId: definition.id, definition });

      return txRepo.findOneByOrFail({ productId: definition.id });
    });
  }

  async updateProductDefinition(
    ctx: RequestContext,
    productId: string,
    input: unknown
  ): Promise<ProductDefinition> {
    const repo = this.connection.getRepository(ctx, ProductDefinition);
    const existing = await repo.findOneBy({ productId });

    if (existing === null) {
      throw new UserInputError(`Nincs termék ezzel az azonosítóval: ${productId}`);
    }

    const definition = await this.validated(input, ctx);

    if (definition.id !== productId) {
      throw new UserInputError("A termékazonosító nem módosítható.");
    }

    return this.connection.withTransaction(ctx, async (txCtx) => {
      const txRepo = this.connection.getRepository(txCtx, ProductDefinition);
      await txRepo.update({ productId }, { definition });

      return txRepo.findOneByOrFail({ productId });
    });
  }

  async deleteProductDefinition(ctx: RequestContext, productId: string): Promise<boolean> {
    const repo = this.connection.getRepository(ctx, ProductDefinition);
    const existing = await repo.findOneBy({ productId });

    if (existing === null) {
      throw new UserInputError(`Nincs termék ezzel az azonosítóval: ${productId}`);
    }

    await this.connection.withTransaction(ctx, async (txCtx) => {
      await this.connection.getRepository(txCtx, ProductDefinition).delete({ productId });
    });

    return true;
  }

  private async validated(
    input: unknown,
    ctx: RequestContext
  ): Promise<CanonicalProductDefinition> {
    const materials = await this.connection.getRepository(ctx, Material).find();
    const result = validateProductDefinition(
      input,
      new Set(materials.map((material) => material.slug))
    );

    if (!result.success) {
      throw new UserInputError(result.errors.join("\n"));
    }

    return result.definition;
  }
}
