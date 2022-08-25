import { env } from 'decentraland-commons'

export const getLandRouterEnvs = () => {
  const ipfsUrl: string | undefined = env.get('IPFS_URL')
  const ipfsProjectId: string | undefined = env.get('IPFS_PROJECT_ID')
  const ipfsApiKey: string | undefined = env.get('IPFS_API_KEY')
  const explorerUrl: string | undefined = env.get('EXPLORER_URL')

  if (!ipfsUrl) {
    throw new Error('IPFS_URL not defined')
  }

  if (!ipfsProjectId) {
    throw new Error('IPFS_PROJECT_ID not defined')
  }

  if (!ipfsApiKey) {
    throw new Error('IPFS_API_KEY not defined')
  }

  if (!explorerUrl) {
    throw new Error('EXPLORER_URL not defined')
  }

  return {
    ipfsUrl,
    ipfsProjectId,
    ipfsApiKey,
    explorerUrl,
  }
}
