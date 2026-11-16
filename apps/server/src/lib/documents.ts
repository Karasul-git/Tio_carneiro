/** Validação de CPF/CNPJ (dígitos verificadores). */
export const onlyDigits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

export function isValidCpf(value: string) {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function isValidCnpj(value: string) {
  const d = onlyDigits(value);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

/** Retorna 'PF', 'PJ' ou null se o documento for inválido. */
export function documentType(value: string): 'PF' | 'PJ' | null {
  const d = onlyDigits(value);
  if (d.length === 11) return isValidCpf(d) ? 'PF' : null;
  if (d.length === 14) return isValidCnpj(d) ? 'PJ' : null;
  return null;
}
