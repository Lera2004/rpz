<template>
  <section class="schedule-page">
    <div v-if="error" class="error-message">{{ error }}</div>

    <div v-if="loading" class="loading">Завантаження розкладу...</div>

    <div v-else class="schedule-shell">
      <header class="page-header">
        <div>
          <p class="eyebrow">Розклад</p>
          <h1>Розклад викладачів 121</h1>
        </div>
      </header>

      <div class="import-panel">
        <div class="upload-box">
          <label class="upload-label" for="schedule-file">Імпорт розкладу</label>
          <input id="schedule-file" type="file" accept=".xlsx,.xls" @change="handleFileChange" />
          <div v-if="selectedFileName" class="selected-file">Обрано: {{ selectedFileName }}</div>
        </div>

        <button class="primary-button" :disabled="importing || !selectedFile" @click="importSchedule">
          {{ importing ? 'Імпортування...' : 'Імпортувати' }}
        </button>
      </div>

      <div v-if="importSummary" class="summary-box">
        <strong>Розклад успішно імпортовано.</strong>
        <div>Додано занять: {{ importSummary.recordsCount }}</div>
        <div>Груп: {{ importSummary.groupsCount }}</div>
        <div>Викладачів: {{ importSummary.teachersCount }}</div>
      </div>

      <div class="toolbar">
        <label class="field">
          <span>Курс</span>
          <select v-model="selectedCourse">
            <option value="">Усі курси</option>
            <option v-for="course in courses" :key="course" :value="String(course)">{{ course }} курс</option>
          </select>
        </label>

        <label class="field">
          <span>Група</span>
          <select v-model="selectedGroup">
            <option value="">Усі групи</option>
            <option v-for="group in groups" :key="group" :value="group">{{ group }}</option>
          </select>
        </label>

        <label class="field">
          <span>День тижня</span>
          <select v-model="selectedDay">
            <option value="">Усі дні</option>
            <option v-for="day in days" :key="day" :value="day">{{ day }}</option>
          </select>
        </label>

        <label class="field">
          <span>Викладач</span>
          <select v-model="selectedTeacher">
            <option value="">Усі викладачі</option>
            <option v-for="teacher in teachers" :key="teacher" :value="teacher">{{ teacher }}</option>
          </select>
        </label>

        <label class="field">
          <span>Тип перегляду</span>
          <select v-model="selectedWeekMode">
            <option value="current">Актуальний тиждень</option>
            <option value="all">Усі тижні</option>
            <option value="numerator">Тільки чисельник</option>
            <option value="denominator">Тільки знаменник</option>
          </select>
        </label>
      </div>

      <section class="week-navigator" aria-label="Навігація по тижнях">
        <button class="week-nav-button" type="button" @click="moveWeek(-1)">← Попередній тиждень</button>
        <div class="week-current">
          <div class="week-range">{{ formattedWeekRange }}</div>
          <div class="week-year">{{ selectedWeekStart.getFullYear() }}</div>
          <span class="calendar-week-badge" :class="`calendar-week-${selectedWeekType || 'preparation'}`">
            {{ getWeekTypeLabel(selectedWeekType) }}
          </span>
        </div>
        <button class="week-nav-button" type="button" @click="moveWeek(1)">Наступний тиждень →</button>
        <button class="today-button" type="button" @click="goToToday">Сьогодні</button>
      </section>

      <div v-if="filteredRecords.length" class="schedule-list">
        <div v-for="day in visibleDays" :key="day" class="day-block">
          <div class="day-header">
            <span class="day-dot" :style="{ background: getDayAccent(day) }"></span>
            <h3>{{ day }}<small>{{ formatDayDate(day) }}</small></h3>
            <span class="day-count">{{ filteredRecordsByDay(day).length }} {{ pluralizeLessons(filteredRecordsByDay(day).length) }}</span>
          </div>

          <div v-if="filteredRecordsByDay(day).length" class="lesson-list">
            <div
              v-for="entry in filteredRecordsByDay(day)"
              :key="`${entry.day}-${entry.lessonNumber}-${entry.groupName || entry.group}-${entry.subject}-${entry.room}-${entry.weekType || 'all'}`"
              class="lesson-item"
              :style="{ '--accent': getDayAccent(day), '--accent-soft': getDayAccentSoft(day) }"
            >
              <div class="lesson-topline">
                <span class="lesson-number">
                  {{ entry.lessonNumber }} пара
                  <span v-if="entry.weekType && entry.weekType !== 'all'" class="week-badge">
                    {{ entry.weekType === 'numerator' ? 'ЧИСЕЛЬНИК' : 'ЗНАМЕННИК' }}
                  </span>
                </span>
                <span class="lesson-group">{{ entry.groupName || entry.group }}</span>
              </div>

              <div class="lesson-subject">{{ entry.subject }}</div>

              <div class="lesson-meta">
                <strong>Викладач:</strong> {{ entry.teacher || '—' }}
              </div>

              <div class="lesson-meta">
                <strong>Аудиторія:</strong> {{ entry.room || '—' }}
              </div>
            </div>
          </div>

          <div v-else class="empty-day">Немає занять</div>
        </div>
      </div>

      <div v-else class="empty-state">Немає даних для обраних фільтрів.</div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../services/api'
import {
  addDays,
  getCourseFromGroup,
  getWeekDates,
  getWeekTypeByDate,
  getWeekTypeLabel,
  startOfWeek
} from '../utils/weekCalendar'

const loading = ref(true)
const error = ref('')
const schedule = ref([])
const selectedCourse = ref('')
const selectedGroup = ref('')
const selectedDay = ref('')
const selectedTeacher = ref('')
const selectedWeekMode = ref('current')
const selectedWeekDate = ref(startOfWeek(new Date()))
const importing = ref(false)
const selectedFile = ref(null)
const selectedFileName = ref('')
const importSummary = ref(null)

const normalizeText = (value) =>
  String(value ?? '')
    .replace(/[’‘`]/g, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const normalizeTeacherKey = (value) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[\s.\-_'’`]+/g, '')

const parseTeacherName = (value) => {
  const raw = normalizeText(value)
  if (!raw) return null

  const match = raw.match(/^([А-ЯІЇЄҐA-Z][а-яіїєґ'-]+(?:\s+[А-ЯІЇЄҐA-Z][а-яіїєґ'-]+)*)\s*(.*)$/u)
  if (!match) {
    return {
      surname: raw,
      initials: '',
      formatted: raw
    }
  }

  const surname = match[1].trim()
  const initialsPart = match[2].trim()
  const initialsChars = initialsPart.replace(/[^А-ЯІЇЄҐA-Z]/g, '')
  const formattedInitials = initialsChars ? initialsChars.split('').join('.') : ''
  const formatted = formattedInitials ? `${surname} ${formattedInitials}.` : surname

  return {
    surname,
    initials: formattedInitials,
    formatted
  }
}

const normalizeDay = (value) => normalizeText(value).toUpperCase()

const isPhysicalEducationEntry = (entry) => {
  const subject = normalizeText(entry?.subject).toLowerCase()
  const teacher = normalizeText(entry?.teacher).toLowerCase()
  const room = normalizeText(entry?.room).toLowerCase()
  const combined = `${subject} ${teacher} ${room}`

  const peSignal = /(фіз(ичн|культ|ра|-ра)|физ(ичн|культ|ра|-ра)|спорт|sport|physical\s*education|physical\s*ed)/i.test(combined)
  const placeholderSignal = /^(x|х|—|-)$/.test(teacher) || /^(x|х|—|-)$/.test(room) || /^(x|х|—|-)$/.test(subject)

  return peSignal || (/(фіз|физ|спорт|sport|physical)/i.test(subject) && placeholderSignal)
}

const splitTeacherNames = (value) => {
  const text = normalizeText(value)

  if (!text) return []

  const prepared = text
    .replace(/\s*(?:\/|,|;|&|\||\n)\s*/gi, ' | ')
    .replace(/\s+\b(?:і|та)\b\s+/gi, ' | ')
    .replace(/(\.\s+)(?=[А-ЯІЇЄҐA-Z][А-ЯІЇЄҐA-Zа-яіїєґ'’.-]*\s+[А-ЯІЇЄҐA-Z]\.)/gu, ' | ')

  const parts = prepared.split('|')
  const names = []

  parts.forEach((item) => {
    const normalized = normalizeText(item)
    if (!normalized) return

    const directMatches = normalized.match(/[А-ЯІЇЄҐA-Z][а-яіїєґ'’.-]+(?:\s*[А-ЯІЇЄҐ]\.){1,3}/g) || []

    if (directMatches.length) {
      directMatches.forEach((match) => names.push(normalizeText(match)))
      return
    }

    names.push(normalized)
  })

  return [...new Set(names.filter(Boolean))]
}

const dayAccentMap = {
  ПОНЕДІЛОК: '#6366f1',
  ВІВТОРОК: '#f59e0b',
  СЕРЕДА: '#10b981',
  ЧЕТВЕР: '#ec4899',
  "П'ЯТНИЦЯ": '#8b5cf6',
  СУБОТА: '#f97316',
  НЕДІЛЯ: '#06b6d4'
}

const getDayAccent = (day) => dayAccentMap[normalizeDay(day)] || '#6366f1'

const getDayAccentSoft = (day) => {
  const base = getDayAccent(day)
  const color = base.replace('#', '')
  return `#${color}22`
}

const days = [
  'ПОНЕДІЛОК',
  'ВІВТОРОК',
  'СЕРЕДА',
  'ЧЕТВЕР',
  "П'ЯТНИЦЯ",
  'СУБОТА',
  'НЕДІЛЯ'
]

const visibleSchedule = computed(() => {
  return schedule.value.filter((entry) => !isPhysicalEducationEntry(entry))
})

const groups = computed(() => {
  return [...new Set(visibleSchedule.value.map((entry) => entry.groupName || entry.group).filter(Boolean))].sort()
})

const courses = [1, 2, 3, 4]

const selectedWeekStart = computed(() => startOfWeek(selectedWeekDate.value))
const selectedWeekEnd = computed(() => addDays(selectedWeekStart.value, 6))
const selectedWeekType = computed(() => getWeekTypeByDate(selectedWeekStart.value))
const selectedWeekDates = computed(() => getWeekDates(selectedWeekStart.value))

const formattedWeekRange = computed(() => {
  const formatter = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long' })
  return `${formatter.format(selectedWeekStart.value)} — ${formatter.format(selectedWeekEnd.value)}`
})

const getDateForDay = (day) => {
  const dayIndex = days.findIndex((item) => normalizeDay(item) === normalizeDay(day))
  return dayIndex >= 0 ? selectedWeekDates.value[dayIndex] : null
}

const formatDayDate = (day) => {
  const date = getDateForDay(day)
  if (!date) return ''
  return new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: '2-digit' }).format(date)
}

const moveWeek = (amount) => {
  selectedWeekDate.value = addDays(selectedWeekStart.value, amount * 7)
}

const goToToday = () => {
  selectedWeekDate.value = startOfWeek(new Date())
}

const teachers = computed(() => {
  const teacherNames = visibleSchedule.value.flatMap((entry) => splitTeacherNames(entry.teacher))
  const uniqueTeachers = new Map()

  teacherNames.filter(Boolean).forEach((teacherName) => {
    const parsed = parseTeacherName(teacherName)
    if (!parsed) return

    const key = normalizeText(parsed.surname).toLowerCase()
    const candidate = parsed.formatted
    const existing = uniqueTeachers.get(key)

    if (!existing) {
      uniqueTeachers.set(key, candidate)
      return
    }

    const existingParsed = parseTeacherName(existing)
    const candidateParsed = parseTeacherName(candidate)
    const existingInitialsLength = existingParsed?.initials?.length || 0
    const candidateInitialsLength = candidateParsed?.initials?.length || 0

    if (candidateInitialsLength > existingInitialsLength) {
      uniqueTeachers.set(key, candidate)
    }
  })

  return [...uniqueTeachers.values()].sort((a, b) => a.localeCompare(b, 'uk'))
})

const visibleDays = computed(() => {
  const present = new Set(
    visibleSchedule.value
      .map((entry) => normalizeDay(entry.day))
      .filter(Boolean)
  )

  const ordered = days.filter((day) => present.has(normalizeDay(day)))

  return ordered.length ? ordered : [...present]
})

const filteredRecords = computed(() => {
  return visibleSchedule.value.filter((entry) => {
    const groupName = entry.groupName || entry.group
    const groupMatch = !selectedGroup.value || normalizeText(entry.groupName || entry.group) === normalizeText(selectedGroup.value)
    const courseMatch = !selectedCourse.value || getCourseFromGroup(groupName) === Number(selectedCourse.value)
    const dayMatch = !selectedDay.value || normalizeDay(entry.day) === normalizeDay(selectedDay.value)
    const entryTeachers = splitTeacherNames(entry.teacher)
    const selectedTeacherName = normalizeText(selectedTeacher.value)
    const selectedParsed = parseTeacherName(selectedTeacherName)

    const teacherMatch =
      !selectedParsed ||
      entryTeachers.some((teacherName) => {
        const parsed = parseTeacherName(teacherName)
        if (!parsed) return false

        const surnameMatch = normalizeText(parsed.surname) === normalizeText(selectedParsed.surname)
        const candidate = normalizeTeacherKey(parsed.formatted)
        const selected = normalizeTeacherKey(selectedParsed.formatted)

        return surnameMatch || candidate === selected || candidate.includes(selected) || selected.includes(candidate)
      })

    const weekType = normalizeText(entry.weekType || 'all').toLowerCase()
    const weekMatch =
      selectedWeekMode.value === 'all' ||
      (selectedWeekMode.value === 'current' && (!selectedWeekType.value || weekType === selectedWeekType.value || weekType === 'all')) ||
      (selectedWeekMode.value !== 'current' && selectedWeekMode.value !== 'all' && (weekType === selectedWeekMode.value || weekType === 'all'))

    return courseMatch && groupMatch && dayMatch && teacherMatch && weekMatch
  })
})

const filteredRecordsByDay = (day) => {
  return filteredRecords.value
    .filter((entry) => normalizeDay(entry.day) === normalizeDay(day))
    .sort((a, b) => {
      const lessonDiff = a.lessonNumber - b.lessonNumber
      if (lessonDiff !== 0) return lessonDiff

      const weekOrder = { numerator: 0, denominator: 1, all: 2 }
      return (weekOrder[a.weekType || 'all'] ?? 99) - (weekOrder[b.weekType || 'all'] ?? 99)
    })
}

const pluralizeLessons = (count) => {
  return count === 1 ? 'заняття' : 'занять'
}

const handleFileChange = (event) => {
  const file = event.target.files?.[0]
  selectedFile.value = file || null
  selectedFileName.value = file ? file.name : ''
  error.value = ''
}

const importSchedule = async () => {
  if (!selectedFile.value) {
    error.value = 'Спочатку оберіть Excel-файл із розкладом.'
    return
  }

  try {
    importing.value = true
    error.value = ''

    const formData = new FormData()
    formData.append('file', selectedFile.value)

    const response = await api.post('/schedule/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })

    importSummary.value = {
      recordsCount: response.data.recordsCount,
      groupsCount: response.data.groupsCount,
      teachersCount: response.data.teachersCount
    }

    await fetchSchedule()
  } catch (e) {
    error.value = e.response?.data?.details || e.response?.data?.message || 'Не вдалося імпортувати розклад.'
  } finally {
    importing.value = false
  }
}

const fetchSchedule = async () => {
  try {
    const response = await api.get('/schedule')
    schedule.value = Array.isArray(response.data) ? response.data : []

    if (!selectedGroup.value && groups.value.length) {
      selectedGroup.value = groups.value[0]
    }
  } catch (e) {
    error.value = e.response?.data?.message || 'Не вдалося завантажити розклад.'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchSchedule()
})
</script>

<style scoped>
:root {
  --bg-page: #f3f7ff;
  --bg-panel: rgba(255, 255, 255, 0.8);
  --card-border: rgba(148, 163, 184, 0.2);
  --ink-900: #0f172a;
  --ink-700: #334155;
  --ink-500: #64748b;
  --primary: #4f46e5;
  --primary-soft: rgba(79, 70, 229, 0.12);
  --shadow-soft: 0 18px 45px rgba(15, 23, 42, 0.08);
}

.schedule-page {
  min-height: 100vh;
  padding: 36px 24px 60px;
  background:
    radial-gradient(circle at 15% 0%, rgba(99, 102, 241, 0.14), transparent 25%),
    radial-gradient(circle at 100% 20%, rgba(59, 130, 246, 0.12), transparent 25%),
    radial-gradient(circle at 0% 100%, rgba(16, 185, 129, 0.12), transparent 25%),
    var(--bg-page);
  color: var(--ink-900);
}

.schedule-shell {
  max-width: 1320px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  padding: 26px 30px;
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 26px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.92), rgba(59, 130, 246, 0.82));
  box-shadow: var(--shadow-soft);
}

.eyebrow {
  margin: 0 0 8px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 11px;
  letter-spacing: 0.16em;
  font-weight: 800;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  color: white;
  font-size: clamp(30px, 4vw, 42px);
  line-height: 1.1;
  font-weight: 900;
  letter-spacing: -0.04em;
}

.import-panel {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 26px;
  padding: 18px 20px;
  border: 1px solid var(--card-border);
  border-radius: 24px;
  background: var(--bg-panel);
  backdrop-filter: blur(14px);
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.05);
}

.upload-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.upload-label {
  color: var(--ink-700);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

input[type='file'] {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border: 1.5px dashed rgba(148, 163, 184, 0.8);
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(248, 250, 252, 0.9));
  color: var(--ink-700);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

input[type='file']:focus {
  border-color: rgba(99, 102, 241, 0.85);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.08);
}

.selected-file {
  color: var(--ink-500);
  font-size: 13px;
}

.primary-button {
  border: 0;
  border-radius: 14px;
  padding: 13px 22px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 12px 22px rgba(99, 102, 241, 0.28);
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.primary-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 16px 30px rgba(99, 102, 241, 0.34);
}

.primary-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.summary-box {
  margin-bottom: 26px;
  padding: 18px 20px;
  border: 1px solid rgba(16, 185, 129, 0.28);
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(52, 211, 153, 0.08));
  color: #065f46;
  line-height: 1.7;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

.toolbar {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 30px;
}

.week-navigator {
  display: grid;
  grid-template-columns: auto minmax(220px, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  margin-bottom: 30px;
  padding: 14px 16px;
  border: 1px solid rgba(99, 102, 241, 0.16);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
}

.week-current {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 0;
  text-align: center;
}

.week-range {
  color: var(--ink-900);
  font-size: 18px;
  font-weight: 900;
}

.week-year {
  color: var(--ink-500);
  font-size: 12px;
  font-weight: 700;
}

.calendar-week-badge {
  display: inline-flex;
  align-items: center;
  margin-top: 4px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.calendar-week-numerator {
  background: rgba(16, 185, 129, 0.15);
  color: #047857;
}

.calendar-week-denominator {
  background: rgba(245, 158, 11, 0.18);
  color: #b45309;
}

.calendar-week-preparation {
  background: rgba(100, 116, 139, 0.14);
  color: var(--ink-700);
}

.week-nav-button,
.today-button {
  border: 1px solid rgba(99, 102, 241, 0.18);
  border-radius: 12px;
  padding: 10px 13px;
  background: rgba(255, 255, 255, 0.86);
  color: var(--ink-700);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.week-nav-button:hover,
.today-button:hover {
  border-color: rgba(99, 102, 241, 0.55);
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(99, 102, 241, 0.12);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--ink-500);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

select {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--ink-900);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

select:hover {
  border-color: rgba(99, 102, 241, 0.6);
}

select:focus {
  border-color: rgba(99, 102, 241, 0.8);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.08);
  outline: none;
}

.schedule-list {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.day-block {
  padding: 18px 18px 12px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 26px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.96));
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.04);
}

.day-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.day-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  box-shadow: 0 0 0 6px rgba(99, 102, 241, 0.12);
}

.day-block h3 {
  margin: 0;
  color: var(--ink-900);
  font-size: 22px;
  font-weight: 900;
  letter-spacing: -0.03em;
}

.day-block h3 small {
  display: block;
  margin-top: 3px;
  color: var(--ink-500);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.day-count {
  margin-left: auto;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.08);
  color: #4338ca;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.lesson-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.lesson-item {
  position: relative;
  overflow: hidden;
  min-height: 150px;
  padding: 20px 20px 18px 26px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 22px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.92));
  box-shadow: 0 15px 30px rgba(15, 23, 42, 0.05);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.lesson-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  background: linear-gradient(180deg, var(--accent), rgba(255, 255, 255, 0.85));
}

.lesson-item:hover {
  transform: translateY(-2px);
  border-color: rgba(99, 102, 241, 0.2);
  box-shadow: 0 20px 36px rgba(15, 23, 42, 0.08);
}

.lesson-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.lesson-number {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
  font-weight: 800;
}

.week-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 7px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  color: var(--ink-900);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.06em;
}

.lesson-group {
  padding: 6px 9px;
  border-radius: 10px;
  background: rgba(148, 163, 184, 0.12);
  color: var(--ink-700);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.lesson-subject {
  margin-bottom: 14px;
  color: var(--ink-900);
  font-size: 18px;
  line-height: 1.35;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.lesson-meta {
  display: flex;
  align-items: baseline;
  gap: 7px;
  color: var(--ink-500);
  font-size: 13px;
  line-height: 1.8;
}

.lesson-meta strong {
  color: var(--ink-700);
}

.empty-day,
.empty-state,
.loading,
.error-message {
  padding: 18px 20px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.74);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: var(--ink-500);
}

.empty-day {
  border-style: dashed;
  background: rgba(255, 255, 255, 0.45);
}

.error-message {
  margin-bottom: 18px;
  border-color: rgba(239, 68, 68, 0.2);
  background: rgba(254, 242, 242, 0.9);
  color: #b91c1c;
  font-weight: 600;
}

@media (max-width: 900px) {
  .lesson-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .schedule-page {
    padding: 22px 14px 40px;
  }

  .page-header {
    padding: 22px 18px;
  }

  .toolbar {
    grid-template-columns: 1fr;
  }

  .week-navigator {
    grid-template-columns: 1fr 1fr;
  }

  .week-current {
    grid-column: 1 / -1;
    grid-row: 1;
  }

  .week-nav-button:first-child {
    grid-column: 1;
    grid-row: 2;
  }

  .week-nav-button:nth-of-type(2) {
    grid-column: 2;
    grid-row: 2;
  }

  .today-button {
    grid-column: 1 / -1;
    grid-row: 3;
  }

  .import-panel {
    flex-direction: column;
    align-items: stretch;
  }

  .primary-button {
    width: 100%;
  }

  .lesson-item {
    padding: 18px 18px 18px 22px;
  }
}

@media (max-width: 480px) {
  h1 {
    font-size: 28px;
  }

  .day-header {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .day-count {
    margin-left: 0;
  }

  .lesson-topline {
    align-items: flex-start;
    flex-direction: column;
  }

  .lesson-subject {
    font-size: 16px;
  }
}
</style>
