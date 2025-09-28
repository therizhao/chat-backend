FROM node:22-slim AS build

RUN mkdir -p /opt/build
WORKDIR /opt/build

COPY . .

RUN npm ci
RUN npm run test
RUN npm run build

# --- --- ---

FROM node:22-slim

ENV NODE_ENV=production

RUN mkdir -p /opt/service
WORKDIR /opt/service

COPY --from=build /opt/build/dist/index.cjs index.cjs

ENTRYPOINT ["node", "index.cjs"]