export type DeploymentAttributes = {
  id: string
  eth_address: string | null
  last_published_cid: string | null
  is_dirty: boolean
  x: number
  y: number
  rotation: Rotation
}
export type Rotation = 'north' | 'east' | 'south' | 'west'

export const deploymentSchema = Object.freeze({
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    last_published_cid: { type: ['string', 'null'] },
    is_dirty: { type: 'boolean' },
    x: { type: 'number' },
    y: { type: 'number' },
    rotation: { type: 'string', pattern: 'north|east|south|west' },
    eth_address: { type: ['string', 'null'] },
    created_at: { type: ['string', 'null'] },
    updated_at: { type: ['string', 'null'] },
  },
  additionalProperties: false,
  required: ['id', 'last_published_cid', 'is_dirty', 'x', 'y', 'rotation'],
})
