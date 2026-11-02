import * as fs from 'fs';
import * as path from 'path';
import { QueryRunner } from 'typeorm';
import { AddUsersComplianceRiskScore20261018001000 } from './20261018001000-AddUsersComplianceRiskScore';

describe('AddUsersComplianceRiskScore20261018001000 migration (#1497)', () => {
  const run = async (hasUsers = true, direction: 'up' | 'down' = 'up') => {
    const queries: string[] = [];
    const queryRunner = {
      hasTable: jest.fn().mockResolvedValue(hasUsers),
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
      }),
    } as unknown as QueryRunner;

    await new AddUsersComplianceRiskScore20261018001000()[direction](
      queryRunner,
    );

    return queries.join('\n');
  };

  it('adds complianceRiskScore integer NOT NULL DEFAULT 0 to users on up()', async () => {
    const sql = await run(true, 'up');

    expect(sql).toContain(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "complianceRiskScore" integer NOT NULL DEFAULT 0',
    );
  });

  it('drops complianceRiskScore from users on down()', async () => {
    const sql = await run(true, 'down');

    expect(sql).toContain(
      'ALTER TABLE "users" DROP COLUMN IF EXISTS "complianceRiskScore"',
    );
  });

  it('is a no-op when the users table is absent', async () => {
    const upSql = await run(false, 'up');
    const downSql = await run(false, 'down');

    expect(upSql).toBe('');
    expect(downSql).toBe('');
  });

  it('matches the User entity declaration for complianceRiskScore', () => {
    const userEntitySource = fs.readFileSync(
      path.resolve(__dirname, '../users/user.entity.ts'),
      'utf8',
    );
    expect(userEntitySource).toMatch(
      /@Column\(\{\s*type:\s*'int',\s*default:\s*0\s*\}\)\s*complianceRiskScore:\s*number;/,
    );
  });
});
