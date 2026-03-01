import { PiiMatch, PiiScanResult } from "../types";
import { piiPatterns } from "./patterns";

function collectRegexMatches(text: string, regex: RegExp): Array<{ value: string; index: number }> {
  const matches: Array<{ value: string; index: number }> = [];
  const copy = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);

  let current = copy.exec(text);
  while (current !== null) {
    matches.push({ value: current[0], index: current.index });
    current = copy.exec(text);
  }

  return matches;
}

function luhnCheck(value: string): boolean {
  const digits = value.replace(/[\s-]/g, "");
  if (!/^\d{13,16}$/.test(digits)) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function scanPII(text: string): PiiScanResult {
  const pii: PiiMatch[] = [];

  for (const pattern of piiPatterns) {
    const found = collectRegexMatches(text, pattern.regex);
    for (const match of found) {
      if (pattern.type === "CREDIT_CARD" && !luhnCheck(match.value)) {
        continue;
      }

      pii.push({
        type: pattern.type,
        value: match.value,
        position: match.index,
        length: match.value.length,
        severity: pattern.severity
      });
    }
  }

  return {
    hasPII: pii.length > 0,
    pii
  };
}
