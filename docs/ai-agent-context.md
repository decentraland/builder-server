# AI Agent Context

**Service Purpose:**

The Builder Server is the backend service for the Decentraland Builder application. It provides APIs for creating and managing scene projects, wearable and emote collections, asset packs, and facilitates the publication workflow to the Decentraland platform.

**Key Capabilities:**

- **Scene Project Management**: Create, edit, and deploy scene projects to Decentraland LAND parcels
- **Wearable/Emote Collections**: Manage collections of wearables and emotes with full lifecycle support
- **Item Curation Workflow**: Complete approval workflow with committee review for publishing items
- **Third-Party Collections**: Support for external providers to create and manage collections
- **Asset Pack Management**: Create and share reusable 3D asset packs for scene building
- **Pool System**: Public scene pools for community sharing with likes and categorization
- **S3 Storage Integration**: Manage project files, thumbnails, and content through S3-compatible storage
- **Forum Integration**: Automatic forum post creation for collection submissions

**Communication Pattern:**

- HTTP REST API with JSON payloads
- Authentication via Decentraland Signed Fetch [ADR-44](https://adr.decentraland.org/adr/ADR-44) using `X-Identity-Auth-Chain-*` headers
- API versioning through URL prefix (default: `/v1/`)
- CORS-enabled for browser clients

**Technology Stack:**

- Runtime: Node.js (check `.nvmrc` for version)
- Language: TypeScript
- HTTP Framework: Express.js
- Database: PostgreSQL with `node-pg-migrate` for migrations
- ORM: `decentraland-server` Model class
- Storage: AWS S3 / MinIO (S3-compatible)
- GraphQL Client: Apollo Client for blockchain data queries

**External Dependencies:**

- **PostgreSQL**: Primary database for all service data
- **AWS S3 / MinIO**: Object storage for projects, assets, and content files
- **Decentraland Subgraph APIs**: Blockchain data for collections, items, rarities, and third parties
- **Catalyst Servers**: Content servers for deployed scenes and wearables
- **Discourse Forum API**: Forum integration for collection submission posts

**Key Concepts:**

- **URN (Uniform Resource Name)**: Unique identifier for Decentraland assets. Format varies:

  - Standard collections: `urn:decentraland:matic:collections-v2:{contract_address}`
  - Third-party items: `urn:decentraland:matic:collections-thirdparty:{third_party_id}:{collection_urn_suffix}:{item_urn_suffix}`

- **Standard vs Third-Party Collections**:

  - Standard collections are deployed to Decentraland's collection factory contract
  - Third-party collections are managed by external providers with their own contracts

- **Curation Workflow**:

  - Collections/items go through `pending` → `approved`/`rejected` states
  - Committee members can assign themselves and review submissions
  - Approved items can be published to the blockchain

- **Content Hashing**:

  - Items have `local_content_hash` computed from their contents
  - Curations store `content_hash` at approval time
  - Comparison detects if items have been modified since approval

- **Lock Mechanism**:

  - Collections can be locked (`lock` timestamp) before publication
  - Locked collections cannot be modified until published

- **Pools vs Projects**:

  - Projects are user-owned scene configurations
  - Pools are public copies of projects shared with the community

- **Asset Packs**:

  - Reusable collections of 3D assets for scene building
  - Default packs are available to all users
  - Users can create custom packs (max 80 assets)

- **Slot Usage Cheques**:
  - Third-party collections require "slots" to publish items
  - Cheques are signed authorizations to use slots

**Database Notes:**

- **Address Normalization**: All Ethereum addresses are stored in lowercase for consistent querying

- **Soft Deletes**: Projects and asset packs use `is_deleted` flag instead of hard deletes

- **UUID Primary Keys**: Most tables use UUID primary keys generated client-side

- **JSONB Columns**: Complex data like item `data`, `metrics`, `contents`, and `mappings` are stored as JSONB

- **Curation History**: Both `collection_curations` and `item_curations` tables store history; the latest record (by `created_at`) is the active curation

- **Composite Keys**: `pool_likes` uses composite primary key (`pool_id`, `eth_address`) to enforce one like per user

- **Third-Party Items**: Items with `urn_suffix` set belong to third-party collections; standard items have `urn_suffix = NULL`

**Code Organization:**

```
src/
├── {Entity}/              # Feature modules
│   ├── {Entity}.model.ts  # Database model
│   ├── {Entity}.router.ts # Express router
│   ├── {Entity}.service.ts # Business logic (optional)
│   ├── {Entity}.types.ts  # TypeScript types
│   └── index.ts           # Module exports
├── common/                # Shared utilities
├── database/              # Database connection
├── ethereum/              # Blockchain API clients
├── middleware/            # Express middleware
├── S3/                    # S3 storage utilities
└── utils/                 # General utilities
```

**Testing:**

- Tests are in `spec/` directory and alongside source files (`*.spec.ts`)
- Uses Jest with `@swc/jest` for fast compilation
- Run with `npm test` or `npm run test:coverage`

**Common Patterns:**

- **Router Structure**: Each router extends a base `Router` class and mounts endpoints in `mount()` method
- **Authentication Middleware**: Use `withAuthentication` for authenticated routes, `withPermissiveAuthentication` for optional auth
- **Model Authorization**: Use `withModelAuthorization` to check ownership before operations
- **Error Handling**: Throw `HTTPError` with status codes from `STATUS_CODES`
- **Request Extraction**: Use `server.extractFromReq(req, 'paramName')` to get request parameters

**Environment Variables:**

Key configuration via environment variables:

- `SERVER_PORT`: Server port (default: 5000)
- `API_VERSION`: API version prefix (default: v1)
- `CONNECTION_STRING`: PostgreSQL connection string
- `AWS_*`: S3/MinIO configuration
- `PEER_URL`: Catalyst peer URL
- `BUILDER_SERVER_URL`: Public URL of this server
