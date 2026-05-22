export class HumanPlayAbortError extends Error {
  constructor() {
    super('Human play aborted by user.');
    this.name = 'HumanPlayAbortError';
  }
}
