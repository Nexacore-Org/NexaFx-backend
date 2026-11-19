import { DataSource } from 'typeorm';
import { truncateAll } from '../helpers/db.helper';

function createDataSource(tablePaths: string[]) {
  const query = jest.fn().mockResolvedValue([]);
  const dataSource = {
    entityMetadatas: tablePaths.map((tablePath) => ({ tablePath })),
    query,
  } as unknown as DataSource;
  return { dataSource, query };
}

describe('truncateAll (e2e)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('truncates every table in one statement', async () => {
    const { dataSource, query } = createDataSource([
      'users',
      'public.transactions',
    ]);

    await truncateAll(dataSource);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      'TRUNCATE TABLE "users", "public"."transactions" RESTART IDENTITY CASCADE',
    );
  });

  it('does nothing when there are no tables', async () => {
    const { dataSource, query } = createDataSource([]);

    await truncateAll(dataSource);

    expect(query).not.toHaveBeenCalled();
  });

  it('warns for a missing table', async () => {
    const { dataSource } = createDataSource(['users']);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest
      .spyOn(dataSource, 'query')
      .mockRejectedValue({ code: '42P01', message: 'relation does not exist' });

    await expect(truncateAll(dataSource)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('rethrows unexpected errors', async () => {
    const { dataSource } = createDataSource(['users']);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest
      .spyOn(dataSource, 'query')
      .mockRejectedValue(new Error('permission denied'));

    await expect(truncateAll(dataSource)).rejects.toThrow('permission denied');
  });
});
