export const ORDER_RESERVE_PERCENT = 5
export const ORDER_HOURS_STEP = 36

export function calculateOrderHours(calculatedHours, reservePercent = ORDER_RESERVE_PERCENT) {
  const hours = Number(calculatedHours)
  const reserve = Number(reservePercent)

  if (!Number.isFinite(hours) || hours <= 0) return 0
  if (!Number.isFinite(reserve) || reserve < 0 || reserve >= 100) {
    throw new Error('Некоректний відсоток запасу годин.')
  }

  const reserveMultiplier = 1 + reserve / 100
  const requiredOrderHours = hours / reserveMultiplier
  const steps = Math.ceil((requiredOrderHours - Number.EPSILON) / ORDER_HOURS_STEP)
  return steps * ORDER_HOURS_STEP
}

export function buildOrderHoursDiagnostics(calculatedHours, reservePercent = ORDER_RESERVE_PERCENT) {
  const orderHours = calculateOrderHours(calculatedHours, reservePercent)
  const hoursWithReserve = orderHours * (1 + Number(reservePercent) / 100)

  return {
    calculatedHours: Number(calculatedHours) || 0,
    reservePercent: Number(reservePercent),
    hoursWithReserve,
    orderHours
  }
}
