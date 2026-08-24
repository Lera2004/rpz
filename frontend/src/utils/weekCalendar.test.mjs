import assert from 'node:assert/strict'
import { getCourseFromGroup, getWeekTypeByDate } from './weekCalendar.js'

const weekCases = {
  '2026-08-31': 'numerator',
  '2026-09-01': 'numerator',
  '2026-09-06': 'numerator',
  '2026-09-07': 'denominator',
  '2026-09-13': 'denominator',
  '2026-09-14': 'numerator',
  '2026-09-21': 'denominator',
  '2026-09-28': 'numerator',
  '2026-10-05': 'denominator'
}

for (const [date, expected] of Object.entries(weekCases)) {
  assert.equal(getWeekTypeByDate(date), expected, `${date} should be ${expected}`)
}

assert.equal(getCourseFromGroup('РПЗ 26 1/9'), 1)
assert.equal(getCourseFromGroup('РПЗ 25 2/9'), 2)
assert.equal(getCourseFromGroup('РПЗ 24 1/9'), 3)
assert.equal(getCourseFromGroup('РПЗ 23 2/9'), 4)

console.log('weekCalendar tests passed')