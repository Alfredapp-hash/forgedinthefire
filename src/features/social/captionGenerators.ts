import type { PostTemplate } from '@/src/features/content/types'

export function generateCaption(
  template: PostTemplate,
  title: string,
  excerpt: string,
  url: string
): string {
  const base = `${title}\n\n${excerpt.slice(0, 200)}${excerpt.length > 200 ? '...' : ''}\n\n${url}?utm_source=social&utm_medium=organic&utm_campaign=forged-blog`

  switch (template) {
    case 'event':
      return `📅 ${base}`
    case 'impact-story':
      return `💙 A story of hope from Forged in the Fire:\n\n${base}`
    case 'volunteer-opp':
      return `🙋 Volunteer with us!\n\n${base}`
    case 'fundraising':
      return `🤝 Support survivors in Lorain County:\n\n${base}`
    case 'donor-update':
      return `Thank you to our community of supporters.\n\n${base}`
    default:
      return base
  }
}
