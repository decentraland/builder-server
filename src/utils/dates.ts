export function buildModelDates(
  createdAt?: Date
): { created_at: Date; updated_at: Date } {
  const currentDate = new Date()
  return {
    created_at: createdAt || currentDate,
    updated_at: currentDate,
  }
}
