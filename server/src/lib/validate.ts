import type { ZodSchema, ZodError } from 'zod';
import { ValidationError } from './errors.js';

/**
 * Parse request data against a Zod schema.
 * Throws a structured ValidationError on failure.
 *
 * Usage in routes:
 *   const body = validate(CreateEpisodeBody, request.body);
 */
export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = formatZodError(result.error);
    throw new ValidationError(message);
  }
  return result.data;
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
}
