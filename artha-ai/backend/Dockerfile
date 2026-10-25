FROM python:3.11-slim

# System dependencies for publication-grade PDF generation (WeasyPrint / Cairo / Pango & Headless Chromium)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libglib2.0-0 \
    libffi-dev \
    shared-mime-info \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-dejavu-core \
    fonts-indic \
    fonts-noto-core \
    chromium \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache Python dependencies in Docker layer
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Ensure runtime directories exist
RUN mkdir -p /app/data /app/reports /app/documents

ENV PORT=8080
ENV BASE_DIR=/app
ENV PYTHONUNBUFFERED=1
ENV CHROME_PATH=/usr/bin/chromium

EXPOSE 8080

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --timeout-keep-alive 120"]
