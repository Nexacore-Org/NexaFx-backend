import { NotificationType } from './enum/notificationType.enum';

export interface DeepLinkContext {
  notificationId: string;
  resourceId?: string;
  resourceType?: string;
  actionType?: string;
}

type DeepLinkBuilder = (ctx: DeepLinkContext) => string;

const SCHEME = 'nexafx://';

const registry: Partial<Record<NotificationType, DeepLinkBuilder>> = {
  [NotificationType.DEPOSIT_CONFIRMED]: (c) =>
    `${SCHEME}transactions/${c.resourceId ?? ''}`,
  [NotificationType.WITHDRAWAL_PROCESSED]: (c) =>
    `${SCHEME}transactions/${c.resourceId ?? ''}`,
  [NotificationType.SWAP_COMPLETED]: (c) =>
    `${SCHEME}transactions/${c.resourceId ?? ''}`,
  [NotificationType.TRANSACTION_FAILED]: (c) =>
    `${SCHEME}transactions/${c.resourceId ?? ''}`,
  [NotificationType.KYC_APPROVED]: () => `${SCHEME}kyc/status`,
  [NotificationType.KYC_REJECTED]: () => `${SCHEME}kyc/status`,
  [NotificationType.RATE_ALERT_TRIGGERED]: (c) =>
    `${SCHEME}rates/alerts/${c.resourceId ?? ''}`,
  [NotificationType.ESCROW_FUNDED]: (c) =>
    `${SCHEME}escrow/${c.resourceId ?? ''}`,
  [NotificationType.ESCROW_RELEASED]: (c) =>
    `${SCHEME}escrow/${c.resourceId ?? ''}`,
  [NotificationType.ESCROW_DISPUTED]: (c) =>
    `${SCHEME}escrow/${c.resourceId ?? ''}`,
  [NotificationType.VAULT_MATURITY]: (c) =>
    `${SCHEME}vaults/${c.resourceId ?? ''}`,
  [NotificationType.SUPPORT_TICKET_UPDATE]: (c) =>
    `${SCHEME}support/tickets/${c.resourceId ?? ''}`,
  [NotificationType.SECURITY_ALERT]: () => `${SCHEME}security/alerts`,
  [NotificationType.LOAN_REPAYMENT_DUE]: (c) =>
    `${SCHEME}loans/${c.resourceId ?? ''}`,
  [NotificationType.STAKING_UNLOCK]: (c) =>
    `${SCHEME}staking/${c.resourceId ?? ''}`,
  [NotificationType.REFERRAL_REWARDED]: () => `${SCHEME}referrals`,
  [NotificationType.WALLET_UPDATED]: () => `${SCHEME}wallet`,
};

export function resolveDeepLink(
  type: NotificationType,
  ctx: DeepLinkContext,
): string {
  const builder = registry[type];
  return builder ? builder(ctx) : `${SCHEME}home`;
}

/**
 * Resolve a deep link from a notification type plus a loosely-typed data bag.
 * Accepts either `transactionId` or `resourceId` so server-generated
 * notifications (reconciliation, rate alerts, referrals) can be navigated to
 * without callers having to know the registry's context shape.
 */
export function resolveDeepLinkFromData(
  type: NotificationType,
  data: Record<string, any> | undefined,
  notificationId: string,
): string {
  const resourceId =
    data?.resourceId ?? data?.transactionId ?? undefined;
  return resolveDeepLink(type, {
    notificationId,
    resourceId: resourceId != null ? String(resourceId) : undefined,
    resourceType: data?.resourceType,
    actionType: data?.actionType,
  });
}

export function buildFcmData(
  type: NotificationType,
  ctx: DeepLinkContext,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    notificationId: ctx.notificationId,
    type,
    deepLink: resolveDeepLink(type, ctx),
    actionType: ctx.actionType ?? type,
    resourceId: ctx.resourceId ?? '',
    resourceType: ctx.resourceType ?? '',
    timestamp: new Date().toISOString(),
    ...(extra ?? {}),
  };
}
