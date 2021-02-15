import escape from 'escape-html'
import { ProjectAttributes } from '../Project'
import { PoolAttributes } from '../Pool'

const html = (
  template: TemplateStringsArray,
  ...substitutions: any[]
): string =>
  String.raw(
    template,
    ...substitutions.map((substitution) => escape(String(substitution || '')))
  )

const template = (
  project: Pick<
    ProjectAttributes,
    Extract<keyof ProjectAttributes, keyof PoolAttributes>
  > & { url: string }
) => html`
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>${project.title}</title>
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@decentraland" />
      <meta property="og:url" content="${encodeURI(project.url)}" />
      <meta property="og:title" content="${project.title}" />
      <meta property="og:description" content="${project.description}" />
      <meta property="og:image" content="${project.thumbnail}" />
    </head>
    <body></body>
  </html>
`

export default template
