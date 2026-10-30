FROM node:24.17.0-bookworm-slim
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages ./packages
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/ai-service/package.json apps/ai-service/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @solo-rpg/shared-contracts build
