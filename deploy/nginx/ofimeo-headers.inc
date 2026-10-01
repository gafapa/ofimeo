# Security headers for Ofimeo (included by ofimeo.conf at every level, because
# nginx drops inherited add_header lines in a location that has its own).
# The app needs: 'unsafe-eval' (draw.io shape code in diagrams),
# 'wasm-unsafe-eval' (grammar checker), inline styles (editors), blob: workers, and connections to Nostr
# relays, the school relay and Nextcloud (https:, wss:, ws: on the LAN).
# Cross-origin isolation (COOP/COEP) is NOT needed: do not add it.
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' data: blob: https: wss: ws:; worker-src 'self' blob:; media-src 'self' data: blob:; frame-src 'self' blob: data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
