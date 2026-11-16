import { describe, expect, it } from 'vitest';
import { documentType, isValidCnpj, isValidCpf } from '../src/lib/documents.js';
import { orderTotals, unitPrice } from '../src/orders/pricing.js';

describe('CPF/CNPJ', () => {
  it('valida dígitos verificadores', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
    expect(documentType('52998224725')).toBe('PF');
    expect(documentType('11222333000181')).toBe('PJ');
    expect(documentType('123')).toBeNull();
  });
});

describe('preços e totais', () => {
  const camiseta = { priceCents: 3500, sizeSurchargeCents: { GG: 500, XG: 800 } };
  it('acréscimo por tamanho', () => {
    expect(unitPrice(camiseta, 'M')).toBe(3500);
    expect(unitPrice(camiseta, 'GG')).toBe(4000);
    expect(unitPrice({ priceCents: null }, 'M')).toBeNull();
  });
  it('total com desconto e frete; itens sem preço ficam pendentes', () => {
    const t = orderTotals(
      [
        { quantity: 10, unitPriceCents: 3500 },
        { quantity: 2, unitPriceCents: 4000 },
      ],
      1000,
      2500,
    );
    expect(t).toEqual({ quantity: 12, subtotalCents: 43000, totalCents: 44500, pendingPrices: false });
    expect(orderTotals([{ quantity: 1, unitPriceCents: null }]).pendingPrices).toBe(true);
    expect(orderTotals([{ quantity: 1, unitPriceCents: 500 }], 9999).totalCents).toBe(0);
  });
});
