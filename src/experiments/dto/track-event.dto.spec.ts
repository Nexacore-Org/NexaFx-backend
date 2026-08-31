import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { TrackEventDto } from './track-event.dto';

describe('TrackEventDto', () => {
  it('should pass validation with valid data', async () => {
    const dto = plainToInstance(TrackEventDto, {
      experimentKey: 'checkout-flow',
      eventName: 'purchase',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass with optional metadata', async () => {
    const dto = plainToInstance(TrackEventDto, {
      experimentKey: 'checkout-flow',
      eventName: 'purchase',
      metadata: { amount: 99.99, currency: 'USD' },
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should pass without metadata', async () => {
    const dto = plainToInstance(TrackEventDto, {
      experimentKey: 'signup-test',
      eventName: 'click',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail when experimentKey is empty', async () => {
    const dto = plainToInstance(TrackEventDto, {
      experimentKey: '',
      eventName: 'click',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when eventName is empty', async () => {
    const dto = plainToInstance(TrackEventDto, {
      experimentKey: 'test',
      eventName: '',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when experimentKey exceeds max length', async () => {
    const dto = plainToInstance(TrackEventDto, {
      experimentKey: 'a'.repeat(256),
      eventName: 'click',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when eventName exceeds max length', async () => {
    const dto = plainToInstance(TrackEventDto, {
      experimentKey: 'test',
      eventName: 'a'.repeat(256),
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when experimentKey is not provided', async () => {
    const dto = plainToInstance(TrackEventDto, {
      eventName: 'click',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should fail when eventName is not provided', async () => {
    const dto = plainToInstance(TrackEventDto, {
      experimentKey: 'test',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
