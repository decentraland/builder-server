export type UploadRedirectionResponse = {
  ipfsHash: string
  contentHash: string
}

export type GetRedirectionHashesResponse = {
  x: number
  y: number
  ipfsHash: string
  contentHash: string
}[]
