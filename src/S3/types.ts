import { Request } from 'express'

export enum S3Type {
  PROJECT = 'projects',
  CONTENT = 'contents',
  ASSET_PACK = 'asset_packs',
  ITEM = 'items',
}

export type MulterFile = Express.Multer.File

export type GetFileKey = (file: MulterFile, req: Request) => Promise<string>

export type UploaderOptions = Partial<{
  getFileKey: GetFileKey
  maxFileSize: number
  mimeTypes: string[]
}>
