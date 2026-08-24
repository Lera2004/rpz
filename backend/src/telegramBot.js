import pool from './config/database.js'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim()

// Local labels for priority (kept in sync with taskController.js)
const TASK_PRIORITY_LABELS = {
  low: 'Низький',
  medium: 'Середній',
  high: 'Високий'
}

const TELEGRAM_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null

let botStarted = false
let lastUpdateId = 0
const reminderCache = new Map()
const educationScheduleState = new Map()

function normalizePhone(value = '') {
  return String(value || '')
    .replace(/[^\d+]/g, '')
    .replace(/^\+/, '0')
    .replace(/\s+/g, '')
    .trim()
}

function normalizeTelegramPhone(value = '') {
  const digits = String(value || '').replace(/\D/g, '')
  return digits
}

async function ensureTelegramFields() {
  const [columns] = await pool.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [process.env.DB_NAME, 'teachers']
  )

  const columnNames = new Set(columns.map((column) => column.COLUMN_NAME))

  if (!columnNames.has('telegram_chat_id')) {
    await pool.query('ALTER TABLE teachers ADD COLUMN telegram_chat_id VARCHAR(255) NULL AFTER date_of_birth')
  }
}

async function resolveTeacherByPhone(phone) {
  const normalizedTarget = normalizeTelegramPhone(phone)
  if (!normalizedTarget) return null

  const [rows] = await pool.query('SELECT id, full_name, phone, telegram_chat_id FROM teachers')

  const match = rows.find((teacher) => {
    const phoneDigits = normalizeTelegramPhone(teacher.phone)
    return phoneDigits && phoneDigits.endsWith(normalizedTarget) || phoneDigits === normalizedTarget
  })

  return match || null
}

export async function linkTelegramChatToTeacher(phone, chatId) {
  const teacher = await resolveTeacherByPhone(phone)
  if (!teacher) return null

  await pool.query('UPDATE teachers SET telegram_chat_id = ? WHERE id = ?', [String(chatId), teacher.id])

  return teacher
}

async function findTeacherByTelegramChatId(chatId) {
  const [rows] = await pool.query('SELECT id, full_name, phone, telegram_chat_id FROM teachers WHERE telegram_chat_id = ?', [String(chatId)])
  return rows[0] || null
}

export async function sendTelegramMessage(chatId, text, extra = {}) {
  if (!BOT_TOKEN || !chatId) return false

  try {
    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...extra
      })
    })

    const data = await response.json()
    if (!data.ok) {
      console.error('Telegram send failed:', data.description)
      return false
    }

    return true
  } catch (error) {
    console.error('Telegram send error:', error)
    return false
  }
}

async function sendBotMessage(chatId, text, extra = {}) {
  return sendTelegramMessage(chatId, text, extra)
}

function buildMainKeyboard() {
  return {
    keyboard: [
      [{ text: '📅 Графік навчального процесу' }],
      [{ text: '🔔 Найближчі події' }],
      [{ text: '📌 Мої завдання' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
}

function buildContactRequestKeyboard() {
  return {
    keyboard: [
      [{
        text: '📱 Поділитися контактом',
        request_contact: true
      }],
      [{ text: 'Повернутись' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  }
}

function buildGroupSelectionKeyboard(groups = []) {
  // arrange buttons two per row for readability
  const rows = []
  const items = Array.isArray(groups) ? groups.map(g => ({ text: String(g.group) })) : []
  for (let i = 0; i < items.length; i += 2) {
    if (i + 1 < items.length) {
      rows.push([items[i], items[i + 1]])
    } else {
      rows.push([items[i]])
    }
  }

  // ensure there is always a 'Повернутись' button to return to main menu
  rows.push([{ text: 'Повернутись' }])

  return {
    keyboard: rows,
    resize_keyboard: true,
    one_time_keyboard: true
  }
}


function setEducationScheduleState(chatId, schedule, groupName) {
  const groups = Array.isArray(schedule?.groups) ? schedule.groups : []
  const selected = groups.find((group) => String(group.group) === String(groupName)) || groups[0]
  if (!selected) {
    educationScheduleState.delete(chatId)
    return
  }

  const selectedIndex = groups.findIndex((group) => String(group.group) === String(selected.group))
  educationScheduleState.set(chatId, {
    groups,
    groupName: String(selected.group),
    index: selectedIndex >= 0 ? selectedIndex : 0
  })
}

async function answerCallbackQuery(callbackQueryId, text = 'Готово') {
  if (!callbackQueryId) return

  try {
    await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text
      })
    })
  } catch (error) {
    console.error('Failed to answer callback query:', error)
  }
}

async function updateEducationScheduleMessage(chatId, messageId, schedule, groupName, useFreshData = false) {
  const groups = Array.isArray(schedule?.groups) ? schedule.groups : []
  const targetGroup = groups.find((group) => String(group.group) === String(groupName)) || groups[0]
  if (!targetGroup) {
    return false
  }

  const text = useFreshData ? formatEducationSchedule(schedule, targetGroup.group) : formatEducationSchedule(schedule, targetGroup.group)
  const replyMarkup = buildEducationScheduleKeyboard(targetGroup.group, groups)

  try {
    await fetch(`${TELEGRAM_API}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      })
    })
    return true
  } catch (error) {
    console.error('Failed to edit education schedule message:', error)
    return false
  }
}

async function sendGroupSelectionMenu(chatId) {
  const schedule = await fetchEducationProcessData()
  if (!schedule || !Array.isArray(schedule.groups)) {
    await sendBotMessage(chatId, 'Не вдалося завантажити список груп. Спробуйте пізніше.', { reply_markup: buildMainKeyboard() })
    return
  }

  // sort groups alphabetically for predictable order
  const groups = schedule.groups.slice().sort((a, b) => String(a.group).localeCompare(String(b.group)))

  // Telegram keyboards can become unwieldy with many buttons; limit to first 120 groups
  const limited = groups.slice(0, 120)

  await sendBotMessage(chatId, '📅 Оберіть групу:', {
    reply_markup: buildGroupSelectionKeyboard(limited)
  })
}

function escapeTelegramHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getEducationProcessApiUrl() {
  const configured = process.env.PUBLIC_API_URL || process.env.BACKEND_PUBLIC_URL || process.env.APP_URL || 'http://localhost:3000'
  const normalized = String(configured).trim().replace(/\/$/, '')

  if (!normalized) {
    return 'http://localhost:3000/api/education-process'
  }

  return normalized.includes('/api')
    ? `${normalized}/education-process`
    : `${normalized}/api/education-process`
}

async function fetchEducationProcessData() {
  try {
    const response = await fetch(getEducationProcessApiUrl(), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })

    if (!response.ok) {
      throw new Error(`Education process request failed: ${response.status}`)
    }

    const data = await response.json()
    return data.records || data
  } catch (error) {
    console.error('Помилка завантаження графіка освітнього процесу:', error)
    return null
  }
}

function getScheduleLegendText() {
  return [
    '<b>Легенда:</b>',
    'ПА — Проміжна атестація',
    'СТ — Святковий тиждень',
    'Е — Екзаменаційна сесія',
    'ОТ / ВТ / ВП / С / ЕМ / РМ / РВ — практика',
    'ПП — Переддипломна практика',
    'ДП — Дипломне проєктування',
    'А — Атестація здобувачів ФПО'
  ].join('\n')
}

function summarizeGroupEvents(group) {
  const events = Array.isArray(group?.events) ? group.events : []
  const summary = []
  const codeOrder = ['ПА', 'Е', 'ОТ', 'ВТ', 'ВП', 'С', 'ЕМ', 'РМ', 'РВ', 'ПП', 'ДП', 'А', 'СТ', 'К']

  for (const code of codeOrder) {
    const event = events.find((entry) => entry.code === code)
    if (event) {
      summary.push(`${code}: ${event.dateFrom || '—'} — ${event.dateTo || '—'}`)
    }
  }

  return summary.length ? summary.join('\n') : 'Подій не знайдено.'
}

function parseEventDate(value) {
 if (!value && value !== 0) return null

 const text = String(value).trim()
 if (!text) return null

 const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
 if (isoMatch) {
   const [, year, month, day] = isoMatch
   const parsed = new Date(Number(year), Number(month) - 1, Number(day))
   return Number.isNaN(parsed.getTime()) ? null : parsed
 }

 const dotMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
 if (dotMatch) {
   const [, day, month, year] = dotMatch
   const parsed = new Date(Number(year), Number(month) - 1, Number(day))
   return Number.isNaN(parsed.getTime()) ? null : parsed
 }

 const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
 if (slashMatch) {
   const [, day, month, year] = slashMatch
   const parsed = new Date(Number(year), Number(month) - 1, Number(day))
   return Number.isNaN(parsed.getTime()) ? null : parsed
 }

 const parsed = new Date(text)
 return Number.isNaN(parsed.getTime()) ? null : parsed
}

function sortEventsByStartDate(events = []) {
 return [...events].sort((a, b) => {
   const aDate = parseEventDate(a?.dateFrom)
   const bDate = parseEventDate(b?.dateFrom)

   if (!aDate && !bDate) return 0
   if (!aDate) return 1
   if (!bDate) return -1

   return aDate.getTime() - bDate.getTime()
 })
}

const EDUCATION_EVENT_ICONS = {
 ПА: '🟠',
 СТ: '🎄',
 Е: '🔴',
 ОТ: '💻',
 ВТ: '🏭',
 ВП: '🏭',
 С: '💻',
 ЕМ: '💻',
 РМ: '💻',
 РВ: '💻',
 ПП: '📘',
 ДП: '🎓',
 А: '📝',
 default: '📌'
}

const TASK_STATUS_LABELS = {
 not_started: 'Не виконано',
 in_progress: 'В процесі',
 completed: 'Виконано'
}

function getEducationEventName(event = {}) {
 const rawName = String(event.name || '').trim()
 const code = String(event.code || '').trim()

 if (rawName && /випуск/i.test(rawName)) return 'Випуск'
 if (rawName) return rawName
 if (code === 'ПА') return 'Проміжна атестація'
 if (code === 'СТ') return 'Святковий тиждень'
 if (code === 'Е') return 'Екзаменаційна сесія'
 if (code === 'ПП') return 'Переддипломна практика'
 if (code === 'ДП') return 'Дипломне проєктування'
 if (code === 'А') return 'Атестація здобувачів ФПО'
 if (code === 'ОТ') return 'Практика з використанням ОТ'
 if (code === 'ВТ') return 'Виробнича технологічна практика'
 if (code === 'ВП') return 'Виробнича практика'
 return code || 'Подія'
}

function getEducationEventIcon(code = '', name = '') {
 const normalized = String(code || '').trim()
 if (normalized && EDUCATION_EVENT_ICONS[normalized]) {
   return EDUCATION_EVENT_ICONS[normalized]
 }
 if (/(випуск)/i.test(String(name || ''))) return '🎉'
 return EDUCATION_EVENT_ICONS.default
}

function getEducationEventSummary(events = []) {
 const summary = { ПА: 0, СТ: 0, Е: 0, practice: 0, ПП: 0, ДП: 0, А: 0 }
 for (const event of events) {
   const code = String(event.code || '').trim()
   if (code === 'ПА') summary.ПА += 1
   if (code === 'СТ') summary.СТ += 1
   if (code === 'Е') summary.Е += 1
   if (['ОТ', 'ВТ', 'ВП', 'С', 'ЕМ', 'РМ', 'РВ'].includes(code)) summary.practice += 1
   if (code === 'ПП') summary.ПП += 1
   if (code === 'ДП') summary.ДП += 1
   if (code === 'А') summary.А += 1
 }
 return summary
}

function formatEducationSchedule(schedule, groupName) {
 const groups = Array.isArray(schedule?.groups) ? schedule.groups : []
 const selected = groups.find((group) => String(group.group) === String(groupName)) || groups[0]
 if (!selected) {
   return [
     '⚠️ <b>Графік навчального процесу не знайдено</b>',
     '',
     `🎓 Група: <b>${escapeTelegramHtml(groupName || '—')}</b>`,
     '',
     'Спробуйте оновити дані або вибрати іншу групу.'
   ].join('\n')
 }

 const events = sortEventsByStartDate(Array.isArray(selected.events) ? selected.events : [])
 const summary = getEducationEventSummary(events)

 const lines = [
   '📅 <b>Графік навчального процесу</b>',
   `🎓 <b>${escapeTelegramHtml(selected.group)}</b>`,
   '',
   '📊 <b>Підсумок</b>',
   `🟠 ПА: ${summary.ПА}  •  🔴 Екз.: ${summary.Е}`,
   `🟢 Практики: ${summary.practice}  •  🔵 ПП: ${summary.ПП}`,
   `🟣 ДП: ${summary.ДП}  •  ⚪ Атестація: ${summary.А}`,
   '',
   '📆 <b>Періоди</b>'
 ]

 if (!events.length) {
   lines.push('Подій не знайдено.')
 } else {
   for (const event of events) {
     const eventLabel = getEducationEventName(event)
     const icon = getEducationEventIcon(event.code, event.name)
     const from = escapeTelegramHtml(event.dateFrom || '—')
     const to = escapeTelegramHtml(event.dateTo || '—')
     lines.push(`${icon} <b>${escapeTelegramHtml(eventLabel)}</b>: ${from} → ${to}`)
   }
 }

 lines.push('', 'ℹ️ <i>Дані автоматично отримуються із системи навчального процесу.</i>')
 return lines.join('\n')
}

function formatNearestEducationEvent(schedule, groupName) {
 const groups = Array.isArray(schedule?.groups) ? schedule.groups : []
 const selected = groups.find((group) => String(group.group) === String(groupName)) || groups[0]
 if (!selected) {
   return [
     '⚠️ <b>Графік навчального процесу не знайдено</b>',
     '',
     `🎓 Група: <b>${escapeTelegramHtml(groupName || '—')}</b>`,
     '',
     'Спробуйте оновити дані або вибрати іншу групу.'
   ].join('\n')
 }

 const today = new Date()
 today.setHours(0, 0, 0, 0)
 const events = sortEventsByStartDate(Array.isArray(selected.events) ? selected.events : [])
 const futureEvents = events.filter((event) => {
   const start = parseEventDate(event.dateFrom)
   return start && start >= today
 })

 if (!futureEvents.length) {
   return [
     '🔔 <b>НАЙБЛИЖЧА ПОДІЯ</b>',
     '━━━━━━━━━━━━━━━━━━',
     `🎓 <b>${escapeTelegramHtml(selected.group)}</b>`,
     '',
     '✅ <b>Усі заплановані події завершено.</b>'
   ].join('\n')
 }

 const nearest = futureEvents[0]
 const startDate = parseEventDate(nearest.dateFrom)
 const endDate = parseEventDate(nearest.dateTo)
 const diffDays = startDate ? Math.max(0, Math.ceil((startDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))) : 0

 const lines = [
   '🔔 <b>Найближча подія</b>',
   `🎓 <b>${escapeTelegramHtml(selected.group)}</b>`,
   '',
   `${getEducationEventIcon(nearest.code, nearest.name)} <b>${escapeTelegramHtml(getEducationEventName(nearest))}</b>`,
   `📅 ${escapeTelegramHtml(nearest.dateFrom || '—')} → ${escapeTelegramHtml(nearest.dateTo || '—')}`,
   ''
 ]

 if (startDate && endDate && startDate <= today && endDate >= today) {
   const remainingDays = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000)))
   lines.push('🟢 <b>Зараз триває</b>')
   lines.push(`⏳ До завершення: ${remainingDays} днів`)
 } else {
   lines.push(`⏳ <b>До початку: ${diffDays} днів</b>`)
   if (futureEvents[1]) {
     const nextEvent = futureEvents[1]
     lines.push('', '📚 <b>Наступна подія</b>')
     lines.push(`${getEducationEventIcon(nextEvent.code, nextEvent.name)} ${escapeTelegramHtml(getEducationEventName(nextEvent))}`)
     lines.push(`${escapeTelegramHtml(nextEvent.dateFrom || '—')} → ${escapeTelegramHtml(nextEvent.dateTo || '—')}`)
   }
 }

 return lines.join('\n')
}

function buildEducationScheduleKeyboard(groupName, groups = []) {
 const safeGroups = Array.isArray(groups) ? groups : []
 const currentIndex = safeGroups.findIndex((group) => String(group.group) === String(groupName))
 const index = currentIndex >= 0 ? currentIndex : 0

 return {
   inline_keyboard: [
     [
       { text: '◀️ Попередня група', callback_data: 'edu:prev' },
       { text: 'Наступна група ▶️', callback_data: 'edu:next' }
     ],
     [{ text: '🔔 Найближча подія', callback_data: 'edu:nearest' }],
     [
       { text: '🔄 Оновити', callback_data: 'edu:refresh' },
       { text: '⬅️ До вибору групи', callback_data: 'edu:back' }
     ]
   ]
 }
}

function formatGroupSchedule(groupName, groupData) {
 const events = Array.isArray(groupData?.events) ? groupData.events : []
 const counts = {
   ПА: events.filter((event) => event.code === 'ПА').length,
   Е: events.filter((event) => event.code === 'Е').length,
   practice: events.filter((event) => ['ОТ', 'ВТ', 'ВП', 'С', 'ЕМ', 'РМ', 'РВ'].includes(event.code)).length,
   ПП: events.filter((event) => event.code === 'ПП').length,
   ДП: events.filter((event) => event.code === 'ДП').length,
   А: events.filter((event) => event.code === 'А').length
 }

 const header = [`<b>📅 Графік — ${escapeTelegramHtml(groupName)}</b>`]
 header.push(`
<i>Підсумок:</i> ${counts.ПА} ПА · ${counts.Е} Екз. · ${counts.practice} Практики · ПП ${counts.ПП} · ДП ${counts.ДП} · А ${counts.А}`)

 const periods = []
 if (events.length) {
   periods.push('\n<b>Періоди:</b>')
   for (const ev of sortEventsByStartDate(events)) {
     const name = escapeTelegramHtml(ev.name || '')
     const code = escapeTelegramHtml(ev.code || '')
     const df = escapeTelegramHtml(ev.dateFrom || '—')
     const dt = escapeTelegramHtml(ev.dateTo || '—')
     periods.push(`• <b>${name}${code ? ` (${code})` : ''}</b>\n  <i>${df} — ${dt}</i>`)
   }
 } else {
   periods.push('\nПодій не знайдено.')
 }

 const footer = ['','<i>Дані беруться з системи навчального процесу</i>']

 return [header.join('\n'), ...periods, ...footer].join('\n')
}

async function fetchMyTasksForTeacher(teacherId) {
 if (!teacherId) return []

 try {
   const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/tasks/my?teacher_id=${encodeURIComponent(teacherId)}`)
   if (!response.ok) return []

   const data = await response.json()
   return Array.isArray(data) ? data : []
 } catch (error) {
   console.error('Помилка отримання моїх завдань для Telegram:', error)
   return []
 }
}

function formatTaskStatusEmoji(status) {
 if (status === 'completed') return '✅'
 if (status === 'in_progress') return '🔄'
 return '⏳'
}

function buildMyTasksKeyboard(tasks = []) {
 const rows = []
 for (const task of tasks.slice(0, 5)) {
   rows.push([
     {
       text: `${formatTaskStatusEmoji(task.status)} ${String(task.title || 'Завдання').slice(0, 24)}`,
       callback_data: `task:noop:${task.id}`
     },
     {
       text: 'Не виконано',
       callback_data: `task:status:${task.id}:${task.assignment_id}:not_started`
     },
     {
       text: 'В процесі',
       callback_data: `task:status:${task.id}:${task.assignment_id}:in_progress`
     },
     {
       text: 'Виконано',
       callback_data: `task:status:${task.id}:${task.assignment_id}:completed`
     }
   ])
 }

 rows.push([{ text: '🔄 Оновити', callback_data: 'task:refresh' }])

 return { inline_keyboard: rows }
}

function formatMyTasksMessage(tasks = [], teacherName = 'Викладач') {
 if (!tasks.length) {
   return [
     '📌 <b>Мої завдання</b>',
     `👤 ${escapeTelegramHtml(teacherName)}`,
     '',
     '✅ Немає активних завдань.'
   ].join('\n')
 }

 const lines = ['📌 <b>Мої завдання</b>', `👤 ${escapeTelegramHtml(teacherName)}`, '']

 for (const task of tasks.slice(0, 5)) {
   const deadline = task.deadline ? ` • ${escapeTelegramHtml(task.deadline)}` : ''
   const status = TASK_STATUS_LABELS[task.status] || TASK_STATUS_LABELS.not_started
   lines.push(`${formatTaskStatusEmoji(task.status)} <b>${escapeTelegramHtml(task.title || 'Завдання')}</b> ${deadline}`)
   lines.push(`   Статус: ${status}`)
   if (task.description) {
     lines.push(`   ${escapeTelegramHtml(String(task.description).slice(0, 90))}${String(task.description).length > 90 ? '...' : ''}`)
   }
   lines.push('')
 }

 return lines.join('\n').trim()
}

function formatScheduleOverview(schedule) {
  const groups = Array.isArray(schedule?.groups) ? schedule.groups : []
  const preview = groups.slice(0, 8)

  const lines = [
    '<b>📚 Графік освітнього процесу</b>',
    `Груп: ${groups.length}`,
    ''
  ]

  for (const group of preview) {
    lines.push(`• ${escapeTelegramHtml(group.group)}`)
  }

  if (groups.length > preview.length) {
    lines.push(`• ... ще ${groups.length - preview.length} груп`)
  }

  lines.push('', '<b>Команди:</b>')
  lines.push('/schedule groups — список груп')
  lines.push('/schedule next — найближчі події')
  lines.push('/schedule <назва групи> — деталі групи')

  return lines.join('\n')
}

async function sendEducationSchedule(chatId, rawArgument = '') {
  const schedule = await fetchEducationProcessData()
  if (!schedule) {
    await sendBotMessage(chatId, '❌ <b>Не вдалося отримати графік</b>\n\nСпробуйте повторити запит пізніше.')
    return
  }

  const groups = Array.isArray(schedule.groups) ? schedule.groups : []
  if (!groups.length) {
    await sendBotMessage(chatId, '⚠️ <b>Графік навчального процесу не знайдено</b>\n\nСпробуйте оновити дані або вибрати іншу групу.')
    return
  }

  const argument = String(rawArgument || '').trim()

  if (!argument || argument === 'groups') {
    const list = groups.map((group, index) => `${index + 1}. ${escapeTelegramHtml(group.group)}`).join('\n')
    await sendBotMessage(chatId, `<b>📚 Групи графіка освітнього процесу</b>\n\n${list}`)
    return
  }

  if (argument === 'next') {
    const now = new Date()
    now.setHours(0, 0, 0, 0)

    const eventList = []
    for (const group of groups) {
      for (const event of group.events || []) {
        const eventDate = parseEventDate(event.dateFrom)
        if (event.dateFrom && eventDate && eventDate.getTime() >= now.getTime()) {
          eventList.push({ group: group.group, ...event })
        }
      }
    }

    const sortedEvents = sortEventsByStartDate(eventList)
    const preview = sortedEvents.slice(0, 8)
    if (!preview.length) {
      await sendBotMessage(chatId, '🔔 <b>Найближчі події</b>\n\n✅ <b>Усі заплановані події завершено.</b>')
      return
    }

    const lines = ['🔔 <b>Найближчі події</b>']
    for (const ev of preview) {
      const groupName = escapeTelegramHtml(ev.group)
      const name = escapeTelegramHtml(getEducationEventName(ev))
      const icon = getEducationEventIcon(ev.code, ev.name)
      const df = escapeTelegramHtml(ev.dateFrom || '—')
      const dt = escapeTelegramHtml(ev.dateTo || '—')
      lines.push(`${icon} <b>${groupName}</b>: ${name} • <b>${df}</b> → ${dt}`)
    }

    await sendBotMessage(chatId, lines.join('\n'))
    return
  }

  if (argument === 'legend') {
    const fallbackGroup = groups[0]
    if (!fallbackGroup) {
      await sendBotMessage(chatId, getScheduleLegendText())
      return
    }
    await sendBotMessage(chatId, `${formatEducationSchedule(schedule, fallbackGroup.group)}\n\n${getScheduleLegendText()}`)
    return
  }

  const targetGroup = groups.find((group) => String(group.group).toLowerCase() === String(argument).toLowerCase())
  const fallbackMatch = groups.find((group) => String(group.group).toLowerCase().includes(String(argument).toLowerCase()))
  const selectedGroup = targetGroup || fallbackMatch

  if (!selectedGroup) {
    await sendBotMessage(chatId, `Групу <b>${escapeTelegramHtml(argument)}</b> не знайдено. Спробуйте /schedule groups для списку доступних груп.`)
    return
  }

  setEducationScheduleState(chatId, schedule, selectedGroup.group)
  await sendBotMessage(chatId, formatEducationSchedule(schedule, selectedGroup.group), {
    reply_markup: buildEducationScheduleKeyboard(selectedGroup.group, groups)
  })
}

import { analyzeMessage } from './services/aiService2.js'

function formatDateOnlyFromDate(d) {
  if (!(d instanceof Date)) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

async function simpleAnalyze(rawText, messageDateIso) {
  // Very small heuristic fallback when AI is not configured.
  const text = String(rawText || '').toLowerCase()
  const parsed = {
    isTask: false,
    title: null,
    description: String(rawText || ''),
    deadline: null,
    priority: 'medium',
    assigneeMode: null,
    teacherNames: [],
    confidence: 0.5
  }

  // early heuristic: messages that look like event/invite (have a time and 'заход'/'збира') should not create a task
  const timePattern = /о\s*\d{1,2}[:\.]\d{2}/gi
  if (/(заход|захід)/i.test(text) || (/((збиратися|збираюсь|збираються|збиратись|збира))/i.test(text) && timePattern.test(rawText))) {
    // leave parsed.isTask = false
    return parsed
  }

  // detect date like dd.mm or dd/mm or yyyy-mm-dd anywhere in text
  const anyDateMatch = text.match(/\b(\d{1,2})[\.\-/](\d{1,2})(?:[\.\-/](\d{2,4}))?\b/)
  if (anyDateMatch) {
    const day = Number(anyDateMatch[1])
    const month = Number(anyDateMatch[2])
    let year = anyDateMatch[3] ? Number(anyDateMatch[3]) : null
    if (year && year < 100) { year += 2000 }
    if (!year) {
      const msgDate = new Date(messageDateIso)
      year = msgDate.getFullYear()
      // if parsed month is earlier than message month and difference > 6 months, assume next year
      if (month < (msgDate.getMonth() + 1) && (msgDate.getMonth() + 1) - month > 6) {
        year = year + 1
      }
    }
    if (day >=1 && day <=31 && month >=1 && month<=12) {
      const d = new Date(year, month - 1, day)
      if (!isNaN(d)) {
        parsed.deadline = formatDateOnlyFromDate(d)
        parsed.isTask = true
        parsed.confidence = Math.max(parsed.confidence, 0.75)
      }
    }
  }

  // relative dates
  if (!parsed.deadline) {
    if (text.includes('завтра')) {
      const md = new Date(messageDateIso)
      md.setDate(md.getDate() + 1)
      parsed.deadline = formatDateOnlyFromDate(md)
      parsed.isTask = true
      parsed.confidence = 0.7
    }
    if (text.includes('сьогодні') || text.includes('до кінця дня') || text.includes('сьогодні до кінця дня')) {
      const md = new Date(messageDateIso)
      parsed.deadline = formatDateOnlyFromDate(md)
      parsed.isTask = true
      parsed.confidence = 0.8
    }
  }

  // detect assignees: if contains 'викладач' or 'колеги' -> all
  if (/(викладачам|шановні колеги|колеги|викладачі)/i.test(text)) {
    parsed.assigneeMode = 'all_teachers'
    parsed.isTask = true
    parsed.confidence = Math.max(parsed.confidence, 0.7)
  }

  // detect specific teacher names (simple LastName initial pattern)
  // detect specific teacher names in format: "Lastname I.O." or "Lastname I." (require at least one initial)
  const nameRegex = /([А-ЯҐЄІЇ][а-яґєії]+)\s+[А-ЯЁІЇ]\.(?:[А-ЯЁІЇ]\.)?/g
  const names = []
  let m
  while ((m = nameRegex.exec(rawText)) !== null) {
    const candidate = m[0].trim()
    if (candidate && candidate.length > 3) names.push(candidate)
  }
  if (names.length && parsed.assigneeMode !== 'all_teachers') {
    parsed.assigneeMode = 'specific_teachers'
    parsed.teacherNames = names
    parsed.isTask = true
    parsed.confidence = Math.max(parsed.confidence, 0.6)
  }

  // keywords that imply task even without date
  if (!parsed.isTask) {
    if (/(потрібно|має|необхідно|чекаю|надати|завантажити)/i.test(text)) {
      parsed.isTask = true
      parsed.confidence = 0.55
    }
  }

  // create a short title if possible: first sentence up to 80 chars or first clause
  if (!parsed.title) {
    const firstLine = String(rawText || '').split(/\n+/)[0]
    parsed.title = (firstLine || String(rawText || '')).slice(0, 120)
  }

  return { success: true, parsed }
}

async function handleTelegramUpdate(update) {
  if (update.callback_query) {
    const callbackQuery = update.callback_query
    const chatId = callbackQuery.message?.chat?.id
    const messageId = callbackQuery.message?.message_id
    const callbackData = String(callbackQuery.data || '')

    if (chatId && callbackData.startsWith('edu:')) {
      const schedule = await fetchEducationProcessData()
      const groups = Array.isArray(schedule?.groups) ? schedule.groups : []
      const currentState = educationScheduleState.get(String(chatId)) || null
      const currentGroup = currentState?.groupName || groups[0]?.group || ''

      await answerCallbackQuery(callbackQuery.id, 'Оновлення...')

      if (callbackData === 'edu:back') {
        await sendGroupSelectionMenu(chatId)
        return
      }

      if (!groups.length) {
        await sendBotMessage(chatId, '⚠️ <b>Графік навчального процесу не знайдено</b>\n\nСпробуйте оновити дані або вибрати іншу групу.')
        return
      }

      const groupIndex = groups.findIndex((group) => String(group.group) === String(currentGroup))
      const safeIndex = groupIndex >= 0 ? groupIndex : 0

      if (callbackData === 'edu:prev') {
        const target = groups[(safeIndex - 1 + groups.length) % groups.length]
        setEducationScheduleState(String(chatId), schedule, target.group)
        const messageText = formatEducationSchedule(schedule, target.group)
        await sendBotMessage(chatId, messageText, { reply_markup: buildEducationScheduleKeyboard(target.group, groups) })
        return
      }

      if (callbackData === 'edu:next') {
        const target = groups[(safeIndex + 1) % groups.length]
        setEducationScheduleState(String(chatId), schedule, target.group)
        const messageText = formatEducationSchedule(schedule, target.group)
        await sendBotMessage(chatId, messageText, { reply_markup: buildEducationScheduleKeyboard(target.group, groups) })
        return
      }

      if (callbackData === 'edu:nearest') {
        const target = groups[safeIndex] || groups[0]
        setEducationScheduleState(String(chatId), schedule, target.group)
        const messageText = formatNearestEducationEvent(schedule, target.group)
        await sendBotMessage(chatId, messageText)
        return
      }

      if (callbackData === 'edu:refresh') {
        const target = groups[safeIndex] || groups[0]
        const freshSchedule = await fetchEducationProcessData()
        if (!freshSchedule || !Array.isArray(freshSchedule.groups) || !freshSchedule.groups.length) {
          await sendBotMessage(chatId, '❌ <b>Не вдалося отримати графік</b>\n\nСпробуйте повторити запит пізніше.')
          return
        }

        const freshGroups = freshSchedule.groups
        const freshTarget = freshGroups.find((group) => String(group.group) === String(target.group)) || freshGroups[0]
        setEducationScheduleState(String(chatId), freshSchedule, freshTarget.group)
        await sendBotMessage(chatId, formatEducationSchedule(freshSchedule, freshTarget.group), {
          reply_markup: buildEducationScheduleKeyboard(freshTarget.group, freshGroups)
        })
        return
      }
    }

    if (chatId && callbackData.startsWith('task:')) {
      const callbackParts = callbackData.split(':')
      if (callbackParts[1] === 'status') {
        const taskId = Number(callbackParts[2])
        const assignmentId = Number(callbackParts[3])
        const nextStatus = callbackParts[4]

        if (!Number.isFinite(taskId) || !Number.isFinite(assignmentId) || !['not_started', 'in_progress', 'completed'].includes(nextStatus)) {
          await answerCallbackQuery(callbackQuery.id, 'Некоректний статус')
          return
        }

        try {
          const teacher = await findTeacherByTelegramChatId(String(chatId))
          if (!teacher) {
            await answerCallbackQuery(callbackQuery.id, 'Спочатку прив’яжіть Telegram до профілю')
            return
          }

          const response = await fetch(`http://localhost:${process.env.PORT || 3000}/api/tasks/${taskId}/assignments/${assignmentId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: nextStatus })
          })

          if (!response.ok) {
            const errorText = await response.text()
            await answerCallbackQuery(callbackQuery.id, 'Не вдалося оновити статус')
            console.error('Task status update failed:', response.status, errorText)
            return
          }

          const updated = await response.json()
          const refreshedTasks = await fetchMyTasksForTeacher(teacher.id)
          const text = formatMyTasksMessage(refreshedTasks, teacher.full_name)
          const keyboard = buildMyTasksKeyboard(refreshedTasks)

          await fetch(`${TELEGRAM_API}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text,
              parse_mode: 'HTML',
              reply_markup: keyboard
            })
          })

          await answerCallbackQuery(callbackQuery.id, `Статус: ${TASK_STATUS_LABELS[nextStatus]}`)
          return
        } catch (error) {
          console.error('Task callback update failed:', error)
          await answerCallbackQuery(callbackQuery.id, 'Помилка оновлення')
          return
        }
      }

      if (callbackData === 'task:refresh') {
        const teacher = await findTeacherByTelegramChatId(String(chatId))
        if (!teacher) {
          await answerCallbackQuery(callbackQuery.id, 'Спочатку прив’яжіть Telegram до профілю')
          return
        }

        const refreshedTasks = await fetchMyTasksForTeacher(teacher.id)
        const text = formatMyTasksMessage(refreshedTasks, teacher.full_name)
        const keyboard = buildMyTasksKeyboard(refreshedTasks)

        await fetch(`${TELEGRAM_API}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text,
            parse_mode: 'HTML',
            reply_markup: keyboard
          })
        })

        await answerCallbackQuery(callbackQuery.id, 'Оновлено')
        return
      }
    }

    return
  }

  // support personal messages and channel posts
  const message = update.message || update.edited_message || update.channel_post || update.edited_channel_post
  if (!message) return

  const chatId = message.chat?.id
  if (!chatId) return

  // If this is a channel post, process as potential task
  const isChannelPost = !!(update.channel_post || update.edited_channel_post)

  if (isChannelPost) {
    try {
      await processChannelPost(message)
    } catch (err) {
      console.error('[Telegram] Channel post processing failed:', err)
    }
    return
  }

  const text = String(message.text || '').trim()

    if (text === '/start' || text === '/start@ped_teacher_bot') {
      const existing = await findTeacherByTelegramChatId(String(chatId))
      if (existing) {
        await sendBotMessage(chatId, 'Вітаємо знову! Ви вже прив’язали Telegram до свого профілю.', { reply_markup: buildMainKeyboard() })
      } else {
        await sendBotMessage(chatId, 'Прив’яжіть свій номер телефону через кнопку «Поділитися контактом» нижче, щоб отримувати призначені завдання.', {
          reply_markup: buildContactRequestKeyboard()
        })
      }
      return
    }

  const normalizedText = text.trim()

  // If user pressed 'Повернутись' from the contact-request keyboard, show main menu
  if (normalizedText === 'Повернутись') {
    await sendBotMessage(chatId, 'Повертаюсь до меню...', { reply_markup: buildMainKeyboard() })
    return
  }

  if (
    normalizedText === '/schedule' ||
    normalizedText === '/schedule@ped_teacher_bot' ||
    normalizedText === '/graph' ||
    normalizedText === '/graph@ped_teacher_bot' ||
    normalizedText === '/education-process' ||
    normalizedText === '/education-process@ped_teacher_bot' ||
    normalizedText === '📚 Графік' ||
    normalizedText === 'Графік'
  ) {
    await sendEducationSchedule(chatId)
    return
  }

  if (
    normalizedText === '👥 Групи' ||
    normalizedText === 'Групи' ||
    normalizedText === '/schedule groups' ||
    normalizedText === '/schedule@ped_teacher_bot groups'
  ) {
    await sendEducationSchedule(chatId, 'groups')
    return
  }

  if (
    normalizedText === '🔔 Найближчі події' ||
    normalizedText === 'Найближчі події' ||
    normalizedText === '/schedule next' ||
    normalizedText === '/schedule@ped_teacher_bot next'
  ) {
    await sendEducationSchedule(chatId, 'next')
    return
  }

  if (
    normalizedText === '📘 Легенда' ||
    normalizedText === 'Легенда' ||
    normalizedText === '/schedule legend' ||
    normalizedText === '/schedule@ped_teacher_bot legend'
  ) {
    await sendEducationSchedule(chatId, 'legend')
    return
  }

  // New: respond to main menu button that shows dynamic group selection
  if (normalizedText === '📅 Графік навчального процесу') {
    await sendGroupSelectionMenu(chatId)
    return
  }

  // If user sent a group name (from the dynamic keyboard), try to match and show details
  try {
    const scheduleTry = await fetchEducationProcessData()
    const groupsTry = Array.isArray(scheduleTry?.groups) ? scheduleTry.groups : []
    if (groupsTry.length) {
      const exact = groupsTry.find(g => String(g.group).toLowerCase() === normalizedText.toLowerCase())
      const partial = groupsTry.find(g => String(g.group).toLowerCase().includes(normalizedText.toLowerCase()))
      const matched = exact || partial
      if (matched) {
        await sendEducationSchedule(chatId, matched.group)
        return
      }
    }
  } catch (err) {
    console.error('Error while matching group name from message:', err)
  }

  const teacherByChatId = await findTeacherByTelegramChatId(String(chatId))
  if (teacherByChatId) {
    const groupMatch = Array.isArray((await fetchEducationProcessData())?.groups)
      ? (await fetchEducationProcessData()).groups.find((group) => group.group.toLowerCase() === normalizedText.toLowerCase())
      : null

    if (groupMatch) {
      await sendBotMessage(chatId, formatGroupSchedule(groupMatch.group, groupMatch))
      return
    }
  }

  if (
    normalizedText === '📌 Мої завдання' ||
    normalizedText === 'Мої завдання'
  ) {
    const teacher = await findTeacherByTelegramChatId(String(chatId))
    if (!teacher) {
      await sendBotMessage(chatId, 'Спочатку прив’яжіть свій номер телефону через кнопку «Поділитися контактом», щоб бачити свої завдання.', {
        reply_markup: buildContactRequestKeyboard()
      })
      return
    }

    const tasks = await fetchMyTasksForTeacher(teacher.id)
    const messageText = formatMyTasksMessage(tasks, teacher.full_name)
    await sendBotMessage(chatId, messageText, {
      reply_markup: buildMyTasksKeyboard(tasks)
    })
    return
  }

  if (normalizedText.startsWith('/schedule ') || normalizedText.startsWith('/schedule@ped_teacher_bot ')) {
    const [, ...args] = normalizedText.split(' ')
    await sendEducationSchedule(chatId, args.join(' '))
    return
  }

  if (normalizedText.startsWith('/graph ') || normalizedText.startsWith('/graph@ped_teacher_bot ')) {
    const [, ...args] = normalizedText.split(' ')
    await sendEducationSchedule(chatId, args.join(' '))
    return
  }

  const existingTeacher = await findTeacherByTelegramChatId(String(chatId))
  if (existingTeacher) {
    return
  }

  if (message.contact) {
    const contactPhone = message.contact.phone_number
    const teacher = await linkTelegramChatToTeacher(contactPhone, chatId)

    if (!teacher) {
      await sendBotMessage(chatId, 'Цей номер телефону не прив’язаний до жодного викладача в системі. Зверніться до адміністратора.')
      return
    }

    await sendBotMessage(chatId, `✅ Телеграм успішно прив’язано до викладача: <b>${teacher.full_name}</b>\nТепер ви будете отримувати тільки свої завдання.`, {
          reply_markup: buildMainKeyboard()
    })
    return
  }

  await sendBotMessage(chatId, 'Надішліть свій номер телефону через кнопку «Поділитися контактом», щоб прив’язати Telegram до профілю викладача.', {
      reply_markup: buildContactRequestKeyboard()
  })
}

// -- helper functions for processing channel posts --
let telegramMessagesSchema = null

async function detectTelegramMessagesSchema() {
  if (telegramMessagesSchema) return telegramMessagesSchema
  const [columns] = await pool.query(
    'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [process.env.DB_NAME, 'telegram_messages']
  )
  const colSet = new Set(columns.map((c) => c.COLUMN_NAME))
  telegramMessagesSchema = {
    channelId: colSet.has('channel_id') ? 'channel_id' : 'channelId',
    messageId: colSet.has('message_id') ? 'message_id' : 'messageId',
    postedAt: colSet.has('posted_at') ? 'posted_at' : (colSet.has('published_at') ? 'published_at' : null),
    rawText: colSet.has('raw_text') ? 'raw_text' : (colSet.has('raw_payload') ? 'raw_payload' : null),
    aiResult: colSet.has('ai_result') ? 'ai_result' : null,
    status: colSet.has('processing_status') ? 'processing_status' : (colSet.has('status') ? 'status' : null),
    taskId: colSet.has('created_task_id') ? 'created_task_id' : (colSet.has('task_id') ? 'task_id' : null),
    error: colSet.has('error') ? 'error' : null
  }
  return telegramMessagesSchema
}

async function ensureTelegramMessagesTable() {
  // Existing table may have a different schema; try to create a compatible table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telegram_messages (
      id INT AUTO_INCREMENT PRIMARY KEY
    )
  `)
  await detectTelegramMessagesSchema()
}

async function insertTelegramMessageIfNotExists(channelId, messageId, postedAt, rawText, rawPayload) {
  const schema = await detectTelegramMessagesSchema()
  const postedField = schema.postedAt || 'published_at'
  const rawField = schema.rawText || 'raw_text'
  const statusField = schema.status || 'status'
  try {
    const [result] = await pool.query(
      `INSERT INTO telegram_messages (channel_id, message_id, ${postedField}, ${rawField}, ${statusField}) VALUES (?, ?, ?, ?, 'received')`,
      [String(channelId), String(messageId), postedAt, rawText || '']
    )
    return { created: true, id: result.insertId }
  } catch (err) {
    if (String(err?.code).includes('ER_DUP_ENTRY')) {
      const [rows] = await pool.query('SELECT id, ' + (schema.status || 'status') + ' AS status FROM telegram_messages WHERE channel_id = ? AND message_id = ?', [String(channelId), String(messageId)])
      return { created: false, id: rows?.[0]?.id, processing_status: rows?.[0]?.status }
    }
    throw err
  }
}

async function updateTelegramMessage(id, patch) {
  const schema = await detectTelegramMessagesSchema()
  const fields = []
  const values = []
  for (const key of Object.keys(patch)) {
    let col = key
    // map our expected keys to actual column names
    if (key === 'processing_status') col = schema.status || 'status'
    if (key === 'ai_result') col = schema.aiResult || 'ai_result'
    if (key === 'created_task_id') col = schema.taskId || 'task_id'
    if (key === 'error') col = schema.error || 'error'

    fields.push(`${col} = ?`)
    values.push(patch[key])
  }
  if (!fields.length) return
  values.push(id)
  await pool.query(`UPDATE telegram_messages SET ${fields.join(', ')} WHERE id = ?`, values)
}

async function resolveTeachersByNames(names = []) {
  if (!Array.isArray(names) || !names.length) return []
  const normalized = names.map((n) => String(n).trim()).filter(Boolean)
  if (!normalized.length) return []

  // try exact match on full_name, then fuzzy LIKE on surname
  const [rowsExact] = await pool.query('SELECT id, full_name FROM teachers WHERE full_name IN (?)', [normalized])
  const foundIds = new Map(rowsExact.map((r) => [r.full_name, r.id]))

  const unresolved = normalized.filter((n) => !foundIds.has(n))
  const resultIds = Array.from(foundIds.values())

  if (unresolved.length) {
    for (const candidate of unresolved) {
      // try to match by last name
      const parts = candidate.split(/\s+/)
      const last = parts[0]
      const [rowsLike] = await pool.query('SELECT id, full_name FROM teachers WHERE full_name LIKE ? LIMIT 5', [`%${last}%`])
      if (rowsLike.length === 1) {
        resultIds.push(rowsLike[0].id)
      }
    }
  }

  return resultIds
}

function generateShortTitle(rawText) {
  const text = String(rawText || '')
  const lower = text.toLowerCase()

  // Detect NМК with semester mention
  if (/НМК/i.test(text)) {
    // detect ordinal semester words
    if (/друг[оі]го|2-?го|2-го|2-й|2й|2 семестр|другий/i.test(lower)) return 'НМК 2 семестр'
    if (/перш[оі]го|1-?го|1-го|1-й|1й|1 семестр|перший/i.test(lower)) return 'НМК 1 семестр'
    return 'Надати НМК'
  }

  // common keywords
  if (/методик/i.test(text) || /методичк/i.test(lower)) return 'Методична робота'
  if (/робочі програми|робочі програми дисциплін/i.test(lower)) return 'Робочі програми дисциплін'
  if (/завантажити.*репозитор/i.test(lower)) return 'Завантажити документи в репозиторій'

  // fallback: compose short title of 3-7 words from main verbs/nouns
  const words = text.replace(/\s+/g,' ').split(/\s+/).slice(0,7)
  const candidate = words.join(' ').replace(/[\.\!\?\,]$/,'')
  if (candidate.length > 0) return candidate.length > 80 ? candidate.slice(0,77)+'...' : candidate

  return 'Нове завдання'
}

function computeEffectivePriority(originalPriority, deadline) {
  // originalPriority: 'low'|'medium'|'high'
  const ranks = { low: 1, medium: 2, high: 3 }
  const now = new Date()
  if (!deadline) return { effectivePriority: originalPriority || 'medium', overdue: false }
  const d = new Date(deadline)
  if (isNaN(d)) return { effectivePriority: originalPriority || 'medium', overdue: false }
  // compute difference in full days (deadline - today)
  const utc1 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const utc2 = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.floor((utc2 - utc1) / (24 * 60 * 60 * 1000))

  let defaultEffective = 'medium'
  if (diffDays > 3) defaultEffective = 'medium'
  else if (diffDays <= 3 && diffDays >= 0) defaultEffective = 'high'
  else if (diffDays < 0) defaultEffective = 'high'

  const orig = originalPriority && ['low','medium','high'].includes(originalPriority) ? originalPriority : 'medium'
  // choose max rank (higher priority)
  const eff = ranks[orig] >= ranks[defaultEffective] ? orig : defaultEffective
  return { effectivePriority: eff, overdue: diffDays < 0 }
}

async function processChannelPost(message) {
  // check allowed channel
  const allowedChannel = process.env.TELEGRAM_TASK_CHANNEL_ID && String(process.env.TELEGRAM_TASK_CHANNEL_ID).trim()
  const channelId = String(message.chat?.id)
  if (allowedChannel && allowedChannel !== channelId) {
    console.log('[Telegram] Ignored channel post from', channelId)
    return
  }

  await ensureTelegramFields()
  await ensureTelegramMessagesTable()

  const messageId = message.message_id
  const postedAt = message.date ? new Date(message.date * 1000).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ')
  const rawText = String(message.text || message.caption || '')

  console.log(`[Telegram] Получено сообщение ${messageId} из канала ${channelId}`)

  const insertResult = await insertTelegramMessageIfNotExists(channelId, messageId, postedAt, rawText, message)
  if (!insertResult.created) {
    console.log('[Telegram] Message already processed or exists id=', insertResult.id, 'status=', insertResult.processing_status)
    return
  }

  const dbId = insertResult.id

  await updateTelegramMessage(dbId, { processing_status: 'analyzing' })
  console.log('[AI] Анализ сообщения')

  const messageDateIso = message.date ? new Date(message.date * 1000).toISOString() : new Date().toISOString()
  let aiRes = null
  if (process.env.AI_API_KEY) {
    aiRes = await analyzeMessage(rawText, messageDateIso)
  } else {
    aiRes = await simpleAnalyze(rawText, messageDateIso)
  }

  if (!aiRes || !aiRes.success) {
    await updateTelegramMessage(dbId, { processing_status: 'failed', error: String((aiRes && aiRes.error) || 'AI failed') })
    console.error('[AI] Ошибка анализа:', aiRes && aiRes.error)
    return
  }

  const aiJson = aiRes.parsed || null
  await updateTelegramMessage(dbId, { processing_status: 'analyzed', ai_result: JSON.stringify(aiJson || {}) })

  // Validate AI result and attempt to map to teacher IDs
  const isTask = Boolean(aiJson?.isTask)
  const confidence = Number(aiJson?.confidence || 0)

  console.log('[AI] isTask=', isTask, 'confidence=', confidence)

  if (!isTask) {
    // not a task — nothing further
    return
  }

  // Resolve deadline
  let deadlineIso = null
  if (aiJson.deadline) {
    // aiJson.deadline may be YYYY-MM-DD or a parsed date string; normalize to YYYY-MM-DD without timezone shifts
    try {
      const raw = String(aiJson.deadline).trim()
      // if already in ISO YYYY-MM-DD
      const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (isoMatch) {
        deadlineIso = raw
      } else {
        // try dd.mm or dd/mm or dd-mm or '2026-09-01'
        const parts = raw.split(/[\.\-\/]\s*/).map(p => p.trim())
        if (parts.length >= 2 && parts[0].length <= 2 && parts[1].length <= 2) {
          let day = Number(parts[0])
          let month = Number(parts[1])
          let year = parts[2] ? Number(parts[2]) : (new Date(messageDateIso)).getFullYear()
          if (year < 100) year += 2000
          if (day >=1 && month >=1 && month <=12 && year>0) {
            const d = new Date(year, month-1, day)
            // format as YYYY-MM-DD using local date parts
            const y = d.getFullYear()
            const m = String(d.getMonth()+1).padStart(2,'0')
            const dd = String(d.getDate()).padStart(2,'0')
            deadlineIso = `${y}-${m}-${dd}`
          }
        } else {
          // fallback: try Date parsing but format using local components
          const d = new Date(raw)
          if (!isNaN(d)) {
            const y = d.getFullYear()
            const m = String(d.getMonth()+1).padStart(2,'0')
            const dd = String(d.getDate()).padStart(2,'0')
            deadlineIso = `${y}-${m}-${dd}`
          }
        }
      }
    } catch (e) {
      deadlineIso = null
    }
  }

  // Resolve priority
  function determineOriginalPriority(text, deadlineIso, messageDateIso) {
    // returns 'low'|'medium'|'high'
    if (!text && !deadlineIso) return 'medium'
    const lower = String(text || '').toLowerCase()

    // keywords
    const mustKeywords = /(потрібно|має(те)?|необхідно|чекаю|надати|зобов'язаний|зобов'язана|здати|обов'язково|терміново|потрібно|потрібні)/i
    const recommendKeywords = /(бажано|рекомендується|за можливості|можна|якщо можливо|за потреби)/i

    const isMust = mustKeywords.test(lower)
    const isRecommend = recommendKeywords.test(lower)

    // compute days to deadline
    let diffDays = null
    if (deadlineIso) {
      try {
        const parts = String(deadlineIso).split('-').map(Number)
        if (parts.length === 3) {
          const d = new Date(parts[0], parts[1]-1, parts[2])
          const md = new Date(messageDateIso || new Date().toISOString())
          const utc1 = Date.UTC(md.getFullYear(), md.getMonth(), md.getDate())
          const utc2 = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
          diffDays = Math.floor((utc2 - utc1) / (24 * 60 * 60 * 1000))
        }
      } catch (e) { diffDays = null }
    }

    // Rules from spec
    if (isMust) {
      if (diffDays !== null) {
        if (diffDays <= 3) return 'high'
        // >3 days -> medium per matrix
        return 'medium'
      }
      // no deadline but must -> medium
      return 'medium'
    }

    if (isRecommend) {
      if (diffDays !== null && diffDays <= 3) return 'medium'
      return 'low'
    }

    // fallback: if contains verbs that imply action -> treat as must moderately
    if (/(потрібно|необхідно|надати|завантажити|здати|підготувати)/i.test(lower)) {
      if (diffDays !== null && diffDays <= 3) return 'high'
      return 'medium'
    }

    // default
    return 'low'
  }

  const computedOriginalPriority = determineOriginalPriority(aiJson.description || rawText, deadlineIso, messageDateIso)
  const priority = ['low', 'medium', 'high'].includes(aiJson.priority) ? aiJson.priority : computedOriginalPriority || 'medium'

  // Resolve assignees
  let teacherIds = []
  if (aiJson.assigneeMode === 'all_teachers') {
    // mark select_all and let create API handle
    teacherIds = 'all'
  } else if (aiJson.assigneeMode === 'specific_teachers') {
    teacherIds = await resolveTeachersByNames(aiJson.teacherNames || [])
  } else if (aiJson.assigneeMode === 'specialty' && aiJson.specialtyCode) {
    // try to find teachers by specialty field if exists (commission/specialty mapping not standardized)
    const [rows] = await pool.query('SELECT id FROM teachers WHERE specialty_code = ?', [String(aiJson.specialtyCode)])
    teacherIds = rows.map((r) => r.id)
  }

  // If teacherIds empty and confidence low — mark needs_review and stop
  if ((teacherIds === 'all' || (Array.isArray(teacherIds) && teacherIds.length > 0)) === false && confidence < 0.75) {
    await updateTelegramMessage(dbId, { processing_status: 'needs_review' })
    console.warn('[ERROR] Не удалось определить преподавателей для сообщения id=', dbId)
    return
  }

  // Prepare payload for task creation
  const generatedTitle = generateShortTitle(aiJson.title || rawText)
  const payload = {
    title: String(generatedTitle).slice(0, 255),
    description: String(aiJson.description || rawText),
    deadline: deadlineIso,
    priority,
    telegram_message_id: dbId
    // either teacher_ids array or flag all_teachers
  }

  if (teacherIds === 'all') {
    payload.all_teachers = true
  } else if (Array.isArray(teacherIds) && teacherIds.length) {
    payload.teacher_ids = teacherIds
    payload.created_by = teacherIds[0]
  }

  // TEST MODE check
  const autoCreate = String(process.env.TELEGRAM_AUTO_CREATE_TASKS || 'false').toLowerCase() === 'true'
  if (!autoCreate) {
    // do not create but store result
    await updateTelegramMessage(dbId, { processing_status: 'analyzed', ai_result: JSON.stringify(aiJson || {}) })
    console.log('[Telegram] TEST MODE — не створюємо завдання. AI result saved id=', dbId)
    return
  }

  // Create task by calling internal API
  try {
    await updateTelegramMessage(dbId, { processing_status: 'creating_task' })
    const port = process.env.PORT || 3000
    const res = await fetch(`http://localhost:${port}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!res.ok) {
      const errText = await res.text()
      await updateTelegramMessage(dbId, { processing_status: 'failed', error: `Task create failed: ${res.status} ${errText}` })
      console.error('[Task] Создание не удалось:', res.status, errText)
      return
    }

    const created = await res.json()
    const createdTaskId = created.id || created.taskId || (created[0] && created[0].id) || null
    await updateTelegramMessage(dbId, { processing_status: 'created', created_task_id: createdTaskId })

    // Notify teachers (internal createTask already notifies), mark notified
    await updateTelegramMessage(dbId, { processing_status: 'notified' })

    console.log('[Task] Создано задание ID=', createdTaskId)
  } catch (err) {
    console.error('[Task] Ошибка при создании задания:', err)
    await updateTelegramMessage(dbId, { processing_status: 'failed', error: String(err.message || err) })
  }
}

async function pollTelegramUpdates() {
  if (!BOT_TOKEN || botStarted) return
  botStarted = true

  await ensureTelegramFields()
  try {
    await ensureTelegramMessagesTable()
  } catch (err) {
    console.error('Failed to ensure telegram_messages table:', err)
  }
  console.log('Telegram bot polling started')

  while (true) {
    try {
      const response = await fetch(`${TELEGRAM_API}/getUpdates?offset=${lastUpdateId}&timeout=30`, {
        method: 'GET'
      })

      const data = await response.json()
      if (!data.ok) {
        console.error('Telegram polling error:', data.description)
        await new Promise((resolve) => setTimeout(resolve, 5000))
        continue
      }

      const updates = data.result || []
      for (const update of updates) {
        await handleTelegramUpdate(update)
        lastUpdateId = Math.max(lastUpdateId, Number(update.update_id || 0) + 1)
      }
    } catch (error) {
      console.error('Telegram bot poll failed:', error)
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }
  }
}

async function verifyTelegramToken() {
  if (!BOT_TOKEN) return false

  try {
    const response = await fetch(`${TELEGRAM_API}/getMe`)
    const data = await response.json()
    if (!data || data.ok !== true) {
      console.error('Telegram token validation failed:', data?.description || data)
      return false
    }

    const botInfo = data.result || {}
    console.log(`Telegram bot verified: @${botInfo.username || 'unknown'} (id=${botInfo.id || 'unknown'})`)
    return true
  } catch (err) {
    console.error('Telegram token verification error:', err)
    return false
  }
}

export async function startTelegramBot() {
  if (!BOT_TOKEN) {
    console.log('Telegram bot disabled: TELEGRAM_BOT_TOKEN is not configured')
    return
  }

  const ok = await verifyTelegramToken()
  if (!ok) {
    console.log('Telegram bot not started: TELEGRAM_BOT_TOKEN is invalid or Bot API returned Not Found. Please check the token in backend/.env')
    return
  }

  await pollTelegramUpdates()
}

export async function notifyTeacherAboutTask(teacherId, task) {
  if (!BOT_TOKEN) return false

  const [rows] = await pool.query(
    'SELECT id, full_name, telegram_chat_id, phone FROM teachers WHERE id = ?',
    [teacherId]
  )

  const teacher = rows[0]
  if (!teacher || !teacher.telegram_chat_id) {
    return false
  }

  const title = String(task?.title || 'Нове завдання')
  const description = task?.description ? `\n\nОпис:\n${String(task.description).trim()}` : ''
  const deadline = task?.deadline ? `\nТермін: ${task.deadline}` : ''

  // compute effective priority without modifying DB
  const { effectivePriority, overdue } = computeEffectivePriority(task?.priority, task?.deadline)
  const originalLabel = TASK_PRIORITY_LABELS[task?.priority] || TASK_PRIORITY_LABELS.medium
  const effectiveLabel = TASK_PRIORITY_LABELS[effectivePriority] || TASK_PRIORITY_LABELS.medium

  const header = [
    '🔔 Вам надіслано нове завдання',
    '',
    '<b>📌 НОВЕ ЗАВДАННЯ</b>',
    ''
  ]

  const footer = [
    '',
    'Перейдіть у систему для оновлення статусу.'
  ]

  // Show only effective (current) priority in Telegram
  const effectiveInfo = `\nПоточний пріоритет: ${effectiveLabel}`

  const message = [
    ...header,
    `<b>${title}</b>`,
    description,
    deadline ? (`\nТермін: ${formatDeadlineForDisplay(task.deadline)}`) : '',
    effectiveInfo,
    ...footer
  ].join('\n')

  return sendTelegramMessage(teacher.telegram_chat_id, message)
}

function formatDeadlineForDisplay(deadline) {
  if (!deadline) return ''
  try {
    // expect YYYY-MM-DD
    const m = String(deadline).match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (m) {
      return `${m[3]}.${m[2]}.${m[1]}`
    }
    const d = new Date(deadline)
    if (!isNaN(d)) {
      const day = String(d.getDate()).padStart(2,'0')
      const month = String(d.getMonth()+1).padStart(2,'0')
      const year = d.getFullYear()
      return `${day}.${month}.${year}`
    }
  } catch (e) {}
  return String(deadline)
}

export async function notifyTeachersForTask(taskId, taskData = {}) {
  if (!BOT_TOKEN) return []

  const [rows] = await pool.query(
    'SELECT ta.teacher_id FROM task_assignments ta WHERE ta.task_id = ? ORDER BY ta.teacher_id',
    [taskId]
  )

  const teacherIds = rows.map((row) => Number(row.teacher_id)).filter((value) => Number.isFinite(value) && value > 0)
  const sent = []

  for (const teacherId of teacherIds) {
    const result = await notifyTeacherAboutTask(teacherId, taskData)
    if (result) {
      sent.push(teacherId)
    }
  }

  return sent
}

function getReminderKey(taskId, teacherId, deadline, kind) {
  return `${taskId}:${teacherId}:${String(deadline || 'unknown')}:${kind}`
}

function buildReminderMessage(task, reminderKind) {
  const title = String(task.title || 'Завдання')
  const description = task.description ? `\n\nОпис:\n${String(task.description).trim()}` : ''
  const deadline = task.deadline ? `\nТермін: ${task.deadline}` : ''

  if (reminderKind === 'three_days') {
    return [
      '🔔 Вам надіслано нове завдання',
      '',
      '<b>⚠️ НАГАДУВАННЯ: строк виконання буде через 3 дні</b>',
      '',
      `<b>${title}</b>`,
      description,
      deadline,
      '',
      'Будь ласка, вчасно виконайте завдання.'
    ].join('\n')
  }

  if (reminderKind === 'tomorrow') {
    return [
      '🔔 Вам надіслано нове завдання',
      '',
      '<b>⚠️ НАГАДУВАННЯ: строк виконання закінчується завтра</b>',
      '',
      `<b>${title}</b>`,
      description,
      deadline,
      '',
      'Завдання потрібно виконати до завтра.'
    ].join('\n')
  }

  return [
    '🔔 Вам надіслано нове завдання',
    '',
    '<b>🚨 ПРОСТРОЧЕНЕ: строк виконання вже пройшов</b>',
    '',
    `<b>${title}</b>`,
    description,
    deadline,
    '',
    'Термін виконання вже минув. Будь ласка, оновіть статус або виконайте завдання якомога швидше.'
  ].join('\n')
}

export async function checkDueTaskReminders() {
  if (!BOT_TOKEN) return []

  const [rows] = await pool.query(`
    SELECT
      ta.id AS assignment_id,
      ta.task_id,
      ta.teacher_id,
      ta.status,
      t.title,
      t.description,
      t.deadline,
      teacher.full_name,
      teacher.telegram_chat_id,
      CASE
        WHEN DATEDIFF(t.deadline, CURDATE()) = 3 THEN 'three_days'
        WHEN DATEDIFF(t.deadline, CURDATE()) = 1 THEN 'tomorrow'
        WHEN DATEDIFF(CURDATE(), t.deadline) >= 1 THEN 'overdue'
        ELSE NULL
      END AS reminder_kind
    FROM task_assignments ta
    JOIN tasks t ON t.id = ta.task_id
    JOIN teachers teacher ON teacher.id = ta.teacher_id
    WHERE ta.status != 'completed'
      AND t.deadline IS NOT NULL
      AND (
        DATEDIFF(t.deadline, CURDATE()) = 3
        OR DATEDIFF(t.deadline, CURDATE()) = 1
        OR DATEDIFF(CURDATE(), t.deadline) >= 1
      )
    ORDER BY t.deadline ASC, ta.teacher_id ASC
  `)

  const sent = []

  for (const row of rows) {
    if (!row.reminder_kind) continue
    if (!row.telegram_chat_id) continue

    const key = getReminderKey(row.task_id, row.teacher_id, row.deadline, row.reminder_kind)
    if (reminderCache.has(key)) continue

    const message = buildReminderMessage(row, row.reminder_kind)
    const delivered = await sendTelegramMessage(row.telegram_chat_id, message)

    if (delivered) {
      reminderCache.set(key, Date.now())
      sent.push({
        task_id: Number(row.task_id),
        teacher_id: Number(row.teacher_id),
        reminder_kind: row.reminder_kind,
        assignment_id: Number(row.assignment_id)
      })
    }
  }

  return sent
}

export function startTaskReminders() {
  if (!BOT_TOKEN) return

  const run = async () => {
    try {
      await checkDueTaskReminders()
    } catch (error) {
      console.error('Помилка перевірки нагадувань:', error)
    }
  }

  run()
  setInterval(run, 60 * 60 * 1000)
}
