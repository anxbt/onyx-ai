const UNCERTAINTY_PATTERNS: RegExp[] = [
  /\bi\s+(don'?t|do not)\s+have\s+(access\s+to|the\s+ability\s+to|real[- ]?time|live|current)/i,
  /\bi\s+can(?:no|')t\s+(verify|access|browse|check)/i,
  /\bi\s+am\s+not\s+sure\s+(about|of)\s+(the\s+)?(current|today'?s|latest|live)/i,
  /\bmy\s+(training\s+data|knowledge)\s+(only\s+)?(extends|goes|is\s+limited)/i,
  /\bas\s+of\s+my\s+(last\s+)?(training|knowledge)\s+(update|cutoff)/i,
  /\bi\s+don'?t\s+have\s+(the\s+)?(latest|current|live|real[- ]?time)\s+(data|information|prices|quotes|news)/i,
  /\bi\s+cannot\s+provide\s+(real[- ]?time|current|live|today'?s)/i,
];

export function detectUncertainty(text: string): { matched: boolean; phrase?: string } {
  if (!text) return { matched: false };
  for (const pattern of UNCERTAINTY_PATTERNS) {
    const m = text.match(pattern);
    if (m) return { matched: true, phrase: m[0] };
  }
  return { matched: false };
}
