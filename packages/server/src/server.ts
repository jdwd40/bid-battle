import { randomBytes } from 'node:crypto';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import { secureRng, type MatchConfig, type Rng } from '@bid-battle/engine';
import { realClock, type Clock } from './clock.js';
import type { ClientToServerEvents, ServerToClientEvents } from './protocol.js';
import { Room } from './room.js';

export interface GameServerOptions {
  clock?: Clock;
  botDelayMs?: number;
  config?: Partial<MatchConfig>;
  rng?: Rng;
  /** Serve static files from this directory (production build of the web client). */
  staticDir?: string;
  /** Verbose private audit log to stderr. */
  audit?: boolean;
  /** Rooms with no connected humans are removed after this many ms. */
  idleRoomMs?: number;
}

interface SocketData {
  token?: string;
  code?: string;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode(rng: Rng, length = 5): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ROOM_CODE_ALPHABET[Math.floor(rng.next() * ROOM_CODE_ALPHABET.length)];
  return out;
}

/** In-memory room registry + Socket.IO transport. Restarting the process clears all matches. */
export function createGameServer(opts: GameServerOptions = {}) {
  const clock = opts.clock ?? realClock;
  const rng = opts.rng ?? secureRng();
  const botDelayMs = opts.botDelayMs ?? 900;
  const idleRoomMs = opts.idleRoomMs ?? 10 * 60_000;
  const rooms = new Map<string, Room>();
  const tokenToRoom = new Map<string, string>();
  const sockets = new Map<string, Set<GameSocket>>(); // token -> sockets

  const httpServer = createHttpServer((req, res) => serveStatic(req, res, opts.staticDir));
  const io = new SocketServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: true },
  });

  function broadcast(room: Room) {
    for (const p of room.players.values()) {
      const set = sockets.get(p.token);
      if (!set || set.size === 0) continue;
      const view = room.viewFor(p.token);
      if (!view) continue;
      for (const s of set) s.emit('view', view);
    }
  }

  function createRoom(): Room {
    let code = makeRoomCode(rng);
    while (rooms.has(code)) code = makeRoomCode(rng);
    const room = new Room(code, {
      clock,
      botDelayMs,
      rng,
      config: opts.config,
      tokenFactory: () => randomBytes(24).toString('base64url'),
      onChange: broadcast,
      audit: opts.audit ? (r, entry) => console.error(`[audit ${r.code}]`, JSON.stringify(entry)) : undefined,
    });
    rooms.set(code, room);
    return room;
  }

  function scheduleIdleSweep() {
    clock.setTimeout(() => {
      for (const [code, room] of rooms) {
        if (room.hasConnectedHumans()) continue;
        const lastSeen = Math.max(room.createdAt, ...[...room.players.values()].map((p) => p.disconnectedAt ?? 0));
        if (clock.now() - lastSeen >= idleRoomMs) {
          room.dispose();
          rooms.delete(code);
          for (const p of room.players.values()) tokenToRoom.delete(p.token);
        }
      }
      if (!closed) scheduleIdleSweep();
    }, Math.min(idleRoomMs, 60_000));
  }
  let closed = false;
  scheduleIdleSweep();

  function attach(socket: GameSocket, room: Room, token: string) {
    socket.data.token = token;
    socket.data.code = room.code;
    let set = sockets.get(token);
    if (!set) sockets.set(token, (set = new Set()));
    set.add(socket);
  }

  io.on('connection', (socket) => {
    socket.on('createRoom', (req, ack) => {
      if (typeof req?.name !== 'string') return ack({ ok: false, error: 'name required' });
      const room = createRoom();
      const res = room.addPlayer(req.name);
      if (!res.ok) {
        rooms.delete(room.code);
        return ack(res);
      }
      tokenToRoom.set(res.token, room.code);
      attach(socket, room, res.token);
      ack({ ok: true, code: room.code, token: res.token, seat: res.seat });
      broadcast(room);
    });

    socket.on('joinRoom', (req, ack) => {
      if (typeof req?.name !== 'string' || typeof req?.code !== 'string') return ack({ ok: false, error: 'name and room code required' });
      const room = rooms.get(req.code.trim().toUpperCase());
      if (!room) return ack({ ok: false, error: 'room not found' });
      const res = room.addPlayer(req.name);
      if (!res.ok) return ack(res);
      tokenToRoom.set(res.token, room.code);
      attach(socket, room, res.token);
      ack({ ok: true, code: room.code, token: res.token, seat: res.seat });
      broadcast(room);
    });

    socket.on('rejoin', (req, ack) => {
      const code = typeof req?.token === 'string' ? tokenToRoom.get(req.token) : undefined;
      const room = code ? rooms.get(code) : undefined;
      if (!room) return ack({ ok: false, error: 'that session no longer exists' });
      const p = room.reconnect(req.token);
      if (!p) return ack({ ok: false, error: 'that session no longer exists' });
      attach(socket, room, req.token);
      ack({ ok: true, code: room.code, token: req.token, seat: p.seat });
      broadcast(room);
    });

    const withRoom = <T>(token: unknown, ack: (r: T | { ok: false; error: string }) => void, fn: (room: Room, token: string) => void) => {
      const code = typeof token === 'string' ? tokenToRoom.get(token) : undefined;
      const room = code ? rooms.get(code) : undefined;
      if (!room || typeof token !== 'string') return ack({ ok: false, error: 'you are not in a room' });
      if (socket.data.token !== token) return ack({ ok: false, error: 'this connection does not own that seat' });
      fn(room, token);
    };

    socket.on('setSeat', (req, ack) => withRoom(req?.token, ack, (room, token) => ack(room.setSeat(token, req.seat, req.difficulty) as { ok: true })));
    socket.on('startMatch', (req, ack) => withRoom(req?.token, ack, (room, token) => ack(room.start(token) as { ok: true })));
    socket.on('leaveRoom', (req, ack) =>
      withRoom(req?.token, ack, (room, token) => {
        room.removePlayer(token);
        if (!room.started) tokenToRoom.delete(token);
        sockets.get(token)?.delete(socket);
        socket.data.token = undefined;
        ack({ ok: true });
        if (room.players.size === 0) {
          room.dispose();
          rooms.delete(room.code);
        }
      }),
    );
    socket.on('command', (req, ack) =>
      withRoom(req?.token, ack, (room, token) => ack(room.command({ ...req, token }))),
    );

    socket.on('disconnect', () => {
      const token = socket.data.token;
      if (!token) return;
      const set = sockets.get(token);
      set?.delete(socket);
      if (set && set.size > 0) return; // another tab still holds the seat
      const code = tokenToRoom.get(token);
      const room = code ? rooms.get(code) : undefined;
      room?.disconnect(token);
    });
  });

  return {
    httpServer,
    io,
    rooms,
    listen(port: number, host = '0.0.0.0') {
      return new Promise<number>((resolve) => {
        httpServer.listen(port, host, () => {
          const addr = httpServer.address();
          resolve(typeof addr === 'object' && addr ? addr.port : port);
        });
      });
    },
    async close() {
      closed = true;
      for (const r of rooms.values()) r.dispose();
      io.disconnectSockets(true);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}

// ---------------- static files (production) ----------------

import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

function serveStatic(req: IncomingMessage, res: ServerResponse, dir?: string) {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (!dir) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Bid Battle server running. Start the web client with `npm run dev`.');
    return;
  }
  const url = (req.url ?? '/').split('?')[0];
  let file = normalize(join(dir, url));
  if (!file.startsWith(normalize(dir))) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}
