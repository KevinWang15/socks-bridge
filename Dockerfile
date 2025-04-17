FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY server.js ./
COPY api/ ./api/
COPY middleware/ ./middleware/
COPY utils/ ./utils/
COPY public/ ./public/

# Create directories for mounted volumes
RUN mkdir -p /app/certs
RUN mkdir -p /app/config

# Set environment variables
ENV NODE_ENV=production

# Command to run the application
CMD ["node", "server.js"]
