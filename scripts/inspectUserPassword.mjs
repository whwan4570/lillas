import { prisma } from '../server/dbStore.mjs';
import { verifyPassword } from '../server/security.mjs';

const email = process.argv[2] ?? 'wjhwang0503@gmail.com';
const trial = process.argv[3] ?? 'demo1234';

const u = await prisma.user.findFirst({ where: { email } });
console.log(JSON.stringify({
  id: u?.id,
  email: u?.email,
  hasPassword: Boolean(u?.passwordHash),
  hashLen: u?.passwordHash?.length ?? null,
  hashSample: u?.passwordHash ? u.passwordHash.slice(0, 24) + '...' : null,
  googleSub: u?.googleSub
}, null, 2));

if (u?.passwordHash) {
  console.log(`verify('${trial}') =`, verifyPassword(trial, u.passwordHash));
}

await prisma.$disconnect();
