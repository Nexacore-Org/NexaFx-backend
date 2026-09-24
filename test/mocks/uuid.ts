import * as crypto from 'crypto';

export function v4() {
  return crypto.randomUUID();
}

export const NIL = '00000000-0000-0000-0000-000000000000';
export const MAX = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
export function v1() { return crypto.randomUUID(); }
export function v3() { return crypto.randomUUID(); }
export function v5() { return crypto.randomUUID(); }
export function validate() { return true; }
export function version() { return 4; }
