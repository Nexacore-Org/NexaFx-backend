export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  environment: process.env.NODE_ENV || 'development',

  upload: {
    directory: process.env.UPLOAD_DIR || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880', 10),
    allowedTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || [
      'application/pdf',
      'image/jpeg',
      'image/png',
    ],
  },

  verification: {
    codeExpiry: parseInt(
      process.env.PHONE_VERIFICATION_CODE_EXPIRY || '600000',
      10,
    ),
    maxAttempts: parseInt(process.env.MAX_VERIFICATION_ATTEMPTS || '3', 10),
    rateLimitWindow: parseInt(
      process.env.VERIFICATION_RATE_LIMIT_WINDOW || '3600000',
      10,
    ),
  },

  sms: {
    apiKey: process.env.SMS_API_KEY,
    senderName: process.env.SMS_SENDER_NAME || 'NexaFX',
    apiUrl: process.env.SMS_API_URL,
  },

  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:3000',
  },
});
