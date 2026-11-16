import { jaccard, normalizeText, tokenize, trigrams } from './normalize.js';

export type KnowledgeEntry = {
  id: string;
  question: string;
  variants: string[];
  answer: string;
  category?: string | null;
};

export type Match = {
  item: KnowledgeEntry;
  /** Confiança de 0 a 1 */
  confidence: number;
  /** Frase da base que mais se parece com a mensagem */
  matchedText: string;
};

type Candidate = { item: KnowledgeEntry; text: string; tokens: string[]; grams: Set<string>; phrase: string };

/**
 * Índice da base de respostas. A confiança combina:
 *  - sobreposição de palavras com peso por raridade (IDF), nos dois sentidos;
 *  - semelhança de trigramas (erros de digitação);
 *  - bônus quando uma variante aparece inteira na mensagem;
 *  - penalidade quando as duas melhores respostas empatam (ambiguidade).
 */
export class KnowledgeIndex {
  private candidates: Candidate[] = [];
  private idf = new Map<string, number>();
  /** Todas as palavras de cada resposta (pergunta + variantes) */
  private vocab = new Map<string, Set<string>>();

  constructor(items: KnowledgeEntry[]) {
    for (const item of items) {
      for (const text of [item.question, ...item.variants]) {
        const tokens = tokenize(text);
        if (tokens.length === 0) continue;
        this.candidates.push({ item, text, tokens, grams: trigrams(text), phrase: normalizeText(text) });
      }
    }
    // IDF por resposta (não por variante), para não favorecer itens com muitas variantes
    const df = new Map<string, number>();
    for (const item of items) {
      const words = new Set([item.question, ...item.variants].flatMap(tokenize));
      this.vocab.set(item.id, words);
      for (const w of words) df.set(w, (df.get(w) ?? 0) + 1);
    }
    const n = Math.max(items.length, 1);
    for (const [w, d] of df) this.idf.set(w, Math.log(1 + n / d));
  }

  get size() {
    return this.candidates.length;
  }

  private weight(token: string) {
    // palavra desconhecida da base: peso médio-alto (é informação que não sabemos responder)
    return this.idf.get(token) ?? Math.log(1 + Math.max(this.candidates.length, 1));
  }

  private scoreCandidate(qTokens: string[], qGrams: Set<string>, qPhrase: string, c: Candidate) {
    const qSet = new Set(qTokens);
    const cSet = new Set(c.tokens);
    let inter = 0;
    let qTotal = 0;
    let cTotal = 0;
    for (const t of qSet) {
      const w = this.weight(t);
      qTotal += w;
      if (cSet.has(t)) inter += w;
    }
    for (const t of cSet) cTotal += this.weight(t);

    // cobertura da pergunta da base pela mensagem pesa mais (a mensagem pode ter "conversa" extra)
    const recall = cTotal ? inter / cTotal : 0;
    const precision = qTotal ? inter / qTotal : 0;
    const lexical = recall && precision ? (1.25 * precision * recall) / (0.25 * precision + recall) : 0;

    const fuzzy = jaccard(qGrams, c.grams);
    let score = 0.75 * lexical + 0.25 * fuzzy;

    // Variante curta que aparece inteira na mensagem (ex.: "pedido minimo")
    if (c.phrase.length >= 5 && ` ${qPhrase} `.includes(` ${c.phrase} `)) {
      score = Math.max(score, 0.6 + 0.3 * Math.min(1, c.tokens.length / 3));
    }
    return Math.min(score, 1);
  }

  /** Melhores respostas para uma mensagem, da mais provável para a menos. */
  search(message: string, limit = 3): Match[] {
    const qTokens = tokenize(message);
    if (qTokens.length === 0 || this.candidates.length === 0) return [];
    const qGrams = trigrams(message);
    const qPhrase = normalizeText(message);

    const best = new Map<string, Match>();
    for (const c of this.candidates) {
      const score = this.scoreCandidate(qTokens, qGrams, qPhrase, c);
      const prev = best.get(c.item.id);
      if (!prev || score > prev.confidence) {
        best.set(c.item.id, { item: c.item, confidence: score, matchedText: c.text });
      }
    }
    // Evidência somada: quanto da mensagem é coberto pelo vocabulário da resposta inteira
    let qTotal = 0;
    for (const t of new Set(qTokens)) qTotal += this.weight(t);
    for (const m of best.values()) {
      const words = this.vocab.get(m.item.id);
      if (!words || !qTotal) continue;
      let covered = 0;
      for (const t of new Set(qTokens)) if (words.has(t)) covered += this.weight(t);
      const coverage = covered / qTotal;
      m.confidence = Math.max(m.confidence, Math.min(1, 0.55 * coverage + 0.45 * m.confidence));
    }

    const ranked = [...best.values()].sort((a, b) => b.confidence - a.confidence);

    // Ambiguidade: se a segunda resposta está muito perto da primeira, reduz a confiança
    if (ranked.length > 1 && ranked[0].confidence > 0) {
      const gap = ranked[0].confidence - ranked[1].confidence;
      if (gap < 0.08) ranked[0] = { ...ranked[0], confidence: ranked[0].confidence * (0.85 + gap) };
    }
    return ranked.slice(0, limit).map((m) => ({ ...m, confidence: Math.round(m.confidence * 1000) / 1000 }));
  }
}
