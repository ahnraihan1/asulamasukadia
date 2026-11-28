import crypto from 'node:crypto';
import { db, GeneratedAccountDataRecord } from '../db/index.js';
import { CredentialVault } from '../vault/credentialVault.js';

export interface GenerationConfig {
  quantity: number;
  prefix?: string;
  suffix?: string;
  length: number;
  passwordPrefix?: string;
  passwordLength?: number;
  includeSymbols?: boolean;
  jobId?: string | null;
  createdById?: string | null;
  createPreparationJob?: boolean;
  jobName?: string;
}

export interface GeneratedCandidateDTO {
  id: string;
  jobId: string | null;
  candidateUsername: string;
  prefix: string | null;
  suffix: string | null;
  length: number;
  credentialId: string | null;
  credentialFingerprint: string | null;
  validationStatus: 'VALID' | 'INVALID';
  validationErrors: string[];
  registrationState: string;
  accountId: string | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

const ALPHANUMERIC = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{}';

const HUMAN_CONSONANTS = ['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'w', 'y', 'z'] as const;
const HUMAN_VOWELS = ['a', 'e', 'i', 'o', 'u'] as const;
const HUMAN_CODAS = ['n', 'r', 'l', 's', 'k', 'm'] as const;

const HUMAN_NAME_ROOTS_BY_LEN: Record<number, readonly string[]> = {
  3: [
    'Kai', 'Leo', 'Sky', 'Ace', 'Max', 'Ray', 'Sam', 'Eli', 'Jay', 'Ari',
    'Rio', 'Han', 'Ken', 'Zoe', 'Ava', 'Eva', 'Ivy', 'Koa', 'Roy', 'Rex',
    'Jun', 'Ian', 'Dan', 'Tim', 'Fox', 'Nyx', 'Zen', 'Vex', 'Ash', 'Oak',
    'Elm', 'Blu', 'Dex', 'Jax', 'Kip', 'Lex', 'Lux', 'Neo', 'Pax', 'Rue',
    'Sol', 'Taj', 'Val', 'Wyn', 'Zed', 'Zan', 'Koi', 'Poe', 'Rae', 'Sly',
    'Tex', 'Van', 'Wes', 'Zay', 'Noa',
  ],
  4: [
    'Kira', 'Nora', 'Sora', 'Riku', 'Taro', 'Zaki', 'Dika', 'Rafi', 'Luma', 'Vero',
    'Yuna', 'Hana', 'Rina', 'Tari', 'Niko', 'Kiko', 'Reno', 'Toby', 'Kobe', 'Sena',
    'Yuki', 'Haru', 'Kazu', 'Nori', 'Tori', 'Tama', 'Rama', 'Wira', 'Yoga', 'Luna',
    'Nova', 'Echo', 'Sage', 'Ruby', 'Opal', 'Dawn', 'Reed', 'Cole', 'Finn', 'Theo',
    'Arlo', 'Elio', 'Ezra', 'Luca', 'Hugo', 'Zora', 'Mika', 'Kael', 'Leon', 'Dion',
    'Ario', 'Bram', 'Ciro', 'Davi', 'Elan', 'Faro', 'Geno', 'Hero', 'Ivan', 'Jaro',
    'Kobi', 'Lark', 'Orin', 'Pako', 'Rami', 'Sami', 'Tino', 'Umar', 'Vito', 'Wade',
    'Zane', 'Zeno', 'Bolt', 'Star', 'Wave', 'Pine', 'Leaf', 'Rain', 'Snow', 'Wind',
    'Gale', 'Peak', 'Vale', 'Glen', 'Cove', 'Dusk', 'Morn', 'Halo', 'Jade', 'Onyx',
    'Rose', 'Iris', 'Link', 'Dash', 'Aero', 'Volt', 'Neon', 'Vibe', 'Flux', 'Apex',
    'Aura', 'Glow', 'Loom', 'Rook', 'Wren', 'Wolf', 'Bear', 'Lynx', 'Puma', 'Deer',
  ],
  5: [
    'Kaito', 'Zidan', 'Fajar', 'Galih', 'Ilham', 'Putra', 'Andra', 'Bagas', 'Dimas', 'Nanda',
    'Rizky', 'Cloud', 'Frost', 'Blaze', 'Pixel', 'Storm', 'Spark', 'Swift', 'Amber', 'Cedar',
    'Coral', 'River', 'Robin', 'Soren', 'Caleb', 'Mason', 'Logan', 'Lucas', 'Ethan', 'Dylan',
    'Caden', 'Jaden', 'Tyler', 'Aiden', 'Kylan', 'Rylan', 'Orion', 'Atlas', 'Kenji', 'Renji',
    'Taiga', 'Daiki', 'Solar', 'Lunar', 'Astro', 'Comet', 'Drift', 'Flint', 'Prism', 'Quest',
    'Ridge', 'Scout', 'Shire', 'Torch', 'Valor',
  ],
  6: ['Kresna', 'Gibran', 'Farhan', 'Hayden', 'Zayden', 'Kenshi', 'Haruka', 'Sakura', 'Darius', 'Nadine', 'Adrian', 'Daniel', 'Samuel', 'Rafael', 'Julian', 'Xavier', 'Marcus', 'Cinder', 'Rizwan', 'Benson'],
};

const RISKY_ROBLOX_SUBSTRINGS = [
  'fuk', 'fck', 'fak', 'fuck', 'shit', 'bitch', 'cunt', 'slut', 'whor',
  'porn', 'rape', 'cock', 'dick', 'puss', 'vag', 'penis', 'tits', 'boob',
  'cum', 'jizz', 'sex', 'ass', 'nig', 'fag', 'kys', 'wtf', 'stfu', 'ball',
  'meth', 'nazi', 'isis', 'b0q', 'c0p', 'suk', 'sux', 'gay', 'hoe', 'thot',
  'simp', 'anal', 'mth', 'fkk',
  'jebi', 'jebo', 'jeba', 'jebu', 'jebe', 'jemi', 'susu', 'caci', 'fogok',
  'bimo', 'bir', 'bowe', 'cubak', 'rorab', 'sinus',
];

const BLOCKED_DIGIT_PATTERNS = ['69', '420', '666', '1488'] as const;

function isRiskyRobloxUsername(username: string): boolean {
  if (BLOCKED_DIGIT_PATTERNS.some((pat) => username.includes(pat))) {
    return true;
  }
  const lower = username.toLowerCase();
  const deLeet = lower
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't');
  return RISKY_ROBLOX_SUBSTRINGS.some((sub) => lower.includes(sub) || deLeet.includes(sub));
}

function buildHumanDigits(len: number): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    let out = '';
    for (let i = 0; i < len; i++) {
      out += DIGITS[crypto.randomInt(0, DIGITS.length)];
    }
    if (!BLOCKED_DIGIT_PATTERNS.some((pat) => out.includes(pat))) {
      return out;
    }
  }
  return '247'.slice(0, len);
}

function buildPronounceableWord(len: number, capitalize: boolean, rootChancePct = 15): string {
  if (len <= 0) return '';
  if (len === 1) {
    const ch = HUMAN_CONSONANTS[crypto.randomInt(0, HUMAN_CONSONANTS.length)];
    return capitalize ? ch.toUpperCase() : ch;
  }

  // Untuk panjang >= 3, sesekali gunakan kosakata manusia yang terverifikasi lolos filter Roblox
  const pool = HUMAN_NAME_ROOTS_BY_LEN[len];
  if (pool && pool.length > 0 && rootChancePct > 0 && crypto.randomInt(0, 100) < rootChancePct) {
    const pick = pool[crypto.randomInt(0, pool.length)].slice(0, len);
    return capitalize ? pick[0].toUpperCase() + pick.slice(1).toLowerCase() : pick.toLowerCase();
  }

  let word = '';
  let idx = 0;
  while (word.length < len) {
    const rem = len - word.length;
    if (rem === 1) {
      word += word.length > 0 && /[aeiou]$/.test(word)
        ? HUMAN_CODAS[crypto.randomInt(0, HUMAN_CODAS.length)]
        : HUMAN_VOWELS[crypto.randomInt(0, HUMAN_VOWELS.length)];
    } else if (rem === 3 && idx > 0) {
      const c1 = HUMAN_CONSONANTS[crypto.randomInt(0, HUMAN_CONSONANTS.length)];
      const v = HUMAN_VOWELS[crypto.randomInt(0, HUMAN_VOWELS.length)];
      const c2 = HUMAN_CODAS[crypto.randomInt(0, HUMAN_CODAS.length)];
      word += c1 + v + c2;
    } else {
      const c = HUMAN_CONSONANTS[crypto.randomInt(0, HUMAN_CONSONANTS.length)];
      const v = HUMAN_VOWELS[crypto.randomInt(0, HUMAN_VOWELS.length)];
      word += c + v;
    }
    idx++;
  }
  const sliced = word.slice(0, len);
  return capitalize ? sliced[0].toUpperCase() + sliced.slice(1) : sliced;
}

function buildHumanizedSegment(len: number, hasPrefix: boolean): string {
  if (len <= 0) return '';
  if (len === 1) {
    const letters = LOWERCASE + UPPERCASE;
    return letters[crypto.randomInt(0, letters.length)];
  }
  if (len === 2) {
    return buildPronounceableWord(2, !hasPrefix || crypto.randomInt(0, 2) === 1, 0);
  }
  if (len === 3) {
    return crypto.randomInt(0, 4) === 0
      ? buildPronounceableWord(2, true, 0) + buildHumanDigits(1)
      : buildPronounceableWord(3, true, 65);
  }
  if (len === 4) {
    return crypto.randomInt(0, 3) === 0
      ? buildPronounceableWord(2, true, 0) + buildHumanDigits(2)
      : buildPronounceableWord(4, true, 65);
  }
  if (len === 5) {
    const mode = crypto.randomInt(0, 100);
    if (mode < 60) return buildPronounceableWord(3, true, 85) + buildHumanDigits(2);
    if (mode < 90) return buildPronounceableWord(4, true, 85) + buildHumanDigits(1);
    return buildPronounceableWord(5, true, 75);
  }
  if (len === 6) {
    const mode = crypto.randomInt(0, 100);
    if (mode < 60) return buildPronounceableWord(3, true, 88) + buildHumanDigits(3);
    if (mode < 95) return buildPronounceableWord(4, true, 88) + buildHumanDigits(2);
    // 5% kombinasi dua kata 3+3 yang terverifikasi agar bebas suku kata acak panjang
    return buildPronounceableWord(3, true, 90) + buildPronounceableWord(3, true, 90);
  }
  if (len === 7) {
    const mode = crypto.randomInt(0, 100);
    if (mode < 45) return buildPronounceableWord(5, true, 85) + buildHumanDigits(2);
    if (mode < 80) return buildPronounceableWord(4, true, 85) + buildHumanDigits(3);
    return buildPronounceableWord(3, true, 85) + buildPronounceableWord(4, true, 85);
  }
  if (len <= 10) {
    const digLen = crypto.randomInt(2, 4); // 2 atau 3 digit natural di belakang
    const wordBudget = len - digLen;
    if (wordBudget >= 7) {
      const w1 = Math.floor(wordBudget / 2);
      const w2 = wordBudget - w1;
      return buildPronounceableWord(w1, true, 85) + buildPronounceableWord(w2, true, 85) + buildHumanDigits(digLen);
    }
    return buildPronounceableWord(wordBudget, true, 85) + buildHumanDigits(digLen);
  }

  // Panjang segmen >= 11: [Kata1(4..5)][Kata2(4..6)][2..3 digit]
  const digLen = crypto.randomInt(2, 4);
  const wordBudget = len - digLen;
  const w1 = Math.min(5, Math.max(4, Math.floor(wordBudget / 2)));
  const w2 = wordBudget - w1;
  return buildPronounceableWord(w1, true, 85) + buildPronounceableWord(w2, true, 85) + buildHumanDigits(digLen);
}

export class GeneratorService {
  /**
   * Validates a Roblox username candidate according to Roblox rules:
   * - 3 to 20 characters total
   * - Only letters, numbers, and at most one underscore (_)
   * - Cannot start or end with an underscore
   * - Cannot consist only of digits
   */
  public static validateUsernameCandidate(username: string): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    if (username.length < 3 || username.length > 20) {
      errors.push('Username length must be between 3 and 20 characters');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      errors.push('Username may only contain alphanumeric characters and underscores');
    }
    if (username.startsWith('_') || username.endsWith('_')) {
      errors.push('Username cannot start or end with an underscore');
    }
    const underscoreCount = (username.match(/_/g) || []).length;
    if (underscoreCount > 1) {
      errors.push('Username cannot contain more than one underscore');
    }
    if (/^\d+$/.test(username)) {
      errors.push('Username cannot contain only numbers');
    }
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generates a strong cryptographically random password with optional prefix
   */
  public static generateStrongPassword(
    length = 16,
    includeSymbols = true,
    passwordPrefix = ''
  ): string {
    const cleanPassPrefix = passwordPrefix.trim();
    const targetLen = Math.max(
      cleanPassPrefix.length + 6,
      Math.max(12, Math.min(64, length))
    );
    const remainingLen = Math.max(6, targetLen - cleanPassPrefix.length);
    const charset = LOWERCASE + UPPERCASE + DIGITS + (includeSymbols ? SYMBOLS : '');

    const mandatory = [
      LOWERCASE[crypto.randomInt(0, LOWERCASE.length)],
      UPPERCASE[crypto.randomInt(0, UPPERCASE.length)],
      DIGITS[crypto.randomInt(0, DIGITS.length)],
    ];
    if (includeSymbols) {
      mandatory.push(SYMBOLS[crypto.randomInt(0, SYMBOLS.length)]);
    }

    const chars = [...mandatory];
    while (chars.length < remainingLen) {
      chars.push(charset[crypto.randomInt(0, charset.length)]);
    }

    // Fisher-Yates CSPRNG shuffle on the random suffix portion
    for (let i = chars.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      const tmp = chars[i];
      chars[i] = chars[j];
      chars[j] = tmp;
    }

    return `${cleanPassPrefix}${chars.join('')}`;
  }

  /**
   * Builds a single humanized, pronounceable username candidate respecting prefix, suffix, and total length
   */
  public static buildCandidateString(prefix = '', suffix = '', totalLength = 12): string {
    const cleanPrefix = prefix.trim();
    const cleanSuffix = suffix.trim();
    const minNeeded = cleanPrefix.length + cleanSuffix.length + 1;
    const effectiveLength = Math.max(minNeeded, Math.min(20, Math.max(3, totalLength)));
    const randomFillLength = Math.max(1, effectiveLength - cleanPrefix.length - cleanSuffix.length);

    let fallback = '';
    for (let safetyAttempt = 0; safetyAttempt < 30; safetyAttempt++) {
      let randomMid = '';
      if (safetyAttempt < 24 && randomFillLength >= 3) {
        randomMid = buildHumanizedSegment(randomFillLength, cleanPrefix.length > 0);
      } else {
        for (let i = 0; i < randomFillLength; i++) {
          if (i === 0 && /^\d*$/.test(cleanPrefix) && /^\d*$/.test(cleanSuffix)) {
            const letters = LOWERCASE + UPPERCASE;
            randomMid += letters[crypto.randomInt(0, letters.length)];
          } else {
            randomMid += ALPHANUMERIC[crypto.randomInt(0, ALPHANUMERIC.length)];
          }
        }
      }
      const candidate = `${cleanPrefix}${randomMid}${cleanSuffix}`;
      if (!fallback) fallback = candidate;
      if (/^\d+$/.test(candidate)) continue;
      if (!isRiskyRobloxUsername(candidate)) {
        return candidate;
      }
    }

    return fallback;
  }

  /**
   * Generates and persists 1 to 5,000 account candidates in a single ACID transaction,
   * detecting duplicates both in-batch and against existing database records.
   */
  public static generateBatch(config: GenerationConfig): {
    candidates: GeneratedCandidateDTO[];
    duplicatesSkipped: number;
    jobId: string | null;
  } {
    const quantity = Math.max(1, Math.min(5000, config.quantity));
    const prefix = (config.prefix ?? '').trim();
    const suffix = (config.suffix ?? '').trim();
    const length = Math.max(3, Math.min(20, config.length || 12));
    const passwordPrefix = (config.passwordPrefix ?? '').trim();
    const passwordLength = Math.max(12, Math.min(64, config.passwordLength ?? 16));
    const includeSymbols = config.includeSymbols ?? true;

    if (prefix.length + suffix.length >= 20) {
      throw new Error('Combined prefix and suffix length must be less than 20 characters');
    }
    if (prefix.length + suffix.length > length - 1) {
      throw new Error('Target username length must be at least (prefix.length + suffix.length + 1)');
    }

    // Load existing usernames in memory set for O(1) duplicate detection at 5,000 scale
    const existingCandidates = db.raw
      .prepare('SELECT LOWER(candidate_username) as uname FROM generated_account_data')
      .all() as { uname: string }[];
    const existingAccounts = db.raw
      .prepare('SELECT LOWER(roblox_username) as uname FROM accounts')
      .all() as { uname: string }[];

    const occupiedSet = new Set<string>();
    for (const r of existingCandidates) occupiedSet.add(r.uname);
    for (const r of existingAccounts) occupiedSet.add(r.uname);

    let duplicatesSkipped = 0;
    const preparedBatch: Array<{
      id: string;
      candidateUsername: string;
      validationStatus: 'VALID' | 'INVALID';
      validationErrors: string[];
      credentialId: string;
      envelope: ReturnType<typeof CredentialVault.encryptSecret>;
    }> = [];

    const maxAttempts = quantity * 15;
    let attempts = 0;

    while (preparedBatch.length < quantity && attempts < maxAttempts) {
      attempts++;
      const candidateUsername = this.buildCandidateString(prefix, suffix, length);
      const lower = candidateUsername.toLowerCase();

      if (occupiedSet.has(lower)) {
        duplicatesSkipped++;
        continue;
      }

      occupiedSet.add(lower);
      const validation = this.validateUsernameCandidate(candidateUsername);
      const password = this.generateStrongPassword(passwordLength, includeSymbols, passwordPrefix);
      const envelope = CredentialVault.encryptSecret(password);

      preparedBatch.push({
        id: crypto.randomUUID(),
        candidateUsername,
        validationStatus: validation.valid ? 'VALID' : 'INVALID',
        validationErrors: validation.errors,
        credentialId: crypto.randomUUID(),
        envelope,
      });
    }

    if (preparedBatch.length < quantity) {
      throw new Error(
        `Exhausted keyspace: could only generate ${preparedBatch.length} unique usernames out of ${quantity} requested`
      );
    }

    const now = new Date().toISOString();
    const results: GeneratedCandidateDTO[] = [];

    db.transaction(() => {
      const insertCredStmt = db.raw.prepare(`
        INSERT INTO credential_metadata (
          id, key_version, algorithm, iv_hex, auth_tag_hex, ciphertext_hex,
          secret_type, fingerprint_sha256, rotated_at, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'PASSWORD', ?, NULL, ?, ?, NULL)
      `);

      const insertCandidateStmt = db.raw.prepare(`
        INSERT INTO generated_account_data (
          id, job_id, candidate_username, prefix, suffix, length,
          credential_id, validation_status, validation_errors, registration_state,
          account_id, attempt_count, last_error, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, ?, ?)
      `);

      const initialState = config.jobId ? 'QUEUED_FOR_PREPARATION' : 'GENERATED_CANDIDATE';

      for (const item of preparedBatch) {
        insertCredStmt.run(
          item.credentialId,
          item.envelope.keyVersion,
          item.envelope.algorithm,
          item.envelope.ivHex,
          item.envelope.authTagHex,
          item.envelope.ciphertextHex,
          item.envelope.fingerprintSha256,
          now,
          now
        );

        const errorsJson = item.validationErrors.length > 0 ? JSON.stringify(item.validationErrors) : null;

        insertCandidateStmt.run(
          item.id,
          config.jobId ?? null,
          item.candidateUsername,
          prefix || null,
          suffix || null,
          item.candidateUsername.length,
          item.credentialId,
          item.validationStatus,
          errorsJson,
          initialState,
          now,
          now
        );

        results.push({
          id: item.id,
          jobId: config.jobId ?? null,
          candidateUsername: item.candidateUsername,
          prefix: prefix || null,
          suffix: suffix || null,
          length: item.candidateUsername.length,
          credentialId: item.credentialId,
          credentialFingerprint: item.envelope.fingerprintSha256,
          validationStatus: item.validationStatus,
          validationErrors: item.validationErrors,
          registrationState: initialState,
          accountId: null,
          attemptCount: 0,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        });
      }

      db.logActivity({
        userId: config.createdById ?? null,
        action: 'GENERATE_CANDIDATES',
        entityType: 'GENERATED_ACCOUNT_DATA',
        entityId: config.jobId ?? results[0]?.id ?? null,
        details: {
          quantity: results.length,
          prefix: prefix || null,
          suffix: suffix || null,
          length,
          duplicatesSkipped,
        },
      });
    });

    return {
      candidates: results,
      duplicatesSkipped,
      jobId: config.jobId ?? null,
    };
  }

  /**
   * Regenerates an invalid or unconfirmed candidate username & password
   */
  public static regenerateCandidate(candidateId: string, userId?: string | null): GeneratedCandidateDTO {
    const existing = db.raw
      .prepare('SELECT * FROM generated_account_data WHERE id = ?')
      .get(candidateId) as GeneratedAccountDataRecord | undefined;

    if (!existing) {
      throw new Error('Generated candidate record not found');
    }
    if (existing.registration_state === 'REGISTERED') {
      throw new Error('Cannot regenerate a candidate that has already been registered');
    }

    const prefix = existing.prefix ?? '';
    const suffix = existing.suffix ?? '';
    const targetLength = Math.max(3, Math.min(20, existing.length || 12));

    let newUsername = '';
    let validation = { valid: false, errors: ['Not generated'] };

    for (let i = 0; i < 50; i++) {
      const candidate = this.buildCandidateString(prefix, suffix, targetLength);
      const conflict = db.raw
        .prepare(
          `SELECT 1 FROM generated_account_data WHERE LOWER(candidate_username) = LOWER(?)
           UNION
           SELECT 1 FROM accounts WHERE LOWER(roblox_username) = LOWER(?)`
        )
        .get(candidate, candidate);

      if (!conflict) {
        const v = this.validateUsernameCandidate(candidate);
        if (v.valid) {
          newUsername = candidate;
          validation = v;
          break;
        }
      }
    }

    if (!newUsername) {
      // Fallback clean random username if prefix/suffix itself was invalid
      for (let i = 0; i < 50; i++) {
        const candidate = this.buildCandidateString('rbx', '', 12);
        const conflict = db.raw
          .prepare('SELECT 1 FROM generated_account_data WHERE LOWER(candidate_username) = LOWER(?)')
          .get(candidate);
        if (!conflict) {
          newUsername = candidate;
          validation = this.validateUsernameCandidate(candidate);
          break;
        }
      }
    }

    const newPassword = this.generateStrongPassword(16, true);
    const credMeta = CredentialVault.storeCredential(newPassword, 'PASSWORD');
    const now = new Date().toISOString();

    db.transaction(() => {
      db.raw
        .prepare(
          `UPDATE generated_account_data
           SET candidate_username = ?, length = ?, credential_id = ?,
               validation_status = ?, validation_errors = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          newUsername,
          newUsername.length,
          credMeta.id,
          validation.valid ? 'VALID' : 'INVALID',
          validation.errors.length > 0 ? JSON.stringify(validation.errors) : null,
          now,
          candidateId
        );

      db.logActivity({
        userId: userId ?? null,
        action: 'REGENERATE_CANDIDATE',
        entityType: 'GENERATED_ACCOUNT_DATA',
        entityId: candidateId,
        details: {
          previousUsername: existing.candidate_username,
          newUsername,
        },
      });
    });

    return this.getCandidateById(candidateId)!;
  }

  public static getCandidateById(id: string): GeneratedCandidateDTO | null {
    const row = db.raw
      .prepare(
        `SELECT g.*, c.fingerprint_sha256
         FROM generated_account_data g
         LEFT JOIN credential_metadata c ON g.credential_id = c.id
         WHERE g.id = ?`
      )
      .get(id) as (GeneratedAccountDataRecord & { fingerprint_sha256: string | null }) | undefined;

    if (!row) return null;
    return this.mapRowToDTO(row);
  }

  public static listCandidates(params: {
    page?: number;
    limit?: number;
    jobId?: string;
    state?: string;
    validationStatus?: string;
    search?: string;
  }): {
    items: GeneratedCandidateDTO[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.max(1, Math.min(50000, params.limit ?? 25));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: (string | number)[] = [];

    if (params.jobId) {
      conditions.push('g.job_id = ?');
      values.push(params.jobId);
    }
    if (params.state) {
      conditions.push('g.registration_state = ?');
      values.push(params.state);
    }
    if (params.validationStatus) {
      conditions.push('g.validation_status = ?');
      values.push(params.validationStatus);
    }
    if (params.search) {
      conditions.push('LOWER(g.candidate_username) LIKE LOWER(?)');
      values.push(`%${params.search.trim()}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = db.raw
      .prepare(`SELECT COUNT(*) as total FROM generated_account_data g ${whereClause}`)
      .get(...values) as { total: number };
    const total = Number(countRow?.total ?? 0);

    const rows = db.raw
      .prepare(
        `SELECT g.*, c.fingerprint_sha256
         FROM generated_account_data g
         LEFT JOIN credential_metadata c ON g.credential_id = c.id
         ${whereClause}
         ORDER BY g.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...values, limit, offset) as unknown as Array<
        GeneratedAccountDataRecord & { fingerprint_sha256: string | null }
      >;

    return {
      items: rows.map((r) => this.mapRowToDTO(r)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Prunes all candidate records in FAILED state (without a registered account)
   * and cleans up their unreferenced vault credential metadata in one atomic transaction.
   */
  public static pruneFailedCandidates(performedById?: string | null): { deletedCount: number } {
    let deletedCount = 0;

    db.transaction(() => {
      db.raw
        .prepare(
          `DELETE FROM credential_metadata
           WHERE id IN (
             SELECT credential_id FROM generated_account_data
             WHERE registration_state = 'FAILED' AND account_id IS NULL AND credential_id IS NOT NULL
           )
           AND id NOT IN (
             SELECT credential_id FROM accounts WHERE credential_id IS NOT NULL
           )`
        )
        .run();

      const res = db.raw
        .prepare(
          `DELETE FROM generated_account_data
           WHERE registration_state = 'FAILED' AND account_id IS NULL`
        )
        .run();
      deletedCount = Number(res.changes ?? 0);

      db.logActivity({
        userId: performedById ?? null,
        action: 'PRUNE_FAILED_CANDIDATES',
        entityType: 'GENERATED_ACCOUNT_DATA',
        entityId: null,
        details: { deletedCount },
      });
    });

    return { deletedCount };
  }

  private static mapRowToDTO(
    row: GeneratedAccountDataRecord & { fingerprint_sha256?: string | null }
  ): GeneratedCandidateDTO {
    let parsedErrors: string[] = [];
    if (row.validation_errors) {
      try {
        parsedErrors = JSON.parse(row.validation_errors);
      } catch {
        parsedErrors = [row.validation_errors];
      }
    }
    return {
      id: row.id,
      jobId: row.job_id,
      candidateUsername: row.candidate_username,
      prefix: row.prefix,
      suffix: row.suffix,
      length: row.length,
      credentialId: row.credential_id,
      credentialFingerprint: row.fingerprint_sha256 ?? null,
      validationStatus: row.validation_status,
      validationErrors: parsedErrors,
      registrationState: row.registration_state,
      accountId: row.account_id,
      attemptCount: row.attempt_count,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
