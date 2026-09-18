import { BRAND, type CanvasFormat, type StudioCanvas } from './types'

export function emptyCanvas(format: CanvasFormat = '9:16'): StudioCanvas {
  return {
    format,
    background: { kind: 'gradient', color: BRAND.ink, color2: BRAND.panel },
    headline: { text: 'A quiet word of dignity', color: BRAND.paper, size: 64 },
    body: { text: 'Survivor-centered. Never sensational.', color: BRAND.glow, size: 32 },
    logo: { visible: true },
    cta: { visible: true, text: 'forgedinthefireohio.org' },
  }
}

export function normalizeCanvas(raw: unknown, fallback: CanvasFormat = '9:16'): StudioCanvas {
  const base = emptyCanvas(fallback)
  if (!raw || typeof raw !== 'object') return base
  const value = raw as Partial<StudioCanvas>
  return {
    format: value.format || fallback,
    background: {
      kind: value.background?.kind === 'color' ? 'color' : 'gradient',
      color: value.background?.color || BRAND.ink,
      color2: value.background?.color2 || BRAND.panel,
    },
    image: value.image?.url
      ? { url: value.image.url, opacity: value.image.opacity ?? 0.28 }
      : undefined,
    headline: {
      text: value.headline?.text ?? base.headline.text,
      color: value.headline?.color || BRAND.paper,
      size: Number(value.headline?.size) || base.headline.size,
    },
    body: {
      text: value.body?.text ?? base.body.text,
      color: value.body?.color || BRAND.glow,
      size: Number(value.body?.size) || base.body.size,
    },
    logo: { visible: value.logo?.visible !== false },
    cta: {
      visible: value.cta?.visible !== false,
      text: value.cta?.text || 'forgedinthefireohio.org',
    },
  }
}

export function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 8)
}

export async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

export async function renderStudioCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: StudioCanvas,
  width: number,
  height: number,
) {
  const { background, headline, body, logo, cta, image } = canvas
  if (background.kind === 'gradient') {
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, background.color)
    gradient.addColorStop(1, background.color2 || BRAND.panel)
    ctx.fillStyle = gradient
  } else {
    ctx.fillStyle = background.color
  }
  ctx.fillRect(0, 0, width, height)

  if (image?.url) {
    const photo = await loadImage(image.url)
    if (photo) {
      ctx.save()
      ctx.globalAlpha = image.opacity
      const scale = Math.max(width / photo.width, height / photo.height)
      const dw = photo.width * scale
      const dh = photo.height * scale
      ctx.drawImage(photo, (width - dw) / 2, (height - dh) / 2, dw, dh)
      ctx.restore()
      ctx.fillStyle = 'rgba(5,7,10,0.45)'
      ctx.fillRect(0, 0, width, height)
    }
  }

  ctx.strokeStyle = 'rgba(83,214,255,0.28)'
  ctx.lineWidth = Math.max(2, width * 0.004)
  ctx.strokeRect(width * 0.05, height * 0.05, width * 0.9, height * 0.9)

  if (logo.visible) {
    const lockup = await loadImage(BRAND.logo)
    if (lockup) {
      const markW = width * 0.28
      const markH = markW * (lockup.height / lockup.width)
      ctx.drawImage(lockup, width * 0.08, height * 0.08, markW, markH)
    }
  }

  const padX = width * 0.08
  const maxW = width * 0.84
  ctx.textAlign = 'left'
  ctx.fillStyle = headline.color
  ctx.font = `600 ${headline.size}px "Playfair Display", Georgia, serif`
  const headLines = wrapLines(ctx, headline.text, maxW)
  let y = height * 0.38
  const headLead = headline.size * 1.12
  for (const line of headLines) {
    ctx.fillText(line, padX, y)
    y += headLead
  }

  ctx.fillStyle = body.color
  ctx.font = `400 ${body.size}px Inter, system-ui, sans-serif`
  const bodyLines = wrapLines(ctx, body.text, maxW)
  y += body.size * 0.6
  for (const line of bodyLines) {
    ctx.fillText(line, padX, y)
    y += body.size * 1.25
  }

  if (cta.visible) {
    const barH = height * 0.08
    ctx.fillStyle = BRAND.ice
    ctx.fillRect(0, height - barH, width, barH)
    ctx.fillStyle = BRAND.ink
    ctx.font = `600 ${Math.round(barH * 0.32)}px Inter, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(cta.text, width / 2, height - barH * 0.38)
  }
}
