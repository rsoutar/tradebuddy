FROM node:22-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH=/opt/venv/bin:$PATH \
    HOST=0.0.0.0 \
    PORT=80 \
    TRADING_BOT_API_HOST=127.0.0.1 \
    TRADING_BOT_API_PORT=8000 \
    TRADING_BOT_STATE_DIR=/storage/state \
    TRADING_BOT_LOG_DIR=/storage/logs \
    TRADING_BOT_HISTORY_DIR=/storage/binance/spot/monthly/klines \
    VITE_API_BASE_URL=http://127.0.0.1:8000

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv python3-pip supervisor curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/pyproject.toml backend/README.md ./backend/
COPY backend/src ./backend/src

RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && cd /app/backend \
    && /opt/venv/bin/pip install --no-cache-dir .

COPY frontend/package.json frontend/package-lock.json ./frontend/

RUN cd /app/frontend \
    && npm ci

COPY frontend ./frontend

RUN cd /app/frontend \
    && npm run build \
    && npm prune --omit=dev

ENV NODE_ENV=production

COPY deploy/once/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

VOLUME ["/storage"]

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-80}/up" || exit 1

CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
