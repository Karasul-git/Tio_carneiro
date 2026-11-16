import { z } from 'zod';
import { prisma } from '../db.js';

/** Dados da empresa e textos do link de pedido (tabela Setting, chave "company"). */
export const companySchema = z.object({
  name: z.string().default('Nossa Confecção'),
  /** CNPJ da empresa (para a nota fiscal, fase 6) */
  document: z.string().default(''),
  /** Mostrar preços na página de pedido */
  showPrices: z.boolean().default(true),
  /** Endereço público do sistema (ex.: https://atendimento.suaconfeccao.com.br). Vazio = usa o do .env */
  publicUrl: z.string().default(''),
  orderLinkMessage: z
    .string()
    .default('Para facilitar, monte seu pedido por este link 👇\n{link}\n\nÉ só escolher os produtos, tamanhos e quantidades. Qualquer dúvida, fale com a gente por aqui!'),
  orderReceivedMessage: z
    .string()
    .default('Recebemos seu pedido *#{numero}* ✅\nNossa equipe vai conferir e retornar com a confirmação em breve.'),
  /** Texto exibido no topo da página de pedido */
  orderPageIntro: z.string().default('Escolha os produtos, tamanhos e quantidades. Depois, preencha seus dados e envie.'),
});

export type Company = z.infer<typeof companySchema>;

let cache: Company | null = null;

export async function getCompany(): Promise<Company> {
  if (cache) return cache;
  const row = await prisma.setting.findUnique({ where: { key: 'company' } });
  cache = companySchema.parse(row?.value ?? {});
  return cache;
}

export async function saveCompany(input: unknown): Promise<Company> {
  const merged = companySchema.parse({ ...(await getCompany()), ...(input as object) });
  await prisma.setting.upsert({ where: { key: 'company' }, create: { key: 'company', value: merged }, update: { value: merged } });
  cache = merged;
  return merged;
}
