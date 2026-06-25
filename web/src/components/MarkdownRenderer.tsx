import { Children, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { PrismAsyncLight as SyntaxHighlighter } from "react-syntax-highlighter";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { extractResponseType, streamingSafeContent } from "@/lib/markdown";
import type { Source } from "@/types";

type MarkdownRendererProps = {
  content: string;
  isStreaming?: boolean;
  sources?: Source[];
};

const syntaxTheme = {
  'code[class*="language-"]': {
    color: "#e6e0e9",
    background: "transparent",
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    fontSize: "13px",
    lineHeight: "1.65",
    textShadow: "none",
  },
  'pre[class*="language-"]': {
    color: "#e6e0e9",
    background: "transparent",
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    fontSize: "13px",
    lineHeight: "1.65",
    margin: 0,
    padding: "14px",
    textShadow: "none",
  },
  comment: { color: "#948e9c" },
  prolog: { color: "#948e9c" },
  doctype: { color: "#948e9c" },
  cdata: { color: "#948e9c" },
  punctuation: { color: "#cbc4d2" },
  property: { color: "#D4A574" },
  tag: { color: "#D4A574" },
  boolean: { color: "#e7c365" },
  number: { color: "#e7c365" },
  constant: { color: "#e7c365" },
  symbol: { color: "#e7c365" },
  selector: { color: "#a8e6cf" },
  attrName: { color: "#a8e6cf" },
  string: { color: "#a8e6cf" },
  char: { color: "#a8e6cf" },
  builtin: { color: "#a8e6cf" },
  inserted: { color: "#a8e6cf" },
  operator: { color: "#cbc4d2" },
  entity: { color: "#D4A574" },
  url: { color: "#D4A574" },
  atrule: { color: "#D4A574" },
  attrValue: { color: "#a8e6cf" },
  keyword: { color: "#D4A574" },
  function: { color: "#D4A574" },
  className: { color: "#a8e6cf" },
  regex: { color: "#e7c365" },
  important: { color: "#ffb4ab" },
  variable: { color: "#e6e0e9" },
  deleted: { color: "#ffb4ab" },
};

function renderCitationChildren(children: ReactNode, sources?: Source[]) {
  if (!sources?.length) return children;

  return Children.map(children, (child) => {
    if (typeof child !== "string") return child;

    const nodes: ReactNode[] = [];
    const regex = /\[(\d+)\]/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(child))) {
      const sourceIndex = Number(match[1]) - 1;
      const source = sources[sourceIndex];
      if (!source) continue;

      if (match.index > lastIndex) {
        nodes.push(child.slice(lastIndex, match.index));
      }

      nodes.push(
        <a className="citation-pill" href={source.url} key={`${match[0]}-${match.index}`} rel="noopener noreferrer" target="_blank">
          {match[0]}
        </a>,
      );
      lastIndex = match.index + match[0].length;
    }

    if (!nodes.length) return child;
    if (lastIndex < child.length) {
      nodes.push(child.slice(lastIndex));
    }

    return nodes;
  });
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <figure className="md-code">
      <figcaption>
        <span>{language || "text"}</span>
        <button type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </figcaption>
      <SyntaxHighlighter
        codeTagProps={{ style: { fontFamily: '"JetBrains Mono", ui-monospace, monospace' } }}
        customStyle={{ background: "transparent", margin: 0, padding: 14 }}
        language={language || "text"}
        lineNumberStyle={{ color: "#716c78", minWidth: "2.75em", paddingRight: "1em" }}
        showLineNumbers
        style={syntaxTheme}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </figure>
  );
}

function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("mermaid")
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "strict",
          themeVariables: {
            background: "#141218",
            mainBkg: "#15171a",
            primaryColor: "#2A2118",
            primaryTextColor: "#e6e0e9",
            primaryBorderColor: "#D4A574",
            lineColor: "#D4A574",
          },
        });
        return mermaid.render(`mermaid-${Math.random().toString(36).slice(2)}`, code);
      })
      .then(({ svg: nextSvg }) => {
        if (!cancelled) {
          setSvg(nextSvg);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not render diagram. Check Mermaid syntax.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return <div className="artifact-error" role="status">{error}</div>;
  }

  return <div className="artifact-frame mermaid-frame" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function ChartArtifact({ code }: { code: string }) {
  try {
    const parsed = JSON.parse(code) as { title?: string; labels?: string[]; values?: number[] };
    const labels = (parsed.labels ?? []).slice(0, 8);
    const values = (parsed.values ?? []).slice(0, labels.length);
    const max = Math.max(...values, 1);
    return (
      <figure className="artifact-frame chart-frame">
        {parsed.title ? <figcaption>{parsed.title}</figcaption> : null}
        <div>
          {labels.map((label, index) => (
            <span key={label} style={{ "--bar-height": `${Math.max(8, (values[index] / max) * 100)}%` } as CSSProperties}>
              <i />
              <small>{label}</small>
            </span>
          ))}
        </div>
      </figure>
    );
  } catch {
    return <pre className="artifact-error">Invalid chart data</pre>;
  }
}

function RoadmapArtifact({ code }: { code: string }) {
  try {
    const parsed = JSON.parse(code) as { label: string; detail?: string; children?: Array<{ label: string; detail?: string }> };
    return (
      <article className="artifact-frame roadmap-frame">
        <strong>{parsed.label}</strong>
        {parsed.detail ? <p>{parsed.detail}</p> : null}
        <ul>
          {(parsed.children ?? []).map((child) => (
            <li key={child.label}>
              <span>{child.label}</span>
              {child.detail ? <small>{child.detail}</small> : null}
            </li>
          ))}
        </ul>
      </article>
    );
  } catch {
    return <pre className="artifact-error">Invalid roadmap data</pre>;
  }
}

function GeometryArtifact({ code }: { code: string }) {
  const points = code
    .split(/\n|;/)
    .map((item) => item.trim().match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/))
    .filter(Boolean)
    .map((match) => ({ x: Number(match![1]), y: Number(match![2]) }));
  const drawable = points.length >= 2 ? points : [{ x: 30, y: 120 }, { x: 140, y: 36 }, { x: 250, y: 120 }, { x: 30, y: 120 }];

  return (
    <svg className="artifact-frame geometry-frame" viewBox="0 0 280 150" role="img" aria-label="Geometry artifact">
      <polyline points={drawable.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#e5d5b0" strokeWidth="3" />
      {drawable.map((point, index) => (
        <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r="5" fill="#e5d5b0" />
      ))}
    </svg>
  );
}

function HtmlArtifact({ code }: { code: string }) {
  return <iframe className="artifact-frame html-frame" sandbox="allow-scripts" srcDoc={code} title="HTML artifact" />;
}

export function MarkdownRenderer({ content, isStreaming = false, sources }: MarkdownRendererProps) {
  const { type, cleanContent } = useMemo(() => extractResponseType(content), [content]);
  const displayContent = isStreaming ? streamingSafeContent(cleanContent) : cleanContent;

  return (
    <div className="markdown-body">
      {type ? <span className="response-type">{type}</span> : null}
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a({ href, children }) {
            return (
              <a href={href} rel="noopener noreferrer" target="_blank">
                {children}
              </a>
            );
          },
          p({ children }) {
            return <p>{renderCitationChildren(children, sources)}</p>;
          },
          li({ children }) {
            return <li>{renderCitationChildren(children, sources)}</li>;
          },
          code(props) {
            const { children, className } = props;
            const code = String(children).replace(/\n$/, "");
            const language = /language-(\w+)/.exec(className ?? "")?.[1];
            if (!language) {
              return <code>{children}</code>;
            }
            if (language === "mermaid" || language === "flowchart") return <MermaidDiagram code={code} />;
            if (language === "chart") return <ChartArtifact code={code} />;
            if (language === "roadmap") return <RoadmapArtifact code={code} />;
            if (language === "html") return <HtmlArtifact code={code} />;
            if (language === "geometry") return <GeometryArtifact code={code} />;
            return <CodeBlock code={code} language={language} />;
          },
        }}
      >
        {displayContent}
      </ReactMarkdown>
      {sources?.length ? (
        <div className="source-list">
          {sources.map((source, index) => (
            <a href={source.url} key={source.url} rel="noopener noreferrer" target="_blank">
              [{index + 1}] {source.title}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
