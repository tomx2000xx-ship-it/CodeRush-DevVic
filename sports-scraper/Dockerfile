FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PORT=8000 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

# Pin the public scraper source to a reviewed commit for reproducible builds.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && git clone https://github.com/omkarcloud/flashscore-scraper.git . \
    && git checkout 6b8a517381576b7a7a0f45ad4a23a9780fa26b72 \
    && python -m pip install --no-cache-dir -r requirements.txt

EXPOSE 8000
CMD ["python", "run.py"]
