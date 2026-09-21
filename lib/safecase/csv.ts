export function csvEscape(value: unknown) {
  const s = value == null ? '' : String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]) {
  const header = columns.join(',')
  const body = rows.map((row) => columns.map((col) => csvEscape(row[col])).join(',')).join('\n')
  return `${header}\n${body}\n`
}
