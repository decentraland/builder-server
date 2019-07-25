export interface ProjectAttributes {
  id?: string
  title: string
  description: string
  thumbnail: string
  sceneId: string
  userId: string
  layout: { cols: number; rows: number }
  created_at?: number
  updated_at?: number
}
