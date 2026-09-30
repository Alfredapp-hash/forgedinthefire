/**
 * Pinned chat question → Program lower third. Painted through LiveCompositor.overlay on
 * camera scenes only. Sits above the title strap (paintLowerThird) so both can show.
 */

import type { ChatMessagePublic } from '@/lib/podcast/live/chat'

const PAD = 18
const STRAP_H = 72
const TITLE_STRAP_H = 52
const MARGIN = 48

/** Word-wrap to at most `maxLines`; the last line gets an ellipsis if there is more. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate
    } else {
      lines.push(line)
      line = word
      if (lines.length === maxLines) break
    }
  }
  if (lines.length < maxLines && line) lines.push(line)
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) {
    let last = lines[maxLines - 1]
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1)
    lines[maxLines - 1] = `${last}…`
  }
  return lines
}

export function paintPinnedQuestion(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pinned: Pick<ChatMessagePublic, 'display_name' | 'body' | 'kind'>,
  opts: { aboveTitleStrap?: boolean } = {},
) {
  const x = MARGIN
  const w = width - MARGIN * 2
  const y = height - MARGIN - STRAP_H - (opts.aboveTitleStrap ? TITLE_STRAP_H + 12 : 0)
  ctx.save()
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(5,7,10,0.82)'
  ctx.fillRect(x, y, w, STRAP_H)
  ctx.fillStyle = '#FF7A3D'
  ctx.fillRect(x, y, 5, STRAP_H)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#8DEBFF'
  ctx.font = '600 15px system-ui, sans-serif'
  const who = `${pinned.kind === 'question' ? 'QUESTION' : 'FROM THE CHAT'} · ${pinned.display_name}`
  ctx.fillText(who, x + PAD, y + 9, w - PAD * 2)
  ctx.fillStyle = '#F6FAFC'
  ctx.font = '500 22px system-ui, sans-serif'
  const lines = wrapText(ctx, pinned.body, w - PAD * 2, 2)
  lines.forEach((line, i) => ctx.fillText(line, x + PAD, y + 30 + i * 24, w - PAD * 2))
  ctx.restore()
}
