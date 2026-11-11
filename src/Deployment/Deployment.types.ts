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
