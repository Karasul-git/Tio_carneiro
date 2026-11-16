import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';

const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@confeccao.local').toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';

const existing = await prisma.user.findUnique({ where: { email } });
if (existing) {
  console.log(`Administrador ${email} já existe.`);
} else {
  await prisma.user.create({
    data: { name: 'Administrador', email, role: 'ADMIN', passwordHash: await bcrypt.hash(password, 10) },
  });
  console.log(`Administrador criado: ${email} / ${password} (troque a senha!)`);
}
await prisma.$disconnect();
