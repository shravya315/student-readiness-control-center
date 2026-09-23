import 'dotenv/config';
import { calculateReadiness } from '../services/readiness.service';

async function main() {
  const result = await calculateReadiness(
    'student-a1',
    'tenant-a'
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});