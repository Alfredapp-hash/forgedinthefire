// Email Service Abstraction Layer
// Forged in the Fire - Supports multiple email providers

import type { EmailType, EmailLog } from '@/src/features/subscribers/types'
import type { ContentItem } from '@/src/features/content/types'
import type { Newsletter } from '@/src/features/subscribers/types'

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL PROVIDER CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

type EmailProvider = 'resend' | 'sendgrid' | 'mailgun' | 'supabase' | 'none'

const getEmailProvider = (): EmailProvider => {
  if (process.env.RESEND_API_KEY) return 'resend'
  if (process.env.SENDGRID_API_KEY) return 'sendgrid'
  if (process.env.MAILGUN_API_KEY) return 'mailgun'
  if (process.env.SUPABASE_EMAIL_HOOK) return 'supabase'
  return 'none'
}

export function isEmailConfigured(): boolean {
  return getEmailProvider() !== 'none'
}

export function getEmailConfigStatus(): { configured: boolean; provider: EmailProvider } {
  const provider = getEmailProvider()
  return { configured: provider !== 'none', provider }
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL SENDING INTERFACE
// ─────────────────────────────────────────────────────────────────────────────

interface SendEmailOptions {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
  replyTo?: string
  tags?: string[]
}

interface SendResult {
  success: boolean
  messageId?: string
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL CONTENT GENERATORS
// ─────────────────────────────────────────────────────────────────────────────

const ORG_NAME = 'Forged in the Fire'
const ORG_TAGLINE = 'Empowering Survivors, Restoring Hope'
const FROM_EMAIL = process.env.FROM_EMAIL || 'updates@forgedinthefireohio.org'
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.forgedinthefireohio.org'

function generateUnsubscribeLink(email: string, token?: string): string {
  if (token) {
    return `${BASE_URL}/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`
  }
  return `${BASE_URL}/unsubscribe?email=${encodeURIComponent(email)}`
}

function generatePreferencesLink(email: string, token?: string): string {
  if (token) {
    return `${BASE_URL}/preferences?email=${encodeURIComponent(email)}&token=${token}`
  }
  return `${BASE_URL}/preferences?email=${encodeURIComponent(email)}`
}

function getEmailFooter(email: string, token?: string): string {
  const unsubscribeLink = generateUnsubscribeLink(email, token)
  const preferencesLink = generatePreferencesLink(email, token)
  
  return `
    <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
      <p style="margin: 0 0 8px 0;">
        You are receiving this email because you subscribed to updates from ${ORG_NAME}.
      </p>
      <p style="margin: 0;">
        <a href="${unsubscribeLink}" style="color: #0B6A88; text-decoration: none;">Unsubscribe</a>
        &nbsp;|&nbsp;
        <a href="${preferencesLink}" style="color: #0B6A88; text-decoration: none;">Manage Preferences</a>
      </p>
      <p style="margin: 16px 0 0 0; font-size: 11px; color: #9ca3af;">
        ${ORG_NAME} | Lorain County, Ohio<br>
        <a href="${BASE_URL}" style="color: #9ca3af; text-decoration: none;">${BASE_URL}</a>
      </p>
    </div>
  `
}

function wrapEmailBody(body: string, subject: string, recipientEmail: string, token?: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f9fafb;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding: 20px 0;">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <tr>
                <td style="background: linear-gradient(135deg, #1E1714 0%, #3A2A24 100%); padding: 24px 32px; text-align: center;">
                  <h1 style="color: #C8A46B; margin: 0; font-size: 24px; font-weight: 600; font-family: Georgia, serif;">${ORG_NAME}</h1>
                  <p style="color: #CDBDAF; margin: 4px 0 0 0; font-size: 13px;">${ORG_TAGLINE}</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 32px;">
                  ${body}
                  ${getEmailFooter(recipientEmail, token)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOG NOTIFICATION EMAIL
// ─────────────────────────────────────────────────────────────────────────────

export function generateBlogNotificationEmail(
  post: ContentItem,
  recipientEmail: string,
  token?: string
): SendEmailOptions {
  const subject = post.emailSubject || `New from ${ORG_NAME}: ${post.title}`
  const excerpt = post.emailExcerpt || post.excerpt
  const postUrl = `${BASE_URL}/blog/${post.slug}`
  
  const body = `
    <div style="color: #1f2937; line-height: 1.6;">
      <p style="font-size: 16px; margin: 0 0 16px 0;">
        ${ORG_NAME} has shared a new update:
      </p>
      
      <h2 style="color: #1E1714; font-size: 22px; font-weight: 600; margin: 0 0 12px 0; font-family: Georgia, serif;">
        ${post.title}
      </h2>
      
      <p style="font-size: 15px; color: #4b5563; margin: 0 0 24px 0; line-height: 1.6;">
        ${excerpt}
      </p>
      
      <p style="font-size: 15px; color: #4b5563; margin: 0 0 24px 0; line-height: 1.6;">
        Read the full post to learn more about survivor support, community resources, and ways to help restore hope and rebuild lives.
      </p>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${postUrl}" style="display: inline-block; background-color: #0B6A88; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">
          Read Full Post
        </a>
      </div>
      
      <p style="font-size: 14px; color: #6b7280; margin: 24px 0 0 0; text-align: center;">
        <a href="${postUrl}" style="color: #6b7280; text-decoration: none;">${postUrl}</a>
      </p>
    </div>
  `
  
  return {
    to: recipientEmail,
    subject,
    html: wrapEmailBody(body, subject, recipientEmail, token),
    from: `${ORG_NAME} <${FROM_EMAIL}>`,
    tags: ['blog_notification'],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY NEWSLETTER EMAIL
// ─────────────────────────────────────────────────────────────────────────────

export function generateNewsletterEmail(
  newsletter: Newsletter,
  posts: ContentItem[],
  recipientEmail: string,
  token?: string
): SendEmailOptions {
  const monthName = new Date(newsletter.year, newsletter.month - 1).toLocaleString('en-US', { month: 'long' })
  const subject = newsletter.title || `${ORG_NAME} Monthly Update — ${monthName} ${newsletter.year}`
  
  const postsHtml = posts.map(post => {
    const postUrl = `${BASE_URL}/blog/${post.slug}`
    const featuredClass = post.featuredInNewsletter ? 'border-left: 4px solid #C8A46B; padding-left: 16px;' : ''
    
    return `
      <div style="margin: 24px 0; ${featuredClass}">
        <h3 style="color: #1E1714; font-size: 18px; font-weight: 600; margin: 0 0 8px 0; font-family: Georgia, serif;">
          <a href="${postUrl}" style="color: #1E1714; text-decoration: none;">${post.title}</a>
        </h3>
        <p style="font-size: 14px; color: #4b5563; margin: 0 0 12px 0; line-height: 1.5;">
          ${post.newsletterCategory ? `<span style="color: #0B6A88; font-weight: 500;">${post.newsletterCategory}</span> — ` : ''}
          ${post.excerpt}
        </p>
        <a href="${postUrl}" style="color: #0B6A88; text-decoration: none; font-size: 14px; font-weight: 500;">
          Read more →
        </a>
      </div>
    `
  }).join('<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">')
  
  const body = `
    <div style="color: #1f2937; line-height: 1.6;">
      ${newsletter.intro_message ? `
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
          <p style="font-size: 15px; color: #4b5563; margin: 0; line-height: 1.6;">
            ${newsletter.intro_message}
          </p>
        </div>
      ` : ''}
      
      ${postsHtml}
      
      ${newsletter.closing_message ? `
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-top: 24px;">
          <p style="font-size: 15px; color: #4b5563; margin: 0; line-height: 1.6;">
            ${newsletter.closing_message}
          </p>
        </div>
      ` : ''}
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${BASE_URL}/blog" style="display: inline-block; background-color: #0B6A88; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">
          View All Updates
        </a>
      </div>
    </div>
  `
  
  return {
    to: recipientEmail,
    subject,
    html: wrapEmailBody(body, subject, recipientEmail, token),
    from: `${ORG_NAME} <${FROM_EMAIL}>`,
    tags: ['monthly_newsletter'],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WELCOME EMAIL
// ─────────────────────────────────────────────────────────────────────────────

export function generateWelcomeEmail(
  recipientName: string,
  recipientEmail: string,
  token?: string
): SendEmailOptions {
  const subject = `Welcome to ${ORG_NAME}`
  
  const body = `
    <div style="color: #1f2937; line-height: 1.6;">
      <p style="font-size: 16px; margin: 0 0 16px 0;">
        ${recipientName ? `Dear ${recipientName},` : 'Hello,'}
      </p>
      
      <p style="font-size: 15px; color: #4b5563; margin: 0 0 16px 0; line-height: 1.6;">
        Thank you for subscribing to updates from ${ORG_NAME}. You are now connected to our community of advocates, volunteers, and supporters working together to restore hope and rebuild lives for survivors of human trafficking.
      </p>
      
      <p style="font-size: 15px; color: #4b5563; margin: 0 0 16px 0; line-height: 1.6;">
        You will receive:
      </p>
      
      <ul style="font-size: 15px; color: #4b5563; margin: 0 0 16px 0; line-height: 1.6; padding-left: 20px;">
        <li>Monthly newsletters with survivor support updates</li>
        <li>Notifications about new blog posts and resources</li>
        <li>Volunteer opportunities and community events</li>
        <li>Ways to support our mission through donations and advocacy</li>
      </ul>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${BASE_URL}" style="display: inline-block; background-color: #0B6A88; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">
          Visit Our Website
        </a>
      </div>
      
      <p style="font-size: 15px; color: #4b5563; margin: 0; line-height: 1.6;">
        With gratitude,<br>
        The ${ORG_NAME} Team
      </p>
    </div>
  `
  
  return {
    to: recipientEmail,
    subject,
    html: wrapEmailBody(body, subject, recipientEmail, token),
    from: `${ORG_NAME} <${FROM_EMAIL}>`,
    tags: ['welcome'],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE EMAIL SENDING FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function sendViaResend(options: SendEmailOptions): Promise<SendResult> {
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)
    
    const result = await resend.emails.send({
      from: options.from || FROM_EMAIL,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      tags: options.tags?.map(tag => ({ name: tag, value: tag })),
    })
    
    if (result.error) {
      return { success: false, error: result.error.message }
    }
    
    return { success: true, messageId: result.data?.id }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

async function sendViaSendgrid(options: SendEmailOptions): Promise<SendResult> {
  // SendGrid implementation placeholder
  return { success: false, error: 'SendGrid not yet implemented' }
}

async function sendViaMailgun(options: SendEmailOptions): Promise<SendResult> {
  // Mailgun implementation placeholder
  return { success: false, error: 'Mailgun not yet implemented' }
}

// Note: Email logging is handled at the API route level to avoid
// server/client context issues. The functions below return results
// that can be logged by the calling API route.
//
// TODO: Implement proper email logging in API routes:
// - /api/subscribe should log welcome emails
// - Newsletter sending endpoints should log newsletter emails
// - Blog notification endpoints should log notification emails

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC EMAIL SENDING API
// ─────────────────────────────────────────────────────────────────────────────

export async function sendEmail(options: SendEmailOptions): Promise<SendResult> {
  if (!isEmailConfigured()) {
    return { success: false, error: 'Email delivery not configured' }
  }
  
  const provider = getEmailProvider()
  
  switch (provider) {
    case 'resend':
      return sendViaResend(options)
    case 'sendgrid':
      return sendViaSendgrid(options)
    case 'mailgun':
      return sendViaMailgun(options)
    default:
      return { success: false, error: 'No email provider configured' }
  }
}

export async function sendBlogPostNotification(
  post: ContentItem,
  subscriberEmail: string,
  subscriberId?: string,
  unsubscribeToken?: string
): Promise<SendResult> {
  if (!isEmailConfigured()) {
    return { success: false, error: 'Email delivery not configured' }
  }
  
  const options = generateBlogNotificationEmail(post, subscriberEmail, unsubscribeToken)
  const result = await sendEmail(options)
  
  // TODO: Log email attempt via API route
  return result
}

export async function sendMonthlyNewsletter(
  newsletter: Newsletter,
  posts: ContentItem[],
  subscriberEmail: string,
  subscriberId?: string,
  unsubscribeToken?: string
): Promise<SendResult> {
  if (!isEmailConfigured()) {
    return { success: false, error: 'Email delivery not configured' }
  }
  
  const options = generateNewsletterEmail(newsletter, posts, subscriberEmail, unsubscribeToken)
  const result = await sendEmail(options)
  
  // TODO: Log email attempt via API route
  return result
}

export async function sendWelcomeEmail(
  subscriberName: string,
  subscriberEmail: string,
  subscriberId?: string,
  unsubscribeToken?: string
): Promise<SendResult> {
  if (!isEmailConfigured()) {
    // Welcome emails are optional, don't fail if not configured
    return { success: true }
  }
  
  const options = generateWelcomeEmail(subscriberName, subscriberEmail, unsubscribeToken)
  const result = await sendEmail(options)
  
  // TODO: Log email attempt via API route
  return result
}

export async function sendTestNewsletter(
  newsletter: Newsletter,
  posts: ContentItem[],
  testEmail: string
): Promise<SendResult> {
  if (!isEmailConfigured()) {
    return { success: false, error: 'Email delivery not configured' }
  }
  
  const options = generateNewsletterEmail(newsletter, posts, testEmail)
  options.subject = `[TEST] ${options.subject}`
  
  return await sendEmail(options)
}
