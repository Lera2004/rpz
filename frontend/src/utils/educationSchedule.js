function parseScheduleDate(value) {
  const match = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!match) return null
  const [, day, month, year] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) return null
  return date
}

function toISODate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function eventDate(event, key) {
  return parseScheduleDate(event?.[key])
}

export function getSemesterDates(groupSchedule, semester) {
  const semesterNumber = Number(semester)
  const weeks = [...(groupSchedule?.weeks || [])]
    .map(week => ({
      ...week,
      start: parseScheduleDate(week.dateFrom),
      end: parseScheduleDate(week.dateTo)
    }))
    .filter(week => week.start && week.end)
    .sort((left, right) => left.week - right.week)
  if (!weeks.length || !Number.isInteger(semesterNumber) || semesterNumber < 1) return null

  const events = (groupSchedule.events || []).map(event => ({
    ...event,
    start: eventDate(event, 'dateFrom'),
    end: eventDate(event, 'dateTo')
  }))
  const winterVacation = events
    .filter(event => event.code === 'К' && event.start && [11, 0, 1].includes(event.start.getMonth()))
    .sort((left, right) => left.start - right.start)[0]
  const isFirstSemester = semesterNumber % 2 === 1
  const firstScheduleDate = weeks[0].start
  const lastScheduleDate = weeks[weeks.length - 1].end
  let start
  let end

  if (isFirstSemester) {
    start = firstScheduleDate
    if (winterVacation) {
      end = addDays(winterVacation.start, -1)
    } else {
      const winterExam = events
        .filter(event => event.code === 'Е' && event.end && [11, 0, 1].includes(event.end.getMonth()))
        .sort((left, right) => left.end - right.end)[0]
      end = winterExam?.end || null
    }
  } else {
    if (winterVacation) {
      start = weeks.find(week => week.start > winterVacation.end)?.start || addDays(winterVacation.end, 1)
    } else {
      const winterExam = events
        .filter(event => event.code === 'Е' && event.end && [11, 0, 1].includes(event.end.getMonth()))
        .sort((left, right) => left.end - right.end)[0]
      start = winterExam
        ? weeks.find(week => week.start > winterExam.end)?.start || addDays(winterExam.end, 1)
        : weeks.find(week => week.start.getMonth() >= 1)?.start || null
    }

    const summerVacation = events
      .filter(event => event.code === 'К' && event.start && event.start.getMonth() >= 4)
      .sort((left, right) => left.start - right.start)[0]
    if (summerVacation) {
      end = addDays(summerVacation.start, -1)
    } else {
      const graduation = events
        .filter(event => /випуск/i.test(`${event.code || ''} ${event.name || ''}`) && event.start)
        .sort((left, right) => left.start - right.start)
        .at(-1)
      const finalExam = events
        .filter(event => event.code === 'Е' && event.end && event.end.getMonth() >= 4)
        .sort((left, right) => left.end - right.end)
        .at(-1)
      end = graduation
        ? addDays(graduation.start, -1)
        : finalExam?.end || lastScheduleDate
    }
  }

  if (!start || !end || start > end) return null
  return { startDate: toISODate(start), endDate: toISODate(end) }
}
