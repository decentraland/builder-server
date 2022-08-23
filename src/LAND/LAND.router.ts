import { env } from 'decentraland-commons'
import { server } from 'decentraland-server'
import FormData from 'form-data'
import { Request } from 'express'
//@ts-ignore
import * as contentHash from 'content-hash'
import fetch, { Response as FetchResponse } from 'node-fetch'
import { HTTPError, STATUS_CODES } from '../common/HTTPError'
import { Router } from '../common/Router'
import { getCID } from '../utils/cid'
import {
  GetRedirectionHashesResponse,
  UploadRedirectionResponse,
} from './LAND.types'

export class LANDRouter extends Router {
  mount() {
    this.router.get(
      '/lands/redirection/hashes',
      server.handleRequest(this.getRedirectionHashes)
    )

    this.router.post(
      '/lands/:coords/redirection',
      server.handleRequest(this.uploadRedirection)
    )
  }

  private uploadRedirection = async (
    req: Request
  ): Promise<UploadRedirectionResponse> => {
    const { url, projectId, apiKey } = this.getEnvs()

    const coords = server.extractFromReq(req, 'coords')

    this.validateCoords(coords)

    const locale = req.headers['accept-language']

    const redirectionFile = this.generateRedirectionFile(coords, locale)

    const formData = new FormData()

    formData.append('blob', redirectionFile, 'index.html')

    let result: FetchResponse

    try {
      result = await fetch(url + '/api/v0/add?pin=false', {
        method: 'post',
        body: formData,
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${projectId}:${apiKey}`
          ).toString('base64')}`,
        },
      })
    } catch (e) {
      throw new HTTPError(
        'Failed to upload file to IPFS # Request',
        {},
        STATUS_CODES.error
      )
    }

    if (!result.ok) {
      throw new HTTPError(
        'Failed to upload file to IPFS # Response',
        {},
        STATUS_CODES.error
      )
    }

    const { Hash } = await result.json()

    return {
      ipfsHash: Hash,
      contentHash: await contentHash.fromIpfs(Hash),
    }
  }

  private getRedirectionHashes = async (
    req: Request
  ): Promise<GetRedirectionHashesResponse> => {
    const coordsQueryParam = server.extractFromReq(req, 'coords')
    const separatedCoords = coordsQueryParam.split(';')

    const locale = req.headers['accept-language']

    const output: GetRedirectionHashesResponse = []

    for (const coords of separatedCoords) {
      this.validateCoords(coords)

      const redirectionFile = this.generateRedirectionFile(coords, locale)

      const ipfsHash = await getCID({
        path: 'index.html',
        content: redirectionFile,
        size: redirectionFile.byteLength,
      })

      const [x, y] = coords.split(',').map((val) => Number(val))

      output.push({
        x,
        y,
        ipfsHash,
        contentHash: await contentHash.fromIpfs(ipfsHash),
      })
    }

    return output
  }

  private getEnvs = () => {
    const url = env.get('IPFS_URL')
    const projectId = env.get('IPFS_PROJECT_ID')
    const apiKey = env.get('IPFS_API_KEY')
    const explorerUrl = env.get('EXPLORER_URL')

    if (!url) {
      throw new Error('IPFS_URL not defined')
    }

    if (!projectId) {
      throw new Error('IPFS_PROJECT_ID not defined')
    }

    if (!apiKey) {
      throw new Error('IPFS_API_KEY not defined')
    }

    if (!explorerUrl) {
      throw new Error('EXPLORER_URL not defined')
    }

    return {
      url,
      projectId,
      apiKey,
      explorerUrl,
    }
  }

  private validateCoords = (coords: string): void => {
    if (!/^-?[1-9]\d*,-?[1-9]\d*$/.test(coords)) {
      throw new HTTPError(
        'Invalid coordinates',
        { coords },
        STATUS_CODES.badRequest
      )
    }
  }

  private generateRedirectionFile = (
    coords: string,
    locale?: string
  ): Buffer => {
    const { explorerUrl } = this.getEnvs()

    let messages: [string, string]

    switch (locale) {
      case 'zh-CN':
        messages = ['如果您未重定向', '点击这里']
        break
      case 'es-ES':
        messages = ['Si no estas siendo redirigido', 'Has click aquí']
        break
      default:
        messages = ['If you are not redirected', 'Click here']
    }

    const html: string = `<html>
    <head>
      <meta
        http-equiv="refresh"
        content="0; URL=${explorerUrl}?position=${coords}"
      />
    </head>
    <body>
      <p>
        ${messages[0]}
        <a href="${explorerUrl}?position=${coords}">
          ${messages[1]}
        </a>.
      </p>
    </body>
    </html>`

    return Buffer.from(html)
  }
}
