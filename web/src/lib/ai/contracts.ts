import { z } from "zod";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const reportTypeSchema = z.enum(["lost", "found"]);
const confidenceSchema = z.number().min(0).max(1);
const titleSchema = z.string().trim().min(5).max(120);

export const aiMethodSchema = z.enum(["model_assisted", "fallback"]);

export const reportAssistantRequestSchema = z.strictObject({
  title: titleSchema,
  publicDescription: z.string().trim().min(10).max(2000),
  colors: z.array(z.string().trim().min(1).max(32)).max(5),
  reportType: reportTypeSchema,
});

export const reportAssistantResponseSchema = z.strictObject({
  method: aiMethodSchema,
  suggestedDescription: z.string().trim().min(1).max(2000),
  suggestedTags: z.array(z.string().trim().min(1).max(40)).max(10),
});

const imageCategorySuggestionSchema = z.strictObject({
  categoryId: objectIdSchema,
  categoryName: z.string().trim().min(2).max(80),
  confidence: confidenceSchema,
});

export const imageCategoryResponseSchema = z.strictObject({
  method: aiMethodSchema,
  suggestions: z.array(imageCategorySuggestionSchema).max(3),
});

const duplicateReportSchema = z.strictObject({
  id: objectIdSchema,
  reportType: reportTypeSchema,
  title: titleSchema,
  occurredAt: z.string().datetime({ offset: true }),
});

const duplicatePairSchema = z.strictObject({
  leftReport: duplicateReportSchema,
  rightReport: duplicateReportSchema,
  similarity: confidenceSchema,
  reasons: z.array(z.string().trim().min(1).max(200)).max(6),
  method: aiMethodSchema,
});

export const duplicateScanResponseSchema = z.strictObject({
  pairs: z.array(duplicatePairSchema).max(20),
});

export type AiMethod = z.infer<typeof aiMethodSchema>;
export type ReportAssistantRequest = z.infer<
  typeof reportAssistantRequestSchema
>;
export type ReportAssistantResponse = z.infer<
  typeof reportAssistantResponseSchema
>;
export type ImageCategoryResponse = z.infer<
  typeof imageCategoryResponseSchema
>;
export type DuplicatePair = z.infer<typeof duplicatePairSchema>;
export type DuplicateScanResponse = z.infer<
  typeof duplicateScanResponseSchema
>;
