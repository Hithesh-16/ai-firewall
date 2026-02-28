import { PromptInjectionMatch, PromptInjectionResult } from "../types";

interface InjectionPattern {
  name: string;
  regex: RegExp;
  weight: number;
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  { name: "instruction_override", regex: /ignore\s+(all\s+)?(previous|prior|above|earlier|preceding)\s+(instructions|prompts|rules|guidelines|context)/gi, weight: 30 },
  { name: "new_instructions", regex: /new\s+instructions?\s*[:=]/gi, weight: 25 },
  { name: "role_play", regex: /(you\s+are\s+now|pretend\s+(you\s+are|to\s+be)|act\s+as\s+(if|a|an|though))/gi, weight: 20 },
  { name: "system_prompt_extract", regex: /repeat\s+(the|your)\s+(system|initial|original|first)\s+(prompt|instructions?|message)/gi, weight: 30 },
  { name: "data_exfil", regex: /send\s+(all|every|the|my)\s+(files?|data|code|content|secrets?|keys?|credentials?)\s+to/gi, weight: 35 },
  { name: "dan_jailbreak", regex: /\b(DAN|Do\s+Anything\s+Now|jailbreak|bypass\s+(filter|safety|restriction))\b/gi, weight: 25 },
  { name: "encoding_bypass", regex: /(base64\s+decode|atob\(|\\x[0-9a-f]{2}|&#x?[0-9a-f]+;)/gi, weight: 15 },
  { name: "delimiter_injection", regex: /(```system|<\|im_start\|>|<\|im_end\|>|\[INST\]|\[\/INST\]|<<SYS>>)/gi, weight: 30 },
  { name: "output_format_hijack", regex: /(respond\s+only\s+with|output\s+format\s*:|from\s+now\s+on\s+you\s+(will|must|should))/gi, weight: 20 },
  { name: "persona_switch", regex: /(switch\s+(to|into)\s+(evil|unrestricted|unfiltered)|enable\s+developer\s+mode)/gi, weight: 25 },
  { name: "context_confusion", regex: /(forget\s+(everything|all|what)|disregard\s+(all|any|the)\s+(previous|above|prior))/gi, weight: 25 },
  { name: "chain_of_thought_leak", regex: /(show\s+(me\s+)?your\s+(reasoning|chain\s+of\s+thought|internal)|reveal\s+(your|the)\s+(system|hidden))/gi, weight: 20 },
  { name: "indirect_injection", regex: /(when\s+you\s+see\s+this|if\s+you\s+read\s+this|hidden\s+instruction)/gi, weight: 20 },
];

export function scanPromptInjection(text: string, threshold = 60): PromptInjectionResult {
  const matches: PromptInjectionMatch[] = [];
  let totalScore = 0;

  for (const pattern of INJECTION_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.regex.exec(text)) !== null) {
      matches.push({
        pattern: pattern.name,
        matched: m[0],
        position: m.index,
        weight: pattern.weight
      });
      totalScore += pattern.weight;
    }
  }

  const score = Math.min(totalScore, 100);
  return {
    score,
    isInjection: score >= threshold,
    matches
  };
}
