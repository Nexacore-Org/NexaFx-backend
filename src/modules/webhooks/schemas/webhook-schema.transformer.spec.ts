import {
  buildSchemaHeaders,
  DEPRECATION_WINDOW_DAYS,
  getSchemaVersionInfo,
  isDeprecatedSchemaVersion,
  LATEST_WEBHOOK_SCHEMA_VERSION,
  WEBHOOK_SCHEMA_VERSION_REGISTRY,
  WEBHOOK_SCHEMA_VERSIONS,
  WebhookSchemaTransformer,
} from './index';

const RAW_TRANSACTION = {
  id: 'tx-123',
  userId: 'user-1',
  type: 'SWAP',
  status: 'SUCCESS',
  amount: '150.00000000',
  currency: 'USD',
  rate: '1550.25000000',
  feeAmount: '1.50000000',
  feeCurrency: 'USD',
  toCurrency: 'NGN',
  toAmount: '232537.50000000',
  txHash: 'hash-abc',
  reference: 'ref-9',
  counterpartyMemo: 'invoice 42',
  failureReason: null,
  createdAt: new Date('2026-07-01T10:00:00.000Z'),
  updatedAt: new Date('2026-07-01T10:05:00.000Z'),
  // Internal / private columns that v1 leaked and v2 must not emit.
  userNote: 'private note',
  searchVector: "'swap':1",
  processingLockedBy: 'worker-3',
  metadata: { internal: true },
};

describe('WebhookSchemaTransformer', () => {
  describe('envelope', () => {
    it('stamps the resolved schemaVersion on the envelope', () => {
      const v1 = WebhookSchemaTransformer.transform(
        'transaction.completed',
        RAW_TRANSACTION,
        '1.0',
      );
      const v2 = WebhookSchemaTransformer.transform(
        'transaction.completed',
        RAW_TRANSACTION,
        '2.0',
      );

      expect(v1.schemaVersion).toBe('1.0');
      expect(v2.schemaVersion).toBe('2.0');
    });

    it('emits the full envelope contract', () => {
      const envelope = WebhookSchemaTransformer.transform(
        'transaction.completed',
        RAW_TRANSACTION,
        '2.0',
      );

      expect(Object.keys(envelope)).toEqual([
        'id',
        'event',
        'schemaVersion',
        'data',
        'timestamp',
      ]);
      expect(envelope.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(envelope.event).toBe('transaction.completed');
      expect(new Date(envelope.timestamp).toISOString()).toBe(
        envelope.timestamp,
      );
    });

    it('reuses a caller-supplied id and timestamp across the fan-out', () => {
      const options = { id: 'event-1', timestamp: '2026-07-29T00:00:00.000Z' };

      const v1 = WebhookSchemaTransformer.transform(
        'transaction.completed',
        RAW_TRANSACTION,
        '1.0',
        options,
      );
      const v2 = WebhookSchemaTransformer.transform(
        'transaction.completed',
        RAW_TRANSACTION,
        '2.0',
        options,
      );

      expect(v1.id).toBe('event-1');
      expect(v2.id).toBe('event-1');
      expect(v1.timestamp).toBe(options.timestamp);
      expect(v2.timestamp).toBe(options.timestamp);
    });

    it('falls back to the latest version for unsupported input', () => {
      expect(
        WebhookSchemaTransformer.transform('transaction.completed', {}, '9.9')
          .schemaVersion,
      ).toBe(LATEST_WEBHOOK_SCHEMA_VERSION);
      expect(
        WebhookSchemaTransformer.transform('transaction.completed', {}, null)
          .schemaVersion,
      ).toBe(LATEST_WEBHOOK_SCHEMA_VERSION);
    });
  });

  describe('transaction.completed v1.0', () => {
    it('preserves the historical entity-dump shape', () => {
      const { data } = WebhookSchemaTransformer.transform<
        Record<string, unknown>
      >('transaction.completed', RAW_TRANSACTION, '1.0');

      expect(data).toEqual(RAW_TRANSACTION);
      expect(data.amount).toBe('150.00000000');
      expect(data.type).toBe('SWAP');
      expect(data.status).toBe('SUCCESS');
      expect(data.feeAmount).toBe('1.50000000');
      expect(data.txHash).toBe('hash-abc');
    });

    it('does not alias the source object', () => {
      const source = { ...RAW_TRANSACTION };
      const { data } = WebhookSchemaTransformer.transform<
        Record<string, unknown>
      >('transaction.completed', source, '1.0');

      expect(data).not.toBe(source);
      (data as any).amount = 'mutated';
      expect(source.amount).toBe('150.00000000');
    });

    it('tolerates null data', () => {
      const { data } = WebhookSchemaTransformer.transform(
        'transaction.completed',
        null,
        '1.0',
      );
      expect(data).toEqual({});
    });
  });

  describe('transaction.completed v2.0', () => {
    it('emits the curated v2 shape', () => {
      const { data } = WebhookSchemaTransformer.transform(
        'transaction.completed',
        RAW_TRANSACTION,
        '2.0',
      );

      expect(data).toEqual({
        transactionId: 'tx-123',
        userId: 'user-1',
        type: 'swap',
        status: 'success',
        amount: 150,
        currency: 'USD',
        fee: { amount: 1.5, currency: 'USD' },
        conversion: {
          fromCurrency: 'USD',
          toCurrency: 'NGN',
          toAmount: 232537.5,
          rate: 1550.25,
        },
        memo: 'invoice 42',
        reference: 'ref-9',
        stellarTxHash: 'hash-abc',
        failureReason: null,
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:05:00.000Z',
      });
    });

    it('drops internal and private columns that v1 leaked', () => {
      const { data } = WebhookSchemaTransformer.transform<
        Record<string, unknown>
      >('transaction.completed', RAW_TRANSACTION, '2.0');

      expect(data).not.toHaveProperty('userNote');
      expect(data).not.toHaveProperty('searchVector');
      expect(data).not.toHaveProperty('processingLockedBy');
      expect(data).not.toHaveProperty('metadata');
      // Renamed, so the v1 keys must be gone too.
      expect(data).not.toHaveProperty('id');
      expect(data).not.toHaveProperty('txHash');
      expect(data).not.toHaveProperty('feeAmount');
      expect(data).not.toHaveProperty('counterpartyMemo');
    });

    it('nulls the fee and conversion objects when they do not apply', () => {
      const { data } = WebhookSchemaTransformer.transform<any>(
        'transaction.completed',
        {
          id: 'tx-9',
          userId: 'user-1',
          type: 'DEPOSIT',
          status: 'PENDING',
          amount: '10.5',
          currency: 'USD',
          feeAmount: null,
          toCurrency: null,
        },
        '2.0',
      );

      expect(data.fee).toBeNull();
      expect(data.conversion).toBeNull();
      expect(data.amount).toBe(10.5);
    });

    it('falls back to the entity currency when no fee currency is set', () => {
      const { data } = WebhookSchemaTransformer.transform<any>(
        'transaction.completed',
        { currency: 'EUR', feeAmount: '0.25', feeCurrency: null },
        '2.0',
      );

      expect(data.fee).toEqual({ amount: 0.25, currency: 'EUR' });
    });

    it('prefers stellarTxHash over the legacy txHash column', () => {
      const { data } = WebhookSchemaTransformer.transform<any>(
        'transaction.completed',
        { stellarTxHash: 'stellar-1', txHash: 'legacy-1' },
        '2.0',
      );

      expect(data.stellarTxHash).toBe('stellar-1');
    });

    it('nulls unparseable numbers and dates instead of emitting NaN', () => {
      const { data } = WebhookSchemaTransformer.transform<any>(
        'transaction.completed',
        { amount: 'not-a-number', createdAt: 'not-a-date' },
        '2.0',
      );

      expect(data.amount).toBeNull();
      expect(data.createdAt).toBeNull();
    });

    it('tolerates null data', () => {
      const { data } = WebhookSchemaTransformer.transform<any>(
        'transaction.completed',
        null,
        '2.0',
      );
      expect(data.transactionId).toBeNull();
      expect(data.fee).toBeNull();
    });
  });

  describe('transaction.failed', () => {
    it('shares the transaction builders with transaction.completed', () => {
      const failed = {
        ...RAW_TRANSACTION,
        status: 'FAILED',
        failureReason: 'insufficient balance',
      };

      const v1 = WebhookSchemaTransformer.transform<any>(
        'transaction.failed',
        failed,
        '1.0',
      );
      const v2 = WebhookSchemaTransformer.transform<any>(
        'transaction.failed',
        failed,
        '2.0',
      );

      expect(v1.data.status).toBe('FAILED');
      expect(v2.data.status).toBe('failed');
      expect(v2.data.failureReason).toBe('insufficient balance');
    });
  });

  describe('events without a versioned schema', () => {
    it('passes data through unchanged on every version', () => {
      const data = { message: 'Test ping from NexaFX' };

      for (const version of WEBHOOK_SCHEMA_VERSIONS) {
        const envelope = WebhookSchemaTransformer.transform(
          'ping',
          data,
          version,
        );
        expect(envelope.data).toEqual(data);
        expect(envelope.schemaVersion).toBe(version);
      }
    });

    it('reports which events have versioned schemas', () => {
      expect(
        WebhookSchemaTransformer.hasVersionedSchema('transaction.completed'),
      ).toBe(true);
      expect(WebhookSchemaTransformer.hasVersionedSchema('ping')).toBe(false);
      expect(WebhookSchemaTransformer.registeredEvents()).toEqual(
        expect.arrayContaining(['transaction.completed', 'transaction.failed']),
      );
    });
  });

  describe('version support', () => {
    it('accepts only registered versions', () => {
      expect(WebhookSchemaTransformer.isSupportedVersion('1.0')).toBe(true);
      expect(WebhookSchemaTransformer.isSupportedVersion('2.0')).toBe(true);
      expect(WebhookSchemaTransformer.isSupportedVersion('3.0')).toBe(false);
      expect(WebhookSchemaTransformer.isSupportedVersion(2.0)).toBe(false);
      expect(WebhookSchemaTransformer.isSupportedVersion(undefined)).toBe(false);
    });

    it('keeps at least two versions deliverable', () => {
      expect(WEBHOOK_SCHEMA_VERSIONS.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('schema deprecation metadata', () => {
  it('marks 1.0 deprecated and 2.0 current', () => {
    expect(isDeprecatedSchemaVersion('1.0')).toBe(true);
    expect(isDeprecatedSchemaVersion('2.0')).toBe(false);
    expect(isDeprecatedSchemaVersion('9.9')).toBe(false);
  });

  it('gives every deprecated version at least a 90-day sunset window', () => {
    for (const info of Object.values(WEBHOOK_SCHEMA_VERSION_REGISTRY)) {
      if (!info.deprecatedOn) continue;

      expect(info.sunsetOn).not.toBeNull();
      const windowDays =
        (new Date(info.sunsetOn as string).getTime() -
          new Date(info.deprecatedOn).getTime()) /
        86_400_000;
      expect(windowDays).toBeGreaterThanOrEqual(DEPRECATION_WINDOW_DAYS);
    }
  });

  it('records an effective date for every version', () => {
    for (const version of WEBHOOK_SCHEMA_VERSIONS) {
      const info = getSchemaVersionInfo(version);
      expect(info.version).toBe(version);
      expect(Number.isNaN(new Date(info.effectiveFrom).getTime())).toBe(false);
    }
  });
});

describe('buildSchemaHeaders', () => {
  it('advertises the version without deprecation flags on 2.0', () => {
    expect(buildSchemaHeaders('2.0')).toEqual({
      'X-NexaFX-Schema-Version': '2.0',
    });
  });

  it('adds deprecation and sunset headers on 1.0', () => {
    const headers = buildSchemaHeaders('1.0');

    expect(headers['X-NexaFX-Schema-Version']).toBe('1.0');
    expect(headers['X-NexaFX-Schema-Deprecated']).toBe('true');
    expect(headers['Deprecation']).toBe('true');
    expect(headers['Link']).toContain('rel="deprecation"');
    // RFC 8594 requires an HTTP-date, not ISO-8601.
    expect(headers['Sunset']).toBe(
      new Date(
        `${WEBHOOK_SCHEMA_VERSION_REGISTRY['1.0'].sunsetOn}T00:00:00.000Z`,
      ).toUTCString(),
    );
    expect(headers['Sunset']).toMatch(/GMT$/);
  });
});
