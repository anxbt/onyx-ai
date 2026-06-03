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

// Placeholder format is bare `MATH_<n>` (no surrounding underscores). The
// previous format `__MATH_N__` collided with CommonMark's bold syntax
// (`__foo__` → `<strong>foo</strong>`), so the markdown parser destroyed
// placeholders before the renderer could substitute math content back in —
// the user saw literal "MATH_8" rendered as bold text. Bare `MATH_N` survives
// markdown parsing because word-internal underscores don't trigger emphasis
// per CommonMark.
const MATH_PLACEHOLDER_PREFIX = "MATH_";
const MATH_PLACEHOLDER_SUFFIX = "";
// Single source of truth for the regex used by the renderer's split.
export const MATH_PLACEHOLDER_SPLIT_REGEX = /(MATH_\d+)/g;

/**
 * Replace math blocks with non-rendering placeholders before markdown parsing,
 * then restore them as plain styled text after.
 *
 * Recognized delimiters (applied in order so AMS delimiters don't survive
 * into the dollar-sign pass):
 *   1. AMS display: \[ ... \]
 *   2. AMS inline:  \( ... \)
 *   3. Block: $$...$$
 *   4. Inline: $...$
 */
export function extractMath(content: string): {
  cleaned: string;
  placeholders: MathPlaceholder[];
} {
  const placeholders: MathPlaceholder[] = [];

  const makePlaceholder = (tex: string, display: boolean) => {
    const id = `${MATH_PLACEHOLDER_PREFIX}${placeholders.length}${MATH_PLACEHOLDER_SUFFIX}`;
    placeholders.push({ id, raw: tex.trim(), display });
    return id;
  };

  // AMS display math first: \[ ... \]
  let cleaned = content.replace(/\\\[([\s\S]*?)\\\]/g, (_match, tex) =>
    makePlaceholder(tex, true),
  );

  // AMS inline math: \( ... \)
  cleaned = cleaned.replace(/\\\(([\s\S]*?)\\\)/g, (_match, tex) =>
    makePlaceholder(tex, false),
  );

  // Block math: $$...$$
  cleaned = cleaned.replace(/\$\$([\s\S]*?)\$\$/g, (_match, tex) =>
    makePlaceholder(tex, true),
  );

  // Inline math: $...$ (but not $$)
  cleaned = cleaned.replace(
    /(?<!\$)\$(?!\$)([^\n$]+?)(?<!\$)\$(?!\$)/g,
    (_match, tex) => makePlaceholder(tex, false),
  );

  return { cleaned, placeholders };
}

// True if the content likely contains LaTeX math worth rendering in the
// KaTeX WebView path (MathHtmlView). Catches delimited math ($…$, $$…$$,
// \(…\), \[…\]) AND common bare commands/environments that models emit
// (\frac, \dfrac, \boxed, \begin{cases|aligned|...}, \sqrt, \sum, \int).
export function containsMath(content: string): boolean {
  if (!content) return false;
  return (
    /\$\$[\s\S]+?\$\$/.test(content) || // $$…$$
    /(?<!\$)\$(?!\$)[^\n$]+?\$/.test(content) || // $…$
    /\\\([\s\S]+?\\\)/.test(content) || // \(…\)
    /\\\[[\s\S]+?\\\]/.test(content) || // \[…\]
    /\\(?:d?frac|boxed|sqrt|sum|int|begin\{[a-z]+\}|cdot|times|alpha|beta|theta|pi|Rightarrow|leq|geq|neq|partial)/.test(
      content,
    )
  );
}

export function isMathPlaceholder(text: string): boolean {
  return /^MATH_\d+$/.test(text);
}

export function parsePlaceholderIndex(text: string): number {
  const match = text.match(/^MATH_(\d+)$/);
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

/**
 * Strip the leading <!--type:foo--> marker that the model is instructed to emit.
 * Returns the response-type label and clean content (without the comment).
 */
export type ResponseType = "answer" | "analysis" | "tutorial" | "creative";

export function extractResponseType(content: string): {
  type: ResponseType | null;
  cleanContent: string;
} {
  if (!content) return { type: null, cleanContent: "" };

  // Fully streamed marker — extract type and strip
  const m = content.match(/^\s*<!--\s*type\s*:\s*(answer|analysis|tutorial|creative)\s*-->/i);
  if (m) {
    const type = m[1].toLowerCase() as ResponseType;
    const cleanContent = content.slice(m[0].length).replace(/^\s+/, "");
    return { type, cleanContent };
  }

  // Mid-stream: marker is being written but not yet closed.
  // Hide the partial comment until "-->" arrives so streaming text appears smoothly.
  if (/^\s*<!--\s*t?y?p?e?\s*:?\s*(answer|analysis|tutorial|creative)?\s*-?-?>?$/i.test(content)) {
    return { type: null, cleanContent: "" };
  }

  return { type: null, cleanContent: content };
}
