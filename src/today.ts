function easternDateString(d: Date): string {
  return new Date(d.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function isToday(completedAt: string | undefined): boolean {
  if (!completedAt) return false
  const d = new Date(completedAt)
  if (isNaN(d.getTime())) return false
  return easternDateString(d) === easternDateString(new Date())
}
