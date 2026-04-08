import { aiClient } from '../providers/openai-compatible.js';

/**
 * Strategies for pulling a JSON object out of a mixed-content AI reply.
 * Returns every candidate string the caller should try to JSON.parse.
 */
export function extractJsonCandidates(content: string): (string | null)[] {
  const trimmed = content.trim();
  return [
    trimmed,
    // Strip markdown code block
    trimmed.replace(/^```(?:json)?\s*/s, '').replace(/\s*```\s*$/s, ''),
    // Extract first fenced json block
    (() => {
      const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      return match ? match[1] : null;
    })(),
    // Carve out the first balanced { ... } block
    (() => {
      const start = trimmed.indexOf('{');
      if (start === -1) return null;
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = start; i < trimmed.length; i += 1) {
        const ch = trimmed[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\' && inString) { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth += 1;
        if (ch === '}') depth -= 1;
        if (depth === 0) return trimmed.slice(start, i + 1);
      }
      // Unbalanced — return what we have so repair can close it
      return trimmed.slice(start);
    })(),
  ];
}

/**
 * Try to parse any candidate, falling back to truncation-repair.
 * Returns the first successfully parsed object, or null if none work.
 */
export function parseFirstValidJson(candidates: (string | null)[]): unknown | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      const repaired = aiClient.tryRepairJSON(candidate);
      if (repaired !== null) return repaired;
    }
  }
  return null;
}

/**
 * A chat response often either (a) is conversational text or (b) contains
 * a JSON payload with a specific shape. This helper handles case (b):
 *   - tries every extraction strategy,
 *   - attempts truncation repair on each,
 *   - validates via the caller-supplied predicate,
 *   - returns the matched payload or null so the caller can fall back to
 *     treating the reply as plain text.
 */
export function extractStructuredPayload<T>(
  content: string,
  isValid: (candidate: unknown) => candidate is T,
): T | null {
  const parsed = parseFirstValidJson(extractJsonCandidates(content));
  if (parsed !== null && isValid(parsed)) return parsed;
  return null;
}

/**
 * Heuristic: does this look like the model *tried* to emit JSON?
 * Used to decide whether it's worth retrying with more tokens.
 */
export function looksLikeJsonAttempt(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('```');
}
