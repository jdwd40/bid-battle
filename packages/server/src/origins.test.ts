import { afterEach, describe, expect, it } from 'vitest';
import { io as connect } from 'socket.io-client';
import { seededRng } from '@bid-battle/engine';
import { FakeClock } from './clock.js';
import { createGameServer, type GameServerOptions } from './server.js';

let server: ReturnType<typeof createGameServer> | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function start(opts: GameServerOptions = {}) {
  server = createGameServer({ clock: new FakeClock(), botDelayMs: 5, rng: seededRng(3), ...opts });
  return server.listen(0, '127.0.0.1');
}

/** Resolves 'connected' or 'refused' for a handshake sent with the given Origin header. */
function handshake(port: number, origin: string, transport: 'websocket' | 'polling' = 'websocket') {
  const s = connect(`http://127.0.0.1:${port}`, {
    transports: [transport],
    forceNew: true,
    reconnection: false,
    extraHeaders: { origin },
  });
  return new Promise<'connected' | 'refused'>((resolve) => {
    s.on('connect', () => {
      s.close();
      resolve('connected');
    });
    s.on('connect_error', () => {
      s.close();
      resolve('refused');
    });
  });
}

describe('allowed origins', () => {
  it('refuses a handshake from a disallowed origin and accepts the allowed one', async () => {
    const port = await start({ allowedOrigins: ['https://bidbattle.jdwd40.com'] });
    expect(await handshake(port, 'https://evil.example')).toBe('refused');
    expect(await handshake(port, 'https://evil.example', 'polling')).toBe('refused');
    expect(await handshake(port, 'https://bidbattle.jdwd40.com')).toBe('connected');
    expect(await handshake(port, 'https://bidbattle.jdwd40.com', 'polling')).toBe('connected');
  });

  it('allows only the local dev origins when no origins are configured', async () => {
    const port = await start();
    expect(await handshake(port, 'http://localhost:5173')).toBe('connected');
    expect(await handshake(port, `http://127.0.0.1:${port}`)).toBe('connected');
    expect(await handshake(port, `http://localhost:${port}`, 'polling')).toBe('connected');
    expect(await handshake(port, 'https://evil.example')).toBe('refused');
    expect(await handshake(port, 'http://localhost:8080')).toBe('refused');
  });
});
