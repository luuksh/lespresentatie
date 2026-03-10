FROM caddy:2

COPY deploy/internal/Caddyfile.template /etc/caddy/Caddyfile.template
COPY deploy/internal/entrypoint.sh /usr/local/bin/internal-entrypoint.sh

RUN chmod +x /usr/local/bin/internal-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/internal-entrypoint.sh"]
