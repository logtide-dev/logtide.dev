# Build stage
FROM node:22-alpine AS build

WORKDIR /app

# Copy package files (packageManager field pins the pnpm version used by corepack)
COPY package.json pnpm-lock.yaml ./

# Enable pnpm via corepack (version from package.json "packageManager")
RUN corepack enable && corepack prepare --activate

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

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
