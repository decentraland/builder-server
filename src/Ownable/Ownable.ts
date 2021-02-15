import { OwnableModel } from './Ownable.types'

export class Ownable {
  Model: OwnableModel

  constructor(Model: OwnableModel) {
    this.Model = Model
  }

  async isOwnedBy(id: string, ethAddress: string) {
    return (await this.Model.count({ id, eth_address: ethAddress })) > 0
  }

  async canUpsert(id: string, ethAddress: string) {
    const [count, isOwner] = await Promise.all([
      this.Model.count({ id }),
      this.isOwnedBy(id, ethAddress),
    ])
    return count === 0 || isOwner
  }
}
