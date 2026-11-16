/**
 * Normalização de texto em português para comparação: minúsculas, sem acentos,
 * sem pontuação, sem palavras vazias e com um "radical" simples (plural etc.).
 */

const STOPWORDS = new Set(
  `a o as os um uma uns umas de do da dos das no na nos nas em por para pra pro pras pros com sem
  e ou que se me te lhe nos vos eu tu ele ela eles elas voce voces vc vcs ce meu minha meus minhas seu sua
  seus suas teu tua este esta estes estas esse essa esses essas isso isto aquilo ao aos ate mais muito muita
  ja so tambem entao ai la aqui ola oi bom boa dia tarde noite tudo bem gostaria queria quero saber
  porfavor favor obrigado obrigada vou ter tem tenho tinha ser sou eh e estou esta estao foi era sim nao
  como qual quais quanto quanta quantos quantas quando onde algum alguma alguns algumas pode podem poderia
  fazer faz fazem faco fiz sao consegue conseguem vcs gente nois nos ne q pq porque mim ta to tao kk kkk rs`
    .split(/\s+/)
    .filter(Boolean),
);

/** Palavras com significado próprio que não devem perder o final ("mes", "pis"...). */
const KEEP = new Set(['mes', 'pis', 'gas', 'gis', 'tenis', 'lapis', 'onibus', 'pires', 'jeans']);

export function stripAccents(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizeText(s: string) {
  return stripAccents(s.toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Radical simplificado (suficiente para casar singular/plural e algumas flexões). */
export function stem(word: string) {
  let w = word;
  if (w.length <= 3 || KEEP.has(w) || /^\d+$/.test(w)) return w;
  if (w.endsWith('oes') || w.endsWith('aes')) w = w.slice(0, -3) + 'ao';
  else if (w.endsWith('ais')) w = w.slice(0, -3) + 'al';
  else if (w.endsWith('eis')) w = w.slice(0, -3) + 'el';
  else if (w.endsWith('ns')) w = w.slice(0, -2) + 'm';
  else if (w.endsWith('res') || w.endsWith('zes') || w.endsWith('ses')) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  // terminações verbais comuns ("entregam", "enviamos", "trocar", "comprando")
  const verb = w.match(/^(.{4,}?)(amos|emos|imos|ando|endo|indo|aram|eram|iram|am|em|ar|er|ir|ou)$/);
  if (verb) w = verb[1];
  // feminino/masculino e diminutivos mais comuns
  if (w.length > 4 && (w.endsWith('inha') || w.endsWith('inho'))) w = w.slice(0, -4);
  if (w.length > 4 && (w.endsWith('a') || w.endsWith('o') || w.endsWith('e'))) w = w.slice(0, -1);
  return w;
}

export function tokenize(s: string): string[] {
  return normalizeText(s)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem)
    .filter((t) => t.length > 1 || /\d/.test(t));
}

/** Trigramas de caracteres (tolera erros de digitação). */
export function trigrams(s: string): Set<string> {
  const text = ` ${normalizeText(s)} `;
  const out = new Set<string>();
  for (let i = 0; i < text.length - 2; i++) out.add(text.slice(i, i + 3));
  return out;
}

export function jaccard<T>(a: Set<T>, b: Set<T>) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
