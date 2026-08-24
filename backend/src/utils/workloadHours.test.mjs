import assert from 'node:assert/strict'
import { buildOrderHoursDiagnostics, calculateOrderHours } from './workloadHours.js'

const cases = [
  [719, 720],
  [720, 720],
  [720.01, 720],
  [727.59, 720],
  [728, 720],
  [750, 720],
  [756, 720],
  [760, 756]
]

for (const [calculatedHours, expectedOrderHours] of cases) {
  assert.equal(calculateOrderHours(calculatedHours), expectedOrderHours, `${calculatedHours} should map to ${expectedOrderHours}`)
}

assert.deepEqual(buildOrderHoursDiagnostics(727.59), {
  calculatedHours: 727.59,
  reservePercent: 5,
  hoursWithReserve: 756,
  orderHours: 720
})

console.log('workloadHours tests passed')
