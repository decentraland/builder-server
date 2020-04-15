import { OwnableModel } from './Ownable.types'

export class OwnableLegacy {
  Model: OwnableModel

  constructor(Model: OwnableModel) {
    this.Model = Model
  }

  async isOwnedBy(id: string, userId: string) {
    return (await this.Model.count({ id, user_id: userId })) > 0
  }

  async canUpsert(id: string, userId: string) {
    const [count, isOwner] = await Promise.all([
      this.Model.count({ id }),
      this.isOwnedBy(id, userId)
    ])
    return count === 0 || isOwner
  }
}
