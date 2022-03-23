export type SlotUsageChequeAttributes = {
  id: string
  qty: number
  salt: string
  signature: string
  collection_id: string
  third_party_id: string
  updated_at: Date
  created_at: Date
}

export type Cheque = Pick<
  SlotUsageChequeAttributes,
  'signature' | 'qty' | 'salt'
>
