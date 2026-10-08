FROM alpine:3.24
RUN apk add --no-cache ca-certificates
COPY agent-gateway device-gateway /usr/local/bin/
USER 10001:10001
