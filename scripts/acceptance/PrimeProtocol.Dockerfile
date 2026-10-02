FROM public.ecr.aws/docker/library/node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c
COPY package.json /opt/prime/package.json
COPY node_modules /opt/prime/node_modules
COPY packages /opt/prime/packages
COPY prime-agent-runtime /opt/prime/prime-agent-runtime
RUN printf '#!/bin/sh\nexec /usr/local/bin/node /opt/prime/packages/coding-agent/dist/bundle/cli.js "$@"\n' > /usr/local/bin/prime-pinned && chmod 755 /usr/local/bin/prime-pinned

RUN chmod -R a+rX /opt/prime

LABEL orvilo.prime.commit="7d442aafa985f9342134fac16c2ef41f03fb45c1" orvilo.prime.version="0.9.8"
