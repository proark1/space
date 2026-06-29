# SIGNAL LOST — deploys the Vite client landing page.
# The build stage installs the TypeScript workspace and emits apps/client/dist.
# The runtime stage serves the static build on Railway's injected $PORT.
FROM node:22-slim AS build

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json tsconfig.base.json ./
COPY apps/ ./apps/
COPY packages/ ./packages/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @sl/client build

FROM python:3.12-slim

WORKDIR /app
COPY --from=build /app/apps/client/dist ./
COPY --from=build /app/apps/client/static_server.py ./static_server.py
COPY lookdev/audio.js lookdev/flow.js lookdev/hero.js lookdev/nav.js lookdev/units.js lookdev/units_alpha.js ./
COPY lookdev/units.html lookdev/launch.html lookdev/lobby.html lookdev/pad.html lookdev/dock.html lookdev/exterior.html lookdev/units_alpha.html ./
COPY lookdev/index.html ./game.html
# Unit Forge: the shared Tripo3D backend (imported by static_server.py), the /forge page, the /model viewer
COPY lookdev/tripo_forge.py ./tripo_forge.py
COPY lookdev/unitforge.js lookdev/units_forge.html lookdev/model.html ./

CMD ["python3", "static_server.py"]
