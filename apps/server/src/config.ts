import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3333),
  JWT_SECRET: z.string().min(8),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  SESSIONS_DIR: z.string().default('./sessions'),
  MAX_CONNECTIONS: z.coerce.number().int().positive().default(5),
  VAPID_PUBLIC_KEY: z.string().optional().default(''),
  VAPID_PRIVATE_KEY: z.string().optional().default(''),
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),
  WEB_DIST_DIR: z.string().optional().default(''),
  /** Endereço público usado nos links enviados aos clientes (ex.: https://atendimento.suaconfeccao.com.br) */
  PUBLIC_URL: z.string().optional().default(''),
  LOG_LEVEL: z.string().default('info'),
});

export const config = schema.parse(process.env);
export const webOrigins = config.WEB_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
