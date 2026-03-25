export interface NexaFxApiErrorPayload {
  success?: false;
  statusCode?: number;
  timestamp?: string;
  path?: string;
  method?: string;
  message?: string | string[];
  error?: string;
}

export class NexaFxError extends Error {
  readonly statusCode?: number;
  readonly payload?: NexaFxApiErrorPayload;

  constructor(message: string, statusCode?: number, payload?: NexaFxApiErrorPayload) {
    super(message);
    this.name = 'NexaFxError';
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

export class NexaFxAuthError extends NexaFxError {
  constructor(message: string, statusCode?: number, payload?: NexaFxApiErrorPayload) {
    super(message, statusCode, payload);
    this.name = 'NexaFxAuthError';
  }
}

export class NexaFxValidationError extends NexaFxError {
  constructor(message: string, statusCode?: number, payload?: NexaFxApiErrorPayload) {
    super(message, statusCode, payload);
    this.name = 'NexaFxValidationError';
  }
}

export class NexaFxRateLimitError extends NexaFxError {
  readonly retryAfter?: number;

  constructor(
    message: string,
    statusCode?: number,
    payload?: NexaFxApiErrorPayload,
    retryAfter?: number,
  ) {
    super(message, statusCode, payload);
    this.name = 'NexaFxRateLimitError';
    this.retryAfter = retryAfter;
  }
}

export function toNexaFxError(
  statusCode: number,
  payload?: NexaFxApiErrorPayload,
  retryAfter?: number,
): NexaFxError {
  const rawMessage = payload?.message;
  const message = Array.isArray(rawMessage)
    ? rawMessage.join(', ')
    : rawMessage || `Request failed with status ${statusCode}`;

  if (statusCode === 401 || statusCode === 403) {
    return new NexaFxAuthError(message, statusCode, payload);
  }

  if (statusCode === 400 || statusCode === 422) {
    return new NexaFxValidationError(message, statusCode, payload);
  }

  if (statusCode === 429) {
    return new NexaFxRateLimitError(message, statusCode, payload, retryAfter);
  }

  return new NexaFxError(message, statusCode, payload);
}
