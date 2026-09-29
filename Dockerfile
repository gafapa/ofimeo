# Ofimeo for schools: the web app served by Ofimeo Relay (Nostr relay + TURN +
# HTTPS), in one small image. Guide: docs/deploy-school.md.
#
#   docker build -t ofimeo .
#   docker compose up -d            (docker-compose.yml)
#
# Multi-architecture (Raspberry Pi included):
#   docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 -t ofimeo .

# ---------- 1. Web app (same for every architecture) ----------
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS web
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# The legal pages are built from legal.config.json: edit it (owner, DPO,
# hosting) before building an image for your school.
RUN npm run build

# ---------- 2. Relay (cross-compiled, static) ----------
FROM --platform=$BUILDPLATFORM golang:1.27.1-bookworm AS relay
ARG TARGETOS=linux
ARG TARGETARCH=amd64
ARG TARGETVARIANT=
ARG VERSION=docker
WORKDIR /src
COPY relay/go.mod relay/go.sum ./
RUN go mod download
COPY relay/ ./
RUN GOARM="$(echo "$TARGETVARIANT" | tr -d v)"; \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH GOARM=${GOARM:-7} \
    go build -trimpath -ldflags "-s -w -X main.version=$VERSION -X main.buildDate=$(date -u +%Y-%m-%d)" -o /out/ofimeo-relay . \
 && mkdir -p /out/data /out/config

# ---------- 3. Final image ----------
# distroless/static: CA certificates and tzdata, no shell, runs as an unprivileged user.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=relay /out/ofimeo-relay /ofimeo-relay
COPY --from=web /src/dist /app
COPY --from=relay --chown=65532:65532 /out/data /data
COPY --from=relay /out/config /config
# Defaults for a container (see relay/school.go for every OFIMEO_* variable).
# Ports above 1024, so no privileges are needed; publish them as 443/80.
ENV OFIMEO_SERVE_APP=/app \
    OFIMEO_SCHOOL_CONFIG=/config/ofimeo.config.json \
    OFIMEO_HTTPS_PORT=8443 \
    OFIMEO_HTTP_PORT=8080 \
    OFIMEO_TURN_PORT=3478
VOLUME ["/data"]
EXPOSE 8443/tcp 8080/tcp 3478/udp 3478/tcp
HEALTHCHECK --interval=30s --timeout=6s --start-period=20s --retries=3 CMD ["/ofimeo-relay", "healthcheck"]
ENTRYPOINT ["/ofimeo-relay", "run", "--data", "/data"]
