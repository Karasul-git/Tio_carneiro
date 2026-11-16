/** Cálculo de preços e totais do pedido (valores em centavos). Funções puras. */

export type PricedProduct = {
  priceCents: number | null;
  sizeSurchargeCents?: unknown;
};

/** Preço unitário de um produto num tamanho (null = sob orçamento). */
export function unitPrice(product: PricedProduct, size?: string | null): number | null {
  if (product.priceCents == null) return null;
  const surcharges = (product.sizeSurchargeCents ?? {}) as Record<string, number>;
  const extra = size && typeof surcharges[size] === 'number' ? surcharges[size] : 0;
  return product.priceCents + extra;
}

export type ItemForTotal = { quantity: number; unitPriceCents: number | null };

export function orderTotals(items: ItemForTotal[], discountCents = 0, shippingCents = 0) {
  const quantity = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.quantity * (i.unitPriceCents ?? 0), 0);
  const pendingPrices = items.some((i) => i.unitPriceCents == null);
  const total = Math.max(0, subtotal - discountCents) + shippingCents;
  return { quantity, subtotalCents: subtotal, totalCents: total, pendingPrices };
}

export const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
