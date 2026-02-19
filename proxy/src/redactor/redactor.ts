type RedactionInput = {
  type: string;
  value: string;
};

function tokenForType(type: string): string {
  const normalized = type.replace(/[^A-Z0-9_]/g, "_");
  return `[REDACTED_${normalized}]`;
}

export function redact(text: string, matches: RedactionInput[]): string {
  let redacted = text;
  const sorted = [...matches].sort((a, b) => b.value.length - a.value.length);

  for (const match of sorted) {
    if (!match.value) continue;
    redacted = redacted.split(match.value).join(tokenForType(match.type));
  }

  return redacted;
}
