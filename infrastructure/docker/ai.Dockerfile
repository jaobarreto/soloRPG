FROM ghcr.io/astral-sh/uv:0.13.6 AS uv
FROM python:3.12.16-slim-bookworm
COPY --from=uv /uv /uvx /usr/local/bin/
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY apps/ai-service/pyproject.toml apps/ai-service/uv.lock ./
RUN uv sync --locked --no-dev
COPY apps/ai-service/app ./app
CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
