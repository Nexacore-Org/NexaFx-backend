export default () => ({
  port: parseInt(process.env.PORT || '', 10) || 3000,
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '', 10) || 5432,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expirationTime: process.env.JWT_EXPIRATION,
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    detailed: process.env.ENABLE_DETAILED_LOGGING === 'true',
  },
  mailgun: {
    apiKey: process.env.MAILGUN_API_KEY,
    domain: process.env.MAILGUN_DOMAIN,
    baseUrl: process.env.MAILGUN_API_BASE_URL || 'https://api.mailgun.net',
    fromEmail: process.env.MAILGUN_FROM_EMAIL,
    fromName: process.env.MAILGUN_FROM_NAME || 'Your App',
    skipSending: process.env.SKIP_EMAIL_SENDING === 'true',
  },
  app: {
    name: process.env.APP_NAME || 'Your App',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  },
});
