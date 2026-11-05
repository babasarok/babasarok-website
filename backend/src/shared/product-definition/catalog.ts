import { z } from "zod";
import { MaterialDefinitionSchema } from "./material.ts";
import { CatalogRevisionSchema } from "./model.ts";
import { ProductGroupDefinitionSchema } from "./product-group.ts";
import { ProductDefinitionSchema } from "./product.ts";

export const ProductCatalogSchema = z.strictObject({
  revision: CatalogRevisionSchema,
  materials: z.array(MaterialDefinitionSchema),
  products: z.array(ProductDefinitionSchema),
  productGroups: z.array(ProductGroupDefinitionSchema),
});

export type ProductCatalog = z.output<typeof ProductCatalogSchema>;
