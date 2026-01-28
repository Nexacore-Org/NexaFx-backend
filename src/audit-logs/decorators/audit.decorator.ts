import { SetMetadata } from '@nestjs/common';

export const Audit = (action: string, entity: string) => 
  SetMetadata('audit', { action, entity });

export const AUDIT_METADATA_KEY = 'audit';