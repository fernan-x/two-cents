import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  SECURITY_EVENT_LOG,
  type SecurityEventLog,
} from '../../domain/ports/repositories';
import type { PlainPassword } from '../../domain/value-objects/plain-password';
import type { BreachedPasswordChecker } from '../../application/ports/security';

const RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 2000;

let commonPasswords: Set<string> | null = null;
function loadCommonPasswords(): Set<string> {
  commonPasswords ??= new Set(
    readFileSync(join(__dirname, 'common-passwords.txt'), 'utf8')
      .split('\n')
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean),
  );
  return commonPasswords;
}

/**
 * Local list of common passwords first, then Have I Been Pwned's k-anonymity range API:
 * only the first 5 hex characters of the SHA-1 leave the server (FR-004, research R4).
 * On timeout or error the password is accepted if it passed the local list.
 */
@Injectable()
export class HibpBreachedPasswordChecker implements BreachedPasswordChecker {
  private readonly logger = new Logger(HibpBreachedPasswordChecker.name);

  /** Replaceable in tests. */
  fetchImpl: typeof fetch = (input, init) => fetch(input, init);

  constructor(
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
  ) {}

  async isBreached(password: PlainPassword): Promise<boolean> {
    if (loadCommonPasswords().has(password.reveal().toLowerCase())) return true;
    const sha1 = createHash('sha1')
      .update(password.reveal())
      .digest('hex')
      .toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);
    try {
      const response = await this.fetchImpl(`${RANGE_URL}${prefix}`, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'two-cents-backend' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HIBP status ${response.status}`);
      const body = await response.text();
      return body.split('\n').some((line) => {
        const [hashSuffix, count] = line.trim().split(':');
        return hashSuffix === suffix && Number(count) > 0;
      });
    } catch (error) {
      this.logger.warn({ err: error }, 'breach check unavailable');
      await this.events.record({ type: 'breach_check_unavailable' });
      return false;
    }
  }
}
