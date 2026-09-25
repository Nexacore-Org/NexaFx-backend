import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { MailProcessor } from './mail.processor';
import { MailService, SendEmailJob } from './mail.service';
import { MailModule } from './mail.module';

describe('MailProcessor', () => {
  let processor: MailProcessor;
  let mailService: { sendNow: jest.Mock };

  const job = {
    id: 'job-1',
    data: { to: 'alice@example.com', subject: 'KYC approved', text: 'ok' },
  } as Job<SendEmailJob>;

  beforeEach(async () => {
    mailService = { sendNow: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MailProcessor, { provide: MailService, useValue: mailService }],
    }).compile();

    processor = module.get(MailProcessor);
  });

  it('sends the job payload immediately', async () => {
    await processor.process(job);

    expect(mailService.sendNow).toHaveBeenCalledWith(job.data);
  });

  it('rethrows send failures so BullMQ marks the job failed and retries it', async () => {
    mailService.sendNow.mockRejectedValueOnce(new Error('Mailgun 500'));

    await expect(processor.process(job)).rejects.toThrow('Mailgun 500');
  });
});

describe('MailModule', () => {
  it('registers MailService and MailProcessor and exports only MailService', () => {
    expect(Reflect.getMetadata('providers', MailModule)).toEqual([
      MailService,
      MailProcessor,
    ]);
    expect(Reflect.getMetadata('exports', MailModule)).toEqual([MailService]);
  });
});
