import 'dotenv/config';
import { createDb } from '../lib/db';
import { migrate, migrationStatus, resetDatabase, runSeeds } from '../lib/db/migrate';
import { env } from '../lib/env';

/**
 * Database CLI.
 *
 *   npm run db:migrate
 *   npm run db:seed
 *   npm run db:status
 *   npm run db:reset   (development only — drops the public schema)
 */
async function main(): Promise<void> {
  const command = process.argv[2] ?? 'migrate';
  const e = env();

  if (command === 'reset' && e.NODE_ENV === 'production') {
    throw new Error('Refusing to reset a production database.');
  }

  const db = await createDb();

  try {
    switch (command) {
      case 'migrate': {
        const result = await migrate(db);
        if (result.applied.length === 0) {
          console.info(`Schema up to date (${result.skipped.length} migrations already applied).`);
        } else {
          console.info(`Applied ${result.applied.length} migration(s):`);
          for (const file of result.applied) console.info(`  + ${file}`);
        }
        break;
      }
      case 'seed': {
        await migrate(db);
        const files = await runSeeds(db);
        console.info(`Seed complete: ${files.join(', ')}`);
        break;
      }
      case 'status': {
        const status = await migrationStatus(db);
        console.info(`Applied: ${status.applied.length}`);
        console.info(`Pending: ${status.pending.length}`);
        for (const file of status.pending) console.info(`  - ${file}`);
        break;
      }
      case 'reset': {
        await resetDatabase(db);
        const files = await runSeeds(db);
        console.info(`Database reset. Migrations + seeds applied (${files.join(', ')}).`);
        break;
      }
      default:
        throw new Error(`Unknown command "${command}". Use migrate | seed | status | reset.`);
    }
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
