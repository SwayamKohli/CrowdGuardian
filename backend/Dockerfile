FROM node:22-bullseye

# Install python3, pip, virtualenv, and build tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Copy package files and install production node modules
COPY package*.json ./
RUN npm ci --only=production

# Set up python virtual environment matching backend/venv
RUN python3 -m venv venv
RUN ./venv/bin/pip install --no-cache-dir --upgrade pip
RUN ./venv/bin/pip install --no-cache-dir scikit-learn numpy pandas osmnx networkx

# Copy all application code
COPY . .

# Expose backend port
EXPOSE 3456

CMD ["node", "server.js"]
