import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireRole } from '../auth.js';
import { getBotSettings, saveBotSettings } from '../bot/settings.js';
import { invalidateKnowledge, searchKnowledge } from '../bot/runner.js';
import { aiAvailable } from '../bot/llm.js';
import { isOpen } from '../bot/hours.js';

const itemSchema = z.object({
  question: z.string().trim().min(3),
  variants: z.array(z.string().trim().min(1)).default([]),
  answer: z.string().trim().min(1).max(4000),
  category: z.string().trim().nullish(),
  active: z.boolean().default(true),
});

export async function botRoutes(app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate);
  const manager = { preHandler: requireRole('ADMIN', 'GESTOR') };

  // ---- Configurações do robô ----
  app.get('/api/bot/settings', manager, async () => {
    const settings = await getBotSettings();
    return { settings, aiAvailable: aiAvailable(), openNow: isOpen(settings.businessHours) };
  });

  app.put('/api/bot/settings', manager, async (req) => {
    const settings = await saveBotSettings(req.body);
    return { settings, aiAvailable: aiAvailable(), openNow: isOpen(settings.businessHours) };
  });

  // ---- Base de respostas ----
  app.get('/api/knowledge', manager, async () =>
    prisma.knowledgeItem.findMany({ orderBy: [{ category: 'asc' }, { question: 'asc' }] }),
  );

  app.post('/api/knowledge', manager, async (req, reply) => {
    const data = itemSchema.parse(req.body);
    const item = await prisma.knowledgeItem.create({ data });
    invalidateKnowledge();
    return reply.code(201).send(item);
  });

  /** Importação em lote (ex.: planilha convertida em JSON) */
  app.post('/api/knowledge/import', manager, async (req) => {
    const items = z.array(itemSchema).max(1000).parse(req.body);
    const result = await prisma.knowledgeItem.createMany({ data: items });
    invalidateKnowledge();
    return { created: result.count };
  });

  app.patch('/api/knowledge/:id', manager, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const data = itemSchema.partial().parse(req.body);
    const item = await prisma.knowledgeItem.update({ where: { id }, data });
    invalidateKnowledge();
    return item;
  });

  app.delete('/api/knowledge/:id', manager, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await prisma.knowledgeItem.delete({ where: { id } });
    invalidateKnowledge();
    return { ok: true };
  });

  /** Testa uma mensagem contra a base e mostra o que o robô faria */
  app.post('/api/knowledge/test', manager, async (req) => {
    const { text } = z.object({ text: z.string().trim().min(1) }).parse(req.body);
    const settings = await getBotSettings();
    const matches = await searchKnowledge(text, 5);
    const top = matches[0];
    const decision = !top
      ? 'none'
      : top.confidence >= settings.autoAnswerThreshold
        ? 'auto'
        : top.confidence >= settings.suggestThreshold
          ? 'suggest'
          : 'none';
    return {
      decision,
      thresholds: { auto: settings.autoAnswerThreshold, suggest: settings.suggestThreshold },
      matches: matches.map((m) => ({
        id: m.item.id,
        question: m.item.question,
        answer: m.item.answer,
        matchedText: m.matchedText,
        confidence: m.confidence,
      })),
    };
  });
}
