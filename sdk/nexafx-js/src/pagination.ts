export interface OffsetPage<T> {
  items: T[];
  total: number;
}

export function createAsyncOffsetIterable<T>(
  fetchPage: (page: number) => Promise<OffsetPage<T>>,
): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      let page = 1;
      let seen = 0;
      let total = Number.POSITIVE_INFINITY;

      while (seen < total) {
        const current = await fetchPage(page);
        total = current.total;

        if (!current.items.length) {
          return;
        }

        for (const item of current.items) {
          yield item;
          seen += 1;
        }

        page += 1;
      }
    },
  };
}
