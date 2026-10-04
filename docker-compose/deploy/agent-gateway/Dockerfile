FROM alpine:3.24
RUN apk add --no-cache ca-certificates
COPY agent-gateway /usr/local/bin/agent-gateway
USER 10001:10001
ENTRYPOINT ["/usr/local/bin/agent-gateway"]
