import { SecretMatch } from "../types";

const ENTROPY_THRESHOLD = 4.0;
const MIN_TOKEN_LENGTH = 20;
const MAX_TOKEN_LENGTH = 200;
const CONTEXT_KEYWORDS = [
  "key", "secret", "token", "password", "passwd", "pwd", "credential",
  "auth", "api_key", "apikey", "access_key", "private", "signing"
];

function shannonEntropy(str: string): number {
  const freq = new Map<string, number>();
  for (const ch of str) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }

  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function hasNearbyKeyword(text: string, position: number): boolean {
  const windowStart = Math.max(0, position - 60);
  const windowEnd = Math.min(text.length, position + 10);
  const context = text.slice(windowStart, windowEnd).toLowerCase();
  return CONTEXT_KEYWORDS.some((kw) => context.includes(kw));
}

export function scanEntropy(text: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  const tokenRegex = /[A-Za-z0-9+/\-_]{20,200}/g;

  let m: RegExpExecArray | null;
  while ((m = tokenRegex.exec(text)) !== null) {
    const candidate = m[0];
    if (candidate.length < MIN_TOKEN_LENGTH || candidate.length > MAX_TOKEN_LENGTH) {
      continue;
    }

    const entropy = shannonEntropy(candidate);
    if (entropy < ENTROPY_THRESHOLD) {
      continue;
    }

    if (!hasNearbyKeyword(text, m.index)) {
      continue;
    }

    const isAlreadyCommonWord = /^[a-z]+$/i.test(candidate);
    if (isAlreadyCommonWord) {
      continue;
    }

    matches.push({
      type: "HIGH_ENTROPY",
      value: candidate,
      position: m.index,
      length: candidate.length,
      severity: entropy > 5.0 ? "high" : "medium"
    });
  }

  return matches;
}
