FROM node:20

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies (ignoring scripts to avoid puppeteer/post-install issues if not needed)
RUN npm install --production

# Copy application source
COPY . .

# Start the bot
CMD [ "npm", "start" ]
