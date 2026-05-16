# design
- For generated artifacts (PDFs, slides, exports): use solid colors only (no gradients), limit to 3 colors max (bg, text, accent), use asymmetric spacing between sections, no decorative shapes or geometric ornaments, left-aligned only (no centered heroes or 3-column grids), and mix type weights across headings. Confidence: 0.85
- Prefer manual trigger buttons for Firecrawl/document ingestion over automatic crawling — let users explicitly choose when to deep-extract. Confidence: 0.65
- When adapting external UI designs: first audit feature gaps (what they have that we don't, what we have that they don't), remove UI elements for features the backend doesn't support, then implement — never blind copy-paste. Confidence: 0.70
- Use drawer-based navigation (side panel) instead of bottom tab bars for main app navigation — place history, settings, and search within the drawer. Confidence: 0.70
- For artifact containers: make them invisible (transparent background, no borders) so content feels native rather than boxed in. Confidence: 0.85
- Prefer React Native components over HTML rendering for interactive artifacts (flowcharts, diagrams) — better UX and more control. Confidence: 0.75
- For flowcharts and graphs: make them scrollable in all directions (not constrained to rectangular boxes). Confidence: 0.70
