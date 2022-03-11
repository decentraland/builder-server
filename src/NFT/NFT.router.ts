// import { env } from 'decentraland-commons'
import { Router } from '../common/Router'

// const OPEN_SEA_URL = env.get<string | undefined>('OPEN_SEA_URL')!
// const OPEN_SEA_API_KEY = env.get<string | undefined>('OPEN_SEA_API_KEY')!

export class NFTRouter extends Router {
  mount() {
    this.router.get('/nfts', (_req, res) => {
      res.send('howdy')
    })
  }
}
