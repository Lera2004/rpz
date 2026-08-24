<template>
  <section class="education-process-page">
    <div v-if="error" class="error-message">{{ error }}</div>

    <div v-if="loading" class="loading">Завантаження даних...</div>

    <div v-else class="schedule-panel">
      <div class="toolbar">
        <div class="search-wrap">
          <label class="field-label" for="group-search">Пошук групи</label>
          <input id="group-search" v-model="searchTerm" type="text" placeholder="Введіть назву групи" />
        </div>

        <div class="select-wrap">
          <label class="field-label" for="group-select">Оберіть групу</label>
          <select id="group-select" v-model="selectedGroup">
            <option v-for="group in filteredGroups" :key="group.group" :value="group.group">
              {{ group.group }}
            </option>
          </select>
        </div>
      </div>

      <div class="upcoming-events-layout">
        <section class="upcoming-events-panel">
          <div class="panel-heading">
            <h3>🔔 Найближчі події</h3>
            <p>Події, які відбудуться найближчим часом у навчальних групах</p>
          </div>

          <div class="upcoming-filters">
            <button
              v-for="option in upcomingEventFilters"
              :key="option.value"
              type="button"
              class="filter-chip"
              :class="{ active: upcomingFilter === option.value }"
              @click="upcomingFilter = option.value"
            >
              {{ option.label }}
            </button>
          </div>

          <div v-if="filteredUpcomingEvents.length" class="upcoming-events-list">
            <button
              v-for="event in filteredUpcomingEvents"
              :key="`${event.group}-${event.code}-${event.dateFrom}-${event.dateTo}`"
              type="button"
              class="event-card"
              :class="event.code"
              @click="selectUpcomingGroup(event.group)"
            >
              <div class="event-card-top">
                <span class="event-code" :class="event.code">{{ event.code }}</span>
                <span class="event-status">{{ getEventRelativeStatus(event) }}</span>
              </div>

              <div class="event-card-name">{{ event.name }}</div>
              <div class="event-card-group">{{ event.group }}</div>
              <div class="event-card-dates">{{ event.dateFrom }} — {{ event.dateTo }}</div>
              <div class="event-card-weeks">{{ event.weeksCount }} {{ event.weeksCount === 1 ? 'тиждень' : 'тижні' }}</div>
            </button>
          </div>

          <div v-else class="upcoming-empty">Найближчих подій за обраним фільтром немає.</div>

          <div v-if="hasMoreUpcomingEvents" class="upcoming-summary">Показано 6 найближчих подій</div>
        </section>

        <aside class="schedule-status-panel">
          <div class="panel-heading compact">
            <h3>📊 Стан графіка</h3>
          </div>

          <div class="status-list">
            <div v-for="item in scheduleStatusItems" :key="item.label" class="status-row">
              <span class="status-label">{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>
        </aside>
      </div>

      <div v-if="selectedRecord" class="selected-group-wrap">
        <div class="selected-header">
          <div class="header-copy">
            <p class="card-label">НАВЧАЛЬНА ГРУПА</p>
            <h2>{{ selectedRecord.group }}</h2>
          </div>
          <span class="study-year-badge">2026–2027</span>
        </div>

        <div class="stats-grid">
          <div class="stat-box pa">
            <div class="stat-topline">
              <span class="stat-dot pa"></span>
              <span class="label">ПА</span>
            </div>
            <strong>{{ selectedRecordCounts.pa }}</strong>
            <small>{{ (selectedRecord.events || []).find(event => event.code === 'ПА')?.dateFrom || '—' }} — {{ (selectedRecord.events || []).find(event => event.code === 'ПА')?.dateTo || '—' }}</small>
          </div>

          <div class="stat-box practice">
            <div class="stat-topline">
              <span class="stat-dot practice"></span>
              <span class="label">ПРАКТИКИ</span>
            </div>
            <strong>{{ selectedRecordCounts.practice }}</strong>
            <small>{{ (selectedRecord.events || []).find(event => ['ОТ', 'ВТ', 'ВП', 'С', 'ЕМ', 'РМ', 'РВ'].includes(event.code))?.dateFrom || '—' }} — {{ (selectedRecord.events || []).findLast(event => ['ОТ', 'ВТ', 'ВП', 'С', 'ЕМ', 'РМ', 'РВ'].includes(event.code))?.dateTo || '—' }}</small>
          </div>

          <div class="stat-box exam">
            <div class="stat-topline">
              <span class="stat-dot exam"></span>
              <span class="label">ЕКЗАМЕНИ (Е)</span>
            </div>
            <strong>{{ selectedRecordCounts.exam }}</strong>
            <small>{{ (selectedRecord.events || []).find(event => event.code === 'Е')?.dateFrom || '—' }} — {{ (selectedRecord.events || []).find(event => event.code === 'Е')?.dateTo || '—' }}</small>
          </div>

          <div class="stat-box pp">
            <div class="stat-topline">
              <span class="stat-dot pp"></span>
              <span class="label">ПЕРЕДДИПЛОМНА (ПП)</span>
            </div>
            <strong>{{ selectedRecordCounts.pp }}</strong>
            <small>{{ (selectedRecord.events || []).find(event => event.code === 'ПП')?.dateFrom || '—' }} — {{ (selectedRecord.events || []).find(event => event.code === 'ПП')?.dateTo || '—' }}</small>
          </div>

          <div class="stat-box dp">
            <div class="stat-topline">
              <span class="stat-dot dp"></span>
              <span class="label">ДИПЛОМНЕ ПРОЄКТУВАННЯ (ДП)</span>
            </div>
            <strong>{{ selectedRecordCounts.dp }}</strong>
            <small>{{ (selectedRecord.events || []).find(event => event.code === 'ДП')?.dateFrom || '—' }} — {{ (selectedRecord.events || []).find(event => event.code === 'ДП')?.dateTo || '—' }}</small>
          </div>

          <div class="stat-box a">
            <div class="stat-topline">
              <span class="stat-dot a"></span>
              <span class="label">АТЕСТАЦІЯ (А)</span>
            </div>
            <strong>{{ (selectedRecord.weeks || []).filter(w => w.code === 'А').length }}</strong>
            <small>{{ (selectedRecord.events || []).find(event => event.code === 'А')?.dateFrom || '—' }} — {{ (selectedRecord.events || []).find(event => event.code === 'А')?.dateTo || '—' }}</small>
          </div>
        </div>

        <div class="mode-switch">
          <button :class="{ active: viewMode === 'month' }" @click="viewMode = 'month'">Місяць</button>
          <button :class="{ active: viewMode === 'year' }" @click="viewMode = 'year'">Весь рік</button>
        </div>

        <div v-if="viewMode === 'month'" class="calendar-section">
          <div class="month-nav">
            <button @click="changeMonth(-1)">← Попередній</button>
            <strong>{{ selectedMonthLabel }}</strong>
            <button @click="changeMonth(1)">Наступний →</button>
          </div>

          <div class="month-list">
            <div v-for="event in selectedMonthEvents" :key="`${selectedRecord.group}-${selectedMonthLabel}-${event.code}-${event.weekFrom}`" class="month-card" :class="{ pa: event.code === 'ПА', holiday: event.code === 'СТ', exam: event.code === 'Е', practice: ['ОТ', 'ВТ', 'ВП', 'С', 'ЕМ', 'РМ', 'РВ'].includes(event.code), pp: event.code === 'ПП', dp: event.code === 'ДП', a: event.code === 'А', k: event.code === 'К' }">
              <div class="event-main">
                <span class="tag" :class="{ pa: event.code === 'ПА', holiday: event.code === 'СТ', exam: event.code === 'Е', practice: ['ОТ', 'ВТ', 'ВП', 'С', 'ЕМ', 'РМ', 'РВ'].includes(event.code), pp: event.code === 'ПП', dp: event.code === 'ДП', a: event.code === 'А', k: event.code === 'К' }">{{ event.code }}</span>
                <h3>{{ event.name }}</h3>
              </div>

              <div class="event-meta">
                <div><span>Період</span> {{ event.dateFrom }} – {{ event.dateTo }}</div>
                <div><span>Тижнів</span> {{ event.weeksCount }}</div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="year-view">
          <div v-for="monthName in selectedRecordMonths" :key="monthName" class="year-month-block">
            <div class="month-card-header">{{ monthName }}</div>

            <div v-if="selectedRecordWeeksByMonth(monthName).length" class="month-events">
              <div v-for="event in selectedRecordWeeksByMonth(monthName)" :key="`${selectedRecord.group}-${monthName}-${event.code}-${event.weekFrom}`" class="year-event" :class="{ pa: event.code === 'ПА', holiday: event.code === 'СТ', exam: event.code === 'Е', practice: ['ОТ', 'ВТ', 'ВП', 'С', 'ЕМ', 'РМ', 'РВ'].includes(event.code), pp: event.code === 'ПП', dp: event.code === 'ДП', a: event.code === 'А', k: event.code === 'К' }">
                <span class="event-pill" :class="{ pa: event.code === 'ПА', holiday: event.code === 'СТ', exam: event.code === 'Е', practice: ['ОТ', 'ВТ', 'ВП', 'С', 'ЕМ', 'РМ', 'РВ'].includes(event.code), pp: event.code === 'ПП', dp: event.code === 'ДП', a: event.code === 'А', k: event.code === 'К' }">{{ event.code }}</span>
                <div class="event-date-range">{{ event.dateFrom }} — {{ event.dateTo }}</div>
                <div class="event-weeks">{{ event.weeksCount }} тижнів</div>
              </div>
            </div>

            <div v-else class="year-empty">Навчальний процес</div>
          </div>
        </div>

        <div class="legend" v-if="selectedRecord">
          <div class="legend-item"><span class="legend-dot pa"></span> ПА — Проміжна атестація</div>
          <div class="legend-item"><span class="legend-dot holiday"></span> СТ — Святковий тиждень</div>
          <div class="legend-item"><span class="legend-dot exam"></span> Е — Екзаменаційна сесія</div>
          <div class="legend-item"><span class="legend-dot practice"></span> ОТ — Практика з використанням обчислювальної техніки</div>
          <div class="legend-item"><span class="legend-dot practice-alt"></span> ВТ — Виробнича технологічна практика</div>
          <div class="legend-item"><span class="legend-dot pp"></span> ПП — Переддипломна практика</div>
          <div class="legend-item"><span class="legend-dot dp"></span> ДП — Дипломне проєктування</div>
          <div class="legend-item"><span class="legend-dot a"></span> А — Атестація здобувачів ФПО</div>
        </div>

        <p class="footer-note">Періоди зазначені за даними графіка освітнього процесу. Тиждень рахується з понеділка по неділю.</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import api from '../services/api'

const loading = ref(true)
const error = ref('')
const records = ref(null)
const selectedGroup = ref('')
const searchTerm = ref('')
const viewMode = ref('month')
const selectedMonthIndex = ref(0)

const monthOrder = ['Вересень', 'Жовтень', 'Листопад', 'Грудень', 'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень']

const normalizeGroupName = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()

const fallbackGroups = ['РПЗ 26 1/9']

const groups = computed(() => {
  const baseGroups = (records.value?.groups || []).slice().sort((a, b) => a.group.localeCompare(b.group))
  const existing = new Set(baseGroups.map(group => normalizeGroupName(group.group)))

  const merged = [...baseGroups]
  fallbackGroups.forEach(groupName => {
    if (!existing.has(normalizeGroupName(groupName))) {
      merged.push({ group: groupName, weeks: [], events: [] })
    }
  })

  return merged.sort((a, b) => a.group.localeCompare(b.group))
})

const eventDisplayNames = {
  ПА: 'Проміжна атестація',
  СТ: 'Святковий тиждень',
  Е: 'Екзаменаційна сесія',
  ОТ: 'Практика з використанням обчислювальної техніки',
  ВТ: 'Виробнича технологічна практика',
  ПП: 'Переддипломна практика',
  ДП: 'Дипломне проєктування',
  А: 'Атестація здобувачів ФПО'
}

const parseDateValue = (value) => {
  if (!value || typeof value !== 'string') return null
  const parts = value.split('.')
  if (parts.length !== 3) return null

  const day = Number(parts[0])
  const month = Number(parts[1])
  const year = Number(parts[2])

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null

  return new Date(year, month - 1, day)
}

const getEventDisplayName = (eventCode, fallbackName) => {
  if (eventCode && eventDisplayNames[eventCode]) return eventDisplayNames[eventCode]
  return fallbackName || 'Навчальна діяльність'
}

const upcomingEventFilters = [
  { value: 'all', label: 'Усі' },
  { value: 'ПА', label: 'ПА' },
  { value: 'practice', label: 'Практики' },
  { value: 'Е', label: 'Е' },
  { value: 'ПП', label: 'ПП' },
  { value: 'ДП', label: 'ДП' },
  { value: 'А', label: 'А' }
]

const upcomingFilter = ref('all')

const upcomingEvents = computed(() => {
  const map = new Map()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (const group of records.value?.groups || []) {
    for (const event of group.events || []) {
      if (!event || !event.dateFrom || !event.dateTo) continue

      const startDate = parseDateValue(event.dateFrom)
      const endDate = parseDateValue(event.dateTo)
      if (!startDate || !endDate) continue

      if (endDate < today) continue

      const dedupeKey = `${group.group}|${event.code || 'unknown'}|${event.dateFrom}|${event.dateTo}`
      if (map.has(dedupeKey)) continue

      map.set(dedupeKey, {
        group: group.group,
        code: event.code,
        name: getEventDisplayName(event.code, event.name),
        dateFrom: event.dateFrom,
        dateTo: event.dateTo,
        weeksCount: Number(event.weeksCount || 1),
        startDate,
        endDate
      })
    }
  }

  return [...map.values()].sort((a, b) => a.startDate - b.startDate)
})

const filteredUpcomingEvents = computed(() => {
  const filtered = upcomingEvents.value.filter((event) => {
    if (upcomingFilter.value === 'all') return true
    if (upcomingFilter.value === 'practice') return ['ОТ', 'ВТ'].includes(event.code)
    return event.code === upcomingFilter.value
  })

  return filtered.slice(0, 6)
})

const hasMoreUpcomingEvents = computed(() => upcomingEvents.value.filter((event) => {
  if (upcomingFilter.value === 'all') return true
  if (upcomingFilter.value === 'practice') return ['ОТ', 'ВТ'].includes(event.code)
  return event.code === upcomingFilter.value
}).length > 6)

const getEventRelativeStatus = (event) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (event.startDate <= today && event.endDate >= today) {
    return 'Зараз триває'
  }

  const diffDays = Math.ceil((event.startDate - today) / 86400000)
  if (diffDays > 0) {
    return `Через ${diffDays} ${diffDays === 1 ? 'день' : 'днів'}`
  }

  return 'Незабаром'
}

const scheduleStatusItems = computed(() => {
  const stats = {
    ПА: 0,
    Практики: 0,
    Е: 0,
    ПП: 0,
    ДП: 0,
    А: 0
  }

  for (const group of records.value?.groups || []) {
    if ((group.events || []).some(event => event.code === 'ПА')) stats.ПА += 1
    if ((group.events || []).some(event => ['ОТ', 'ВТ'].includes(event.code))) stats.Практики += 1
    if ((group.events || []).some(event => event.code === 'Е')) stats.Е += 1
    if ((group.events || []).some(event => event.code === 'ПП')) stats.ПП += 1
    if ((group.events || []).some(event => event.code === 'ДП')) stats.ДП += 1
    if ((group.events || []).some(event => event.code === 'А')) stats.А += 1
  }

  return [
    { label: 'ПА', value: `${stats.ПА} групи` },
    { label: 'Практики', value: `${stats.Практики} груп` },
    { label: 'Е', value: `${stats.Е} груп` },
    { label: 'ПП', value: `${stats.ПП} групи` },
    { label: 'ДП', value: `${stats.ДП} групи` },
    { label: 'А', value: `${stats.А} групи` }
  ]
})

const selectUpcomingGroup = (groupName) => {
  selectedGroup.value = groupName
}

const filteredGroups = computed(() => {
  const term = normalizeGroupName(searchTerm.value)
  if (!term) return groups.value
  return groups.value.filter(group => normalizeGroupName(group.group).includes(term))
})

const selectedRecord = computed(() => {
  if (!selectedGroup.value) return null
  const normalizedSelected = normalizeGroupName(selectedGroup.value)
  const matched = groups.value.find(record => normalizeGroupName(record.group) === normalizedSelected)

  if (matched) return matched

  return {
    group: selectedGroup.value,
    weeks: [],
    events: []
  }
})

const hasGraduationEvent = computed(() => {
  return (selectedRecord.value?.events || []).some(event => event.code === 'Випуск' || event.name === 'Випуск')
})

const selectedRecordMonths = computed(() => {
  if (!selectedRecord.value) return []
  const monthSet = new Set()
  for (const event of selectedRecord.value.events || []) {
    if (event.monthFrom) monthSet.add(event.monthFrom)
    if (event.monthTo) monthSet.add(event.monthTo)
  }

  const months = Array.from(monthSet).filter(Boolean).sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b))

  if (hasGraduationEvent.value) {
    return months.filter(month => month !== 'Липень')
  }

  return months
})

const selectedMonthLabel = computed(() => {
  if (!selectedRecordMonths.value.length) return ''
  return selectedRecordMonths.value[selectedMonthIndex.value] || selectedRecordMonths.value[0]
})

const selectedMonthEvents = computed(() => {
  if (!selectedRecord.value) return []
  const monthName = selectedMonthLabel.value
  if (hasGraduationEvent.value && monthName === 'Липень') return []
  return (selectedRecord.value.events || []).filter((event) => event.monthFrom === monthName || event.monthTo === monthName)
})

const selectedRecordWeeksByMonth = (monthName) => {
  if (!selectedRecord.value) return []
  if (hasGraduationEvent.value && monthName === 'Липень') return []
  return (selectedRecord.value.events || []).filter((event) => event.monthFrom === monthName || event.monthTo === monthName)
}

const selectedRecordCounts = computed(() => {
  const weeks = selectedRecord.value?.weeks || []
  return {
    pa: weeks.filter(w => w.code === 'ПА').length,
    exam: weeks.filter(w => w.code === 'Е').length,
    practice: weeks.filter(w => ['ОТ', 'ВТ', 'ВП', 'С', 'ЕМ', 'РМ', 'РВ'].includes(w.code)).length,
    pp: weeks.filter(w => w.code === 'ПП').length,
    dp: weeks.filter(w => w.code === 'ДП').length
  }
})

const changeMonth = (delta) => {
  if (!selectedRecordMonths.value.length) return
  const maxIndex = selectedRecordMonths.value.length - 1
  selectedMonthIndex.value = Math.min(maxIndex, Math.max(0, selectedMonthIndex.value + delta))
}

watch(selectedRecord, () => {
  selectedMonthIndex.value = 0
})

onMounted(async () => {
  try {
    const response = await api.get('/education-process')
    records.value = response.data.records || null
    if (groups.value.length) {
      selectedGroup.value = groups.value[0].group
    }
  } catch (e) {
    error.value = e.response?.data?.message || 'Не вдалося завантажити графік освітнього процесу.'
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
:global(body) {
  background: #f4f6fb;
}

.education-process-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 18px 0 36px;
  color: #111827;
}

.schedule-panel {
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
  padding: 0;
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(220px, 420px);
  gap: 18px;
  margin-bottom: 22px;
}

.search-wrap,
.select-wrap {
  display: grid;
  gap: 8px;
}

.field-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #475467;
  font-weight: 700;
}

input,
select {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #dfe3ea;
  border-radius: 10px;
  font-size: 15px;
  color: #0f172a;
  background: #fff;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

input:focus,
select:focus {
  outline: 2px solid rgba(99, 102, 241, 0.15);
  border-color: #b6c0ff;
}

.selected-group-wrap {
  display: grid;
  gap: 20px;
}

.upcoming-events-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.85fr) minmax(220px, 0.95fr);
  gap: 18px;
  margin: 0 0 22px;
}

.upcoming-events-panel,
.schedule-status-panel {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
  padding: 18px;
}

.panel-heading {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
}

.panel-heading.compact {
  margin-bottom: 10px;
}

.panel-heading h3 {
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.3;
  color: #111827;
  letter-spacing: -0.02em;
}

.panel-heading p {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.upcoming-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.filter-chip {
  border: 1px solid #dfe3ea;
  background: #f8fafc;
  color: #475467;
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-chip.active {
  background: #eef2ff;
  border-color: #c7d2fe;
  color: #312e81;
}

.upcoming-events-list {
  display: grid;
  gap: 10px;
}

.event-card {
  width: 100%;
  text-align: left;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  background: #fff;
  padding: 12px 12px 10px;
  display: grid;
  gap: 7px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.03);
}

.event-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.event-code {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 42px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.event-status {
  font-size: 11px;
  font-weight: 700;
  color: #475467;
}

.event-card-name {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
  color: #111827;
}

.event-card-group,
.event-card-dates,
.event-card-weeks {
  font-size: 12px;
  color: #475467;
  line-height: 1.45;
}

.event-card-weeks {
  font-weight: 700;
}

.upcoming-empty {
  padding: 12px 0 0;
  color: #64748b;
  font-size: 13px;
}

.upcoming-summary {
  margin-top: 12px;
  color: #475467;
  font-size: 12px;
  font-weight: 600;
}

.status-list {
  display: grid;
  gap: 10px;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px 12px;
}

.status-label {
  font-size: 12px;
  color: #475467;
  font-weight: 700;
}

.status-row strong {
  font-size: 13px;
  color: #111827;
  letter-spacing: -0.01em;
}

.selected-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  padding: 0 0 12px;
}

.header-copy {
  display: grid;
  gap: 6px;
}

.card-label {
  margin: 0;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
  font-weight: 700;
}

.selected-header h2 {
  margin: 0;
  font-size: clamp(2rem, 3vw, 3rem);
  line-height: 1.1;
  letter-spacing: -0.04em;
  color: #111827;
  font-weight: 800;
}

.study-year-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  background: #eef2ff;
  color: #312e81;
  font-size: 13px;
  font-weight: 700;
  box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.08);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(150px, 1fr));
  gap: 12px;
}

.stat-box {
  display: grid;
  gap: 10px;
  min-height: 128px;
  padding: 14px 14px 12px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.04);
  position: relative;
  overflow: hidden;
}

.stat-box::before {
  content: "";
  position: absolute;
  inset: 0 auto auto 0;
  width: 100%;
  height: 3px;
  background: transparent;
}

.stat-topline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.stat-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #475467;
  font-weight: 700;
}

.stat-box strong {
  font-size: clamp(1.6rem, 2vw, 2.2rem);
  line-height: 1;
  color: #111827;
  letter-spacing: -0.04em;
}

.stat-box small {
  font-size: 12px;
  line-height: 1.5;
  color: #64748b;
  font-weight: 600;
}

.mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #eef2f8;
  border-radius: 14px;
  padding: 5px;
  width: fit-content;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.12);
}

.mode-switch button,
.month-nav button {
  border: none;
  background: transparent;
  color: #475467;
  padding: 10px 16px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 700;
  font-size: 14px;
  transition: all 0.2s ease;
}

.mode-switch button.active {
  background: linear-gradient(180deg, #2f3d8d 0%, #273774 100%);
  color: #fff;
  box-shadow: 0 6px 14px rgba(39, 55, 116, 0.2);
}

.calendar-section {
  display: grid;
  gap: 18px;
}

.month-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0 4px;
}

.month-nav strong {
  font-size: 28px;
  color: #111827;
  letter-spacing: -0.03em;
}

.month-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

.month-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-left: 6px solid #dbeafe;
  border-radius: 14px;
  padding: 16px;
  display: grid;
  gap: 12px;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
}

.event-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.event-main h3 {
  margin: 0;
  font-size: 16px;
  line-height: 1.35;
  color: #111827;
}

.tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.event-meta {
  display: grid;
  gap: 6px;
  color: #475467;
  font-size: 12px;
}

.event-meta div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.event-meta span {
  font-weight: 700;
  color: #374151;
}

.year-view {
  display: grid;
  grid-template-columns: repeat(4, minmax(220px, 1fr));
  gap: 16px;
}

.year-month-block {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 14px 14px 12px;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
  display: grid;
  gap: 10px;
}

.month-card-header {
  font-size: 16px;
  font-weight: 800;
  color: #111827;
  letter-spacing: -0.02em;
}

.month-events {
  display: grid;
  gap: 10px;
}

.year-event {
  display: grid;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  background: #f8fafc;
}

.event-weeks {
  font-size: 11px;
  line-height: 1.4;
  color: #475467;
  font-weight: 700;
}

.event-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  min-width: 42px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.event-date-range {
  font-size: 12px;
  line-height: 1.5;
  color: #334155;
  font-weight: 600;
}

.year-empty {
  font-size: 12px;
  color: #64748b;
  padding: 10px 0 2px;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: center;
  padding-top: 4px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #475467;
  font-size: 12px;
  line-height: 1.4;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}

.footer-note {
  margin: 0;
  color: #6b7280;
  font-size: 12px;
  line-height: 1.6;
}

.pa { background: #f9d7df; color: #8b1e3f; }
.pa::before { background: #f38aa6; }
.stat-dot.pa { background: #f38aa6; }
.legend-dot.pa { background: #f38aa6; }
.event-code.pa { background: #f9d7df; color: #8b1e3f; }

.holiday { background: #f0d9f7; color: #5b2a7a; }
.stat-dot.holiday { background: #b86ad8; }
.legend-dot.holiday { background: #b86ad8; }
.event-code.holiday { background: #f0d9f7; color: #5b2a7a; }

.exam { background: #ffd9b3; color: #9a4d00; }
.stat-dot.exam { background: #ff9f43; }
.legend-dot.exam { background: #ff9f43; }
.event-code.exam { background: #ffd9b3; color: #9a4d00; }

.practice { background: #dff7d8; color: #1f6b32; }
.stat-dot.practice { background: #5ec76f; }
.legend-dot.practice { background: #5ec76f; }
.event-code.practice { background: #dff7d8; color: #1f6b32; }

.practice-alt { background: #d5f0ff; color: #13689f; }
.legend-dot.practice-alt { background: #54b2e8; }
.event-code.practice-alt { background: #d5f0ff; color: #13689f; }

.pp { background: #dfe4ff; color: #2646be; }
.stat-dot.pp { background: #6887ff; }
.legend-dot.pp { background: #6887ff; }
.event-code.pp { background: #dfe4ff; color: #2646be; }

.dp { background: #f7e8bb; color: #7f5800; }
.stat-dot.dp { background: #d4a728; }
.legend-dot.dp { background: #d4a728; }
.event-code.dp { background: #f7e8bb; color: #7f5800; }

.a { background: #fbe2d2; color: #8a4d2c; }
.stat-dot.a { background: #ef8f5b; }
.legend-dot.a { background: #ef8f5b; }
.event-code.a { background: #fbe2d2; color: #8a4d2c; }

.k { background: #f3f4f6; color: #374151; }
.stat-dot.k { background: #d1d5db; }
.legend-dot.k { background: #d1d5db; }
.event-code.k { background: #f3f4f6; color: #374151; }

.loading,
.error-message {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px 18px;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
}

.error-message {
  color: #b42318;
}

@media (max-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(3, minmax(160px, 1fr));
  }

  .upcoming-events-layout {
    grid-template-columns: 1fr;
  }

  .year-view {
    grid-template-columns: repeat(2, minmax(220px, 1fr));
  }
}

@media (max-width: 768px) {
  .education-process-page {
    padding-top: 8px;
  }

  .toolbar {
    grid-template-columns: 1fr;
  }

  .selected-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .study-year-badge {
    align-self: flex-start;
  }

  .stats-grid {
    grid-template-columns: repeat(2, minmax(130px, 1fr));
  }

  .month-nav {
    flex-direction: column;
    align-items: flex-start;
  }

  .year-view {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  .mode-switch {
    width: 100%;
    justify-content: space-between;
  }

  .mode-switch button {
    flex: 1;
  }
}
</style>
