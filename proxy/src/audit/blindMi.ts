import { scanEntropy } from "../scanner/entropyScanner";

export interface BlindMiResult {
  blindMiScore: number; // 0..1
  candidates: string[];
  signals: {
    entropy: number;
    ngramRepetition: number;
    vocabRichness: number;
    codeStructure: number;
  };
}

const WEIGHTS = {
  entropy: 0.4,
  ngramRepetition: 0.3,
  vocabRichness: 0.2,
  codeStructure: 0.1
};

function computeNgramRepetition(text: string): number {
  if (text.length < 10) return 0;

  const charNgrams = new Map<string, number>();
  for (let i = 0; i <= text.length - 3; i++) {
    const ng = text.substring(i, i + 3);
    charNgrams.set(ng, (charNgrams.get(ng) ?? 0) + 1);
  }

  const total = text.length - 2;
  if (total <= 0) return 0;

  let repeatedCount = 0;
  for (const count of charNgrams.values()) {
    if (count > 1) repeatedCount += count - 1;
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    const wordBigrams = new Map<string, number>();
    for (let i = 0; i < words.length - 1; i++) {
      const bg = `${words[i]} ${words[i + 1]}`;
      wordBigrams.set(bg, (wordBigrams.get(bg) ?? 0) + 1);
    }
    let wordRepeat = 0;
    for (const c of wordBigrams.values()) {
      if (c > 1) wordRepeat += c - 1;
    }
    const wordRatio = wordRepeat / Math.max(1, words.length - 1);
    const charRatio = repeatedCount / total;
    return Math.min(1, (charRatio + wordRatio) / 2);
  }

  return Math.min(1, repeatedCount / total);
}

function computeVocabRichness(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 5) return 0;

  const uniqueWords = new Set(words);
  const ttr = uniqueWords.size / words.length;

  // Low TTR (< 0.3) → high memorization signal; High TTR (> 0.7) → low signal
  // Invert: memorized text tends to have LOW diversity (low TTR → high score)
  return Math.min(1, Math.max(0, 1 - ttr));
}

function computeCodeStructure(text: string): number {
  if (text.length < 20) return 0;

  const indicators = [
    /[{}\[\]();]/g,
    /\b(function|class|const|let|var|import|export|return|if|for|while)\b/g,
    /[A-Z][a-z]+[A-Z]/g,  // camelCase
    /\b0x[0-9a-fA-F]+\b/g,
    /\/\/.*/g,
    /\/\*[\s\S]*?\*\//g,
  ];

  let totalMatches = 0;
  for (const regex of indicators) {
    regex.lastIndex = 0;
    const matches = text.match(regex);
    totalMatches += matches?.length ?? 0;
  }

  const density = totalMatches / text.length;
  // Memorized code snippets tend to have high code-structure density
  return Math.min(1, density * 10);
}

/**
 * Multi-signal BlindMI heuristic for privacy leak detection.
 *
 * Weighted combination of:
 *  - Entropy-based high-entropy token detection (0.4)
 *  - N-gram repetition analysis (0.3)
 *  - Vocabulary richness / type-token ratio (0.2)
 *  - Code structure density (0.1)
 */
export function analyzeBlindMi(text: string): BlindMiResult {
  const entropyMatches = scanEntropy(text);
  const entropySignal = Math.min(1, entropyMatches.length / 3);

  const ngramRepetition = computeNgramRepetition(text);
  const vocabRichness = computeVocabRichness(text);
  const codeStructure = computeCodeStructure(text);

  const blindMiScore =
    WEIGHTS.entropy * entropySignal +
    WEIGHTS.ngramRepetition * ngramRepetition +
    WEIGHTS.vocabRichness * vocabRichness +
    WEIGHTS.codeStructure * codeStructure;

  const candidates = entropyMatches.map((m) => m.value).slice(0, 10);

  return {
    blindMiScore: Math.round(blindMiScore * 1000) / 1000,
    candidates,
    signals: {
      entropy: Math.round(entropySignal * 1000) / 1000,
      ngramRepetition: Math.round(ngramRepetition * 1000) / 1000,
      vocabRichness: Math.round(vocabRichness * 1000) / 1000,
      codeStructure: Math.round(codeStructure * 1000) / 1000
    }
  };
}
