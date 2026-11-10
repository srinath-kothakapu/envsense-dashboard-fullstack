# ---- build the React app ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# The containerised dashboard always talks to the API (nginx proxies /api -> api:3001)
ARG VITE_USE_API=true
ENV VITE_USE_API=$VITE_USE_API
RUN npm run build

# ---- serve static files + reverse-proxy the API ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
