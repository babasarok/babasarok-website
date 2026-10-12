import { z } from "zod";
import { MaterialDefinitionSchema } from "./material";
import { CatalogRevisionSchema } from "./model";
import { ProductGroupDefinitionSchema } from "./product-group";
import { ProductDefinitionSchema } from "./product";
import { ThreadColorPaletteSchema } from "./thread-color";

export const ProductCatalogSchema = z.strictObject({
  revision: CatalogRevisionSchema,
  materials: z.array(MaterialDefinitionSchema),
  products: z.array(ProductDefinitionSchema),
  productGroups: z.array(ProductGroupDefinitionSchema),
  threadColors: ThreadColorPaletteSchema,
});

export type ProductCatalog = z.output<typeof ProductCatalogSchema>;
