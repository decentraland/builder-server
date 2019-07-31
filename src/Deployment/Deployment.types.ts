export type DeploymentAttributes = {
  id: string
  user_id: string
  lastPublishedCID: string | null
  isDirty: boolean
  x: number
  y: number
  rotation: Rotation
}
export type Rotation = 'north' | 'east' | 'south' | 'west'

export const deploymentSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    lastPublishedCID: { type: ['string', 'null'] },
    isDirty: { type: 'boolean' },
    x: { type: 'number' },
    y: { type: 'number' },
    rotation: { type: 'string', pattern: 'north|east|south|west' },
    additionalProperties: false
  },
  additionalProperties: false,
  removeAdditional: true,
  required: ['id', 'lastPublishedCID', 'isDirty', 'x', 'y', 'rotation']
}
