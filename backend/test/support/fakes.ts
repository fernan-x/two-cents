import type {
  Clock,
  PushMessage,
  PushSender,
} from '../../src/shared-kernel/application/ports';

/** Records pushes instead of calling Expo. */
export class InMemoryPushSender implements PushSender {
  readonly sent: PushMessage[] = [];

  send(messages: PushMessage[]): Promise<void> {
    this.sent.push(...messages);
    return Promise.resolve();
  }

  /** Pushes that reached `token`. */
  to(token: string): PushMessage[] {
    return this.sent.filter((m) => m.to.includes(token));
  }

  clear(): void {
    this.sent.length = 0;
  }
}

/** Real time until a test sets it; then frozen, and moved forward with `advance`. */
export class SettableClock implements Clock {
  private fixed: Date | null = null;

  now(): Date {
    return this.fixed ? new Date(this.fixed) : new Date();
  }

  set(date: Date | string): void {
    this.fixed = new Date(date);
  }

  advance(ms: number): void {
    this.fixed = new Date(this.now().getTime() + ms);
  }

  reset(): void {
    this.fixed = null;
  }
}

export const DAY_MS = 86_400_000;
