# 1. Choose a base image - Node.js 18.x LTS is a good choice
FROM node:18-slim

# 2. Create and set the working directory in the container
WORKDIR /usr/src/app

# 3. Copy package.json and package-lock.json (or yarn.lock)
# These are copied first to leverage Docker's layer caching.
# If these files don't change, Docker can reuse the 'npm install' layer.
COPY package*.json ./

# 4. Install project dependencies
# Using --omit=dev if you have devDependencies you don't need in production
RUN npm install --omit=dev

# 5. Copy the rest of your application code into the working directory
# This includes your app.js and the other modules (config.js, scraper.js, etc.)
COPY . .

# 6. (Optional but Recommended) Set a non-root user for security
# RUN addgroup --system --gid 1001 nodejs
# RUN adduser --system --uid 1001 appuser
# USER appuser
# If you use this, make sure file permissions are appropriate, or adjust WORKDIR ownership.
# For simplicity in this example, I'm keeping it as root, but for production, consider a non-root user.

# 7. Define environment variables that will be passed at runtime
# DO NOT PUT YOUR ACTUAL SECRETS HERE. These are just placeholders to show they are expected.
# You will provide the actual values when you run the container.
ENV TWILIO_ACCOUNT_SID="TWILIO_ACCOUNT_SID"
ENV TWILIO_AUTH_TOKEN="TWILIO_AUTH_TOKEN"
ENV TWILIO_WHATSAPP_SANDBOX_NUMBER="TWILIO_WHATSAPP_SANDBOX_NUMBER"
ENV YOUR_WHATSAPP_NUMBER="YOUR_WHATSAPP_NUMBER"
# Add any other ENV variables your script might expect, even if they are optional.

# 8. Specify the command to run when the container starts
# Assuming your main script is app.js
CMD [ "node", "app.js" ]

# If your package.json has a start script like "start": "node app.js",
# you could also use:
# CMD [ "npm", "start" ]
# However, directly calling node is often preferred for simplicity in Docker.
# Adjust "app.js" if your main file is named differently.