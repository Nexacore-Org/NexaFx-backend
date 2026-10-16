import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key read by JwtAuthGuard.
 */
export const ALLOW_PARTIAL_AUTH_KEY = 'allowPartialAuth';

/**
 * Marks the routes a `partial_auth` token (2FA pending) may reach before the
 * second factor has been presented.
 *
 * The guard used to recognise those routes by comparing the raw request path
 * against '/two-factor/verify'. URI versioning prefixes every route at
 * runtime ('/v1/two-factor/verify'), so the comparison never matched and the
 * one endpoint meant to be reachable answered 403. Matching on metadata keeps
 * the allow-list independent of the version prefix.
 */
export const AllowPartialAuth = () => SetMetadata(ALLOW_PARTIAL_AUTH_KEY, true);