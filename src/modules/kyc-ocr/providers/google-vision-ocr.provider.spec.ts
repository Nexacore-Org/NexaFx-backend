import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GoogleVisionOcrProvider } from './google-vision-ocr.provider';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GoogleVisionOcrProvider', () => {
  let provider: GoogleVisionOcrProvider;
  let config: { get: jest.Mock };

  beforeEach(() => {
    config = { get: jest.fn() };
    provider = new GoogleVisionOcrProvider(config as unknown as ConfigService);
    jest.clearAllMocks();
  });

  it('returns confidence 0 when API key is missing (no silent fake fields)', async () => {
    config.get.mockReturnValue(undefined);
    const result = await provider.extract('gs://bucket/doc.jpg');
    expect(result.confidence).toBe(0);
    expect(result.documentNumber).toBeUndefined();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('maps a realistic Vision API response into documentNumber and DOB', async () => {
    config.get.mockReturnValue('test-api-key');
    mockedAxios.post.mockResolvedValue({
      data: {
        responses: [
          {
            fullTextAnnotation: {
              text: 'PASSPORT\nName: John Smith\nDocument AB998877\nDOB 1992-05-15\n',
            },
          },
        ],
      },
    });

    const result = await provider.extract('https://cdn.example/doc.jpg');

    expect(mockedAxios.post).toHaveBeenCalled();
    expect(result.documentNumber).toMatch(/^[A-Z0-9]{6,12}$/);
    expect(result.dateOfBirth).toBe('1992-05-15');
    expect(result.confidence).toBe(60);
  });

  it('returns confidence 0 when Vision response has empty text', async () => {
    config.get.mockReturnValue('test-api-key');
    mockedAxios.post.mockResolvedValue({
      data: { responses: [{ fullTextAnnotation: { text: '' } }] },
    });

    const result = await provider.extract('img');
    expect(result.confidence).toBe(0);
    expect(result.documentNumber).toBeUndefined();
  });
});
