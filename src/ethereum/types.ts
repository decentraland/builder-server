export enum Network {
  MAINNET = 'mainnet',
  ROPSTEN = 'ropsten'
}

export const FACTORY_COLLECTION_ADDRESS = {
  [Network.MAINNET]: '',
  [Network.ROPSTEN]: '0x16d8bac5b67a6b782a9081377bec413bc5bb56a6'
}

export const FACTORY_COLLECTION_CODE_HASH = {
  [Network.MAINNET]: '',
  [Network.ROPSTEN]:
    '0x65cb40b83a99516a3dc696b3e8805681c6fa9324249b5e0ff9eb041314e3d2e8'
}
