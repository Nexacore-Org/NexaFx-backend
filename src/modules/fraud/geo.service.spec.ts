import { ConfigService } from '@nestjs/config';
import { GeoService } from './geo.service';

describe('GeoService', () => {
  let service: GeoService;

  beforeEach(() => {
    const config = {
      get: jest.fn().mockReturnValue(undefined), // no MAXMIND_DB_PATH
    } as unknown as ConfigService;
    service = new GeoService(config);
  });

  it('returns null geo data when reader is not loaded', () => {
    const result = service.lookup('8.8.8.8');
    expect(result).toEqual({
      country: null,
      city: null,
      latitude: null,
      longitude: null,
      isp: null,
    });
  });

  it('returns null geo data for localhost', async () => {
    await service.onModuleInit();
    expect(service.lookup('127.0.0.1').country).toBeNull();
    expect(service.lookup('::1').country).toBeNull();
  });

  it('returns null for empty ip', () => {
    expect(service.lookup('').country).toBeNull();
  });
});
