FROM alpine:3.20

RUN apk add --no-cache ffmpeg ca-certificates curl

COPY --from=bluenviron/mediamtx:latest /mediamtx /mediamtx
COPY mediamtx.yml.template /mediamtx.yml.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

WORKDIR /
EXPOSE 8554 8888 8889 8189/udp 8190/tcp 9997

HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=10s \
  CMD curl -fsS http://127.0.0.1:9997/v3/config/global/get || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
