# syntax=docker/dockerfile:1

# =============================================================================
# Stage 1 — build: instala dependências e gera o bundle em .mastra/output
# =============================================================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copia só os manifestos primeiro para aproveitar o cache de camadas:
# `npm ci` só reexecuta quando package.json/lock mudam.
COPY package.json package-lock.json ./
RUN npm ci

# Copia o restante do código e gera o bundle de produção (mastra build).
COPY . .
RUN npm run build

# =============================================================================
# Stage 2 — runtime: imagem enxuta só com o bundle (auto-contido, sem deps)
# =============================================================================
FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production \
    # Em container é obrigatório ouvir em 0.0.0.0, não em localhost.
    MASTRA_HOST=0.0.0.0 \
    PORT=4111 \
    # Desliga a telemetria PostHog (evita PostHogFetchNetworkError offline).
    MASTRA_TELEMETRY_DISABLED=1

WORKDIR /app

# O bundle de .mastra/output é auto-contido (seu package.json tem deps vazias),
# então basta copiá-lo — nenhum `npm install` é necessário no runtime.
COPY --from=builder --chown=node:node /app/.mastra/output ./

# Roda como usuário sem privilégios (já existe na imagem oficial do Node).
USER node

EXPOSE 4111

# Considera saudável qualquer resposta HTTP com status < 500.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4111)+'/api').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.mjs"]
