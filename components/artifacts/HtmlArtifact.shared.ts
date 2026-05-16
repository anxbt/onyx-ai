export const DESIGN_TOKENS = `
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: transparent;
    color: #e6e0e9;
    font-family: 'IBM Plex Sans', -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    padding: 0;
    -webkit-text-size-adjust: 100%;
  }
  h1 { font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #e6e0e9; }
  h2 { font-size: 15px; font-weight: 500; margin-top: 24px; margin-bottom: 8px; color: #e6e0e9; }
  h3 { font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #948e9c; }
  p { margin-bottom: 10px; }
  code { font-family: 'JetBrains Mono', monospace; font-size: 12px; background: #1d2024; padding: 2px 5px; border-radius: 3px; color: #D4A574; }
  pre { background: #1d2024; padding: 10px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  td, th { padding: 6px 10px; text-align: left; border-bottom: 1px solid #272a2f; color: #e6e0e9; font-size: 13px; }
  th { color: #948e9c; font-weight: 600; font-size: 12px; }
  ul, ol { padding-left: 18px; margin-bottom: 8px; }
  li { margin-bottom: 3px; }
  blockquote { border-left: 2px solid #D4A574; padding-left: 12px; margin: 8px 0; color: #948e9c; }
  a { color: #D4A574; }
  .accent { color: #D4A574; }
  .flex-row { display: flex; flex-direction: row; gap: 8px; align-items: center; flex-wrap: wrap; }
  .card { background: transparent; border: none; border-radius: 0; padding: 0; margin-bottom: 8px; }
  .pill { display: inline-block; background: #1d2024; border: 1px solid #272a2f; padding: 4px 12px; border-radius: 4px; color: #e6e0e9; font-size: 13px; }
  .pill-active { background: #D4A574; border-color: #D4A574; color: #1A1510; }
  .bar-bg { background: #1d2024; border-radius: 4px; height: 12px; margin: 4px 0; }
  .bar-fill { background: #D4A574; border-radius: 4px; height: 12px; }
  .node { margin-left: 16px; padding: 4px 0; border-left: 1px solid #272a2f; padding-left: 12px; }
  .node-root { border-left: none; margin-left: 0; padding-left: 0; }
  .node-label { font-weight: 600; font-size: 13px; color: #e6e0e9; }
  .node-detail { font-size: 12px; color: #948e9c; margin-top: 2px; }
  .section-break { margin-top: 32px; }
</style>`;

export function wrapHtml(inner: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  ${DESIGN_TOKENS}
</head>
<body>${inner}</body>
</html>`;
}
