#!/bin/bash

# NexaFX v2 Development Environment Setup Script
# This script automates the entire setup process for local development

set -e  # Exit on any error
set -o pipefail  # Exit if any command in a pipeline fails

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper function to print status messages
print_status() {
    echo -e "${GREEN}▶ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✖ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

echo "=============================================="
echo "   NexaFX v2 Development Environment Setup"
echo "=============================================="
echo ""

# 1. Check Node.js version
print_status "Checking Node.js version..."
REQUIRED_NODE_VERSION="20"
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js v${REQUIRED_NODE_VERSION} or higher."
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//')
if (( ${NODE_VERSION%%.*} < REQUIRED_NODE_VERSION )); then
    print_error "Node.js version ${NODE_VERSION} is too old. Please install v${REQUIRED_NODE_VERSION} or higher."
    exit 1
fi
print_success "Node.js v${NODE_VERSION} is installed"

# 2. Check Docker and Docker Compose
print_status "Checking Docker and Docker Compose..."
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker Desktop."
    exit 1
fi

if ! docker info &> /dev/null; then
    print_error "Docker is not running. Please start Docker Desktop."
    exit 1
fi

print_success "Docker is installed and running"

# 3. Copy .env.example to .env if it doesn't exist
print_status "Setting up environment variables..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    print_success ".env file created from .env.example"
else
    print_warning ".env file already exists (not overwriting)"
fi

# 4. Start Docker Compose services
print_status "Starting Docker services (PostgreSQL)..."
docker-compose up -d

# 5. Wait for PostgreSQL to be healthy
print_status "Waiting for PostgreSQL to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker-compose exec -T postgres pg_isready -U postgres &> /dev/null; then
        print_success "PostgreSQL is ready!"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    print_warning "PostgreSQL not ready yet (attempt $RETRY_COUNT/$MAX_RETRIES)..."
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    print_error "Timed out waiting for PostgreSQL"
    exit 1
fi

# 6. Install npm dependencies
print_status "Installing npm dependencies..."
npm ci

# 7. Run database migrations
print_status "Running database migrations..."
npm run typeorm:migration:run

echo ""
echo "=============================================="
print_success "NexaFX v2 dev environment ready!"
echo ""
echo "Next steps:"
echo "  • Start the app: npm run start:dev"
echo "  • View API docs: http://localhost:3000/api/docs"
echo "  • Run tests: npm run test"
echo "=============================================="
