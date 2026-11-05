# Build stage
FROM node:22-alpine AS build

WORKDIR /app

# Copy package files (packageManager field pins the pnpm version used by corepack)
COPY package.json pnpm-lock.yaml ./

# Enable pnpm via corepack (version from package.json "packageManager")
RUN corepack enable && corepack prepare --activate

# git supplies the real page dates (sitemap lastmod, dateModified) at build time
RUN apk add --no-cache git && git config --global --add safe.directory /app

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Build the site
RUN pnpm build

# Production stage
FROM nginx:alpine

# Copy built files to nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
