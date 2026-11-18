import { randomUUID } from 'node:crypto';
import { strFromU8, unzipSync } from 'fflate';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import { seedHousehold, type Household } from '../support/planning';
import {
  type NovemberLines,
  recordTxn,
  seedNovemberLines,
  txnBody,
  txnUrl,
} from '../support/tracking';

/** T109: transactions and receipts in the GDPR export, private lines excluded (R15, Principle III). */
describe('tracking data in the export', () => {
  let e2e: E2eApp;
  let h: Household;
  let L: NovemberLines;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });
  afterAll(() => e2e.close());
  beforeEach(async () => {
    await e2e.reset();
    h = await seedHousehold(e2e);
    L = await seedNovemberLines(e2e, h);
  });

  // Same binary parser as test/export-deletion.e2e-spec.ts.

  const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];

    res.on('data', (c: Buffer) => chunks.push(c));

    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  it('exports shared transactions and receipts, never the partner private ones', async () => {
    const { id } = await recordTxn(
      e2e,
      h,
      h.fabien,
      txnBody({ parts: [{ lineId: L.courses, amountMinor: '4230' }] }),
    );
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
    const receiptId = randomUUID();
    await e2e
      .client()
      .put(`${txnUrl(h, id)}/receipts/${receiptId}`)
      .set('Authorization', `Bearer ${h.fabien.token}`)
      .set('Content-Type', 'image/jpeg')
      .send(jpeg);
    await recordTxn(
      e2e,
      h,
      h.maelle,
      txnBody({
        label: 'Séance secrète',
        payer: { kind: 'member', membershipId: h.m },
        parts: [{ lineId: L.psy, amountMinor: '4230' }],
      }),
    );

    const res = await e2e
      .client()
      .get('/v1/me/export')
      .set('Authorization', `Bearer ${h.fabien.token}`)
      .buffer(true)
      .parse(binary);
    expect(res.status).toBe(200);
    const files = unzipSync(new Uint8Array(res.body as Buffer));
    const csv = strFromU8(files['transactions.csv']);
    expect(csv).toContain('Leclerc');
    expect(csv).not.toContain('Séance secrète');
    expect(files[`receipts/${id}/${receiptId}.jpg`]).toEqual(
      new Uint8Array(jpeg),
    );
  });
});
