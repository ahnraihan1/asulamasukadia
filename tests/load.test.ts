import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { db } from '../src/server/db/index.js';
import { AuthService } from '../src/server/middleware/auth.js';
import { GeneratorService } from '../src/server/services/generatorService.js';
import { AccountService } from '../src/server/services/accountService.js';
import { createApp } from '../src/server/app.js';

describe('Performance & Load Testing (5,000 Account Records & 20 Concurrent Users)', () => {
  beforeEach(async () => {
    db.resetForTests();
    await AuthService.ensureDefaultUsers();
  });

  it('generates 5,000 unique candidate records and 5,000 registered accounts with zero duplicates and handles 20 concurrent users', async () => {
    const app = createApp();

    // 1. Generate 5,000 unique account candidates with AES-256-GCM encrypted passwords
    const t0 = performance.now();
    const genBatch = GeneratorService.generateBatch({
      quantity: 5000,
      prefix: 'ld',
      length: 14,
      passwordLength: 16,
      includeSymbols: true,
    });
    const genDurationMs = Math.round(performance.now() - t0);

    expect(genBatch.candidates).toHaveLength(5000);
    const uniqueCandidateNames = new Set(
      genBatch.candidates.map((c) => c.candidateUsername.toLowerCase())
    );
    expect(uniqueCandidateNames.size).toBe(5000);

    // 2. Bulk insert 5,000 registered account records
    const t1 = performance.now();
    const accountInputs = Array.from({ length: 5000 }, (_, idx) => ({
      robloxUsername: `rbx_acct_${String(idx + 1).padStart(5, '0')}`,
      robloxUserId: String(1000000000 + idx),
      category: idx % 3 === 0 ? 'VIP' : idx % 2 === 0 ? 'TRADING' : 'STANDARD',
      registrationStatus: 'REGISTERED' as const,
      verificationStatus: 'VERIFIED' as const,
      notes: `Load test account #${idx + 1}`,
      tags: ['load-test', `batch-${idx % 10}`],
    }));

    const bulkRes = AccountService.bulkCreateAccounts(accountInputs);
    const bulkInsertMs = Math.round(performance.now() - t1);
    expect(bulkRes.insertedCount).toBe(5000);

    // 3. Authenticate 20 concurrent dashboard users and execute simultaneous API queries
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      username: 'admin',
      password: 'Admin@RobloxEngine2026!',
    });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.data.token as string;

    const t2 = performance.now();
    const concurrentUsers = 20;
    const userPromises = Array.from({ length: concurrentUsers }, async (_, userIdx) => {
      const page = (userIdx % 25) + 1;
      const [accountsPage, candidatesPage, healthCheck] = await Promise.all([
        request(app)
          .get(`/api/v1/accounts?page=${page}&limit=50&category=VIP&sortBy=roblox_username&sortOrder=asc`)
          .set('Authorization', `Bearer ${token}`),
        request(app)
          .get(`/api/v1/generator/candidates?page=${page}&limit=50&search=ld`)
          .set('Authorization', `Bearer ${token}`),
        request(app).get('/api/v1/system/health'),
      ]);

      expect(accountsPage.status).toBe(200);
      expect(accountsPage.body.success).toBe(true);
      expect(accountsPage.body.data.length).toBeGreaterThan(0);

      expect(candidatesPage.status).toBe(200);
      expect(candidatesPage.body.success).toBe(true);
      expect(candidatesPage.body.meta.total).toBe(5000);

      expect(healthCheck.status).toBe(200);
      expect(healthCheck.body.data.metrics.registeredAccounts).toBe(5000);
      expect(healthCheck.body.data.metrics.generatedCandidates).toBe(5000);
    });

    await Promise.all(userPromises);
    const concurrentRequestsMs = Math.round(performance.now() - t2);

    console.log(
      `[LOAD TEST METRICS] 5,000 candidates + AES-256-GCM vault generated in ${genDurationMs}ms | ` +
        `5,000 registered accounts inserted in ${bulkInsertMs}ms | ` +
        `20 concurrent users (60 parallel API requests) completed in ${concurrentRequestsMs}ms`
    );

    expect(genDurationMs).toBeLessThan(15000);
    expect(bulkInsertMs).toBeLessThan(10000);
    expect(concurrentRequestsMs).toBeLessThan(5000);
  }, 30000);
});
