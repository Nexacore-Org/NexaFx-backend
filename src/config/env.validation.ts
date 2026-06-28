import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .required(),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().required(),
  ALLOWED_ORIGINS: Joi.string().allow('', null),
  SLA_HOURS_LOW: Joi.number().default(72),
  SLA_HOURS_MEDIUM: Joi.number().default(24),
  SLA_HOURS_HIGH: Joi.number().default(8),
  SLA_HOURS_URGENT: Joi.number().default(2),
  MAILGUN_API_KEY: Joi.string().optional(),
  MAILGUN_DOMAIN: Joi.string().optional(),
  MAILGUN_FROM_EMAIL: Joi.string().optional(),
  MAILGUN_FROM_NAME: Joi.string().optional(),
});
