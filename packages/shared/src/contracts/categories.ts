import { z } from 'zod';
import { TrimmedText } from './budgets';

/** Spec 003: per-budget categories (FR-014). */

export const CATEGORY_SYSTEM_KEYS = [
  'housing',
  'food',
  'transport',
  'pets',
  'leisure',
  'health',
  'subscriptions',
  'savings',
  'gifts',
  'other',
] as const;
export const CategorySystemKey = z.enum(CATEGORY_SYSTEM_KEYS);
export type CategorySystemKey = z.infer<typeof CategorySystemKey>;

export const CategoryName = TrimmedText(1, 40);

export const Category = z.object({
  id: z.uuid(),
  /** Set for the default categories; their label is translated while `name` is null. */
  systemKey: CategorySystemKey.nullable(),
  name: z.string().nullable(),
  position: z.number().int(),
});
export type Category = z.infer<typeof Category>;

export const ListCategoriesResponse = z.object({ categories: z.array(Category) });
export type ListCategoriesResponse = z.infer<typeof ListCategoriesResponse>;

export const CreateCategoryRequest = z.object({ name: CategoryName });
export type CreateCategoryRequest = z.input<typeof CreateCategoryRequest>;

export const UpdateCategoryRequest = z
  .object({ name: CategoryName, position: z.number().int().min(0) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'at least one field');
export type UpdateCategoryRequest = z.input<typeof UpdateCategoryRequest>;
