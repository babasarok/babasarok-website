import { z } from "zod";

export const MoneySchema = z.int().nonnegative();
export const PositiveMoneySchema = z.int().positive();

export const TrimmedTextSchema = z
  .string()
  .regex(/^\S(?:.*\S)?$/, "Must be non-empty without leading or trailing whitespace");

export const LabelSchema = TrimmedTextSchema;

export const ProductIdSchema = TrimmedTextSchema.brand<"ProductId">();
export const ProductFieldIdSchema = TrimmedTextSchema.brand<"ProductFieldId">();
export const ProductRevisionSchema = TrimmedTextSchema.brand<"ProductRevision">();
export const CatalogRevisionSchema = TrimmedTextSchema.brand<"CatalogRevision">();

export type Money = z.output<typeof MoneySchema>;
export type PositiveMoney = z.output<typeof PositiveMoneySchema>;
export type ProductId = z.output<typeof ProductIdSchema>;
export type ProductFieldId = z.output<typeof ProductFieldIdSchema>;
export type ProductRevision = z.output<typeof ProductRevisionSchema>;
export type CatalogRevision = z.output<typeof CatalogRevisionSchema>;
