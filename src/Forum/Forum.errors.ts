export class DuplicatedForumPostTitleError extends Error {
  constructor(public title: string) {
    super(`The forum post title "${title}" is already in use`)
  }
}
