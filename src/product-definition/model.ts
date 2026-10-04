import { z } from "zod";

export const MoneySchema = z.number().int().nonnegative();

export const ProductIdSchema = z.string().min(1);
export const ProductFieldIdSchema = z.string().min(1);
export const MaterialIdSchema = z.string().trim().min(1);

export type ProductId = z.output<typeof ProductIdSchema>;
export type ProductFieldId = z.output<typeof ProductFieldIdSchema>;
export type MaterialId = z.output<typeof MaterialIdSchema>;
