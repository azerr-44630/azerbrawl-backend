# ClashAzeri Backend v3

HMAC + AES privacy vault arxitekturası.

## Quraşdırma

    npm install
    cp .env.example .env
    npm run migrate
    npm run dev

## Struktur

- src/config/     - ENV, DB, logger
- src/db/         - migrations
- src/middleware/ - auth, rate limit, validation
- src/services/   - biznes məntiqi
- src/routes/     - HTTP endpointlər
- src/sockets/    - Socket.IO chat
- public/         - static frontend (index.html)
