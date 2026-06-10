# Playwright's official image ships the browsers + system deps, so deploys to
# Railway / Render / Fly / any container host work out of the box.
FROM mcr.microsoft.com/playwright:v1.49.1-noble

WORKDIR /app
COPY package.json ./
# Browsers are already in the base image; skip the postinstall download.
RUN npm install --omit=dev --ignore-scripts
COPY server.js ./

ENV PORT=3001
EXPOSE 3001
CMD ["node", "server.js"]
