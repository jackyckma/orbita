FROM searxng/searxng:latest

COPY settings.yml /etc/searxng/settings.yml

# Zeabur sets PORT; SearXNG listens on 8080 by default — map via env if needed.
EXPOSE 8080
