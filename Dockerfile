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

CMD ["sh", "-c", "python3 -m http.server ${PORT:-8080} --bind 0.0.0.0 --directory /app"]
