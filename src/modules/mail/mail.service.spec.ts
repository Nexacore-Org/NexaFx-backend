import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import Mailgun from 'mailgun.js';
import { MailService, SendEmailJob } from './mail.service';
import { EMAIL_QUEUE } from '../queues/queue.constants';

const mockCreate = jest.fn();
const mockClient = jest.fn(() => ({ messages: { create: mockCreate } }));

jest.mock('mailgun.js', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ client: mockClient })),
}));
jest.mock('form-data', () => ({ __esModule: true, default: jest.fn() }));

describe('MailService', () => {
  let service: MailService;
  let queue: { add: jest.Mock };
  let config: Record<string, string | undefined>;

  const job: SendEmailJob = {
    to: 'alice@example.com',
    subject: 'Reset your password',
    html: '<p>hi</p>',
    text: 'hi',
  };

  beforeEach(async () => {
    config = {
      MAILGUN_API_KEY: 'key-123',
      MAILGUN_DOMAIN: 'mg.nexafx.com',
      MAILGUN_FROM_EMAIL: 'no-reply@nexafx.com',
      MAILGUN_FROM_NAME: 'NexaFX Team',
    };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    mockCreate.mockResolvedValue({ id: 'msg-1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: getQueueToken(EMAIL_QUEUE), useValue: queue },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => config[key]) },
        },
      ],
    }).compile();

    service = module.get(MailService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('enqueueEmail', () => {
    it('adds a send-email job to the queue and does not send inline', async () => {
      await service.enqueueEmail(job);

      expect(queue.add).toHaveBeenCalledWith('send-email', job);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('falls back to sending inline when the queue is unavailable', async () => {
      queue.add.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await service.enqueueEmail(job);

      expect(mockCreate).toHaveBeenCalledWith(
        'mg.nexafx.com',
        expect.objectContaining({ to: ['alice@example.com'] }),
      );
    });

    it('handles non-Error rejections from the queue', async () => {
      queue.add.mockRejectedValueOnce('redis down');

      await expect(service.enqueueEmail(job)).resolves.toBeUndefined();
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it('propagates the inline send error when both queue and Mailgun fail', async () => {
      queue.add.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      mockCreate.mockRejectedValueOnce(new Error('Mailgun 401'));

      await expect(service.enqueueEmail(job)).rejects.toThrow('Mailgun 401');
    });
  });

  describe('sendNow', () => {
    it('sends via Mailgun with the configured domain, sender and credentials', async () => {
      await service.sendNow(job);

      expect(Mailgun).toHaveBeenCalledTimes(1);
      expect(mockClient).toHaveBeenCalledWith({ username: 'api', key: 'key-123' });
      expect(mockCreate).toHaveBeenCalledWith('mg.nexafx.com', {
        from: 'NexaFX Team <no-reply@nexafx.com>',
        to: ['alice@example.com'],
        subject: 'Reset your password',
        html: '<p>hi</p>',
        text: 'hi',
      });
    });

    it('passes an array of recipients through unchanged', async () => {
      await service.sendNow({ ...job, to: ['a@x.com', 'b@x.com'] });

      expect(mockCreate).toHaveBeenCalledWith(
        'mg.nexafx.com',
        expect.objectContaining({ to: ['a@x.com', 'b@x.com'] }),
      );
    });

    it('uses an explicit from address when provided', async () => {
      await service.sendNow({ ...job, from: 'Support <support@nexafx.com>' });

      expect(mockCreate).toHaveBeenCalledWith(
        'mg.nexafx.com',
        expect.objectContaining({ from: 'Support <support@nexafx.com>' }),
      );
    });

    it('defaults the sender name to NexaFX', async () => {
      config.MAILGUN_FROM_NAME = undefined;

      await service.sendNow(job);

      expect(mockCreate).toHaveBeenCalledWith(
        'mg.nexafx.com',
        expect.objectContaining({ from: 'NexaFX <no-reply@nexafx.com>' }),
      );
    });

    it('skips sending entirely when SKIP_EMAIL_SENDING is "true"', async () => {
      config.SKIP_EMAIL_SENDING = 'true';

      await service.sendNow(job);

      expect(Mailgun).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('does not skip for other SKIP_EMAIL_SENDING values', async () => {
      config.SKIP_EMAIL_SENDING = 'false';

      await service.sendNow(job);

      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it.each(['MAILGUN_API_KEY', 'MAILGUN_DOMAIN', 'MAILGUN_FROM_EMAIL'])(
      'throws when %s is missing and never calls Mailgun',
      async (key) => {
        config[key] = undefined;

        await expect(service.sendNow(job)).rejects.toThrow(
          'Missing Mailgun configuration',
        );
        expect(Mailgun).not.toHaveBeenCalled();
      },
    );

    it('propagates Mailgun API errors so the queue can retry', async () => {
      mockCreate.mockRejectedValueOnce(new Error('Mailgun 500'));

      await expect(service.sendNow(job)).rejects.toThrow('Mailgun 500');
    });
  });
});
