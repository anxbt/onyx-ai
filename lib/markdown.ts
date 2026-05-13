/**
 * Markdown preprocessing helpers:
 *  - Math block extraction (so markdown-it doesn't mangle $$…$$)
 *  - Streaming-safe truncation
 */

export interface MathPlaceholder {
  id: string;
  raw: string;
  display: boolean; // true = block $$…$$, false = inline $…$
}

const MATH_PLACEHOLDER_PREFIX = "__MATH_";
const MATH_PLACEHOLDER_SUFFIX = "__";

/**
 * Replace math blocks with non-rendering placeholders before markdown parsing,
 * then restore them as plain styled text after.
 */
export function extractMath(content: string): {
  cleaned: string;
  placeholders: MathPlaceholder[];
} {
  const placeholders: MathPlaceholder[] = [];

  // Block math: $$...$$
  let cleaned = content.replace(
    /\$\$([\s\S]*?)\$\$/g,
    (_match, tex) => {
      const id = `${MATH_PLACEHOLDER_PREFIX}${placeholders.length}${MATH_PLACEHOLDER_SUFFIX}`;
      placeholders.push({ id, raw: tex.trim(), display: true });
      return id;
    }
  );

  // Inline math: $...$ (but not $$)
  cleaned = cleaned.replace(
    /(?<!\$)\$(?!\$)([^\n$]+?)(?<!\$)\$(?!\$)/g,
    (_match, tex) => {
      const id = `${MATH_PLACEHOLDER_PREFIX}${placeholders.length}${MATH_PLACEHOLDER_SUFFIX}`;
      placeholders.push({ id, raw: tex.trim(), display: false });
      return id;
    }
  );

  return { cleaned, placeholders };
}

export function isMathPlaceholder(text: string): boolean {
  return text.startsWith(MATH_PLACEHOLDER_PREFIX) && text.endsWith(MATH_PLACEHOLDER_SUFFIX);
}

export function parsePlaceholderIndex(text: string): number {
  const match = text.match(
    new RegExp(`^${MATH_PLACEHOLDER_PREFIX}(\\d+)${MATH_PLACEHOLDER_SUFFIX}$`)
  );
  return match ? parseInt(match[1], 10) : -1;
}

/**
 * Streaming helper: truncate at a safe boundary (end of line, end of word,
 * or after a complete markdown token) so react-native-markdown-display
 * doesn't receive unterminated structures.
 */
export function safeTruncateForStreaming(content: string): string {
  if (!content) return "";

  // Don't truncate in the middle of a code fence
  const lastFence = content.lastIndexOf("```");
  if (lastFence !== -1) {
    const afterFence = content.slice(lastFence + 3);
    // If there's an odd number of fences, we're inside an unclosed one
    const fenceCount = (content.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) {
      // Truncate back to before the last fence start
      return content.slice(0, lastFence);
    }
  }

  // Don't truncate inside inline backticks
  const backtickMatches = content.match(/`/g);
  if (backtickMatches && backtickMatches.length % 2 !== 0) {
    const lastTick = content.lastIndexOf("`");
    return content.slice(0, lastTick);
  }

  // Don't truncate inside a link [...](...)
  const lastBracket = content.lastIndexOf("[");
  if (lastBracket !== -1) {
    const after = content.slice(lastBracket);
    if (after.includes("](") && !after.includes(")")) {
      return content.slice(0, lastBracket);
    }
  }

  return content;
}

/**
 * For incremental streaming: if the content ends mid-token, return a
 * display-safe version that won't break the markdown parser.
 */
export function streamingSafeContent(content?: string): string {
  if (!content) return "";
  return safeTruncateForStreaming(content);
}
