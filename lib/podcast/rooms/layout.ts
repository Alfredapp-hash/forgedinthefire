/**
 * Grid layout math for the live compositor's `grid` scene (host + up to 3 guests)
 * and the lane assignment that gives every guest its own recording lane.
 * Pure functions; no DOM.
 */

export type GridCell = { x: number; y: number; w: number; h: number }

/** People the grid scene is drawn for (host + 3 guests); more guests fall off the grid. */
export const GRID_MAX_PEOPLE = 4
export const GRID_GAP = 12

/**
 * Cells for `n` people in a `width`×`height` frame.
 * 1 → full frame · 2 → side by side · 3 → two up, one centred below · 4 → 2×2.
 * Cells keep the frame's aspect (16:9) so cover-fit crops stay gentle.
 */
export function gridCells(n: number, width: number, height: number, gap = GRID_GAP): GridCell[] {
  const count = Math.max(0, Math.min(GRID_MAX_PEOPLE, Math.floor(n)))
  if (count === 0) return []
  if (count === 1) return [{ x: 0, y: 0, w: width, h: height }]
  const cols = 2
  const rows = count <= 2 ? 1 : 2
  const cellW = Math.floor((width - gap * (cols + 1)) / cols)
  const cellH = Math.floor((height - gap * (rows + 1)) / rows)
  const cells: GridCell[] = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols)
    const col = i % cols
    const lastRowCount = count - row * cols
    // Lone cell on the last row (3 people) sits centred.
    const rowCols = Math.min(cols, lastRowCount)
    const rowWidth = rowCols * cellW + (rowCols - 1) * gap
    const x0 = Math.floor((width - rowWidth) / 2)
    const y = gap + row * (cellH + gap)
    cells.push({ x: x0 + col * (cellW + gap), y, w: cellW, h: cellH })
  }
  return cells
}

export type GuestLaneInput = {
  inviteId: string
  name: string | null
}

export type GuestLane = {
  inviteId: string
  /** SessionPerson id in the editor. The first guest keeps `guest` so the 1-guest path is unchanged. */
  personId: string
  /** 1-based guest number: "Guest 2", lane colours, grid order. */
  index: number
  name: string
}

export const FIRST_GUEST_PERSON_ID = 'guest'

export function guestPersonId(inviteId: string, index: number) {
  return index === 1 ? FIRST_GUEST_PERSON_ID : `guest_${inviteId.replace(/-/g, '').slice(0, 8)}`
}

/**
 * Stable lane per invite: ordered by invite creation (the order the host made
 * the links), so a guest who drops and rejoins keeps their lane and their
 * number. Names fall back to "Guest N".
 */
export function assignGuestLanes(invites: GuestLaneInput[]): GuestLane[] {
  return invites.map((inv, i) => {
    const index = i + 1
    return {
      inviteId: inv.inviteId,
      personId: guestPersonId(inv.inviteId, index),
      index,
      name: (inv.name || '').trim() || `Guest ${index}`,
    }
  })
}

/** Device key used by the editor's capture jobs for a remote lane. */
export function remoteLaneKey(personId: string) {
  return `remote:${personId}`
}

export function isRemoteLaneKey(key: string) {
  return key.startsWith('remote:')
}
