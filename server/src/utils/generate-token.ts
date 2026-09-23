import 'dotenv/config';
import jwt from 'jsonwebtoken';

const tenant = process.argv[2];

const users: Record<string, object> = {
  acme: {
    userId: 'user-a',
    tenantId: 'tenant-a',
    role: 'ADMIN',
  },
  beta: {
    userId: 'user-b',
    tenantId: 'tenant-b',
    role: 'ADMIN',
  },
};

if (!tenant || !users[tenant]) {
  console.error('Usage: npx tsx src/utils/generate-token.ts acme|beta');
  process.exit(1);
}

const token = jwt.sign(
  users[tenant],
  process.env.JWT_SECRET ?? 'development-secret',
  { expiresIn: '1h' }
);

console.log(token);