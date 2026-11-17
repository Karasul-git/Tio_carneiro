import ExcelJS from 'exceljs';
import { prisma } from '../db.js';
import { buildOverview, type ReportFilter } from './service.js';
import { responseEpisodes } from './metrics.js';

const STATUS: Record<string, string> = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Enviado pelo cliente',
  CONFIRMED: 'Confirmado',
  IN_PRODUCTION: 'Em produção',
  READY: 'Pronto',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
};
const money = (cents: number | null | undefined) => (cents == null ? null : cents / 100);
const BRL = '"R$" #,##0.00';
const DATE = 'dd/mm/yyyy hh:mm';

function sheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width?: number; fmt?: string }[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16, style: c.fmt ? { numFmt: c.fmt } : {} }));
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

/** Planilha com o período: resumo, pedidos, itens (para a nota fiscal), clientes e atendimentos. */
export async function buildWorkbook(filter: ReportFilter) {
  const { from, to, connectionId } = filter;
  const connWhere = connectionId ? { connectionId } : {};
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Central de Atendimentos';
  wb.created = new Date();

  // ---- Resumo ----
  const o = await buildOverview(filter);
  const resumo = sheet(wb, 'Resumo', [
    { header: 'Indicador', key: 'k', width: 42 },
    { header: 'Valor', key: 'v', width: 20 },
  ]);
  const rt = o.service.responseTime;
  const rows: [string, unknown, string?][] = [
    ['Período', `${from.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} a ${to.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`],
    ['Conversas com o cliente', o.service.conversations],
    ['Mensagens recebidas', o.service.messagesIn],
    ['Mensagens enviadas', o.service.messagesOut],
    ['Mensagens do robô', o.service.botMessages],
    ['Tempo de resposta (mediana, min)', rt.medianMinutes],
    ['Tempo de resposta (média, min)', rt.averageMinutes],
    ['Respondidas em até 15 min (%)', rt.withinPct],
    ['Passadas ao atendente pelo robô', o.service.handoffs],
    ['Resolvidas pelo robô', o.service.botResolved],
    ['Links de pedido criados', o.orders.linksSent],
    ['Pedidos enviados pelos clientes', o.orders.submitted],
    ['Pedidos confirmados', o.orders.confirmed],
    ['Faturamento (pedidos confirmados)', money(o.orders.revenueCents), BRL],
    ['Ticket médio', money(o.orders.averageTicketCents), BRL],
    ['Peças vendidas', o.orders.pieces],
  ];
  for (const [k, v, fmt] of rows) {
    const r = resumo.addRow({ k, v });
    if (fmt) r.getCell('v').numFmt = fmt;
  }

  // ---- Pedidos e itens ----
  const orders = await prisma.order.findMany({
    where: { ...connWhere, status: { not: 'DRAFT' }, OR: [{ createdAt: { gte: from, lte: to } }, { confirmedAt: { gte: from, lte: to } }] },
    include: { items: { orderBy: { position: 'asc' } }, customer: true, connection: { select: { name: true } } },
    orderBy: { number: 'asc' },
  });
  const ped = sheet(wb, 'Pedidos', [
    { header: 'Nº', key: 'number', width: 8 },
    { header: 'Situação', key: 'status', width: 18 },
    { header: 'Cliente', key: 'customer', width: 30 },
    { header: 'CPF/CNPJ', key: 'document', width: 18 },
    { header: 'Telefone', key: 'phone', width: 16 },
    { header: 'Cidade/UF', key: 'city', width: 20 },
    { header: 'Peças', key: 'pieces', width: 8 },
    { header: 'Desconto', key: 'discount', fmt: BRL },
    { header: 'Frete', key: 'shipping', fmt: BRL },
    { header: 'Total', key: 'total', fmt: BRL },
    { header: 'Entrega', key: 'delivery', width: 10 },
    { header: 'Prazo', key: 'due', fmt: 'dd/mm/yyyy' },
    { header: 'Enviado em', key: 'submitted', fmt: DATE, width: 18 },
    { header: 'Confirmado em', key: 'confirmed', fmt: DATE, width: 18 },
    { header: 'Número WhatsApp', key: 'connection', width: 18 },
  ]);
  const itens = sheet(wb, 'Itens', [
    { header: 'Pedido', key: 'number', width: 8 },
    { header: 'Situação', key: 'status', width: 18 },
    { header: 'Cliente', key: 'customer', width: 30 },
    { header: 'CPF/CNPJ', key: 'document', width: 18 },
    { header: 'Produto', key: 'description', width: 30 },
    { header: 'Tamanho', key: 'size', width: 9 },
    { header: 'Cor', key: 'color', width: 14 },
    { header: 'Personalização', key: 'customization', width: 26 },
    { header: 'Qtd.', key: 'quantity', width: 7 },
    { header: 'Preço unit.', key: 'unit', fmt: BRL },
    { header: 'Subtotal', key: 'subtotal', fmt: BRL },
    { header: 'NCM', key: 'ncm', width: 11 },
    { header: 'CFOP', key: 'cfop', width: 7 },
  ]);
  const productIds = [...new Set(orders.flatMap((x) => x.items.map((i) => i.productId)).filter((x): x is string => Boolean(x)))];
  const products = new Map((await prisma.product.findMany({ where: { id: { in: productIds } } })).map((p) => [p.id, p]));
  for (const x of orders) {
    const c = x.customer;
    ped.addRow({
      number: x.number,
      status: STATUS[x.status],
      customer: c?.name ?? '',
      document: c?.document ?? '',
      phone: c?.phone ?? '',
      city: c?.city ? `${c.city}/${c.state ?? ''}` : '',
      pieces: x.items.reduce((s, i) => s + i.quantity, 0),
      discount: money(x.discountCents),
      shipping: money(x.shippingCents),
      total: money(x.totalCents),
      delivery: x.deliveryMethod === 'DELIVERY' ? 'Entrega' : 'Retirada',
      due: x.dueDate,
      submitted: x.submittedAt,
      confirmed: x.confirmedAt,
      connection: x.connection?.name ?? '',
    });
    for (const i of x.items) {
      const p = i.productId ? products.get(i.productId) : undefined;
      itens.addRow({
        number: x.number,
        status: STATUS[x.status],
        customer: c?.name ?? '',
        document: c?.document ?? '',
        description: i.description,
        size: i.size ?? '',
        color: i.color ?? '',
        customization: i.customization ?? '',
        quantity: i.quantity,
        unit: money(i.unitPriceCents),
        subtotal: i.unitPriceCents == null ? null : money(i.unitPriceCents * i.quantity),
        ncm: p?.ncm ?? '',
        cfop: p?.cfop ?? '',
      });
    }
  }

  // ---- Clientes ----
  const customerIds = [...new Set(orders.map((x) => x.customerId).filter((x): x is string => Boolean(x)))];
  const customers = await prisma.customer.findMany({ where: { id: { in: customerIds } }, orderBy: { name: 'asc' } });
  const cli = sheet(wb, 'Clientes', [
    { header: 'Nome / razão social', key: 'name', width: 30 },
    { header: 'Tipo', key: 'type', width: 6 },
    { header: 'CPF/CNPJ', key: 'document', width: 18 },
    { header: 'Inscrição estadual', key: 'ie', width: 16 },
    { header: 'E-mail', key: 'email', width: 24 },
    { header: 'Telefone', key: 'phone', width: 16 },
    { header: 'CEP', key: 'zip', width: 10 },
    { header: 'Endereço', key: 'street', width: 30 },
    { header: 'Número', key: 'number', width: 8 },
    { header: 'Complemento', key: 'complement', width: 14 },
    { header: 'Bairro', key: 'district', width: 16 },
    { header: 'Cidade', key: 'city', width: 18 },
    { header: 'UF', key: 'state', width: 5 },
    { header: 'Cód. IBGE', key: 'ibge', width: 10 },
  ]);
  for (const c of customers) {
    cli.addRow({
      name: c.name, type: c.personType, document: c.document ?? '', ie: c.stateRegistration ?? '', email: c.email ?? '',
      phone: c.phone ?? '', zip: c.zipCode ?? '', street: c.street ?? '', number: c.number ?? '', complement: c.complement ?? '',
      district: c.district ?? '', city: c.city ?? '', state: c.state ?? '', ibge: c.cityCode ?? '',
    });
  }

  // ---- Atendimentos (uma linha por espera respondida ou pendente) ----
  const convs = await prisma.conversation.findMany({
    where: { ...connWhere, messages: { some: { timestamp: { gte: from, lte: to } } } },
    include: {
      contact: true,
      connection: { select: { name: true, attendant: { select: { name: true } } } },
      messages: { where: { timestamp: { gte: new Date(from.getTime() - 86400_000), lte: to } }, select: { timestamp: true, fromMe: true, sender: true } },
    },
    take: 5000,
  });
  const at = sheet(wb, 'Atendimentos', [
    { header: 'Cliente', key: 'customer', width: 26 },
    { header: 'Telefone', key: 'phone', width: 16 },
    { header: 'Número WhatsApp', key: 'connection', width: 18 },
    { header: 'Atendente', key: 'attendant', width: 18 },
    { header: 'Assunto', key: 'intent', width: 16 },
    { header: 'Cliente escreveu em', key: 'start', fmt: DATE, width: 18 },
    { header: 'Respondido em', key: 'end', fmt: DATE, width: 18 },
    { header: 'Tempo de resposta (min)', key: 'minutes', width: 12 },
  ]);
  for (const c of convs) {
    for (const e of responseEpisodes(c.messages)) {
      if (e.start < from && (!e.end || e.end < from)) continue;
      at.addRow({
        customer: c.contact.name ?? '',
        phone: c.contact.phone ?? '',
        connection: c.connection.name,
        attendant: c.connection.attendant?.name ?? '',
        intent: c.intent ?? '',
        start: e.start,
        end: e.end,
        minutes: e.minutes == null ? 'sem resposta' : Math.round(e.minutes),
      });
    }
  }

  return wb;
}
