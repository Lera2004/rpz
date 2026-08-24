<template>
  <section class="statements-page">
    <div class="page-header">
      <div>
        <p class="eyebrow">Документи</p>
        <h1>Відомості</h1>
      </div>
    </div>

    <div v-if="loading" class="state-message">Завантаження груп...</div>
    <div v-else-if="error" class="state-message error">{{ error }}</div>
    <div v-else class="content-card">
      <label class="field" for="statement-group">Група</label>
      <select id="statement-group" v-model="selectedGroup">
        <option value="">Оберіть групу</option>
        <option v-for="group in groups" :key="group.id" :value="String(group.id)">
          {{ group.name }} ({{ group.student_count }} студентів)
        </option>
      </select>

      <div v-if="selectedGroup" class="selected-group">
        <div class="selected-group-heading">
          <div>
            <strong>{{ selectedGroupName }}</strong>
            <span>{{ selectedGroupCourse }} курс · {{ selectedGroupSpecialty }}</span>
          </div>
          <span>{{ selectedGroupRecord.student_count }} активних студентів</span>
        </div>
        <div class="report-list">
          <div v-for="report in availableReports" :key="report.type" class="statement-row">
            <div>
              <strong>{{ report.label }}</strong>
              <span>{{ report.description }}</span>
            </div>
            <button type="button" :disabled="downloading" @click="downloadStatement(report.type, report.label)">
              {{ downloadingType === report.type ? 'Формування...' : 'Завантажити' }}
            </button>
          </div>
        </div>
      </div>
      <div v-else class="empty-state">
        Оберіть групу, щоб переглянути відомості.
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../services/api'

const groups = ref([])
const selectedGroup = ref('')
const loading = ref(true)
const error = ref('')
const downloading = ref(false)
const downloadingType = ref('')
const selectedGroupRecord = computed(() => groups.value.find((group) => String(group.id) === selectedGroup.value) || null)
const selectedGroupName = computed(() => selectedGroupRecord.value?.name || '')
const selectedGroupCourse = computed(() => Number(selectedGroupRecord.value?.course || 0))
const selectedGroupSpecialty = computed(() => selectedGroupRecord.value?.specialty || 'Спеціальність не вказана')

const reportDefinitions = [
  { type: 'grade5', label: 'Залікова відомість 5 балів', description: 'Доступна для всіх курсів' },
  { type: 'grade12', label: 'Залікова відомість 12 балів', description: 'Для 1 та 2 курсу' },
  { type: 'summary', label: 'Підсумкова відомість', description: 'Підсумкові оцінки за семестрами' },
  { type: 'summary100', label: 'Підсумкова відомість 100 балів', description: 'Доступна для всіх курсів' },
  { type: 'summary24', label: 'Підсумкова відомість РПЗ 24', description: 'Шаблон для 2 курсу' },
  { type: 'okr', label: 'Відомість результатів ОКР', description: 'Оцінки та аркуш перескладання' }
]

const availableReports = computed(() => {
  const course = selectedGroupCourse.value
  if (!course) return []
  return reportDefinitions.filter((report) => {
    if (report.type === 'grade12') return [1, 2].includes(course)
    if (report.type === 'summary24') return course === 2
    return true
  })
})

onMounted(async () => {
  try {
    const response = await api.get('/statements/groups')
    groups.value = Array.isArray(response.data) ? response.data : []
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Не вдалося завантажити групи.'
  } finally {
    loading.value = false
  }
})

const downloadStatement = async (reportType, reportLabel) => {
  if (!selectedGroup.value) return

  try {
    downloading.value = true
    downloadingType.value = reportType
    error.value = ''
    const response = await api.get(`/statements/export/${selectedGroup.value}/${reportType}`, { responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `${reportLabel} ${selectedGroupName.value}.docx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Не вдалося завантажити відомість.'
  } finally {
    downloading.value = false
    downloadingType.value = ''
  }
}
</script>

<style scoped>
.statements-page {
  max-width: 1200px;
}

.page-header {
  margin-bottom: 24px;
  padding: 24px 28px;
  border-radius: 12px;
  background: #1d4ed8;
  color: white;
}

.eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.8;
}

h1 {
  margin: 0;
  font-size: 32px;
}

.content-card {
  max-width: 520px;
  padding: 24px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: white;
}

.field {
  display: block;
  margin-bottom: 8px;
  color: #334155;
  font-size: 14px;
  font-weight: 700;
}

select {
  width: 100%;
  padding: 11px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: white;
  color: #0f172a;
  font-size: 15px;
}

.empty-state,
.state-message {
  margin-top: 20px;
  padding: 16px;
  border-radius: 8px;
  background: #f8fafc;
  color: #64748b;
}

.statement-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #e2e8f0;
}

.selected-group {
  max-width: 760px;
}

.selected-group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 20px;
  padding: 16px 0;
  border-top: 1px solid #e2e8f0;
}

.selected-group-heading div,
.statement-row div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.selected-group-heading > span {
  color: #64748b;
  font-size: 14px;
  white-space: nowrap;
}

.report-list {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}

.report-list .statement-row {
  margin-top: 0;
  padding: 16px;
  border-top: 0;
  border-bottom: 1px solid #e2e8f0;
}

.report-list .statement-row:last-child {
  border-bottom: 0;
}

.statement-row span {
  color: #64748b;
  font-size: 14px;
}

button {
  border: 0;
  border-radius: 8px;
  padding: 10px 14px;
  background: #1d4ed8;
  color: white;
  cursor: pointer;
}

button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.error {
  color: #b42318;
  background: #fef3f2;
}
</style>
