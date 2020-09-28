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
    '0x91b457a218bd3fdd716b2f8558cba38904a45d0b7d394be81e507ab69ef93305'
}
