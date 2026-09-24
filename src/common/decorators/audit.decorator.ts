import { SetMetadata } from '@nestjs/common';

export const AUDIT_ACTION_KEY = 'audit_action';
export const Audit = (action: string) => SetMetadata(AUDIT_ACTION_KEY, action);
