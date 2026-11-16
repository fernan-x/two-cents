import { Injectable } from '@nestjs/common';
import { v7 } from 'uuid';
import type { IdGenerator } from '../../application/ports';

@Injectable()
export class UuidV7Generator implements IdGenerator {
  next(): string {
    return v7();
  }
}
