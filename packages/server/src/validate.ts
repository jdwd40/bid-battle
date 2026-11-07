/** Payload schema validation for client commands. Returns an error string or null. */
export function validateCommand(x: unknown): string | null {
  if (!x || typeof x !== 'object') return 'command must be an object';
  const c = x as Record<string, unknown>;
  const optInt = (k: string) => c[k] === undefined || c[k] === null || Number.isInteger(c[k]);
  const int = (k: string) => Number.isInteger(c[k]);
  switch (c.type) {
    case 'SUBMIT_QUOTE':
      if (!optInt('bid') || !optInt('ask')) return 'prices must be whole numbers';
      if (typeof c.confirm !== 'boolean') return 'confirm flag required';
      return null;
    case 'BUY':
    case 'SELL':
      if (!int('target') || !int('price')) return 'target and price must be whole numbers';
      return null;
    case 'COUNTER':
      if (!int('target') || !int('price')) return 'target and price must be whole numbers';
      if (c.side !== 'bid' && c.side !== 'ask') return 'side must be bid or ask';
      return null;
    case 'RESPOND_COUNTER':
      if (!int('counterId') || typeof c.accept !== 'boolean') return 'counterId and accept required';
      return null;
    case 'PASS':
    case 'READY':
      return null;
    default:
      return 'unknown command type';
  }
}
