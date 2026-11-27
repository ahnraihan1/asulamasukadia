import { AuthService } from '../src/server/middleware/auth.js';
import { JobManager } from '../src/server/queue/jobManager.js';
import { AccountService } from '../src/server/services/accountService.js';
import { db } from '../src/server/db/index.js';

async function seed() {
  console.log('Seeding default RBAC users (admin, operator, viewer)...');
  await AuthService.ensureDefaultUsers();

  const existingAccounts = AccountService.listAccounts({ page: 1, limit: 5 });
  if (existingAccounts.total === 0) {
    console.log('Seeding initial sample job & registered accounts...');
    const adminRow = db.raw
      .prepare('SELECT id FROM users WHERE username = ?')
      .get('admin') as { id: string } | undefined;

    AccountService.createAccount({
      robloxUsername: 'rbx_alpha_001',
      robloxUserId: '7019283741',
      password: 'StrongVaultPassword#2026!',
      category: 'STANDARD',
      registrationStatus: 'REGISTERED',
      verificationStatus: 'VERIFIED',
      notes: 'Initial seeded verified account',
      tags: ['seed', 'verified'],
      createdById: adminRow?.id ?? null,
    });

    const job = JobManager.createJob({
      name: 'Initial-Supervised-Batch',
      generationConfig: {
        quantity: 5,
        prefix: 'rbx',
        suffix: 'x',
        length: 12,
        passwordLength: 16,
        includeSymbols: true,
      },
      createdById: adminRow?.id ?? null,
      autoStart: false,
    });
    await JobManager.processJob(job.id);
  }

  console.log('Database seed completed successfully.');
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
