export const WEEK_CONFIG = {
  academicYear: '2026-2027',
  anchorDate: '2026-09-01',
  anchorWeekType: 'numerator'
}

const DAY_MS = 24 * 60 * 60 * 1000

function toDate(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }

  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function startOfWeek(value) {
  const date = toDate(value)
  const day = date.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + mondayOffset)
  return date
}

export function addDays(value, amount) {
  const date = toDate(value)
  date.setDate(date.getDate() + amount)
  return date
}

export function formatDateKey(value) {
  const date = toDate(value)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}

export function getWeekTypeByDate(value) {
  const date = startOfWeek(value)
  const anchorWeek = startOfWeek(WEEK_CONFIG.anchorDate)
  const differenceInWeeks = Math.floor((date.getTime() - anchorWeek.getTime()) / (7 * DAY_MS))

  if (differenceInWeeks < 0) return null

  const anchorIsNumerator = WEEK_CONFIG.anchorWeekType === 'numerator'
  const isNumerator = anchorIsNumerator ? differenceInWeeks % 2 === 0 : differenceInWeeks % 2 !== 0
  return isNumerator ? 'numerator' : 'denominator'
}

export function getWeekDates(value) {
  const start = startOfWeek(value)
  return Array.from({ length: 7 }, (_, index) => addDays(start, index))
}

export function getCourseFromGroup(groupName, academicYear = WEEK_CONFIG.academicYear) {
  const match = String(groupName ?? '').trim().match(/^\D+\s+(\d{2,4})\s+\d+\/\d+$/u)
  if (!match) return null

  const academicStartYear = Number(String(academicYear).slice(0, 4))
  const admissionYearValue = Number(match[1])
  const admissionYear = admissionYearValue < 100
    ? Math.floor(academicStartYear / 100) * 100 + admissionYearValue
    : admissionYearValue
  const course = academicStartYear - admissionYear + 1

  return course >= 1 && course <= 4 ? course : null
}

export function getWeekTypeLabel(weekType) {
  if (weekType === 'numerator') return 'ЧИСЕЛЬНИК'
  if (weekType === 'denominator') return 'ЗНАМЕННИК'
  return 'Підготовка до навчального року'
}
