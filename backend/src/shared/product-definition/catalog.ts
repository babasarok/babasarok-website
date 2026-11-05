import { z } from "zod";
import { MaterialDefinitionSchema } from "./material";
import { CatalogRevisionSchema } from "./model";
import { ProductGroupDefinitionSchema } from "./product-group";
import { ProductDefinitionSchema } from "./product";

export const ProductCatalogSchema = z.strictObject({
  revision: CatalogRevisionSchema,
  materials: z.array(MaterialDefinitionSchema),
  products: z.array(ProductDefinitionSchema),
  productGroups: z.array(ProductGroupDefinitionSchema),
});

export type ProductCatalog = z.output<typeof ProductCatalogSchema>;
