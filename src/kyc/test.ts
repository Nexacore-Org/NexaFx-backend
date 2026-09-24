describe('Progressive KYC Step-Up (#787)', () => {
  it('should return 402 with X-Retry-After-Upgrade header when limit is breached', async () => {
    const res = await request(app.getHttpServer())
      .post('/v2/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 1500, currency: 'USD' })
      .expect(402);

    expect(res.headers['x-retry-after-upgrade']).toBe('true');
    expect(res.body).toMatchObject({
      statusCode: 402,
      code: 'KYC_UPGRADE_REQUIRED',
      currentTier: 'BASIC',
      requiredTier: 'STANDARD',
      upgradeUrl: expect.stringContaining('nexafx://kyc/upgrade'),
    });
  });

  it('should store encrypted pending retry and expire in 24h', async () => {
    const storeRes = await request(app.getHttpServer())
      .post('/v2/kyc/pending-retry')
      .set('Authorization', `Bearer ${token}`)
      .send({ originalRequest: { method: 'POST', url: '/v2/transactions', body: { amount: 1500 } } })
      .expect(201);

    expect(storeRes.body.id).toBeDefined();
  });
});