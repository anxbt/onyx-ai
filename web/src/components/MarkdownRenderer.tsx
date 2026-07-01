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

type VerificationMarker = {
  type?: string;
  equation?: string;
  var?: string;
  solutions?: string[];
};

const mathNames = new Set([
  "abs",
  "acos",
  "asin",
  "atan",
  "ceil",
  "cos",
  "E",
  "exp",
  "floor",
  "ln",
  "log",
  "max",
  "min",
  "PI",
  "pow",
  "round",
  "sin",
  "sqrt",
  "tan",
]);

function extractVerificationMarkers(content: string): { cleanContent: string; markers: VerificationMarker[] } {
  const markers: VerificationMarker[] = [];
  const cleanContent = content.replace(/<!--\s*verify\s*:\s*({[\s\S]*?})\s*-->/g, (_match, json) => {
    try {
      const parsed = JSON.parse(json) as VerificationMarker;
      markers.push(parsed);
    } catch {
      // Hide malformed machine metadata rather than showing raw JSON to users.
    }
    return "";
  });

  return { cleanContent, markers };
}

function identifierSet(input: string): Set<string> {
  return new Set(input.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
}

function findMatchingLeftParen(input: string, index: number) {
  let depth = 0;
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    if (input[cursor] === ")") depth += 1;
    if (input[cursor] === "(") {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}

function findMatchingRightParen(input: string, index: number) {
  let depth = 0;
  for (let cursor = index; cursor < input.length; cursor += 1) {
    if (input[cursor] === "(") depth += 1;
    if (input[cursor] === ")") {
      depth -= 1;
      if (depth === 0) return cursor;
    }
  }
  return -1;
}

function operandStart(input: string, caretIndex: number) {
  let end = caretIndex - 1;
  while (input[end] === " ") end -= 1;
  if (input[end] === ")") return findMatchingLeftParen(input, end);
  let start = end;
  while (start >= 0 && /[A-Za-z0-9_.]/.test(input[start])) start -= 1;
  return start + 1;
}

function operandEnd(input: string, caretIndex: number) {
  let start = caretIndex + 1;
  while (input[start] === " ") start += 1;
  if (input[start] === "(") return findMatchingRightParen(input, start) + 1;
  let end = start;
  if (input[end] === "+" || input[end] === "-") end += 1;
  while (end < input.length && /[A-Za-z0-9_.]/.test(input[end])) end += 1;
  return end;
}

function normalizeMathExpression(expression: string) {
  let normalized = expression.replace(/\bln\s*\(/g, "log(");
  while (normalized.includes("^")) {
    const caretIndex = normalized.indexOf("^");
    const start = operandStart(normalized, caretIndex);
    const end = operandEnd(normalized, caretIndex);
    if (start < 0 || end <= caretIndex + 1) {
      throw new Error("Invalid exponent expression");
    }
    const left = normalized.slice(start, caretIndex).trim();
    const right = normalized.slice(caretIndex + 1, end).trim();
    normalized = `${normalized.slice(0, start)}pow(${left},${right})${normalized.slice(end)}`;
  }
  return normalized;
}

function compileMathExpression(expression: string, variables: string[]) {
  const allowed = new Set([...variables, ...mathNames]);
  for (const identifier of identifierSet(expression)) {
    if (!allowed.has(identifier)) {
      throw new Error(`Unsupported identifier: ${identifier}`);
    }
  }

  if (!/^[\d\s+\-*/%^().,A-Za-z_]+$/.test(expression)) {
    throw new Error("Unsupported characters in expression");
  }

  const normalized = normalizeMathExpression(expression);
  const args = variables.join(",");
  const body = `"use strict"; const {abs,acos,asin,atan,ceil,cos,E,exp,floor,log,max,min,PI,pow,round,sin,sqrt,tan}=Math; return (${normalized});`;
  return new Function(args, body) as (...values: number[]) => number;
}

function evaluateExpression(expression: string, env: Record<string, number>) {
  const variables = Object.keys(env);
  const fn = compileMathExpression(expression, variables);
  return fn(...variables.map((name) => env[name]));
}

function verifyEquation(marker: VerificationMarker): boolean | null {
  if (marker.type !== "equation" || !marker.equation || !marker.var || !marker.solutions?.length) {
    return null;
  }

  const [lhs, rhs] = marker.equation.split("=").map((part) => part.trim());
  if (!lhs || !rhs) return false;

  const names = new Set([
    ...identifierSet(lhs),
    ...identifierSet(rhs),
    ...identifierSet(marker.solutions.join(" ")),
  ]);
  for (const name of mathNames) names.delete(name);
  names.delete(marker.var);
  const parameters = [...names];

  try {
    return marker.solutions.some((solution) => {
      for (let sample = 0; sample < 5; sample += 1) {
        const env: Record<string, number> = {};
        parameters.forEach((name, index) => {
          env[name] = name.toLowerCase().includes("alpha") ? 0.45 + sample * 0.17 : 2 + sample + index;
        });
        const solvedValue = evaluateExpression(solution, env);
        if (!Number.isFinite(solvedValue)) return false;
        env[marker.var as string] = solvedValue;
        const left = evaluateExpression(lhs, env);
        const right = evaluateExpression(rhs, env);
        if (!Number.isFinite(left) || !Number.isFinite(right) || Math.abs(left - right) > 1e-6) {
          return false;
        }
      }
      return true;
    });
  } catch {
    return false;
  }
}

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

function flattenArrayLikeText(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return value;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return value;
    const flattened = parsed
      .map((item) => {
        if (item == null) return "";
        if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") return String(item);
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join(", ");
    return flattened || value;
  } catch {
    return value;
  }
}

function renderTableCellChildren(children: ReactNode, sources?: Source[]) {
  const normalized = Children.map(children, (child) => {
    if (typeof child !== "string") return child;
    return flattenArrayLikeText(child);
  });
  return renderCitationChildren(normalized, sources);
}

function sourceLabel(source: Source) {
  try {
    return new URL(source.url).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

function stripTrailingSourceSummary(content: string, sources?: Source[]) {
  if (!sources?.length) return content;
  return content
    .replace(/\n{0,2}(?:\*\*)?Sources(?:\*\*)?\s*:\s+[^\n]*(?:\[(?:\d+)\][^\n]*)+\s*$/i, "")
    .trimEnd();
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

function htmlTextContent(code: string) {
  return code
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHtmlArtifact(code: string) {
  const trimmed = code.trim();
  if (/\bdata-type=["']artifact["']/i.test(trimmed)) return true;
  if (/<(?:!doctype|html|body|canvas|svg)\b/i.test(trimmed)) return true;
  return /<\w+[^>]*\bstyle=["'][^"']+/i.test(trimmed) && htmlTextContent(trimmed).length > 0;
}

function PlotArtifact({ code }: { code: string }) {
  try {
    const parsed = JSON.parse(code) as {
      title?: string;
      functions?: string[];
      xRange?: [number, number];
      yRange?: [number, number];
    };
    const functions = (parsed.functions ?? []).slice(0, 6);
    if (!functions.length) throw new Error("No functions");

    const xRange = parsed.xRange ?? [-10, 10];
    const yRange = parsed.yRange ?? [-10, 10];
    const width = 640;
    const height = 360;
    const pad = 36;
    const plotWidth = width - pad * 2;
    const plotHeight = height - pad * 2;
    const colors = ["#e5d5b0", "#9adbcf", "#d7b3ff", "#ffb4ab", "#b9d884", "#a9c7ff"];
    const scaleX = (x: number) => pad + ((x - xRange[0]) / (xRange[1] - xRange[0])) * plotWidth;
    const scaleY = (y: number) => pad + (1 - (y - yRange[0]) / (yRange[1] - yRange[0])) * plotHeight;

    const paths = functions.map((expression) => {
      const fn = compileMathExpression(expression, ["x"]);
      const segments: string[] = [];
      let open = false;
      for (let i = 0; i <= 260; i += 1) {
        const x = xRange[0] + ((xRange[1] - xRange[0]) * i) / 260;
        const y = fn(x);
        if (!Number.isFinite(y) || y < yRange[0] - 1 || y > yRange[1] + 1) {
          open = false;
          continue;
        }
        const command = open ? "L" : "M";
        segments.push(`${command}${scaleX(x).toFixed(2)} ${scaleY(y).toFixed(2)}`);
        open = true;
      }
      return segments.join(" ");
    });

    const xAxis = yRange[0] <= 0 && yRange[1] >= 0 ? scaleY(0) : scaleY(yRange[0]);
    const yAxis = xRange[0] <= 0 && xRange[1] >= 0 ? scaleX(0) : scaleX(xRange[0]);

    return (
      <figure className="artifact-frame plot-frame">
        <figcaption>{parsed.title ?? "Function plot"}</figcaption>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={parsed.title ?? "Function plot"}>
          <rect x={pad} y={pad} width={plotWidth} height={plotHeight} rx="10" />
          {[0, 1, 2, 3, 4].map((tick) => {
            const x = pad + (plotWidth * tick) / 4;
            const y = pad + (plotHeight * tick) / 4;
            return <g key={tick}><line x1={x} x2={x} y1={pad} y2={height - pad} /><line x1={pad} x2={width - pad} y1={y} y2={y} /></g>;
          })}
          <line className="plot-axis" x1={pad} x2={width - pad} y1={xAxis} y2={xAxis} />
          <line className="plot-axis" x1={yAxis} x2={yAxis} y1={pad} y2={height - pad} />
          {paths.map((path, index) => (
            <path d={path} key={functions[index]} stroke={colors[index % colors.length]} />
          ))}
        </svg>
        <ol>
          {functions.map((expression, index) => (
            <li key={expression}>
              <span style={{ background: colors[index % colors.length] }} />
              <code>{expression}</code>
            </li>
          ))}
        </ol>
      </figure>
    );
  } catch {
    return <pre className="artifact-error">Invalid plot data</pre>;
  }
}

function buildMolecule3DHtml(molecule: { smiles?: string; name?: string; cid?: string | number }) {
  const payload = JSON.stringify({
    cid: molecule.cid ? String(molecule.cid).trim() : "",
    name: molecule.name?.trim() ?? "",
    smiles: molecule.smiles?.trim() ?? "",
  });

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #f7f5ef; color: #191817; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    #viewer { position: absolute; inset: 0; }
    .hud { position: absolute; left: 12px; right: 12px; bottom: 10px; display: flex; justify-content: space-between; gap: 8px; align-items: end; pointer-events: none; }
    .label, .status { max-width: min(70%, 460px); border: 1px solid rgba(25, 24, 23, 0.1); border-radius: 999px; background: rgba(255, 255, 255, 0.82); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08); padding: 7px 10px; font-size: 12px; font-weight: 700; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .status { color: #615b51; font-weight: 650; }
    .error { position: absolute; inset: 0; display: grid; place-items: center; padding: 18px; text-align: center; background: #141218; color: #e6e0e9; font-size: 13px; line-height: 1.45; }
    .error strong { display: block; margin-bottom: 6px; color: #ffb4ab; font-size: 14px; }
    .loader { position: absolute; inset: 0; display: grid; place-items: center; color: #615b51; font-size: 13px; font-weight: 700; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/3dmol@2.5.5/build/3Dmol-min.js"></script>
</head>
<body>
  <div id="viewer"></div>
  <div class="loader" id="loader">Loading 3D structure...</div>
  <div class="hud">
    <div class="label" id="label"></div>
    <div class="status">Drag to rotate · scroll to zoom</div>
  </div>
  <script>
    const molecule = ${payload};
    const label = document.getElementById("label");
    const loader = document.getElementById("loader");
    const viewerEl = document.getElementById("viewer");
    label.textContent = molecule.name || molecule.smiles || (molecule.cid ? "CID " + molecule.cid : "Molecule");

    function fail(message) {
      document.body.innerHTML = '<div class="error"><div><strong>Could not load 3D molecule</strong>' + message + '</div></div>';
    }

    function pubChemSdfUrl() {
      if (molecule.cid) {
        return "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/" + encodeURIComponent(molecule.cid) + "/SDF?record_type=3d";
      }
      if (molecule.name) {
        return "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/" + encodeURIComponent(molecule.name) + "/SDF?record_type=3d";
      }
      if (molecule.smiles) {
        return "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/" + encodeURIComponent(molecule.smiles) + "/SDF?record_type=3d";
      }
      return "";
    }

    async function renderMolecule() {
      if (!window.$3Dmol) {
        fail("3Dmol.js was blocked or failed to load.");
        return;
      }

      const url = pubChemSdfUrl();
      if (!url) {
        fail("No PubChem CID, name, or SMILES string was provided.");
        return;
      }

      try {
        const response = await fetch(url, { mode: "cors" });
        if (!response.ok) throw new Error("PubChem returned " + response.status);
        const sdf = await response.text();
        if (!sdf.trim()) throw new Error("PubChem returned an empty structure.");

        const viewer = $3Dmol.createViewer(viewerEl, { backgroundColor: "#f7f5ef" });
        viewer.addModel(sdf, "sdf");
        viewer.setStyle({}, { stick: { radius: 0.16, colorscheme: "Jmol" }, sphere: { scale: 0.24, colorscheme: "Jmol" } });
        viewer.zoomTo();
        viewer.render();
        loader.remove();
      } catch (error) {
        fail(error && error.message ? error.message : "The molecule could not be rendered.");
      }
    }

    if (document.readyState === "complete") renderMolecule();
    else window.addEventListener("load", renderMolecule);
  </script>
</body>
</html>`;
}

function MoleculeArtifact({ code }: { code: string }) {
  try {
    const parsed = JSON.parse(code) as { smiles?: string; name?: string; cid?: string | number };
    const smiles = parsed.smiles?.trim();
    const name = parsed.name?.trim();
    const cid = parsed.cid ? String(parsed.cid).trim() : "";
    if (!smiles && !name && !cid) throw new Error("No molecule identifier");

    return (
      <figure className="artifact-frame molecule-frame">
        <figcaption>
          <strong>{parsed.name ?? "Molecule"}</strong>
          {smiles ? <code>{smiles}</code> : cid ? <code>CID {cid}</code> : null}
        </figcaption>
        <iframe
          className="molecule-viewer"
          sandbox="allow-scripts"
          srcDoc={buildMolecule3DHtml(parsed)}
          title={`${parsed.name ?? smiles ?? cid} 3D molecule viewer`}
        />
      </figure>
    );
  } catch {
    return <pre className="artifact-error">Invalid molecule data</pre>;
  }
}

function VerificationResults({ markers }: { markers: VerificationMarker[] }) {
  if (!markers.length) return null;

  return (
    <div className="verification-list">
      {markers.map((marker, index) => {
        const result = verifyEquation(marker);
        return (
          <span className={result ? "verification-chip is-valid" : "verification-chip is-invalid"} key={`${marker.equation}-${index}`}>
            <b>{result ? "OK" : "!"}</b>
            {result ? "Verified equation" : "Could not verify equation"}
            {marker.var ? <code>{marker.var}</code> : null}
          </span>
        );
      })}
    </div>
  );
}

export function MarkdownRenderer({ content, isStreaming = false, sources }: MarkdownRendererProps) {
  const { type, cleanContent } = useMemo(() => extractResponseType(content), [content]);
  const bodyContent = useMemo(() => stripTrailingSourceSummary(cleanContent, sources), [cleanContent, sources]);
  const { cleanContent: verifiedContent, markers } = useMemo(() => extractVerificationMarkers(bodyContent), [bodyContent]);
  const displayContent = isStreaming ? streamingSafeContent(verifiedContent) : verifiedContent;

  return (
    <div className="markdown-body">
      {type ? <span className="response-type">{type}</span> : null}
      <VerificationResults markers={markers} />
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
          table({ children }) {
            return (
              <div className="md-table-scroll">
                <table>{children}</table>
              </div>
            );
          },
          th({ children }) {
            return <th>{renderTableCellChildren(children, sources)}</th>;
          },
          td({ children }) {
            return <td>{renderTableCellChildren(children, sources)}</td>;
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
            if (language === "html" && isHtmlArtifact(code)) return <HtmlArtifact code={code} />;
            if (language === "geometry") return <GeometryArtifact code={code} />;
            if (language === "plot") return <PlotArtifact code={code} />;
            if (language === "molecule") return <MoleculeArtifact code={code} />;
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
              {source.faviconUrl ? <img alt="" src={source.faviconUrl} loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
              <span>[{index + 1}] {sourceLabel(source)} · {source.title}</span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
