# Production image: builds the engine, server and web client, then runs the bundled server,
# which serves the web client on the same port. See docs/adr/0001.
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages packages
RUN npm run build

FROM node:26-slim
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
# The bundle keeps npm packages external, so it needs the server's runtime dependencies.
RUN npm ci --omit=dev --workspace=@bid-battle/server && npm cache clean --force
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/web/dist packages/web/dist
USER node
EXPOSE 3001
CMD ["node", "packages/server/dist/index.js"]
