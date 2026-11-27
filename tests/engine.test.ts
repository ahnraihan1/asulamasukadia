import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import { db } from '../src/server/db/index.js';
import { CredentialVault } from '../src/server/vault/credentialVault.js';
import { redactSecrets } from '../src/server/config/env.js';
import { GeneratorService } from '../src/server/services/generatorService.js';
import { JobManager } from '../src/server/queue/jobManager.js';
import { RegistrationService } from '../src/server/services/registrationService.js';
import { BrowserAssistService } from '../src/server/services/browserAssistService.js';
import {
  applyWindowRectAccountJitter,
  buildFirefoxDataSaverPrefs,
  buildFirefoxDisableWebAuthnPrefs,
  buildFirefoxUniqueAccountFingerprintPrefs,
  FIREFOX_PROXY_BYPASS_LIST,
  prepareMainFirefoxProfileForWorker,
} from '../src/server/services/firefoxMarionetteDriver.js';
import {
  clearRobloxAndCaptchaStorage,
  clearRobloxAuthCookiesInSqlite,
  clearRobloxPlacesHistoryInSqlite,
  createOrSyncMasterFirefoxProfile,
  getMasterFirefoxProfileStatus,
  hasRecentRobloxHomeVisit,
  setWorkerLoopbackCookieInSqlite,
} from '../src/server/services/firefoxManualCapture.js';
import { isBlockedByDataSaver, LocalProxyBridge } from '../src/server/services/localProxyBridge.js';
import {
  computeGridDimensions,
  computeWorkerWindowRect,
  patchFirefoxXulstoreRect,
} from '../src/server/services/windowTiling.js';
import {
  ROBLOX_SIGNUP_AUTOFILL_BROWSER_FN,
  buildManualUserscriptSource,
} from '../src/server/services/robloxFormFiller.js';
import { AuthService } from '../src/server/middleware/auth.js';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/server/app.js';

describe('Roblox Account Generator Engine - Comprehensive Suite', () => {
  beforeEach(async () => {
    db.resetForTests();
    await AuthService.ensureDefaultUsers();
  });

  // ==========================================================================
  // 1. CREDENTIAL VAULT (AES-256-GCM) & SECRET REDACTION TESTS
  // ==========================================================================
  describe('Credential Vault (AES-256-GCM) & Security Controls', () => {
    it('encrypts and decrypts secrets accurately with AES-256-GCM and unique 96-bit IVs', () => {
      const secret = 'SuperSecretRobloxPass#2026!';
      const env1 = CredentialVault.encryptSecret(secret);
      const env2 = CredentialVault.encryptSecret(secret);

      expect(env1.algorithm).toBe('AES-256-GCM');
      expect(env1.ivHex).not.toBe(env2.ivHex);
      expect(env1.ciphertextHex).not.toBe(env2.ciphertextHex);
      expect(env1.fingerprintSha256).toBe(env2.fingerprintSha256);

      expect(CredentialVault.decryptSecret(env1)).toBe(secret);
      expect(CredentialVault.decryptSecret(env2)).toBe(secret);
    });

    it('rejects tampered ciphertext or authentication tag', () => {
      const env = CredentialVault.encryptSecret('ValidSecret123!');
      const tamperedTag = {
        ...env,
        authTagHex: env.authTagHex.replace(/^../, env.authTagHex.startsWith('aa') ? 'bb' : 'aa'),
      };
      expect(() => CredentialVault.decryptSecret(tamperedTag)).toThrow();
    });

    it('rejects decryption with an incorrect master key', () => {
      const env = CredentialVault.encryptSecret('AnotherSecret#99');
      const wrongKey = crypto.randomBytes(32);
      expect(() => CredentialVault.decryptSecret(env, wrongKey)).toThrow();
    });

    it('stores credential metadata without exposing secret values in public metadata queries', () => {
      const stored = CredentialVault.storeCredential('VaultStoredPassword$1', 'PASSWORD');
      const pub = CredentialVault.getPublicMetadata(stored.id);

      expect(pub).not.toBeNull();
      expect(pub?.algorithm).toBe('AES-256-GCM');
      expect((pub as any).ciphertextHex).toBeUndefined();
      expect((pub as any).ivHex).toBeUndefined();
      expect((pub as any).password).toBeUndefined();
    });

    it('redacts sensitive fields and tokens from objects and logs', () => {
      const dirty = {
        username: 'testuser',
        password: 'PlaintextPassword123',
        passwordHash: '$argon2id$v=19$m=19456...',
        nested: {
          ciphertextHex: 'deadbeef',
          note: 'Auth header Bearer secret_token_12345 and _|WARNING:-DO-NOT-SHARE-THIS.--cookie',
        },
      };

      const cleaned = redactSecrets(dirty);
      expect(cleaned.password).toBe('[REDACTED]');
      expect(cleaned.passwordHash).toBe('[REDACTED]');
      expect(cleaned.nested.ciphertextHex).toBe('[REDACTED]');
      expect(cleaned.nested.note).toContain('Bearer [REDACTED]');
      expect(cleaned.nested.note).toContain('[REDACTED_ROBLOX_COOKIE]');
    });
  });

  // ==========================================================================
  // 2. DATABASE ACID TRANSACTION & CONSTRAINT TESTS
  // ==========================================================================
  describe('Database ACID Transactions & Constraints', () => {
    it('rolls back entire transaction when an error occurs mid-flight', () => {
      const beforeCount = (
        db.raw.prepare('SELECT COUNT(*) as cnt FROM accounts').get() as { cnt: number }
      ).cnt;

      expect(() => {
        db.transaction(() => {
          db.raw
            .prepare(
              `INSERT INTO accounts (
                id, roblox_username, roblox_user_id, credential_id, category,
                registration_status, verification_status, notes, tags_json, created_by_id, created_at, updated_at
              ) VALUES (?, 'tx_rollback_user', '999111', NULL, 'STANDARD', 'REGISTERED', 'VERIFIED', NULL, '[]', NULL, ?, ?)`
            )
            .run(crypto.randomUUID(), new Date().toISOString(), new Date().toISOString());

          throw new Error('Simulated mid-transaction failure');
        });
      }).toThrow('Simulated mid-transaction failure');

      const afterCount = (
        db.raw.prepare('SELECT COUNT(*) as cnt FROM accounts').get() as { cnt: number }
      ).cnt;
      expect(afterCount).toBe(beforeCount);
    });
  });

  // ==========================================================================
  // 3. ACCOUNT DATA GENERATOR TESTS
  // ==========================================================================
  describe('Account Data Generator Service', () => {
    it('generates valid username candidates respecting prefix, suffix, and length, plus passwordPrefix and proxy parsing', () => {
      const passWithPrefix = GeneratorService.generateStrongPassword(16, true, 'DimasPass');
      expect(passWithPrefix.startsWith('DimasPass')).toBe(true);
      expect(passWithPrefix.length).toBeGreaterThanOrEqual(16);

      const p1 = BrowserAssistService.parseProxyString('192.168.1.10:8080');
      expect(p1?.server).toBe('http://192.168.1.10:8080');

      const p2 = BrowserAssistService.parseProxyString('user1:pass1@203.0.113.5:3128');
      expect(p2?.server).toBe('http://203.0.113.5:3128');
      expect(p2?.username).toBe('user1');
      expect(p2?.password).toBe('pass1');

      const p3 = BrowserAssistService.parseProxyString('203.0.113.9:8000:myuser:mypass');
      expect(p3?.server).toBe('http://203.0.113.9:8000');
      expect(p3?.username).toBe('myuser');
      expect(p3?.password).toBe('mypass');

      const batch = GeneratorService.generateBatch({
        quantity: 25,
        prefix: 'rbx',
        suffix: 'z',
        length: 14,
        passwordPrefix: 'MyPre',
        passwordLength: 18,
        includeSymbols: true,
      });

      expect(batch.candidates).toHaveLength(25);
      const seen = new Set<string>();

      for (const c of batch.candidates) {
        expect(c.candidateUsername.startsWith('rbx')).toBe(true);
        expect(c.candidateUsername.endsWith('z')).toBe(true);
        expect(c.candidateUsername.length).toBe(14);
        expect(c.validationStatus).toBe('VALID');
        expect(c.registrationState).toBe('GENERATED_CANDIDATE');
        expect(c.accountId).toBeNull();
        expect(seen.has(c.candidateUsername.toLowerCase())).toBe(false);
        seen.add(c.candidateUsername.toLowerCase());
      }
    });

    it('regenerates an unconfirmed candidate with a new username and vault credential', () => {
      const batch = GeneratorService.generateBatch({
        quantity: 1,
        prefix: 'regen',
        length: 12,
      });
      const original = batch.candidates[0];
      const regenerated = GeneratorService.regenerateCandidate(original.id);

      expect(regenerated.id).toBe(original.id);
      expect(regenerated.candidateUsername).not.toBe(original.candidateUsername);
      expect(regenerated.credentialId).not.toBe(original.credentialId);
      expect(regenerated.validationStatus).toBe('VALID');
    });
  });

  // ==========================================================================
  // 4. REGISTRATION JOB MANAGER & HUMAN-SUPERVISED WORKFLOW TESTS
  // ==========================================================================
  describe('Registration Job Manager & Human-Supervised Confirmation', () => {
    it('processes jobs, retries transient errors, supports pause/resume/cancel, and gates COMPLETED on human confirmation', async () => {
      const job = JobManager.createJob({
        name: 'Supervised-Queue-Test',
        generationConfig: {
          quantity: 3,
          prefix: 'job',
          length: 11,
        },
        autoStart: false,
      });

      expect(job.status).toBe('PENDING');
      expect(job.totalCount).toBe(3);

      // Pause and verify state
      const paused = JobManager.pauseJob(job.id);
      expect(paused.status).toBe('PAUSED');

      // Process with simulated transient failure to verify automatic retry recovery
      await JobManager.resumeJob(job.id);
      await JobManager.processJob(job.id, { simulateTransientFailures: 1 });

      const afterPrep = JobManager.getJobById(job.id, true)!;
      // Job MUST NOT be marked COMPLETED until human confirms actual registration!
      expect(afterPrep.status).toBe('VERIFICATION_REQUIRED');
      expect(afterPrep.processedCount).toBe(3);
      expect(afterPrep.completedCount).toBe(0);
      expect(afterPrep.verificationRequiredCount).toBe(3);

      // Confirm all 3 candidates through the human-supervised workflow
      const candidates = afterPrep.candidates!;
      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const pkg = RegistrationService.getPreparationPackage(c.id);
        expect(pkg.officialRegistrationUrl).toBe('https://www.roblox.com/CreateAccount');
        expect(pkg.generatedPasswordForHumanCopy?.length).toBeGreaterThanOrEqual(12);

        RegistrationService.confirmRegistration(c.id, {
          robloxUserId: `80000000${i + 1}`,
          robloxUsername: c.candidateUsername,
          category: 'STANDARD',
        });
      }

      const finalJob = JobManager.getJobById(job.id, true)!;
      expect(finalJob.status).toBe('COMPLETED');
      expect(finalJob.completedCount).toBe(3);
      expect(finalJob.progressPercent).toBe(100);
    });
  });

  // ==========================================================================
  // 5. REST API (/api/v1), RBAC, & CSRF SECURITY INTEGRATION TESTS
  // ==========================================================================
  describe('REST API /api/v1 Integration & RBAC/CSRF Protection', () => {
    const app = createApp();

    it('authenticates via /api/v1/auth/login, enforces CSRF on cookie requests, and enforces RBAC roles', async () => {
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        username: 'admin',
        password: 'Admin@RobloxEngine2026!',
      });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
      const token = loginRes.body.data.token as string;
      const csrfToken = loginRes.body.data.csrfToken as string;
      const cookies = loginRes.headers['set-cookie'];

      // Mutating request with cookie but WITHOUT X-CSRF-Token must be blocked (403)
      const csrfFailRes = await request(app)
        .post('/api/v1/generator/generate')
        .set('Cookie', cookies)
        .send({ quantity: 2, length: 10 });
      expect(csrfFailRes.status).toBe(403);
      expect(csrfFailRes.body.error.code).toBe('CSRF_TOKEN_MISMATCH');

      // Mutating request WITH valid X-CSRF-Token succeeds
      const genRes = await request(app)
        .post('/api/v1/generator/generate')
        .set('Cookie', cookies)
        .set('X-CSRF-Token', csrfToken)
        .send({
          quantity: 2,
          prefix: 'api',
          length: 10,
          createPreparationJob: false,
        });
      expect(genRes.status).toBe(201);
      expect(genRes.body.data.candidates).toHaveLength(2);

      // Confirm one candidate via API with cookie and verify username:password:cookie format
      const candidateId = genRes.body.data.candidates[0].id;
      const confirmRes = await request(app)
        .post(`/api/v1/registration/${candidateId}/confirm`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          robloxUserId: '918273645',
          cookie: '_|WARNING:-DO-NOT-SHARE-THIS.--sample_session_cookie_123',
          category: 'VIP',
          tags: ['api-test'],
        });
      expect(confirmRes.status).toBe(201);
      const accountId = confirmRes.body.data.account.id;
      expect(confirmRes.body.data.formattedCredential).toContain(
        ':_|WARNING:-DO-NOT-SHARE-THIS.--sample_session_cookie_123'
      );

      // Verify authorized formatted export endpoint returns username:password:cookie
      const formattedRes = await request(app)
        .get(`/api/v1/accounts/${accountId}/formatted-credential`)
        .set('Authorization', `Bearer ${token}`);
      expect(formattedRes.status).toBe(200);
      expect(formattedRes.body.data.formatted.split(':').length).toBeGreaterThanOrEqual(3);

      // Verify GET /api/v1/accounts NEVER leaks password or ciphertext
      const listRes = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${token}`);
      expect(listRes.status).toBe(200);
      const rawJson = JSON.stringify(listRes.body);
      expect(rawJson).not.toContain('ciphertext');
      expect(rawJson).not.toContain('iv_hex');
      expect(rawJson).not.toContain('auth_tag_hex');

      // Verify VIEWER role cannot create or delete accounts (RBAC 403)
      const viewerLogin = await request(app).post('/api/v1/auth/login').send({
        username: 'viewer',
        password: 'Viewer@RobloxEngine2026!',
      });
      const viewerToken = viewerLogin.body.data.token as string;

      const viewerDelete = await request(app)
        .delete(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${viewerToken}`);
      expect(viewerDelete.status).toBe(403);

      // Verify Firefox Main Profile detection endpoint & manual bookmarklet / bridge
      const ffInfoRes = await request(app)
        .get('/api/v1/registration/firefox-profile-info')
        .set('Authorization', `Bearer ${token}`);
      expect(ffInfoRes.status).toBe(200);
      expect(ffInfoRes.body.success).toBe(true);
      expect(Array.isArray(ffInfoRes.body.data.profiles)).toBe(true);

      const bmRes = await request(app)
        .get('/api/v1/registration/manual-bookmarklet')
        .set('Authorization', `Bearer ${token}`);
      expect(bmRes.status).toBe(200);
      expect(bmRes.body.success).toBe(true);
      expect(bmRes.body.data.bookmarkletHref).toMatch(/^javascript:/);
      expect(bmRes.body.data.userscriptUrl).toContain('rage-autofill.user.js');

      const usRes = await request(app).get('/api/v1/registration/rage-autofill.user.js');
      expect(usRes.status).toBe(200);
      expect(usRes.text).toContain('GM_xmlhttpRequest');
      expect(usRes.text).toContain('manual-autofill-json');
      expect(usRes.text).toContain('manual-home-signal');
      expect(usRes.text).toContain('Add password');

      const sigRes = await request(app)
        .post('/api/v1/registration/manual-home-signal')
        .send({ workerId: 2, url: 'https://www.roblox.com/home' });
      expect(sigRes.status).toBe(200);
      expect(sigRes.body.data.received).toBe(true);
      expect(sigRes.body.data.workerId).toBe(2);

      // Verify per-worker isolation across concurrent manual targets
      const targetMap = (BrowserAssistService as any).activeAutofillTargets as Map<number, any>;
      targetMap.set(1, {
        workerId: 1,
        candidateId: 'cand-w1',
        birthMonth: 'Jan',
        birthDay: '05',
        birthYear: '2001',
        username: 'worker1_user',
        gender: 'MALE',
        password: 'PassWorker1#2026',
      });
      targetMap.set(2, {
        workerId: 2,
        candidateId: 'cand-w2',
        birthMonth: 'Dec',
        birthDay: '20',
        birthYear: '2000',
        username: 'worker2_user',
        gender: 'FEMALE',
        password: 'PassWorker2#2026',
      });
      try {
        const w2Json = await request(app).get('/api/v1/registration/manual-autofill-json?workerId=2');
        expect(w2Json.status).toBe(200);
        expect(w2Json.body.data.username).toBe('worker2_user');
        expect(w2Json.body.data.workerId).toBe(2);

        const w2Bridge = await request(app).get(
          '/api/v1/registration/manual-autofill-bridge?origin=https://www.roblox.com&workerId=2'
        );
        expect(w2Bridge.status).toBe(200);
        expect(w2Bridge.text).toContain('worker2_user');
        expect(w2Bridge.text).not.toContain('worker1_user');
      } finally {
        targetMap.delete(1);
        targetMap.delete(2);
      }

      const jsonRes = await request(app).get('/api/v1/registration/manual-autofill-json');
      expect(jsonRes.status).toBe(200);
      expect(jsonRes.body.success).toBe(true);
      expect(jsonRes.body.data).toBeNull();

      const bridgeRes = await request(app).get(
        '/api/v1/registration/manual-autofill-bridge?origin=https://www.roblox.com'
      );
      expect(bridgeRes.status).toBe(200);
      expect(bridgeRes.headers['cross-origin-opener-policy']).toBe('unsafe-none');
      expect(bridgeRes.text).toContain('RAGE');

      // ADMIN can soft-delete the account
      const adminDelete = await request(app)
        .delete(`/api/v1/accounts/${accountId}`)
        .set('Authorization', `Bearer ${token}`);
      expect(adminDelete.status).toBe(200);
    });

    it('preserves Firefox extensions and extension storage when syncing main profile copy', () => {
      const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'rage-ext-test-'));
      try {
        const srcProfile = path.join(tmpBase, 'main.default-release');
        const workersRoot = path.join(tmpBase, 'worker_profiles');
        fs.mkdirSync(path.join(srcProfile, 'extensions'), { recursive: true });
        fs.mkdirSync(path.join(srcProfile, 'extension-store'), { recursive: true });
        fs.mkdirSync(path.join(srcProfile, 'storage', 'default', 'moz-extension+++abc123'), {
          recursive: true,
        });
        fs.mkdirSync(path.join(srcProfile, 'storage', 'default', 'https+++example.com'), {
          recursive: true,
        });

        fs.writeFileSync(
          path.join(srcProfile, 'extensions.json'),
          JSON.stringify({
            addons: [
              {
                id: '{aecec67f-0d10-4fa7-b7c7-609a2db280cf}',
                location: 'app-profile',
                active: true,
                userDisabled: false,
                appDisabled: true,
                path: 'C:\\Users\\OldPcUser\\AppData\\Roaming\\Mozilla\\Firefox\\Profiles\\abc.default-release\\extensions\\{aecec67f-0d10-4fa7-b7c7-609a2db280cf}.xpi',
                rootURI: 'jar:file:///C:/Users/OldPcUser/AppData/Roaming/Mozilla/Firefox/Profiles/abc.default-release/extensions/%7Baecec67f-0d10-4fa7-b7c7-609a2db280cf%7D.xpi!/',
              },
            ],
          })
        );
        fs.writeFileSync(path.join(srcProfile, 'addonStartup.json.lz4'), 'stale-startup-cache');
        fs.writeFileSync(path.join(srcProfile, 'extensions', '{aecec67f-0d10-4fa7-b7c7-609a2db280cf}.xpi'), 'xpi-bytes');
        fs.writeFileSync(path.join(srcProfile, 'extension-store', 'settings.json'), '{"ok":true}');
        fs.writeFileSync(path.join(srcProfile, 'storage-sync-v2.sqlite'), 'sync-db');
        fs.writeFileSync(
          path.join(srcProfile, 'storage', 'default', 'moz-extension+++abc123', 'idb.sqlite'),
          'ext-idb'
        );
        fs.writeFileSync(
          path.join(srcProfile, 'storage', 'default', 'https+++example.com', 'idb.sqlite'),
          'site-idb'
        );

        const res = prepareMainFirefoxProfileForWorker({
          workerId: 1,
          profilesRootDir: workersRoot,
          customProfilePath: srcProfile,
          forceCopy: true,
        });

        expect(res.mode).toBe('SYNCED_MAIN');
        expect(
          fs.existsSync(path.join(res.profileDir, 'extensions', '{aecec67f-0d10-4fa7-b7c7-609a2db280cf}.xpi'))
        ).toBe(true);
        expect(fs.existsSync(path.join(res.profileDir, 'extensions.json'))).toBe(true);
        expect(fs.existsSync(path.join(res.profileDir, 'addonStartup.json.lz4'))).toBe(false);
        const relocatedExtJson = JSON.parse(
          fs.readFileSync(path.join(res.profileDir, 'extensions.json'), 'utf8')
        );
        expect(relocatedExtJson.addons[0].path).toBe(
          path.join(res.profileDir, 'extensions', '{aecec67f-0d10-4fa7-b7c7-609a2db280cf}.xpi')
        );
        expect(relocatedExtJson.addons[0].rootURI).toContain('jar:file:///');
        expect(relocatedExtJson.addons[0].rootURI).not.toContain('OldPcUser');
        expect(relocatedExtJson.addons[0].appDisabled).toBe(false);
        expect(fs.existsSync(path.join(res.profileDir, 'extension-store', 'settings.json'))).toBe(true);
        expect(fs.existsSync(path.join(res.profileDir, 'storage-sync-v2.sqlite'))).toBe(true);
        expect(
          fs.existsSync(
            path.join(res.profileDir, 'storage', 'default', 'moz-extension+++abc123', 'idb.sqlite')
          )
        ).toBe(true);
        expect(
          fs.existsSync(
            path.join(res.profileDir, 'storage', 'default', 'https+++example.com', 'idb.sqlite')
          )
        ).toBe(false);
      } finally {
        fs.rmSync(tmpBase, { recursive: true, force: true });
      }
    });

    it('retries transient upstream 407 in LocalProxyBridge and never leaks 407 Sign-In challenge to browser', async () => {
      let attemptCount = 0;
      let always407 = false;
      const mockUpstream = net.createServer((sock) => {
        sock.once('data', (chunk) => {
          attemptCount++;
          const txt = chunk.toString('latin1');
          expect(txt).toContain('Proxy-Authorization: Basic ');
          if (always407 || attemptCount === 1) {
            sock.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Mock"\r\nContent-Length: 0\r\n\r\n');
          } else {
            sock.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            sock.on('data', (d) => sock.write(d));
          }
        });
      });
      await new Promise<void>((resolve) => mockUpstream.listen(0, '127.0.0.1', resolve));
      const upPort = (mockUpstream.address() as net.AddressInfo).port;
      const bridge = await LocalProxyBridge.start({
        server: `http://127.0.0.1:${upPort}`,
        username: 'demoUser',
        password: 'demoPassword',
      });

      try {
        // 1) Transient 407 on attempt 1 recovers cleanly on retry without exposing 407
        const resp1 = await new Promise<string>((resolve, reject) => {
          const c = net.connect(bridge.port, '127.0.0.1');
          c.once('connect', () => {
            c.write('CONNECT www.roblox.com:443 HTTP/1.1\r\nHost: www.roblox.com:443\r\n\r\n');
          });
          c.once('data', (d) => {
            c.destroy();
            resolve(d.toString('latin1'));
          });
          c.once('error', reject);
        });
        expect(resp1).toContain('200 Connection Established');
        expect(attemptCount).toBe(2);

        // 2) Persistent upstream 407 is sanitized into 502 without Proxy-Authenticate
        always407 = true;
        const resp2 = await new Promise<string>((resolve, reject) => {
          const c = net.connect(bridge.port, '127.0.0.1');
          c.once('connect', () => {
            c.write('CONNECT www.roblox.com:443 HTTP/1.1\r\nHost: www.roblox.com:443\r\n\r\n');
          });
          c.once('data', (d) => {
            c.destroy();
            resolve(d.toString('latin1'));
          });
          c.once('error', reject);
        });
        expect(resp2).toContain('502 Bad Gateway');
        expect(resp2).not.toContain('407');
        expect(resp2).not.toContain('Proxy-Authenticate');
      } finally {
        bridge.close();
        mockUpstream.close();
      }
    });

    it('detects roblox/home visit in places.sqlite and clears only Roblox auth cookies in cookies.sqlite', () => {
      const tmpProf = fs.mkdtempSync(path.join(os.tmpdir(), 'rage-ff-sqlite-'));
      try {
        const cookiesDb = new DatabaseSync(path.join(tmpProf, 'cookies.sqlite'));
        cookiesDb.exec(
          'CREATE TABLE moz_cookies (id INTEGER PRIMARY KEY, name TEXT, value TEXT, host TEXT, lastAccessed INTEGER);'
        );
        cookiesDb
          .prepare('INSERT INTO moz_cookies (name, value, host, lastAccessed) VALUES (?, ?, ?, ?)')
          .run('.ROBLOSECURITY', 'secret_rbx_cookie_1234567890123456', '.roblox.com', 100);
        cookiesDb
          .prepare('INSERT INTO moz_cookies (name, value, host, lastAccessed) VALUES (?, ?, ?, ?)')
          .run('_px3', 'spent_px3_token', '.roblox.com', 100);
        cookiesDb
          .prepare('INSERT INTO moz_cookies (name, value, host, lastAccessed) VALUES (?, ?, ?, ?)')
          .run('RBXEventTrackerV2', 'spent_tracker', '.roblox.com', 100);
        cookiesDb
          .prepare('INSERT INTO moz_cookies (name, value, host, lastAccessed) VALUES (?, ?, ?, ?)')
          .run('timestamp', 'ark_session', '.arkoselabs.com', 100);
        cookiesDb
          .prepare('INSERT INTO moz_cookies (name, value, host, lastAccessed) VALUES (?, ?, ?, ?)')
          .run('SID', 'google_session_keep_intact', '.google.com', 100);
        cookiesDb.close();

        fs.mkdirSync(path.join(tmpProf, 'storage', 'default', 'https+++www.roblox.com', 'ls'), {
          recursive: true,
        });
        fs.mkdirSync(path.join(tmpProf, 'storage', 'default', 'https+++roblox-api.arkoselabs.com', 'ls'), {
          recursive: true,
        });
        fs.mkdirSync(path.join(tmpProf, 'storage', 'default', 'moz-extension+++abc123'), {
          recursive: true,
        });

        const removed = clearRobloxAuthCookiesInSqlite(tmpProf);
        expect(removed).toBe(4);
        const removedStorage = clearRobloxAndCaptchaStorage(tmpProf);
        expect(removedStorage).toBe(2);
        expect(fs.existsSync(path.join(tmpProf, 'storage', 'default', 'https+++www.roblox.com'))).toBe(false);
        expect(
          fs.existsSync(path.join(tmpProf, 'storage', 'default', 'https+++roblox-api.arkoselabs.com'))
        ).toBe(false);
        expect(fs.existsSync(path.join(tmpProf, 'storage', 'default', 'moz-extension+++abc123'))).toBe(true);

        const verifyCookiesDb = new DatabaseSync(path.join(tmpProf, 'cookies.sqlite'));
        const rows = verifyCookiesDb.prepare('SELECT name, host FROM moz_cookies').all() as Array<{
          name: string;
          host: string;
        }>;
        verifyCookiesDb.close();
        expect(rows).toEqual([{ name: 'SID', host: '.google.com' }]);

        const nowMs = Date.now();
        const placesDb = new DatabaseSync(path.join(tmpProf, 'places.sqlite'));
        placesDb.exec(
          'CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT); CREATE TABLE moz_historyvisits (id INTEGER PRIMARY KEY, place_id INTEGER, visit_date INTEGER);'
        );
        placesDb.prepare('INSERT INTO moz_places (id, url) VALUES (1, ?)').run('https://www.roblox.com/home?nu=true');
        placesDb.prepare('INSERT INTO moz_historyvisits (place_id, visit_date) VALUES (1, ?)').run(nowMs * 1000);
        placesDb.close();

        expect(hasRecentRobloxHomeVisit(tmpProf, nowMs - 1000)).toBe(true);
        expect(hasRecentRobloxHomeVisit(tmpProf, nowMs + 60000)).toBe(false);
      } finally {
        fs.rmSync(tmpProf, { recursive: true, force: true });
      }
    });

    it('blocks telemetry/safebrowsing/heavy-media locally in LocalProxyBridge data-saver without hitting upstream while preserving Roblox/CAPTCHA hosts', async () => {
      expect(isBlockedByDataSaver('safebrowsing.googleapis.com', { dataSaver: true })).toBe(true);
      expect(isBlockedByDataSaver('metrics.roblox.com', { dataSaver: true })).toBe(true);
      expect(isBlockedByDataSaver('ecsv2.roblox.com', { dataSaver: true })).toBe(true);
      expect(isBlockedByDataSaver('locale.roblox.com', { dataSaver: true })).toBe(true);
      expect(isBlockedByDataSaver('clients2.google.com', { dataSaver: true })).toBe(true);
      expect(isBlockedByDataSaver('mozilla.cloudflare-dns.com', { dataSaver: true })).toBe(true);
      expect(isBlockedByDataSaver('ciscobinary.openh264.org', { dataSaver: true })).toBe(true);
      expect(isBlockedByDataSaver('redirector.gvt1.com', { dataSaver: true })).toBe(true);
      expect(isBlockedByDataSaver('assetdelivery.roblox.com', { dataSaver: true })).toBe(true);
      expect(isBlockedByDataSaver('catalog.roblox.com', { dataSaver: true })).toBe(true);
      expect(isBlockedByDataSaver('apis.roblox.com', { dataSaver: true })).toBe(false);
      expect(
        isBlockedByDataSaver('prod-games-particle.merino.prod.webservices.mozgcp.net', {
          dataSaver: true,
        })
      ).toBe(true);
      // Font & UI CreateAccount tetap diizinkan agar Arkose/PerimeterX tidak memicu "Please try again"
      expect(isBlockedByDataSaver('images.rbxcdn.com', { dataSaver: true, blockHeavyMedia: true })).toBe(
        false
      );
      expect(isBlockedByDataSaver('fonts.gstatic.com', { dataSaver: true, blockHeavyMedia: true })).toBe(
        false
      );
      expect(isBlockedByDataSaver('fonts.googleapis.com', { dataSaver: true, blockHeavyMedia: true })).toBe(
        false
      );
      expect(isBlockedByDataSaver('tr.rbxcdn.com', { dataSaver: true, blockHeavyMedia: false })).toBe(false);
      expect(isBlockedByDataSaver('tr.rbxcdn.com', { dataSaver: true, blockHeavyMedia: true })).toBe(true);
      expect(isBlockedByDataSaver('t3.rbxcdn.com', { dataSaver: true, blockHeavyMedia: true })).toBe(true);
      expect(isBlockedByDataSaver('roblox-api.arkoselabs.com', { dataSaver: true, blockHeavyMedia: true })).toBe(
        false
      );
      expect(isBlockedByDataSaver('client.px-cloud.net', { dataSaver: true, blockHeavyMedia: true })).toBe(
        false
      );
      expect(isBlockedByDataSaver('auth.roblox.com', { dataSaver: true, blockHeavyMedia: true })).toBe(
        false
      );
      expect(isBlockedByDataSaver('js.rbxcdn.com', { dataSaver: true, blockHeavyMedia: true })).toBe(
        false
      );

      let upstreamHits = 0;
      const mockUpstream = net.createServer((sock) => {
        sock.once('data', () => {
          upstreamHits++;
          sock.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          sock.on('data', (d) => sock.write(d));
        });
      });
      await new Promise<void>((resolve) => mockUpstream.listen(0, '127.0.0.1', resolve));
      const upPort = (mockUpstream.address() as net.AddressInfo).port;

      const bridge = await LocalProxyBridge.start({
        server: `http://127.0.0.1:${upPort}`,
        username: 'u',
        password: 'p',
        dataSaver: true,
        blockHeavyMedia: true,
      });

      const sendConnect = (hostPort: string) =>
        new Promise<string>((resolve, reject) => {
          const c = net.connect(bridge.port, '127.0.0.1');
          c.once('connect', () => {
            c.write(`CONNECT ${hostPort} HTTP/1.1\r\nHost: ${hostPort}\r\n\r\n`);
          });
          c.once('data', (d) => {
            c.destroy();
            resolve(d.toString('latin1'));
          });
          c.once('error', reject);
        });

      try {
        const rBlocked1 = await sendConnect('safebrowsing.googleapis.com:443');
        const rBlocked2 = await sendConnect('tr.rbxcdn.com:443');
        const rBlocked3 = await sendConnect('www.googletagmanager.com:443');
        expect(rBlocked1).toContain('403 Forbidden');
        expect(rBlocked2).toContain('403 Forbidden');
        expect(rBlocked3).toContain('403 Forbidden');
        expect(upstreamHits).toBe(0);

        const rAllowed = await sendConnect('auth.roblox.com:443');
        expect(rAllowed).toContain('200 Connection Established');
        expect(upstreamHits).toBe(1);

        const stats = bridge.getStats();
        expect(stats.blockedRequests).toBe(3);
        expect(stats.proxiedRequests).toBe(1);
        expect(stats.bytesTransferred).toBeGreaterThan(0);

        const prefs = buildFirefoxDataSaverPrefs(true).join('\n');
        expect(prefs).toContain('browser.safebrowsing.malware.enabled", false');
        expect(prefs).toContain('toolkit.telemetry.enabled", false');
        expect(prefs).toContain('browser.startup.page", 0');
        expect(prefs).toContain('browser.cache.disk.enable", true');
        expect(prefs).toContain('network.trr.mode", 5');
        expect(prefs).toContain('media.gmp-provider.enabled", false');
        expect(prefs).toContain('browser.cache.check_doc_frequency", 2');

        expect(FIREFOX_PROXY_BYPASS_LIST).toContain('localhost');
        expect(FIREFOX_PROXY_BYPASS_LIST).toContain('127.0.0.1');
        expect(FIREFOX_PROXY_BYPASS_LIST).toContain('.omocaptcha.com');
        expect(FIREFOX_PROXY_BYPASS_LIST).toContain('.yescaptcha.com');
        expect(FIREFOX_PROXY_BYPASS_LIST).not.toContain('roblox.com');
        expect(FIREFOX_PROXY_BYPASS_LIST).not.toContain('arkoselabs.com');

        const webAuthnPrefs = buildFirefoxDisableWebAuthnPrefs().join('\n');
        expect(webAuthnPrefs).toContain('user_pref("security.webauth.webauthn", false);');
        expect(webAuthnPrefs).toContain('user_pref("security.webauth.webauthn_enable_usbtoken", false);');
        expect(webAuthnPrefs).toContain('user_pref("security.webauth.webauthn_enable_softtoken", false);');
        expect(webAuthnPrefs).toContain('user_pref("security.webauth.ctap2", false);');
        expect(webAuthnPrefs).toContain('user_pref("dom.security.credentialmanagement.identity.enabled", false);');
        expect(webAuthnPrefs).toContain('user_pref("dom.webauthn.enabled", false);');
        expect(webAuthnPrefs).toContain('user_pref("media.peerconnection.enabled", false);');
        expect(webAuthnPrefs).toContain('user_pref("network.http.http3.enable", false);');

        const fpSamples = new Set<string>();
        const rectSamples = new Set<string>();
        for (let i = 0; i < 20; i++) {
          const fp = buildFirefoxUniqueAccountFingerprintPrefs().join('\n');
          expect(fp).toContain('user_pref("privacy.fingerprintingProtection", false);');
          expect(fp).toContain('user_pref("privacy.resistFingerprinting.randomDataOnCanvasExtract", false);');
          expect(fp).toContain('user_pref("security.ssl.disable_session_identifiers", false);');
          expect(fp).toMatch(/user_pref\("dom\.maxHardwareConcurrency", (4|6|8|12|16)\);/);
          fpSamples.add(fp);

          const jr = applyWindowRectAccountJitter({ x: 0, y: 0, width: 960, height: 520 });
          expect(jr.width).toBeGreaterThanOrEqual(380);
          expect(jr.height).toBeGreaterThanOrEqual(420);
          rectSamples.add(`${jr.x},${jr.y},${jr.width},${jr.height}`);
        }
        expect(fpSamples.size).toBeGreaterThan(1);
        expect(rectSamples.size).toBeGreaterThan(1);
      } finally {
        bridge.close();
        mockUpstream.close();
      }
    });

    it('preserves browser HTTP cache when prepareWorkerProfileDir cleans cookies with preserveCache=true and serves v1.3.1 data-saver userscript', async () => {
      const profileDir = BrowserAssistService.prepareWorkerProfileDir('CHROME', 9, true, false);
      const cacheDir = path.join(profileDir, 'Default', 'Cache');
      const cookiesFile = path.join(profileDir, 'Default', 'Cookies');
      const extIdbDir = path.join(
        profileDir,
        'Default',
        'IndexedDB',
        'chrome-extension_jinjaccalgkegednnccohejagnlnfdag_0.indexeddb.leveldb'
      );
      const siteIdbDir = path.join(
        profileDir,
        'Default',
        'IndexedDB',
        'https_www.roblox.com_0.indexeddb.leveldb'
      );
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.mkdirSync(extIdbDir, { recursive: true });
        fs.mkdirSync(siteIdbDir, { recursive: true });
        fs.writeFileSync(path.join(cacheDir, 'data_0'), 'cached-rbx-js-bundle');
        fs.writeFileSync(path.join(extIdbDir, '000003.log'), 'vm-script-storage');
        fs.writeFileSync(path.join(siteIdbDir, '000003.log'), 'rbx-site-idb');
        fs.writeFileSync(cookiesFile, 'stale-cookie-bytes');

        BrowserAssistService.prepareWorkerProfileDir('CHROME', 9, true, true);
        expect(fs.existsSync(path.join(cacheDir, 'data_0'))).toBe(true);
        expect(fs.existsSync(path.join(extIdbDir, '000003.log'))).toBe(true);
        expect(fs.existsSync(siteIdbDir)).toBe(false);
        expect(fs.existsSync(cookiesFile)).toBe(false);
      } finally {
        fs.rmSync(profileDir, { recursive: true, force: true });
      }

      const app = createApp();
      const directScript = buildManualUserscriptSource();
      expect(directScript).toContain('/(?:^|;\\s*)_px3=/');
      expect(directScript).not.toContain('/(?:^|;s*)_px3=/');

      const res = await request(app)
        .get('/api/v1/registration/rage-autofill.user.js')
        .set('Host', '127.0.0.1:4000');
      expect(res.status).toBe(200);
      expect(res.text).toContain('1.4.0');
      expect(res.text).toContain('document-start');
      expect(res.text).toContain('window.stop()');
      expect(res.text).not.toContain('rw=');
      expect(res.text).toContain('/(?:^|;\\s*)_px3=/');
      expect(res.text).not.toContain('/(?:^|;s*)_px3=/');
      // Pastikan skrip autofill & userscript valid secara sintaksis
      expect(() => new Function(`return (${ROBLOX_SIGNUP_AUTOFILL_BROWSER_FN})`)).not.toThrow();
      expect(() => new Function('GM_xmlhttpRequest', res.text)).not.toThrow();
    });

    it('prevents cross-worker autofill leak when Worker #1 finishes before Worker #2 and binds loopback worker cookie in SQLite', async () => {
      const app = createApp();
      const tmpProf = fs.mkdtempSync(path.join(os.tmpdir(), 'rage-ff-wcookie-'));
      try {
        const dbFile = new DatabaseSync(path.join(tmpProf, 'cookies.sqlite'));
        dbFile.exec(
          `PRAGMA user_version = 17;
          CREATE TABLE moz_cookies (
            id INTEGER PRIMARY KEY,
            originAttributes TEXT NOT NULL DEFAULT '',
            name TEXT,
            value TEXT,
            host TEXT,
            path TEXT,
            expiry INTEGER,
            lastAccessed INTEGER,
            creationTime INTEGER,
            isSecure INTEGER,
            isHttpOnly INTEGER,
            inBrowserElement INTEGER DEFAULT 0,
            sameSite INTEGER DEFAULT 0,
            schemeMap INTEGER DEFAULT 0
          );`
        );
        dbFile.close();

        expect(setWorkerLoopbackCookieInSqlite(tmpProf, 2)).toBe(true);
        const verifyDb = new DatabaseSync(path.join(tmpProf, 'cookies.sqlite'));
        const rows = verifyDb
          .prepare('SELECT host, name, value, expiry FROM moz_cookies ORDER BY host ASC')
          .all() as Array<{ host: string; name: string; value: string; expiry: number }>;
        verifyDb.close();
        expect(rows.map(({ host, name, value }) => ({ host, name, value }))).toEqual([
          { host: '127.0.0.1', name: 'rage_worker_id', value: '2' },
          { host: 'localhost', name: 'rage_worker_id', value: '2' },
        ]);
        // Pastikan expiry ditulis dalam milidetik (> 20 hari ke depan dari epoch ms), bukan detik
        const minExpiryMs = Date.now() + 20 * 86400 * 1000;
        for (const row of rows) {
          expect(row.expiry).toBeGreaterThan(minExpiryMs);
        }
      } finally {
        fs.rmSync(tmpProf, { recursive: true, force: true });
      }

      // Simulasi bug yang dilaporkan: Worker #1 sudah selesai, sementara Worker #2 masih mengerjakan "dimsongkang1"
      const targetsMap = (BrowserAssistService as any).activeAutofillTargets as Map<number, any>;
      const batchStateRef = (BrowserAssistService as any).batchState;
      const origWorkers = batchStateRef.workers;
      try {
        batchStateRef.workers = [{ workerId: 1 }, { workerId: 2 }];
        targetsMap.clear();
        targetsMap.set(2, {
          workerId: 2,
          candidateId: 'cand-w2',
          username: 'dimsongkang1',
          password: 'Password!1234',
          birthMonth: 'Jan',
          birthDay: '02',
          birthYear: '2001',
          gender: 'MALE',
        });

        // 1) Worker #1 meminta ?workerId=1 -> HARUS null, tidak boleh ikut mengerjakan dimsongkang1
        const w1Res = await request(app)
          .get('/api/v1/registration/manual-autofill-json?workerId=1')
          .set('Host', '127.0.0.1:4000');
        expect(w1Res.status).toBe(200);
        expect(w1Res.body.data).toBeNull();

        // 2) Request tanpa workerId & tanpa cookie saat multi-worker -> HARUS ditolak (MISSING_WORKER_ID), tidak bocor ke dimsongkang1
        const noIdRes = await request(app)
          .get('/api/v1/registration/manual-autofill-json')
          .set('Host', '127.0.0.1:4000');
        expect(noIdRes.status).toBe(200);
        expect(noIdRes.body.data).toBeNull();
        expect(noIdRes.body.errorCode).toBe('MISSING_WORKER_ID');

        // 3) Request tanpa query workerId tetapi membawa cookie loopback rage_worker_id=2 -> tetap akurat ke Worker #2
        const cookieRes = await request(app)
          .get('/api/v1/registration/manual-autofill-json')
          .set('Host', '127.0.0.1:4000')
          .set('Cookie', 'rage_worker_id=2');
        expect(cookieRes.status).toBe(200);
        expect(cookieRes.body.data?.username).toBe('dimsongkang1');
        expect(cookieRes.body.data?.workerId).toBe(2);

        // 4) Bookmarklet bridge tanpa workerId saat multi-worker -> aman (tidak bocor), dengan cookie -> isi dimsongkang1
        const bridgeNoId = await request(app)
          .get('/api/v1/registration/manual-autofill-bridge?origin=https://www.roblox.com')
          .set('Host', '127.0.0.1:4000');
        expect(bridgeNoId.status).toBe(200);
        expect(bridgeNoId.text).not.toContain('dimsongkang1');

        const bridgeWithCookie = await request(app)
          .get('/api/v1/registration/manual-autofill-bridge?origin=https://www.roblox.com')
          .set('Host', '127.0.0.1:4000')
          .set('Cookie', 'rage_worker_id=2');
        expect(bridgeWithCookie.status).toBe(200);
        expect(bridgeWithCookie.text).toContain('dimsongkang1');
      } finally {
        targetsMap.clear();
        batchStateRef.workers = origWorkers;
      }
    });

    it('computes responsive split-screen worker window tiles and patches Firefox xulstore.json cleanly', () => {
      const workArea = { x: 0, y: 0, width: 1920, height: 1040 };

      expect(computeGridDimensions(1, 'AUTO')).toBeNull();
      expect(computeWorkerWindowRect({ workerId: 1, totalWorkers: 1, workingArea: workArea })).toBeNull();

      expect(computeGridDimensions(2, 'AUTO')).toEqual({ cols: 2, rows: 1 });
      expect(computeGridDimensions(3, 'AUTO')).toEqual({ cols: 3, rows: 1 });
      expect(computeGridDimensions(3, 'GRID')).toEqual({ cols: 2, rows: 2 });
      expect(computeGridDimensions(4, 'AUTO')).toEqual({ cols: 2, rows: 2 });
      expect(computeGridDimensions(5, 'AUTO')).toEqual({ cols: 3, rows: 2 });

      expect(computeWorkerWindowRect({ workerId: 1, totalWorkers: 2, workingArea: workArea })).toEqual({
        x: 0,
        y: 0,
        width: 960,
        height: 1040,
      });
      expect(computeWorkerWindowRect({ workerId: 2, totalWorkers: 2, workingArea: workArea })).toEqual({
        x: 960,
        y: 0,
        width: 960,
        height: 1040,
      });
      expect(computeWorkerWindowRect({ workerId: 4, totalWorkers: 4, workingArea: workArea })).toEqual({
        x: 960,
        y: 520,
        width: 960,
        height: 520,
      });

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rage-xul-'));
      try {
        const xulPath = path.join(tmpDir, 'xulstore.json');
        fs.writeFileSync(
          xulPath,
          JSON.stringify({
            'chrome://browser/content/browser.xhtml': {
              'main-window': { sizemode: 'maximized', screenX: '0', screenY: '0', width: '1920', height: '1080' },
            },
            'chrome://browser/content/places/places.xhtml': { places: { width: '800' } },
          })
        );

        patchFirefoxXulstoreRect(tmpDir, { x: 960, y: 0, width: 960, height: 1040 });
        const updated = JSON.parse(fs.readFileSync(xulPath, 'utf8'));
        expect(updated['chrome://browser/content/browser.xhtml']['main-window']).toEqual({
          sizemode: 'normal',
          screenX: '960',
          screenY: '0',
          width: '960',
          height: '1040',
        });
        expect(updated['chrome://browser/content/places/places.xhtml']).toEqual({ places: { width: '800' } });
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('replaces timed-out or failed candidates with fresh username and password while marking old candidate FAILED', async () => {
      const job = JobManager.createJob({
        name: 'Timeout-Replacement-Test',
        generationConfig: {
          quantity: 1,
          prefix: 'dm',
          length: 10,
          passwordPrefix: 'PassKu',
          passwordLength: 16,
          includeSymbols: true,
        },
        autoStart: false,
      });
      await JobManager.processJob(job.id);
      const fullJob = JobManager.getJobById(job.id, true)!;
      const oldCand = fullJob.candidates![0];

      const replacement = BrowserAssistService.createReplacementCandidate({
        failedCandidateId: oldCand.id,
        reason: 'Worker #1: Batas waktu 120 detik habis',
        jobId: job.id,
        usernamePrefix: 'dm',
        usernameLength: 10,
        passwordPrefix: 'PassKu',
        passwordLength: 16,
        performedById: null,
      });

      const oldUpdated = GeneratorService.getCandidateById(oldCand.id)!;
      expect(oldUpdated.registrationState).toBe('FAILED');
      expect(oldUpdated.lastError).toContain('120 detik');

      expect(replacement.id).not.toBe(oldCand.id);
      expect(replacement.candidateUsername).not.toBe(oldCand.candidateUsername);
      expect(replacement.candidateUsername.startsWith('dm')).toBe(true);
      expect(replacement.candidateUsername.length).toBe(10);
      expect(replacement.registrationState).toBe('VERIFICATION_REQUIRED');

      const newSecret = CredentialVault.retrieveSecretPayload(replacement.credentialId!).password;
      expect(newSecret.startsWith('PassKu')).toBe(true);
      expect(newSecret.length).toBe(16);

      const jobAfter = JobManager.getJobById(job.id)!;
      expect(jobAfter.totalCount).toBe(2);
      expect(jobAfter.failedCount).toBe(1);
      expect(jobAfter.verificationRequiredCount).toBe(1);

      // Pastikan batch > 100 akun tidak terpotong di 100 kandidat pada JobManager.getJobById
      const largeJob = JobManager.createJob({
        name: 'Large-Batch-250-Test',
        generationConfig: {
          quantity: 250,
          prefix: 'lg',
          length: 12,
          passwordPrefix: 'PassKu',
          passwordLength: 16,
          includeSymbols: true,
        },
        autoStart: false,
      });
      await JobManager.processJob(largeJob.id);
      const largeJobFull = JobManager.getJobById(largeJob.id, true)!;
      expect(largeJobFull.candidates?.length).toBe(250);
    });

    it('parses curl -x proxy strings, expands sticky port ranges, and encrypts/decrypts proxy-config in database', async () => {
      const parsed = BrowserAssistService.parseProxyString(
        'curl -x "http://demoUser:demoPass@gw.example.net:10000" https://api.ipify.org/'
      );
      expect(parsed).toEqual({
        server: 'http://gw.example.net:10000',
        username: 'demoUser',
        password: 'demoPass',
        display: 'gw.example.net:10000 (auth)',
      });

      const expanded = BrowserAssistService.expandProxyLines([
        'curl -x "http://demoUser:demoPass@gw.example.net:10000-10002" https://api.ipify.org/',
      ]);
      expect(expanded).toEqual([
        'http://demoUser:demoPass@gw.example.net:10000',
        'http://demoUser:demoPass@gw.example.net:10001',
        'http://demoUser:demoPass@gw.example.net:10002',
      ]);

      const app = createApp();
      const loginRes = await request(app).post('/api/v1/auth/login').send({
        username: 'admin',
        password: process.env.ADMIN_SEED_PASSWORD || 'Admin@RobloxEngine2026!',
      });
      const csrf = loginRes.body.data.csrfToken;
      const cookieHeader = (loginRes.headers['set-cookie'] as unknown as string[])
        .map((c) => c.split(';')[0])
        .join('; ');

      const saveRes = await request(app)
        .post('/api/v1/registration/proxy-config')
        .set('Cookie', cookieHeader)
        .set('X-CSRF-Token', csrf)
        .send({ useProxy: true, proxyText: expanded.join('\n') });
      expect(saveRes.status).toBe(200);
      expect(saveRes.body.data.configured).toBe(true);

      const getRes = await request(app)
        .get('/api/v1/registration/proxy-config')
        .set('Cookie', cookieHeader);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.useProxy).toBe(true);
      expect(getRes.body.data.proxyText).toBe(expanded.join('\n'));
    });

    it('allocates a distinct unique sticky session per account for DataImpulse and template proxies', () => {
      const baseDi = BrowserAssistService.parseProxyString(
        'http://demoUser__cr.th;sessid.old1:demoPass@gw.dataimpulse.com:10000'
      )!;
      const alloc1 = BrowserAssistService.allocateUniqueStickyProxy(baseDi, 1, 1);
      const alloc2 = BrowserAssistService.allocateUniqueStickyProxy(baseDi, 2, 2);
      const alloc25 = BrowserAssistService.allocateUniqueStickyProxy(baseDi, 25, 1);

      expect(alloc1.isDynamicSession).toBe(true);
      expect(alloc1.proxy.server).toBe('http://gw.dataimpulse.com:823');
      expect(alloc2.proxy.server).toBe('http://gw.dataimpulse.com:823');
      expect(alloc1.proxy.username).toMatch(/^demoUser__cr\.th;sessid\.rg1a1[0-9a-f]{4}$/);
      expect(alloc2.proxy.username).toMatch(/^demoUser__cr\.th;sessid\.rg2a2[0-9a-f]{4}$/);
      expect(alloc25.proxy.username).toMatch(/^demoUser__cr\.th;sessid\.rg1a25[0-9a-f]{4}$/);
      expect(new Set([alloc1.proxy.username, alloc2.proxy.username, alloc25.proxy.username]).size).toBe(3);

      // Pastikan endpoint IP DataImpulse (seperti 74.81.81.81 / username __cr.*) juga mendapat ;sessid unik di port 823
      const baseIpDi = BrowserAssistService.parseProxyString(
        'curl -x "http://demoUser__cr.sa:demoPass@74.81.81.81:10000" https://api.ipify.org/'
      )!;
      const ipAlloc1 = BrowserAssistService.allocateUniqueStickyProxy(baseIpDi, 1, 1);
      const ipAlloc2 = BrowserAssistService.allocateUniqueStickyProxy(baseIpDi, 2, 2);
      expect(ipAlloc1.isDynamicSession).toBe(true);
      expect(ipAlloc1.proxy.server).toBe('http://74.81.81.81:823');
      expect(ipAlloc2.proxy.server).toBe('http://74.81.81.81:823');
      expect(ipAlloc1.proxy.username).toMatch(/^demoUser__cr\.sa;sessid\.rg1a1[0-9a-f]{4}$/);
      expect(ipAlloc2.proxy.username).toMatch(/^demoUser__cr\.sa;sessid\.rg2a2[0-9a-f]{4}$/);

      const tpl = BrowserAssistService.parseProxyString(
        'http://user-{SESSION}:pass@proxy.custom.net:9000'
      )!;
      const tplAlloc = BrowserAssistService.allocateUniqueStickyProxy(tpl, 4, 2);
      expect(tplAlloc.isDynamicSession).toBe(true);
      expect(tplAlloc.proxy.username).toMatch(/^user-rg2a4[0-9a-f]{4}$/);

      const staticProxy = BrowserAssistService.parseProxyString('198.51.100.10:8080')!;
      const staticAlloc = BrowserAssistService.allocateUniqueStickyProxy(staticProxy, 1, 1);
      expect(staticAlloc.isDynamicSession).toBe(false);
      expect(staticAlloc.proxy.server).toBe('http://198.51.100.10:8080');
    });

    it('auto-rotates dead DataImpulse sticky session on 503 NO_RAY in LocalProxyBridge so browser never loses connection', async () => {
      const seenUsernames: string[] = [];
      const mockUpstream = net.createServer((sock) => {
        sock.once('data', (chunk) => {
          const raw = chunk.toString('latin1');
          const authMatch = raw.match(/Proxy-Authorization:\s*Basic\s+([A-Za-z0-9+/=]+)/i);
          const decoded = authMatch ? Buffer.from(authMatch[1], 'base64').toString('utf8') : '';
          const user = decoded.split(':')[0] || '';
          seenUsernames.push(user);

          if (seenUsernames.length <= 5) {
            sock.end('HTTP/1.1 503 NO_RAY\r\nContent-Length: 0\r\n\r\n');
          } else {
            sock.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            sock.on('data', (d) => sock.write(d));
          }
        });
      });
      await new Promise<void>((resolve) => mockUpstream.listen(0, '127.0.0.1', resolve));
      const upPort = (mockUpstream.address() as net.AddressInfo).port;

      const bridge = await LocalProxyBridge.start({
        server: `http://127.0.0.1:${upPort}`,
        username: '7111f2ad64fd156330de__cr.sa;sessid.rg1a20dead',
        password: 'demoPass',
      });

      try {
        // Simulasikan 2 request paralel di awal pembukaan tab sebelum sessionPinned = true
        const sendConnect = () =>
          new Promise<string>((resolve, reject) => {
            const c = net.connect(bridge.port, '127.0.0.1');
            c.once('connect', () => {
              c.write('CONNECT www.roblox.com:443 HTTP/1.1\r\nHost: www.roblox.com:443\r\n\r\n');
            });
            c.once('data', (d) => {
              c.destroy();
              resolve(d.toString('latin1'));
            });
            c.once('error', reject);
          });

        const [resp1, resp2] = await Promise.all([sendConnect(), sendConnect()]);

        expect(resp1).toContain('200 Connection Established');
        expect(resp2).toContain('200 Connection Established');
        expect(resp1).not.toContain('503 NO_RAY');
        expect(seenUsernames.length).toBe(7);
        expect(seenUsernames[0]).toBe('7111f2ad64fd156330de__cr.sa;sessid.rg1a20dead');
        expect(seenUsernames[1]).toMatch(/^7111f2ad64fd156330de__cr\.sa;sessid\./);
        expect(seenUsernames[2]).toMatch(/^7111f2ad64fd156330de__cr\.sa;sessid\./);
        // Pada percobaan ke-4..6 (termasuk attempt >= 4), WAJIB tetap mempertahankan ;sessid.<token> unik agar tidak jatuh ke rotating proxy
        expect(seenUsernames[3]).toMatch(/^7111f2ad64fd156330de__cr\.id;sessid\./);
        expect(seenUsernames[4]).toMatch(/^7111f2ad64fd156330de__cr\.[a-z]{2};sessid\./);
        expect(seenUsernames[5]).toMatch(/^7111f2ad64fd156330de__cr\.[a-z]{2};sessid\./);
        // Request paralel kedua harus memakai token sticky ter-pin yang persis sama dengan pemenang pertama
        expect(seenUsernames[6]).toBe(seenUsernames[5]);
        expect(new Set(seenUsernames.slice(0, 6)).size).toBe(6);
      } finally {
        bridge.close();
        mockUpstream.close();
      }
    });

    it('creates a sanitized Master Warm Profile (preserving other history/cookies/extensions, wiping Roblox) and fast-resets workers on close & reopen', () => {
      const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'rage-master-warm-'));
      try {
        const srcProfile = path.join(tmpBase, 'source.default-release');
        const workersRoot = path.join(tmpBase, 'worker_profiles');
        fs.mkdirSync(path.join(srcProfile, 'extensions'), { recursive: true });
        fs.mkdirSync(path.join(srcProfile, 'storage', 'default', 'moz-extension+++vm123'), {
          recursive: true,
        });
        fs.mkdirSync(path.join(srcProfile, 'storage', 'default', 'https+++www.roblox.com', 'ls'), {
          recursive: true,
        });
        fs.writeFileSync(path.join(srcProfile, 'extensions', 'vm.xpi'), 'vm-bytes');
        fs.writeFileSync(
          path.join(srcProfile, 'storage', 'default', 'moz-extension+++vm123', 'idb.sqlite'),
          'vm-idb'
        );
        fs.writeFileSync(
          path.join(srcProfile, 'prefs.js'),
          'user_pref("network.proxy.type", 1);\nuser_pref("network.proxy.http", "1.2.3.4");\nuser_pref("browser.startup.homepage", "https://www.google.com");\n'
        );
        fs.writeFileSync(path.join(srcProfile, 'sessionstore.jsonlz4'), 'old-tab-state');

        const cdb = new DatabaseSync(path.join(srcProfile, 'cookies.sqlite'));
        cdb.exec(
          'CREATE TABLE moz_cookies (id INTEGER PRIMARY KEY, originAttributes TEXT NOT NULL DEFAULT \'\', name TEXT, value TEXT, host TEXT, lastAccessed INTEGER);'
        );
        cdb
          .prepare('INSERT INTO moz_cookies (name, value, host, lastAccessed) VALUES (?, ?, ?, ?)')
          .run('.ROBLOSECURITY', 'secret_rbx_token_1234567890123456', '.roblox.com', 100);
        cdb
          .prepare('INSERT INTO moz_cookies (name, value, host, lastAccessed) VALUES (?, ?, ?, ?)')
          .run('__cf_bm', 'ark_cf_token', '.arkoselabs.com', 100);
        cdb
          .prepare('INSERT INTO moz_cookies (name, value, host, lastAccessed) VALUES (?, ?, ?, ?)')
          .run('PREF', 'yt_keep_me', '.youtube.com', 100);
        cdb
          .prepare('INSERT INTO moz_cookies (name, value, host, lastAccessed) VALUES (?, ?, ?, ?)')
          .run('NID', 'google_keep_me', '.google.com', 100);
        cdb.close();

        const pdb = new DatabaseSync(path.join(srcProfile, 'places.sqlite'));
        pdb.exec(`
          CREATE TABLE moz_origins (id INTEGER PRIMARY KEY, prefix TEXT, host TEXT, frecency INTEGER);
          CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT, origin_id INTEGER);
          CREATE TABLE moz_historyvisits (id INTEGER PRIMARY KEY, place_id INTEGER, visit_date INTEGER);
        `);
        pdb.prepare('INSERT INTO moz_origins (id, prefix, host, frecency) VALUES (1, ?, ?, 10)').run('https://', 'www.roblox.com');
        pdb.prepare('INSERT INTO moz_origins (id, prefix, host, frecency) VALUES (2, ?, ?, 10)').run('https://', 'www.youtube.com');
        pdb.prepare('INSERT INTO moz_places (id, url, origin_id) VALUES (1, ?, 1)').run('https://www.roblox.com/CreateAccount');
        pdb.prepare('INSERT INTO moz_places (id, url, origin_id) VALUES (2, ?, 1)').run('https://js.rbxcdn.com/main.js');
        pdb.prepare('INSERT INTO moz_places (id, url, origin_id) VALUES (3, ?, 2)').run('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        pdb.prepare('INSERT INTO moz_places (id, url, origin_id) VALUES (4, ?, 2)').run('https://github.com/explore');
        pdb.prepare('INSERT INTO moz_historyvisits (place_id, visit_date) VALUES (1, 1000), (3, 1000)').run();
        pdb.close();

        // 1. Buat & sterilkan Master Profile
        const masterStatus = createOrSyncMasterFirefoxProfile({
          sourceProfilePath: srcProfile,
          profilesRootDir: workersRoot,
        });
        expect(masterStatus.exists).toBe(true);
        expect(masterStatus.robloxCookiesCount).toBe(0);
        expect(masterStatus.robloxPlacesCount).toBe(0);
        expect(masterStatus.nonRobloxCookiesCount).toBe(2);
        expect(masterStatus.nonRobloxPlacesCount).toBe(2);
        expect(masterStatus.extensionCount).toBe(1);
        expect(fs.existsSync(path.join(masterStatus.masterProfileDir, 'sessionstore.jsonlz4'))).toBe(false);
        expect(fs.readFileSync(path.join(masterStatus.masterProfileDir, 'prefs.js'), 'utf8')).not.toContain(
          'network.proxy.http'
        );
        expect(getMasterFirefoxProfileStatus(workersRoot).exists).toBe(true);

        // 2. Worker #1 clone pertama kali dari Master
        const run1 = prepareMainFirefoxProfileForWorker({
          workerId: 1,
          profilesRootDir: workersRoot,
          useMasterProfile: true,
          fastReset: true,
        });
        expect(run1.mode).toBe('SYNCED_MAIN');
        expect(run1.usedMasterProfile).toBe(true);
        expect(run1.fastResetApplied).toBe(false);

        // Simulasi Akun 1 menuliskan sesi Roblox, storage & cache2 di Worker #1
        const wCdb = new DatabaseSync(path.join(run1.profileDir, 'cookies.sqlite'));
        wCdb
          .prepare('INSERT INTO moz_cookies (name, value, host, lastAccessed) VALUES (?, ?, ?, ?)')
          .run('.ROBLOSECURITY', 'account1_dirty_cookie_12345678901234', '.roblox.com', 999);
        wCdb.close();
        fs.mkdirSync(path.join(run1.profileDir, 'storage', 'default', 'https+++www.roblox.com'), {
          recursive: true,
        });
        fs.mkdirSync(path.join(run1.profileDir, 'cache2', 'entries'), { recursive: true });
        fs.writeFileSync(path.join(run1.profileDir, 'cache2', 'entries', 'cached_js'), 'js-ok');

        // 3. Close & buka lagi Worker #1 untuk Akun 2 -> fast reset balik ke Master
        const run2 = prepareMainFirefoxProfileForWorker({
          workerId: 1,
          profilesRootDir: workersRoot,
          useMasterProfile: true,
          fastReset: true,
        });
        expect(run2.usedMasterProfile).toBe(true);
        expect(run2.fastResetApplied).toBe(true);

        // Verifikasi cookie & storage Roblox hilang, history web lain & ekstensi & cache2 tetap ada!
        const w2Cdb = new DatabaseSync(path.join(run2.profileDir, 'cookies.sqlite'));
        const w2Cookies = w2Cdb.prepare('SELECT host FROM moz_cookies ORDER BY host').all() as Array<{ host: string }>;
        w2Cdb.close();
        expect(w2Cookies.map((c) => c.host)).toEqual(['.google.com', '.youtube.com']);

        const w2Pdb = new DatabaseSync(path.join(run2.profileDir, 'places.sqlite'));
        const w2Places = w2Pdb.prepare('SELECT url FROM moz_places ORDER BY url').all() as Array<{ url: string }>;
        w2Pdb.close();
        expect(w2Places.map((p) => p.url)).toEqual([
          'https://github.com/explore',
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        ]);

        expect(fs.existsSync(path.join(run2.profileDir, 'storage', 'default', 'https+++www.roblox.com'))).toBe(false);
        expect(fs.existsSync(path.join(run2.profileDir, 'storage', 'default', 'moz-extension+++vm123', 'idb.sqlite'))).toBe(true);
        expect(fs.existsSync(path.join(run2.profileDir, 'cache2', 'entries', 'cached_js'))).toBe(true);
        expect(clearRobloxPlacesHistoryInSqlite(run2.profileDir)).toBe(0);
      } finally {
        fs.rmSync(tmpBase, { recursive: true, force: true });
      }
    }, 15000);

    it('recovers from inappropriate username, transient Continue disable, and invisible Step 2 CSS grid trap in V2 & V1 autofill', async () => {
      // 1. Pastikan generator menghasilkan username humanized yang mudah dibaca, bebas substring terlarang,
      //    dan tetap menampung ribuan variasi unik meski panjang pengisian hanya 6 karakter
      const uniqueHuman = new Set<string>();
      for (let i = 0; i < 400; i++) {
        const u = GeneratorService.buildCandidateString('soknje', '', 12);
        expect(u).toHaveLength(12);
        expect(u.startsWith('soknje')).toBe(true);
        expect(u.toLowerCase()).not.toMatch(/fuk|fuck|vag|b4ll|ball|shit|porn|sex|cunt|slut/);
        // Pastikan segmen humanized tidak mengacak digit di tengah huruf (hanya di akhir bila ada angka)
        expect(u.slice(6)).toMatch(/^[A-Za-z]+\d*$/);
        uniqueHuman.add(u.toLowerCase());
      }
      expect(uniqueHuman.size).toBeGreaterThan(390);

      // 2. Simulasikan DOM V2 dengan:
      //    - panel Step 2 memakai class `invisible` + `aria-hidden="true"` sejak awal
      //    - username awal `soknjehIFukL` ditolak Roblox (`aria-invalid="true"` + "Username not appropriate for Roblox.")
      //    - setelah username dimutasi autofill, tombol Continue aktif namun sempat flash disabled saat klik pertama
      //    - cookie `_px3` muncul setelah `; ` untuk menguji regex `/(?:^|;\s*)_px3=/`
      const origWindow = (globalThis as any).window;
      const origDocument = (globalThis as any).document;
      const origEvent = (globalThis as any).Event;
      const origKeyboardEvent = (globalThis as any).KeyboardEvent;
      const origHtmlInput = (globalThis as any).HTMLInputElement;
      const origHtmlSelect = (globalThis as any).HTMLSelectElement;

      class MockEvent {
        type: string;
        constructor(type: string) {
          this.type = type;
        }
      }
      class MockInput {
        value = '';
        attrs: Record<string, string> = {};
        listeners: Record<string, Array<() => void>> = {};
        _valueTracker = { setValue: () => {} };
        focus() {}
        getAttribute(k: string) {
          return this.attrs[k] ?? null;
        }
        setAttribute(k: string, v: string) {
          this.attrs[k] = v;
        }
        closest() {
          return null;
        }
        addEventListener(t: string, cb: () => void) {
          this.listeners[t] = this.listeners[t] || [];
          this.listeners[t].push(cb);
        }
        dispatchEvent(ev: { type: string }) {
          for (const cb of this.listeners[ev.type] || []) cb();
          return true;
        }
      }
      class MockSelect extends MockInput {
        options: Array<{ value: string }> = [];
      }

      const setupMockDom = (mode: 'V2_MUTATE_FLASH' | 'V1_SIGNUP') => {
        const monthSel = new MockSelect();
        monthSel.options = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((v) => ({ value: v }));
        const daySel = new MockSelect();
        daySel.options = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1).padStart(2, '0') }));
        const yearSel = new MockSelect();
        yearSel.options = [{ value: '2000' }, { value: '2001' }];

        const userInput = new MockInput();
        const passInput = new MockInput();
        const maleBtn = { textContent: 'Male', disabled: false, clicked: 0, click() { this.clicked++; } };
        const femaleBtn = { textContent: 'Female', disabled: false, clicked: 0, click() { this.clicked++; } };

        const panel2Classes = new Set<string>(['self-start', 'invisible']);
        const panel2 = {
          classList: { contains: (c: string) => panel2Classes.has(c) },
          ariaHidden: 'true',
          innerText: '',
          getAttribute(k: string) {
            return k === 'aria-hidden' ? this.ariaHidden : null;
          },
          querySelectorAll() {
            return [addPassBtn];
          },
        };
        const panel1 = { innerText: 'Birthday *\nUsername *\nIs not already in use' };

        let contClickCount = 0;
        let submitClickCount = 0;
        let flashDone = false;

        const contBtn: any = {
          disabled: true,
          textContent: 'Continue',
          focus() {},
          scrollIntoView() {},
          form: null,
          click() {
            contClickCount++;
            panel2Classes.delete('invisible');
            panel2.ariaHidden = 'false';
          },
        };
        const addPassBtn: any = {
          disabled: true,
          textContent: 'Add password',
          focus() {},
          scrollIntoView() {},
          form: null,
          click() {
            submitClickCount++;
            this.disabled = true;
          },
        };
        const v1SignupBtn: any = {
          disabled: true,
          textContent: 'Sign Up',
          focus() {},
          scrollIntoView() {},
          form: null,
          click() {
            submitClickCount++;
            this.disabled = true;
          },
        };

        if (mode === 'V2_MUTATE_FLASH') {
          userInput.addEventListener('input', () => {
            if (userInput.value === 'soknjehIFukL') {
              userInput.setAttribute('aria-invalid', 'true');
              panel1.innerText = 'Birthday *\nUsername *\nUsername not appropriate for Roblox.';
              contBtn.disabled = true;
            } else if (userInput.value.length >= 6) {
              userInput.setAttribute('aria-invalid', 'false');
              panel1.innerText = 'Birthday *\nUsername *\nIs not already in use';
              contBtn.disabled = false;
              if (!flashDone) {
                flashDone = true;
                // Simulasi tombol sempat disabled sesaat selama jeda klik, lalu aktif lagi
                setTimeout(() => {
                  contBtn.disabled = true;
                  setTimeout(() => {
                    contBtn.disabled = false;
                  }, 250);
                }, 80);
              }
            }
          });
          passInput.addEventListener('input', () => {
            // Password hanya boleh mengaktifkan Add password bila Step 2 sudah visible
            if (!panel2.classList.contains('invisible') && passInput.value.length >= 8) {
              addPassBtn.disabled = false;
            }
          });
        } else {
          userInput.addEventListener('input', () => {
            if (userInput.value.length >= 6 && passInput.value.length >= 8) {
              v1SignupBtn.disabled = false;
            }
          });
          passInput.addEventListener('input', () => {
            if (userInput.value.length >= 6 && passInput.value.length >= 8) {
              v1SignupBtn.disabled = false;
            }
          });
        }

        const mockDoc: any = {
          cookie: '_pxvid=abc123; _px3=real_token_1',
          body: { innerText: '' },
          querySelectorAll(sel: string) {
            if (sel === 'select') return [monthSel, daySel, yearSel];
            if (sel === 'button') {
              return mode === 'V2_MUTATE_FLASH'
                ? [maleBtn, femaleBtn, contBtn, addPassBtn]
                : [maleBtn, femaleBtn, v1SignupBtn];
            }
            return [];
          },
          querySelector(sel: string) {
            if (sel.includes('#signup-username')) return userInput;
            if (sel.includes('signup-v2-add-auth-method-panel')) return mode === 'V2_MUTATE_FLASH' ? panel2 : null;
            if (sel.includes('signup-v2-form-panel')) return mode === 'V2_MUTATE_FLASH' ? panel1 : null;
            if (sel.includes('button[aria-label="Continue"]')) return mode === 'V2_MUTATE_FLASH' ? contBtn : null;
            if (sel.includes('button[aria-label="Add password"]')) return mode === 'V2_MUTATE_FLASH' ? addPassBtn : null;
            if (sel.includes('#signup-v2-password')) return mode === 'V2_MUTATE_FLASH' ? passInput : null;
            if (sel.includes('#signup-password')) return mode === 'V1_SIGNUP' ? passInput : null;
            if (sel.includes('#signup-button')) return mode === 'V1_SIGNUP' ? v1SignupBtn : null;
            return null;
          },
        };

        (globalThis as any).HTMLInputElement = MockInput;
        (globalThis as any).HTMLSelectElement = MockSelect;
        (globalThis as any).Event = MockEvent;
        (globalThis as any).KeyboardEvent = MockEvent;
        (globalThis as any).document = mockDoc;
        (globalThis as any).window = {
          HTMLInputElement: MockInput,
          HTMLSelectElement: MockSelect,
          innerWidth: 1000,
          getComputedStyle: () => ({ visibility: 'visible', display: 'block' }),
        };

        return {
          userInput,
          passInput,
          getCounts: () => ({ contClickCount, submitClickCount, finalUser: userInput.value }),
        };
      };

      try {
        const fn = new Function(`return (${ROBLOX_SIGNUP_AUTOFILL_BROWSER_FN})`)() as (d: any) => Promise<any>;

        // Kasus 1: V2 dengan username inappropriate + Continue flash disabled + Step 2 CSS Grid invisible trap
        const v2 = setupMockDom('V2_MUTATE_FLASH');
        const v2Res = await fn({
          birthMonth: 'Jan',
          birthDay: '15',
          birthYear: '2001',
          username: 'soknjehIFukL',
          gender: 'MALE',
          password: 'asKf73%^!HK!',
        });
        expect(v2Res.ok).toBe(true);
        expect(v2Res.continueClicked).toBe(true);
        expect(v2Res.passwordFilled).toBe(true);
        expect(v2Res.submitClicked).toBe(true);
        expect(v2.getCounts().finalUser).not.toBe('soknjehIFukL');
        expect(v2.getCounts().contClickCount).toBe(1);
        expect(v2.getCounts().submitClickCount).toBe(1);

        // Kasus 2: V1 dengan tombol #signup-button ("Sign Up")
        const v1 = setupMockDom('V1_SIGNUP');
        const v1Res = await fn({
          birthMonth: 'Jan',
          birthDay: '15',
          birthYear: '2001',
          username: 'soknjeValid99',
          gender: 'FEMALE',
          password: 'asKf73%^!HK!',
        });
        expect(v1Res.ok).toBe(true);
        expect(v1Res.continueClicked).toBe(false);
        expect(v1Res.passwordFilled).toBe(true);
        expect(v1Res.submitClicked).toBe(true);
        expect(v1.getCounts().submitClickCount).toBe(1);
      } finally {
        (globalThis as any).window = origWindow;
        (globalThis as any).document = origDocument;
        (globalThis as any).Event = origEvent;
        (globalThis as any).KeyboardEvent = origKeyboardEvent;
        (globalThis as any).HTMLInputElement = origHtmlInput;
        (globalThis as any).HTMLSelectElement = origHtmlSelect;
      }
    }, 30000);
  });
});
