import type { z } from "zod";
import type { TinaField } from "tinacms";
import type { ProductField } from "../../../product";
import { choiceFieldAuthoring } from "./choice";
import { embroideryFieldAuthoring } from "./embroidery";
import { inputFieldAuthoring } from "./input";
import { materialFieldAuthoring } from "./material";
import { toggleFieldAuthoring } from "./toggle";

type FieldAuthoring = {
  schema: z.ZodType;
  fields: TinaField[];
};

export const FIELD_AUTHORING = {
  input: inputFieldAuthoring,
  choice: choiceFieldAuthoring,
  toggle: toggleFieldAuthoring,
  material: materialFieldAuthoring,
  embroidery: embroideryFieldAuthoring,
} satisfies Record<ProductField["kind"], FieldAuthoring>;
