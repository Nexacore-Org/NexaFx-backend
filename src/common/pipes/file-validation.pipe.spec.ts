import {
  BadRequestException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { FileValidationPipe } from './file-validation.pipe';
import {
  readMp4DurationSeconds,
  validateSelfieVideo,
} from '../helpers/video-duration-scanner.helper';

jest.mock('file-type', () => ({ fromBuffer: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fromBuffer } = require('file-type');

const MP4_MIME = 'video/mp4';
const JPEG_MIME = 'image/jpeg';

const makeFile = (overrides: Partial<Express.Multer.File> = {}) =>
  ({
    buffer: Buffer.from('file'),
    size: 1024,
    originalname: 'upload.bin',
    mimetype: JPEG_MIME,
    ...overrides,
  }) as Express.Multer.File;

const asFiles = (
  ...files: Array<[string, Express.Multer.File]>
): Record<string, Express.Multer.File[]> =>
  Object.fromEntries(
    files.map(([field, file]) => [field, [{ ...file, fieldname: field }]]),
  );

const metadata = { type: 'body' } as never;

describe('FileValidationPipe', () => {
  let pipe: FileValidationPipe;

  beforeEach(() => {
    jest.clearAllMocks();
    (fromBuffer as jest.Mock).mockResolvedValue({ mime: JPEG_MIME });
    pipe = new FileValidationPipe();
  });

  describe('limits follow the field name, not the client', () => {
    it('applies the 5MB document limit to documentFront', async () => {
      const file = makeFile({
        mimetype: MP4_MIME,
        size: 20 * 1024 * 1024,
      });

      await expect(
        pipe.transform(asFiles(['documentFront', file]), metadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a video payload on a document field even at 1MB', async () => {
      (fromBuffer as jest.Mock).mockResolvedValue({ mime: MP4_MIME });
      const file = makeFile({ mimetype: MP4_MIME, size: 1024 * 1024 });

      await expect(
        pipe.transform(asFiles(['documentFront', file]), metadata),
      ).rejects.toThrow(/invalid or unsupported format/i);
    });

    it('allows a 20MB video on videoSelfie', async () => {
      (fromBuffer as jest.Mock).mockResolvedValue({ mime: MP4_MIME });
      const file = makeFile({ mimetype: MP4_MIME, size: 20 * 1024 * 1024 });

      await expect(
        pipe.transform(asFiles(['videoSelfie', file]), metadata),
      ).resolves.toBeDefined();
    });

    it('rejects a 20MB file on selfie even when it claims to be a video', async () => {
      (fromBuffer as jest.Mock).mockResolvedValue({ mime: JPEG_MIME });
      const file = makeFile({ mimetype: MP4_MIME, size: 20 * 1024 * 1024 });

      await expect(
        pipe.transform(asFiles(['selfie', file]), metadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('passes a valid document through', async () => {
      const file = makeFile();

      await expect(
        pipe.transform(asFiles(['documentFront', file]), metadata),
      ).resolves.toBeDefined();
    });
  });
});

describe('scanBuffer', () => {
  const originalEnv = { ...process.env };

  const loadScanner = () =>
    require('./virus-scanner.helper').scanBuffer as (
      buffer: Buffer,
    ) => Promise<void>;

  /** Minimal net.Socket stand-in the scanner can drive. */
  const fakeSocket = () => {
    const handlers: Record<string, (arg?: unknown) => void> = {};
    return {
      on: (event: string, handler: (arg?: unknown) => void) => {
        handlers[event] = handler;
        if (event === 'connect') {
          setImmediate(() => handler());
        }
        return undefined;
      },
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
      emit: (event: string, arg?: unknown) => handlers[event]?.(arg),
      reply: (payload: string) => {
        handlers.data?.(Buffer.from(payload));
        handlers.end?.();
      },
    };
  };

  beforeEach(() => {
    jest.resetModules();
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = '3310';
    delete process.env.CLAMAV_FAIL_OPEN;
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const mockConnection = (socket: ReturnType<typeof fakeSocket>) => {
    const net = require('net');
    jest.spyOn(net, 'createConnection').mockReturnValue(socket as never);
  };

  it('rejects a clean-looking ERROR reply', async () => {
    const socket = fakeSocket();
    mockConnection(socket);

    const promise = loadScanner()(Buffer.from('x'));
    setImmediate(() => socket.reply('stream: Instream size limit exceeded. ERROR\\n'));

    await expect(promise).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects a timeout in production', async () => {
    const socket = fakeSocket();
    mockConnection(socket);

    const promise = loadScanner()(Buffer.from('x'));
    setImmediate(() => socket.emit('timeout'));

    await expect(promise).rejects.toThrow(ServiceUnavailableException);
  });

  it('rejects a connection error in production', async () => {
    const socket = fakeSocket();
    mockConnection(socket);

    const promise = loadScanner()(Buffer.from('x'));
    setImmediate(() => socket.emit('error', new Error('ECONNREFUSED')));

    await expect(promise).rejects.toThrow(ServiceUnavailableException);
  });

  it('rejects when ClamAV is not configured in production', async () => {
    delete process.env.CLAMAV_HOST;
    jest.resetModules();

    await expect(loadScanner()(Buffer.from('x'))).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('accepts a clean reply', async () => {
    const socket = fakeSocket();
    mockConnection(socket);

    const promise = loadScanner()(Buffer.from('x'));
    setImmediate(() => socket.reply('stream: OK\\n'));

    await expect(promise).resolves.toBeUndefined();
  });

  it('still rejects a detected virus', async () => {
    const socket = fakeSocket();
    mockConnection(socket);

    const promise = loadScanner()(Buffer.from('x'));
    setImmediate(() => socket.reply('stream: Eicar-Test-Signature FOUND\\n'));

    await expect(promise).rejects.toThrow(UnprocessableEntityException);
  });

  it('fails open in development', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.CLAMAV_HOST;
    jest.resetModules();

    await expect(loadScanner()(Buffer.from('x'))).resolves.toBeUndefined();
  });

  it('honours CLAMAV_FAIL_OPEN=false outside production', async () => {
    process.env.NODE_ENV = 'test';
    process.env.CLAMAV_FAIL_OPEN = 'false';
    delete process.env.CLAMAV_HOST;
    jest.resetModules();

    await expect(loadScanner()(Buffer.from('x'))).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});

describe('validateSelfieVideo', () => {
  const buildMp4 = (timescale: number, duration: number): Buffer => {
    const header = Buffer.alloc(4);
    header.write('mvhd', 0, 'ascii');
    const body = Buffer.alloc(16);
    body.writeUInt8(0, 0); // version
    body.writeUInt32BE(0, 4); // creation time
    body.writeUInt32BE(0, 8); // modification time
    body.writeUInt32BE(timescale, 12);
    body.writeUInt32BE(duration, 14);
    return Buffer.concat([Buffer.from('ftyp'), header, body]);
  };

  it('rejects a 45 second video', async () => {
    const buffer = buildMp4(1000, 45_000);

    expect(readMp4DurationSeconds(buffer)).toBe(45);
    await expect(validateSelfieVideo(buffer)).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('accepts a 10 second video', async () => {
    await expect(validateSelfieVideo(buildMp4(1000, 10_000))).resolves.toBeUndefined();
  });

  it('throws 422 rather than a bare Error for an oversized file', async () => {
    await expect(
      validateSelfieVideo(Buffer.alloc(51 * 1024 * 1024)),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('returns null for a container without an mvhd box', () => {
    expect(readMp4DurationSeconds(Buffer.from('not-an-mp4'))).toBeNull();
  });

  it('still enforces the size limit when the duration cannot be read', async () => {
    await expect(
      validateSelfieVideo(Buffer.alloc(51 * 1024 * 1024)),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});