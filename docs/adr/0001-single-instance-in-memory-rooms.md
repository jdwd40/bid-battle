# Single instance with in-memory rooms

Bid Battle runs as one always-on Node process on a small managed container host, with every room held in that process's memory and the server serving the web client on the same port. The first audience is groups of friends sharing invite links, so one instance is enough. Shared room state (Redis, sticky sessions, a database) would add cost and moving parts before anyone needs them. Because of this the server can't scale horizontally and a restart ends every match, so deploys wait until no match is running instead of persisting state. The first host is one always-running Fly.io machine with auto-stop turned off, because a stopped machine would drop rooms and a cold start would slow down invite links.

## Considered options

- **Serverless functions**: rejected; long-lived Socket.IO connections and server-side game timers need a persistent process.
- **Multiple instances with shared state**: deferred until a classroom or public audience needs it.
- **Persisting matches to survive restarts**: deferred; friends can rematch, and draining on deploy avoids most losses.
