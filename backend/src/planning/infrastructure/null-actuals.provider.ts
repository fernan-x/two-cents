import { Injectable } from '@nestjs/common';
import type { ActualsView } from '@two-cents/shared/contracts';
import type { ActualsProvider } from '../application/ports';

/** No transactions yet: planned figures only (FR-037). Feature 04 replaces this binding. */
@Injectable()
export class NullActualsProvider implements ActualsProvider {
  forMonth(): Promise<ActualsView | null> {
    return Promise.resolve(null);
  }
}
