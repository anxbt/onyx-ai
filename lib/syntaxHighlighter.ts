/**
 * Lightweight regex-based syntax highlighter for React Native.
 * Tokenizes common patterns across popular languages.
 */

export type TokenType =
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "function"
  | "operator"
  | "type"
  | "punctuation"
  | "plain";

export interface Token {
  type: TokenType;
  value: string;
}

const KEYWORDS = new Set([
  // JS / TS
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "import", "export", "default", "from", "class", "extends", "async", "await",
  "try", "catch", "finally", "throw", "new", "this", "typeof", "instanceof",
  "in", "of", "switch", "case", "break", "continue", "do", "void", "delete",
  "yield", "debugger", "with", "super", "static", "get", "set", "constructor",
  "interface", "type", "enum", "namespace", "module", "declare", "abstract",
  "implements", "readonly", "private", "protected", "public", "optional",
  // Python
  "def", "print", "lambda", "None", "True", "False", "pass", "assert", "raise",
  "global", "nonlocal", "del", "elif", "except", "finally", "from", "import",
  "as", "with", "yield", "self", "cls",
  // Rust / Go / C-family
  "fn", "mut", "pub", "crate", "use", "mod", "impl", "trait", "struct", "enum",
  "match", "loop", "ref", "box", "where", "move", "unsafe", "extern", "crate",
  "let", "const", "static", "type", "goto", "sizeof", "union", "volatile",
  "inline", "restrict", "auto", "register", "signed", "unsigned", "short", "long",
  // Java / C#
  "package", "final", "abstract", "synchronized", "native", "strictfp", "transient",
  "volatile", "implements", "extends", "instanceof", "throws",
  // Swift / Kotlin / Dart
  "func", "init", "deinit", "protocol", "extension", "associatedtype", "convenience",
  "dynamic", "final", "lazy", "mutating", "nonmutating", "optional", "override",
  "required", "static", "unowned", "weak", "willSet", "didSet", "inout", "guard",
  "defer", "repeat", "fallthrough", "where", "some", "any", "await", "async",
  "suspend", "val", "var", "fun", "data", "sealed", "open", "internal", "external",
  "expect", "actual", "companion", "object", "inline", "crossinline", "noinline",
  "reified", "tailrec", "operator", "infix", "inline", "lateinit",
  "dynamic", "external", "annotation", "const", "vararg",
]);

const TYPES = new Set([
  "string", "number", "boolean", "any", "void", "null", "undefined", "never",
  "unknown", "symbol", "bigint", "object", "Array", "Object", "Promise", "Map",
  "Set", "Date", "RegExp", "Error", "Function", "String", "Number", "Boolean",
  "int", "float", "double", "char", "byte", "short", "long", "bool", "str",
  "Vec", "Option", "Result", "String", "i8", "i16", "i32", "i64", "i128", "isize",
  "u8", "u16", "u32", "u64", "u128", "usize", "f32", "f64", "char", "bool",
]);

// Language-specific comment patterns
function getCommentPatterns(_language?: string): RegExp[] {
  return [
    /\/\/[^{\n]*$/m,        // // line comment
    /\/\*[\s\S]*?\*\//,     // /* block comment */
    /#[^{\n]*$/m,             // # line comment (python/ruby/shell)
  ];
}

/**
 * Naïve but fast tokenizer. Splits the code into tokens based on
 * regex matches for strings, comments, numbers, identifiers, etc.
 */
export function tokenize(code: string, _language?: string): Token[] {
  const tokens: Token[] = [];
  let remaining = code;

  const patterns: { regex: RegExp; type: TokenType | ((m: string) => TokenType) }[] = [
    // Triple-quoted strings (Python, etc)
    { regex: /"""[\s\S]*?"""/, type: "string" },
    { regex: /'''[\s\S]*?'''/, type: "string" },
    // Regular strings
    { regex: /"(?:\\.|[^"\\])*"/, type: "string" },
    { regex: /'(?:\\.|[^'\\])*'/, type: "string" },
    // Backtick strings / template literals (up to next backtick)
    { regex: /`(?:\\.|[^`\\])*`/, type: "string" },
    // Block comments /* */
    { regex: /\/\*[\s\S]*?\*\//, type: "comment" },
    // Line comments // or #
    { regex: /\/\/.*/, type: "comment" },
    { regex: /#.*/, type: "comment" },
    // Hex / binary / octal numbers
    { regex: /0[xX][0-9a-fA-F]+(?:n)?\b/, type: "number" },
    { regex: /0[oO]?[0-7]+(?:n)?\b/, type: "number" },
    { regex: /0[bB][01]+(?:n)?\b/, type: "number" },
    // Decimal numbers (including scientific notation)
    { regex: /\d+\.?\d*(?:[eE][+-]?\d+)?(?:n)?\b/, type: "number" },
    // Operators (multi-char first)
    { regex: /=>|::|->|\+\+|--|&&|\|\||<<=?|>>>=?|>>=?|[-+*/%^&|!=<>]=?|~/,
      type: "operator" },
    // Punctuation
    { regex: /[{}[\]();,.:;]/, type: "punctuation" },
    // Identifiers / keywords
    {
      regex: /[A-Za-z_][A-Za-z0-9_]*/,
      type: (m: string) => {
        if (KEYWORDS.has(m)) return "keyword";
        if (TYPES.has(m)) return "type";
        // Heuristic: Capitalized word after `new` or before `(`
        return "plain";
      },
    },
    // Whitespace (preserve for layout)
    { regex: /\s+/, type: "plain" },
    // Any other single character
    { regex: /./, type: "plain" },
  ];

  while (remaining.length > 0) {
    let matched = false;
    for (const { regex, type } of patterns) {
      regex.lastIndex = 0;
      const m = regex.exec(remaining);
      if (m && m.index === 0) {
        const rawType = typeof type === "function" ? type(m[0]) : type;
        tokens.push({ type: rawType, value: m[0] });
        remaining = remaining.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Safety fallback — consume one char
      tokens.push({ type: "plain", value: remaining[0] });
      remaining = remaining.slice(1);
    }
  }

  return tokens;
}

/**
 * Very fast line-by-line tokenizer for large code blocks.
 * Falls back to `tokenize` for each line.
 */
export function tokenizeFast(code: string, language?: string): Token[][] {
  const lines = code.split("\n");
  return lines.map((line) => tokenize(line, language));
}
