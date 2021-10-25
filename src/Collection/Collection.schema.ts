// DCL: urn:decentraland:{network}:collections-v2:{contract-address}
// TPW: urn:decentraland:{network}:collections-thirdparty:{third-party-name}:{collection-id}(:{item-id})?

const networkMatcher = '(mainnet|ropsten|polygon|mumbai)'
const addressMatcher = '0x[a-fA-F0-9]{40}'
const emailMatcher =
  "^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"

const dclNameMatcher = `collections-v2:${addressMatcher}`
const tpwNameMatcher = 'collections-thirdparty:[^:|\\s]+:([^:|\\s]+)'

export const tpwCollectionURNRegex = new RegExp(
  `^urn:decentraland:${networkMatcher}:${tpwNameMatcher}$`
)

export const collectionSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    urn: {
      type: ['string'],
      pattern: `^urn:decentraland:${networkMatcher}:(?:${tpwNameMatcher}|${dclNameMatcher})$`,
    },
    third_party_id: { type: ['string', 'null'] },
    name: { type: 'string', maxLength: 32 },
    eth_address: { type: 'string' },
    salt: { type: ['string', 'null'] },
    contract_address: { type: ['string', 'null'] },
    is_published: { type: 'boolean' },
    is_approved: { type: 'boolean' },
    minters: {
      type: 'array',
      items: { type: 'string' },
    },
    managers: {
      type: 'array',
      items: { type: 'string' },
    },
    forum_link: { type: ['string', 'null'] },
    reviewed_at: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
  additionalProperties: false,
  required: [
    'id',
    'name',
    'eth_address',
    'salt',
    'contract_address',
    'reviewed_at',
    'created_at',
    'updated_at',
  ],
})

export const saveTOSSchema = Object.freeze({
  type: 'object',
  properties: {
    email: {
      type: 'string',
      pattern: emailMatcher,
    },
    collection_address: { type: 'string', pattern: `^${addressMatcher}$` },
  },
  additionalProperties: false,
  required: ['email', 'collection_address'],
})
