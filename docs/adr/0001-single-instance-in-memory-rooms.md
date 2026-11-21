# Single instance with in-memory rooms

Bid Battle runs as one always-on Node process, with every room held in that process's memory and the server serving the web client on the same port. The first audience is groups of friends sharing invite links, so one instance is enough. Shared room state (Redis, sticky sessions, a database) would add cost and moving parts before anyone needs them. Because of this the server can't scale horizontally and a restart ends every match, so deploys wait until no match is running instead of persisting state. It runs as a systemd service behind nginx on app-server, the VPS that already hosts the owner's other apps, because an always-on process there costs nothing extra and needs no new account.

## Considered options

- **Serverless functions**: rejected; long-lived Socket.IO connections and server-side game timers need a persistent process.
- **Multiple instances with shared state**: deferred until a classroom or public audience needs it.
- **Persisting matches to survive restarts**: deferred; friends can rematch, and draining on deploy avoids most losses.
- **Fly.io**: tried first and dropped; its trial stops a machine after five minutes, which ends every room, and an always-on machine would be a new paid account for a host already available.
