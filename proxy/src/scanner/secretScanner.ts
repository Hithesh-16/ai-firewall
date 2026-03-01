import { SecretMatch, SecretScanResult } from "../types";
import { secretPatterns } from "./patterns";

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

export function scanSecrets(text: string): SecretScanResult {
  const secrets: SecretMatch[] = [];

  for (const pattern of secretPatterns) {
    const found = collectRegexMatches(text, pattern.regex);
    for (const match of found) {
      secrets.push({
        type: pattern.type,
        value: match.value,
        position: match.index,
        length: match.value.length,
        severity: pattern.severity
      });
    }
  }

  return {
    hasSecrets: secrets.length > 0,
    secrets
  };
}
