import { Request, Response, NextFunction } from 'express'

const crawlers = [
  {
    name: 'linkedin',
    pattern: 'LinkedInBot',
    // instances: [
    //   'LinkedInBot/1.0 (compatible; Mozilla/5.0; Jakarta Commons-HttpClient/3.1 +http://www.linkedin.com)',
    //   'LinkedInBot/1.0 (compatible; Mozilla/5.0; Jakarta Commons-HttpClient/4.3 +http://www.linkedin.com)',
    //   'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)'
    // ]
  },
  {
    name: 'facebook',
    pattern: 'facebookexternalhit',
    // url: 'https://developers.facebook.com/docs/sharing/webmasters/crawler/'
    // instances: [
    //   'facebookexternalhit/1.0 (+http://www.facebook.com/externalhit_uatext.php)',
    //   'facebookexternalhit/1.1',
    //   'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
    // ],
  },

  {
    name: 'twitter',
    pattern: 'Twitterbot',
    // url: 'https://dev.twitter.com/cards/getting-started',
    // instances: [
    //   'Twitterbot/0.1',
    //   'Twitterbot/1.0'
    // ]
  },

  {
    name: 'facebook',
    pattern: 'Facebot',
    // url: 'https://developers.facebook.com/docs/sharing/best-practices#crawl',
    // instances: [
    //   'Facebot/1.0'
    // ]
  },

  {
    name: 'embedly',
    pattern: 'Embedly',
    // url: 'http://support.embed.ly',
    // instances: [
    //   'Embedly +support@embed.ly',
    //   'Mozilla/5.0 (compatible; Embedly/0.2; +http://support.embed.ly/)',
    //   'Mozilla/5.0 (compatible; Embedly/0.2; snap; +http://support.embed.ly/)'
    // ]
  },

  {
    name: 'slack',
    pattern: 'Slackbot',
    // url: 'https://api.slack.com/robots',
    // instances: [
    //   'Slackbot-LinkExpanding (+https://api.slack.com/robots)',
    //   'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    //   'Slackbot 1.0 (+https://api.slack.com/robots)'
    // ]
  },

  {
    name: 'whatsapp',
    pattern: 'WhatsApp',
    // url: 'https://www.whatsapp.com/',
    // instances: [
    //   'WhatsApp',
    //   'WhatsApp/2.12.15/i',
    //   'WhatsApp/2.12.16/i',
    //   'WhatsApp/2.12.17/i',
    //   'WhatsApp/2.12.449 A',
    //   'WhatsApp/2.12.453 A',
    //   'WhatsApp/2.12.510 A',
    //   'WhatsApp/2.12.540 A',
    //   'WhatsApp/2.12.548 A',
    //   'WhatsApp/2.12.555 A',
    //   'WhatsApp/2.12.556 A',
    //   'WhatsApp/2.16.1/i',
    //   'WhatsApp/2.16.13 A',
    //   'WhatsApp/2.16.2/i',
    //   'WhatsApp/2.16.42 A',
    //   'WhatsApp/2.16.57 A',
    //   'WhatsApp/2.19.175 A',
    //   'WhatsApp/0.3.4479 N'
    // ]
  },

  {
    name: 'pinterest',
    pattern: 'Pinterest',
    // url: 'http://www.pinterest.com/bot.html'
    // instances: [
    //   'Mozilla/5.0 (compatible; Pinterestbot/1.0; +http://www.pinterest.com/bot.html)',
    //   'Pinterest/0.2 (+http://www.pinterest.com/bot.html)'
    // ],
  },

  {
    name: 'yahoo',
    pattern: 'Yahoo Link Preview',
    // url: 'https://help.yahoo.com/kb/mail/yahoo-link-preview-SLN23615.html'
    // instances: [
    //   'Mozilla/5.0 (compatible; Yahoo Link Preview; https://help.yahoo.com/kb/mail/yahoo-link-preview-SLN23615.html)'
    // ],
  },

  {
    name: 'discord',
    pattern: 'Discordbot',
    // url: 'https://discordapp.com',
    // instances: [
    //   'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'
    // ]
  },

  {
    name: 'telegram',
    pattern: 'TelegramBot',
    // instances: [
    //   'TelegramBot (like TwitterBot)'
    // ]
  },

  {
    name: 'pocket',
    pattern: 'PocketParser',
    // url: 'https://getpocket.com/pocketparser_ua',
    // instances: [
    //   'PocketParser/2.0 (+https://getpocket.com/pocketparser_ua)'
    // ]
  },
]

export type SocialRequest = Request & {
  socialAgent?: string
}

function getSocialUserAgentDetector() {
  return (req: SocialRequest, _res: Response, next: NextFunction) => {
    const userAgent = req.header('user-agent')
    if (userAgent) {
      const currentCrawler = crawlers.find((crawler) => {
        return userAgent.includes(crawler.pattern)
      })

      if (currentCrawler) {
        req.socialAgent = currentCrawler.name
      }
    }
    next()
  }
}

export const withSocialUserAgentDetector = getSocialUserAgentDetector()
