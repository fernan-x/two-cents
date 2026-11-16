import { validatePasswordPolicy } from '@two-cents/shared/domain';
import { DomainError } from '../../../shared-kernel/domain/domain-error';

/** A password typed by the user. Never persisted, logged or serialized (FR-050). */
export class PlainPassword {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  /** A new password: must meet the policy (≥ 10 code points). */
  static create(raw: string): PlainPassword {
    const result = validatePasswordPolicy(raw);
    if (!result.ok) throw new DomainError(result.reason);
    return new PlainPassword(raw);
  }

  /** A password typed to sign in: no policy check (old passwords may predate it). */
  static forVerification(raw: string): PlainPassword {
    return new PlainPassword(raw);
  }

  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return '[redacted]';
  }

  toJSON(): never {
    throw new Error('PlainPassword must never be serialized');
  }
}
