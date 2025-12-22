# Builder Server

Backend service for the Decentraland Builder application. Exposes endpoints for managing scene projects, wearable/emote collections, asset packs, and more.

## Table of Contents

- [Features](#features)
- [Dependencies & Related Services](#dependencies--related-services)
- [API Documentation](#api-documentation)
- [Database](#database)
  - [Schema](#schema)
  - [Migrations](#migrations)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Running the Service](#running-the-service)
- [S3 Storage Structure](#s3-storage-structure)
- [Testing](#testing)
- [AI Agent Context](#ai-agent-context)

## Features

- **Scene Projects**: Create, manage, and deploy scene projects to Decentraland parcels
- **Collections & Items**: Manage wearable and emote collections with full curation workflow
- **Asset Packs**: Create and manage reusable 3D asset packs for scene building
- **Pools & Pool Groups**: Public scene pools for community sharing and categorization
- **Third Party Integration**: Support for third-party wearable and emote collections
- **S3 Storage**: Manage project files, thumbnails, and content through S3-compatible storage
- **Curation Workflow**: Full approval workflow for collections and items with committee review
- **Forum Integration**: Automatic forum post creation for collection submissions

## Dependencies & Related Services

This service interacts with the following services:

- **[Decentraland Builder](https://github.com/decentraland/builder)**: Frontend application that consumes this API
- **[Catalyst](https://github.com/decentraland/catalyst)**: Content server for deployed scenes and wearables
- **[Subgraph APIs](https://subgraph.decentraland.org)**: Blockchain data for collections, items, and third parties

External dependencies:

- **PostgreSQL**: Primary database for all service data
- **AWS S3 / MinIO**: Object storage for projects, assets, and content files
- **Discourse Forum API**: Forum integration for collection submissions
- **Decentraland Graph APIs**: Collection, item, and third-party blockchain data

## API Documentation

The API is fully documented using the [OpenAPI standard](https://swagger.io/specification/). The schema is located at [docs/openapi.yaml](docs/openapi.yaml).

### S3 Rewrites

The following endpoints proxy requests to S3 storage:

- `GET /v1/storage/assetPacks/:filename` → Asset pack thumbnails (`:id.png`)
- `GET /v1/storage/contents/:hash` → Content files by hash

### Authenticated S3 Endpoints

These endpoints require authentication:

- `GET /v1/projects/:id/manifest` → Project manifest JSON
- `GET /v1/pools/:id/manifest` → Pool manifest JSON
- `GET /v1/projects/:id/media/:filename` → Project media files

> **Note**: `/v1/` corresponds to the version specified in `.env` with `API_VERSION`

## Database

### Schema

See [docs/database-schemas.md](docs/database-schemas.md) for detailed schema, column definitions, and relationships.

### Migrations

The service uses `node-pg-migrate` for database migrations. These migrations are located in `migrations/`.

#### Create a new migration

Migrations are created by running the create command:

```bash
npm run migrate -- create name-of-the-migration
```

This will create a migration file inside the `migrations/` directory containing the migration setup and rollback procedures.

#### Manually applying migrations

To run migrations manually:

```bash
npm run migrate up
```

To rollback migrations manually:

```bash
npm run migrate down
```

## Getting Started

### Prerequisites

Before running this service, ensure you have the following installed:

- **Node.js**: Check `.nvmrc` for the required version
- **npm**: Comes with Node.js
- **PostgreSQL**: Version 12.x or higher
- **Docker**: For containerized external services (optional)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/decentraland/builder-server.git
cd builder-server
```

2. Install dependencies:

```bash
npm install
```

3. Build the project:

```bash
npm run build
```

### Configuration

The service uses environment variables for configuration. Create a `.env` file in the root directory based on `.env.example`:

```bash
cp .env.example .env
```

Key environment variables:

| Variable            | Description                            |
| ------------------- | -------------------------------------- |
| `SERVER_PORT`       | Port to run the server (default: 5000) |
| `API_VERSION`       | API version prefix (default: v1)       |
| `CONNECTION_STRING` | PostgreSQL connection string           |
| `DEFAULT_USER_ID`   | Default user ID for seeding            |
| `AWS_ACCESS_KEY`    | AWS/MinIO access key                   |
| `AWS_ACCESS_SECRET` | AWS/MinIO secret key                   |
| `AWS_BUCKET_NAME`   | S3 bucket name                         |
| `AWS_STORAGE_URL`   | S3-compatible storage URL              |

### Running the Service

#### Using Docker Compose (Recommended for Development)

This repository provides a `docker-compose.yml` file to run external dependencies locally:

```bash
docker-compose up -d
```

This starts:

- **PostgreSQL** on port 5432
- **Adminer** (database UI) on http://localhost:8080
- **MinIO** (S3-compatible storage) on port 9000
- **MinIO Console** on http://localhost:9001

Configure your `.env` for Docker Compose:

```env
CONNECTION_STRING='postgres://admin:password@localhost:5432/builder-server'
AWS_ACCESS_KEY=admin
AWS_ACCESS_SECRET=password
AWS_BUCKET_NAME=builder-server
AWS_STORAGE_URL=http://localhost:9000
```

#### First-time Setup

```bash
# Run database migrations
npm run migrate up

# Seed initial data (only once, after asset pack changes)
npm run seed

# Optional: Run one-time scripts
npx ts-node ./scripts/parseS3Pools.ts
npx ts-node ./scripts/updateProjectThumbnails.ts
```

#### Running in Development Mode

```bash
npm start
```

Or with auto-reload:

```bash
npm run watch:start
```

#### Windows Subsystem for Linux (WSL)

If using WSL, start PostgreSQL service before running:

```bash
sudo service postgresql start
```

## S3 Storage Structure

```
projects/
├── PROJECT_ID/
│   ├── manifest.json
│   ├── pool.json
│   ├── east.png
│   ├── north.png
│   ├── preview.png
│   ├── south.png
│   ├── thumbnail.png
│   └── west.png
asset_packs/
└── ASSET_PACK_ID.png
contents/
├── HASH1
├── HASH2
└── HASH3
```

## Testing

This service includes test coverage with unit and integration tests.

### Running Tests

Run all tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

Run tests with coverage:

```bash
npm run test:coverage
```

For detailed testing guidelines and standards, refer to the [Decentraland Testing Standards](https://decentraland.notion.site/Testing-standards-46797744fccf4f3eba52335f9866d0eb).

## AI Agent Context

For detailed AI Agent context, see [docs/ai-agent-context.md](docs/ai-agent-context.md).

---

**License**: Apache-2.0
