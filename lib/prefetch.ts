export const isPrefetchDenial = (detail: unknown): boolean =>
  detail === 'prefetch_disabled' || detail === 'prefetch_limit_exceeded';

export class PrefetchDeniedError extends Error {
  constructor() {
    super('AI prefetch was declined by the server');
    this.name = 'PrefetchDeniedError';
  }
}
