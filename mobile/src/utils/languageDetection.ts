/**
 * languageDetection.ts — deterministic script-based language detection for
 * free-typed chat queries.
 *
 * Why detection instead of trusting the saved profile language: a fisherman
 * might have their profile set to English but occasionally type a question
 * in Malayalam (or vice versa) — the response language should match what
 * they actually typed THIS message, not a fixed default from Profile.
 *
 * Deterministic Unicode-range script matching, not an LLM call: no extra
 * network round trip, no latency added to sending a message, and no risk of
 * a model mis-guessing — each of these Indic scripts has its own dedicated
 * Unicode block, so this is unambiguous. Same "rules over AI where rules are
 * enough" approach as risk_agent.py.
 *
 * Codes match mobile/src/constants/portsAndLanguages.ts exactly (and are
 * mirrored in backend/src/agents/response.py's LANGUAGE_NAMES).
 */

const SCRIPT_RANGES: Array<{ code: string; pattern: RegExp }> = [
  { code: 'ml', pattern: /[ഀ-ൿ]/ }, // Malayalam
  { code: 'ta', pattern: /[஀-௿]/ }, // Tamil
  { code: 'te', pattern: /[ఀ-౿]/ }, // Telugu
  { code: 'kn', pattern: /[ಀ-೿]/ }, // Kannada
  { code: 'bn', pattern: /[ঀ-৿]/ }, // Bengali
  { code: 'gu', pattern: /[઀-૿]/ }, // Gujarati
  { code: 'or', pattern: /[଀-୿]/ }, // Odia
  // Devanagari covers both Hindi and Marathi — same script, no reliable way
  // to tell them apart from text alone. Default to Hindi (more speakers,
  // and it's the profile default most Devanagari-script users will have).
  { code: 'hi', pattern: /[ऀ-ॿ]/ }, // Hindi / Marathi (Devanagari)
];

/**
 * Returns the language code for the first Indic script found in `text`, or
 * 'en' if none matches (Latin script, numbers, punctuation, or empty input).
 * Mixed-script input (e.g. a Malayalam word plus an English place name)
 * resolves to whichever Indic script appears — that's the language the
 * response should be in even if a proper noun stayed in English.
 */
export function detectQueryLanguage(text: string): string {
  if (!text) return 'en';
  for (const { code, pattern } of SCRIPT_RANGES) {
    if (pattern.test(text)) return code;
  }
  return 'en';
}

// Sarvam STT (backend's /voice/stt) returns the BCP-47 code it actually
// detected from the AUDIO — unlike script-based text detection above, this
// can tell Marathi and Hindi apart (they share Devanagari script, so
// detectQueryLanguage can't). Voice queries should prefer this over
// re-guessing from the transcript text. Mirrors backend's LANGUAGE_BCP47.
const BCP47_TO_APP_LANGUAGE: Record<string, string> = {
  'en-IN': 'en',
  'hi-IN': 'hi',
  'ml-IN': 'ml',
  'ta-IN': 'ta',
  'te-IN': 'te',
  'bn-IN': 'bn',
  'gu-IN': 'gu',
  'mr-IN': 'mr',
  'od-IN': 'or',
  'kn-IN': 'kn',
};

export function bcp47ToAppLanguage(bcp47: string | null | undefined): string | null {
  if (!bcp47) return null;
  return BCP47_TO_APP_LANGUAGE[bcp47] ?? null;
}
