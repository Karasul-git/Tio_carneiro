/**
 * Simula uma conversa de cliente com o robô de triagem, sem WhatsApp.
 * Útil para testar fluxo, base de respostas e resumo.
 *
 *   npm run simular -w apps/server -- "Oi" "1" "50 camisetas pretas M e G até dia 20/12"
 *   npm run simular -w apps/server -- --novo "Oi"      (usa um cliente novo)
 *
 * Cria (se não existir) um número "Simulador" e um contato de teste. As respostas
 * do robô são gravadas como se tivessem sido enviadas.
 */
import 'dotenv/config';
import type { WAMessage } from 'baileys';
import { prisma } from '../db.js';
import { ingestMessages, registerOutgoing } from '../whatsapp/ingest.js';
import { whatsapp, type SendOptions } from '../whatsapp/manager.js';
import { botRunner } from '../bot/runner.js';
import { getBotSettings, saveBotSettings } from '../bot/settings.js';

const args = process.argv.slice(2);
const novo = args.includes('--novo');
const texts = args.filter((a) => a !== '--novo');
const JID = novo ? `55119${String(Date.now()).slice(-8)}@s.whatsapp.net` : '5511900000001@s.whatsapp.net';
const NAMES = ['Joana Souza', 'Carlos Lima', 'Ana Paula', 'Marcos Oliveira', 'Fernanda Rocha'];
const NAME = novo ? NAMES[Date.now() % NAMES.length] : 'Cliente Teste';
if (texts.length === 0) {
  console.log('Uso: npm run simular -- "mensagem 1" "mensagem 2" ...');
  process.exit(1);
}

let conn = await prisma.whatsAppConnection.findFirst({ where: { name: 'Simulador' } });
conn ??= await prisma.whatsAppConnection.create({ data: { name: 'Simulador', status: 'DISCONNECTED' } });

// Liga o robô e encurta a espera só durante a simulação (restaura no final)
const original = await getBotSettings();
await saveBotSettings({ ...original, enabled: true, debounceSeconds: 0.2 });

// Substitui o envio real: grava a resposta do robô como mensagem enviada
let seq = 0;
(whatsapp as any).sendText = async (connectionId: string, jid: string, text: string, opts: SendOptions) => {
  const id = `SIMOUT${Date.now()}${seq++}`;
  registerOutgoing(id, { sender: opts.sender, sentByUserId: opts.userId, meta: opts.meta });
  const msg = { key: { id, remoteJid: jid, fromMe: true }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: text } };
  await ingestMessages(connectionId, [msg as WAMessage], { live: true });
  console.log(`\n🤖 Robô:\n${text}`);
  return id;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
for (const text of texts) {
  console.log(`\n👤 Cliente: ${text}`);
  const msg = {
    key: { id: `SIMIN${Date.now()}${seq++}`, remoteJid: JID, fromMe: false },
    messageTimestamp: Math.floor(Date.now() / 1000),
    pushName: NAME,
    message: { conversation: text },
  };
  const saved = await ingestMessages(conn.id, [msg as WAMessage], { live: true });
  for (const m of saved) if (m.sender === 'CUSTOMER') botRunner.onCustomerMessage(m.conversationId, { allowBot: true });
  await sleep(700);
}
await sleep(1500);

const conv = await prisma.conversation.findFirst({
  where: { connectionId: conn.id, contact: { jid: JID } },
  orderBy: { updatedAt: 'desc' },
});
console.log('\n──────── Estado da conversa ────────');
console.log({ etapa: conv?.botState, assunto: conv?.intent, aguardandoDesde: conv?.awaitingSince, motivo: conv?.handoffReason });
if (conv?.summary) console.log(`\nResumo para o atendente:\n${conv.summary}`);
await saveBotSettings(original);
await prisma.$disconnect();
process.exit(0);
