import type { EngineResult, TokenIdentity } from "../types.js";
import { evaluateRules, scoreFromBase, type RuleDef } from "./rule-kit.js";

/**
 * V1 "coinability" heuristics: pure lexical/structural analysis of the
 * token's name and symbol. No external calls, no LLM - deterministic and
 * fully auditable, by design (see product spec: "premiere matrice de
 * coinability", enrichable later with a semantic/LLM layer).
 */
const MEME_KEYWORDS = [
  "dog", "doge", "shib", "inu", "cat", "pepe", "frog", "wojak", "chad", "based",
  "moon", "rocket", "elon", "musk", "trump", "bonk", "wif", "hat", "duck",
  "pig", "bear", "bull", "ape", "monkey", "banana", "toad", "rat", "mouse",
  "king", "baby", "mini", "meme", "coin", "ai", "gpt", "based", "sigma",
  "rizz", "skibidi", "gigachad", "cope", "seethe", "wagmi", "ngmi", "fren",
  "turbo", "chungus", "floki", "santa", "grinch", "santa", "snake", "lizard",
];

const GENERIC_LOW_EFFORT_NAMES = ["token", "coin", "test", "new token", "unnamed", "sample"];

interface ViralityFeatures {
  name: string;
  symbol: string;
  nameLength: number;
  symbolLength: number;
  wordCount: number;
  keywordMatches: number;
  matchedKeywords: string;
  hasDigits: boolean;
  hasEmoji: boolean;
  isAllCapsSymbol: boolean;
  isGenericName: boolean;
  hasIdentity: boolean;
}

function extractFeatures(identity: TokenIdentity): ViralityFeatures {
  const name = (identity.name ?? "").trim();
  const symbol = (identity.symbol ?? "").trim();
  const lowerName = name.toLowerCase();
  const lowerSymbol = symbol.toLowerCase();
  const combined = `${lowerName} ${lowerSymbol}`;

  const matched = MEME_KEYWORDS.filter((kw) => combined.includes(kw));
  const wordCount = name.length > 0 ? name.split(/\s+/).filter(Boolean).length : 0;

  return {
    name,
    symbol,
    nameLength: name.length,
    symbolLength: symbol.length,
    wordCount,
    keywordMatches: matched.length,
    matchedKeywords: matched.join(", "),
    hasDigits: /\d/.test(name) || /\d/.test(symbol),
    hasEmoji: /\p{Extended_Pictographic}/u.test(name),
    isAllCapsSymbol: symbol.length > 0 && symbol === symbol.toUpperCase() && /[A-Z]/.test(symbol),
    isGenericName: GENERIC_LOW_EFFORT_NAMES.some((g) => lowerName === g || lowerName.startsWith(`${g} `)),
    hasIdentity: name.length > 0 || symbol.length > 0,
  };
}

const RULES: RuleDef<ViralityFeatures>[] = [
  {
    id: "VIR_NO_IDENTITY",
    label: "No name/symbol metadata available",
    description: () => "Token metadata did not resolve a name or symbol, preventing any narrative assessment.",
    severity: "warn",
    impact: -20,
    when: (f) => !f.hasIdentity,
    evidence: () => ({}),
  },
  {
    id: "VIR_TICKER_MEMORABLE_LENGTH",
    label: "Memorable, short ticker",
    description: (f) => `Ticker "${f.symbol}" is ${f.symbolLength} characters, an easy length to remember and type.`,
    severity: "positive",
    impact: 10,
    when: (f) => f.symbolLength >= 3 && f.symbolLength <= 5,
    evidence: (f) => ({ symbol: f.symbol, symbolLength: f.symbolLength }),
  },
  {
    id: "VIR_TICKER_TOO_LONG",
    label: "Ticker is hard to remember",
    description: (f) => `Ticker "${f.symbol}" is ${f.symbolLength} characters, too long for quick recall or casual typing.`,
    severity: "warn",
    impact: -8,
    when: (f) => f.symbolLength > 8,
    evidence: (f) => ({ symbol: f.symbol, symbolLength: f.symbolLength }),
  },
  {
    id: "VIR_KEYWORD_MATCHES",
    label: "Matches known meme/narrative vocabulary",
    description: (f) => `Name/symbol reference well-known meme vocabulary: ${f.matchedKeywords}.`,
    severity: "positive",
    impact: 7,
    when: (f) => f.keywordMatches > 0,
    evidence: (f) => ({ keywordMatches: f.keywordMatches, matchedKeywords: f.matchedKeywords }),
  },
  {
    id: "VIR_MULTIPLE_KEYWORD_MATCHES",
    label: "Strong narrative density",
    description: (f) => `Multiple meme/narrative references detected (${f.matchedKeywords}), suggesting strong remixable branding.`,
    severity: "positive",
    impact: 8,
    when: (f) => f.keywordMatches >= 2,
    evidence: (f) => ({ keywordMatches: f.keywordMatches }),
  },
  {
    id: "VIR_NAME_TOO_LONG",
    label: "Name is too long for instant readability",
    description: (f) => `Name is ${f.nameLength} characters across ${f.wordCount} words, hurting instant recognizability.`,
    severity: "warn",
    impact: -8,
    when: (f) => f.nameLength > 24 || f.wordCount > 3,
    evidence: (f) => ({ nameLength: f.nameLength, wordCount: f.wordCount }),
  },
  {
    id: "VIR_GENERIC_NAME",
    label: "Generic, low-effort naming",
    description: (f) => `Name "${f.name}" reads as a placeholder/generic label with no narrative hook.`,
    severity: "danger",
    impact: -20,
    when: (f) => f.isGenericName,
    evidence: (f) => ({ name: f.name }),
  },
  {
    id: "VIR_DIGITS_NOISE",
    label: "Digits reduce clarity",
    description: () => "Name or symbol contains digits, which can dilute instant readability and memorability.",
    severity: "info",
    impact: -3,
    when: (f) => f.hasDigits,
    evidence: (f) => ({ name: f.name, symbol: f.symbol }),
  },
  {
    id: "VIR_ALL_CAPS_TICKER",
    label: "Standard all-caps ticker convention",
    description: (f) => `Ticker "${f.symbol}" follows the familiar all-caps ticker convention.`,
    severity: "info",
    impact: 2,
    when: (f) => f.isAllCapsSymbol,
    evidence: (f) => ({ symbol: f.symbol }),
  },
  {
    id: "VIR_CONCISE_ONE_WORD_NAME",
    label: "Concise, single-word name",
    description: (f) => `Name "${f.name}" is a single word, maximizing instant readability and shareability.`,
    severity: "positive",
    impact: 6,
    when: (f) => f.wordCount === 1 && f.nameLength <= 14,
    evidence: (f) => ({ name: f.name }),
  },
];

export function runViralityEngine(identity: TokenIdentity): EngineResult {
  const features = extractFeatures(identity);
  const triggers = evaluateRules(features, RULES);
  const score = scoreFromBase(50, triggers);

  const confidence = features.hasIdentity ? 0.55 : 0.15;

  const summary = !features.hasIdentity
    ? "Insufficient metadata to evaluate narrative/meme potential."
    : score >= 70
      ? "Strong meme-native branding: memorable, evocative, and instantly readable."
      : score >= 50
        ? "Middling narrative strength - neither a clear hook nor a clear weakness."
        : score >= 30
          ? "Weak narrative hooks; branding is unlikely to drive organic virality."
          : "Very low coinability: generic or confusing branding with little viral potential.";

  return {
    id: "virality",
    label: "Virality / Memeability",
    score,
    direction: "higher_is_better",
    confidence,
    triggers,
    rulesEvaluatedCount: RULES.length,
    features: features as unknown as Record<string, string | number | boolean | null>,
    summary,
  };
}
