# SeaSarathi backend image. Build from the REPO ROOT (the API reads the shared
# data/static/*.geojson that lives beside backend/):
#   docker build -f deploy/Dockerfile -t seasarathi-api .
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first so code changes don't reinstall them.
COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

COPY backend backend
COPY data/static data/static

WORKDIR /app/backend
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=4)" || exit 1

# ONE worker on purpose: the app runs background loops (Copernicus grid, IMD
# scrapers) inside the process. More workers would each run their own copy.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
