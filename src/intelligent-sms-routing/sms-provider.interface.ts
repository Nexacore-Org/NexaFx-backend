export interface SmsSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

/**
 * Abstraction over a concrete SMS gateway. Implementations must never log the
 * message body or the recipient phone number in plaintext.
 */
export interface SmsProvider {
  /** Stable identifier used for routing, health tracking and logging. */
  readonly name: string;

  /**
   * Deliver a single SMS. Implementations should resolve (not throw) with a
   * result object so the router can decide whether to fail over.
   */
  send(to: string, body: string): Promise<SmsSendResult>;
}

export interface SmsProviderConfig {
  provider: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
  termiiApiKey?: string;
  termiiSenderId?: string;
  infobipApiKey?: string;
  infobipBaseUrl?: string;
  infobipSenderId?: string;
}

/**
 * Masks a phone number for logging, keeping only the last 2 digits so operators
 * can correlate without exposing the full MSISDN.
 */
export function maskPhone(phone: string): string {
  if (!phone) {
    return '***';
  }
  const visible = phone.slice(-2);
  return `***${visible}`;
}

/**
 * Masks an SMS body for logging. OTP codes and other secrets must never be
 * written to logs, so only the length is reported.
 */
export function maskBody(body: string): string {
  const length = body ? body.length : 0;
  return `<redacted:${length} chars>`;
}
