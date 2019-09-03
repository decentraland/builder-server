import { OwnableModel } from './Ownable.types'

export class Ownable {
  Model: OwnableModel

  constructor(Model: OwnableModel) {
    this.Model = Model
  }

  async isOwnedBy(id: string, userId: string) {
    return (await this.Model.count({ id, user_id: userId })) > 0
  }
}
