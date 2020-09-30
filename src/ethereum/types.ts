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
    '0x5a2f39d04b74b899c9f56f226dde8160642dd5772ba44d3a9c9db3a7db8488e1'
}
