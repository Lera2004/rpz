<template>
  <section class="statements-page">
    <div class="page-header">
      <div>
        <p class="eyebrow">Документи</p>
        <h1>Відомості</h1>
      </div>
    </div>

    <div v-if="loading" class="state-message">Завантаження груп...</div>
    <div v-else class="content-card">
      <div v-if="error" class="state-message error">{{ error }}</div>
      <div v-if="successMessage" class="state-message success">{{ successMessage }}</div>
      <div class="statements-layout" :class="{ 'admin-layout': isAdmin }">
        <section v-if="isAdmin" class="template-manager">
          <div class="template-manager-heading">
            <div>
              <h2>Шаблони відомостей</h2>
              <p>Завантажте власний DOCX-шаблон, щоб замінити стандартний. Завантажені шаблони зберігаються після перезапуску.</p>
            </div>
            <button type="button" class="secondary-button" :disabled="templatesLoading" @click="loadTemplates">
              {{ templatesLoading ? 'Оновлення...' : 'Оновити список' }}
            </button>
          </div>
          <div v-if="templateError" class="state-message error">{{ templateError }}</div>
          <div v-else-if="templatesLoading && !templates.length" class="template-empty">
            Завантаження списку шаблонів...
          </div>
          <div v-else class="template-list">
            <div v-for="template in templates" :key="template.type" class="template-item">
              <div class="template-info">
                <strong>{{ template.label }}</strong>
                <span v-if="template.custom">Завантажений шаблон: {{ template.filename }}</span>
                <span v-else>Стандартний шаблон: {{ template.fallbackFilename }}</span>
              </div>
              <div class="template-controls">
                <label class="template-upload" :class="{ disabled: Boolean(uploadingType) }">
                  <input
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    :disabled="Boolean(uploadingType)"
                    @change="uploadTemplate($event, template)"
                  />
                  {{ uploadingType === template.type
                    ? 'Завантаження...'
                    : template.custom ? 'Замінити шаблон' : 'Завантажити шаблон' }}
                </label>
                <button
                  v-if="template.custom"
                  type="button"
                  class="delete-button"
                  :disabled="Boolean(deletingType)"
                  @click="deleteTemplate(template)"
                >
                  {{ deletingType === template.type ? 'Видалення...' : 'Видалити' }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="statement-workspace">
          <div class="group-picker">
            <label class="field" for="statement-group">Оберіть навчальну групу</label>
            <select id="statement-group" v-model="selectedGroup">
              <option value="">Оберіть групу зі списку</option>
              <option v-for="group in groups" :key="group.id" :value="String(group.id)">
                {{ group.name }} ({{ group.student_count }} студентів)
              </option>
            </select>
            <span>Виберіть групу, щоб переглянути доступні для формування документи.</span>
          </div>

          <div v-if="selectedGroup" class="selected-group">
            <div class="selected-group-heading">
              <div>
                <span class="selected-group-label">Обрана група</span>
                <strong>{{ selectedGroupName }}</strong>
                <span>{{ selectedGroupCourse }} курс · {{ selectedGroupSpecialty }}</span>
              </div>
              <span class="student-count-badge">{{ selectedGroupRecord.student_count }} активних студентів</span>
            </div>
            <div class="report-list">
              <div v-for="report in availableReports" :key="report.type" class="statement-row">
                <div>
                  <strong>{{ report.label }}</strong>
                  <span>{{ report.description }}</span>
                  <small v-if="templatesByType[report.type]">
                    {{ templatesByType[report.type].custom
                      ? `Активний шаблон: ${templatesByType[report.type].filename}`
                      : `Стандартний шаблон: ${templatesByType[report.type].fallbackFilename}` }}
                  </small>
                </div>
                <div class="statement-actions">
                  <button type="button" :disabled="downloading" @click="downloadStatement(report.type, report.label)">
                    {{ downloadingType === report.type ? 'Формування...' : 'Завантажити' }}
                  </button>
                </div>
              </div>
            </div>
            <div class="statement-row group-list-row">
              <div>
                <strong>Список студентів групи</strong>
                <span>Word-документ із фінансуванням і класним керівником; студенти в академічній відпустці не включаються.</span>
              </div>
              <div class="statement-actions">
                <button type="button" :disabled="downloading" @click="downloadGroupList">
                  {{ downloadingType === 'group-list' ? 'Формування...' : 'Завантажити список' }}
                </button>
              </div>
            </div>
          </div>
          <div v-else class="empty-state">
            Оберіть групу, щоб переглянути відомості та список студентів.
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../services/api'

const groups = ref([])
const templates = ref([])
const selectedGroup = ref('')
const loading = ref(true)
const error = ref('')
const templateError = ref('')
const downloading = ref(false)
const downloadingType = ref('')
const uploadingType = ref('')
const deletingType = ref('')
const templatesLoading = ref(false)
const successMessage = ref('')
const isAdmin = computed(() => {
  try {
    return JSON.parse(localStorage.getItem('ped_user') || 'null')?.role === 'admin'
  } catch (parseError) {
    console.error('Не вдалося прочитати роль користувача', parseError)
    return false
  }
})
const selectedGroupRecord = computed(() => groups.value.find((group) => String(group.id) === selectedGroup.value) || null)
const templatesByType = computed(() => Object.fromEntries(templates.value.map((template) => [template.type, template])))
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
  await Promise.all([loadGroups(), loadTemplates()])
})

const loadGroups = async () => {
  loading.value = true
  try {
    const response = await api.get('/statements/groups')
    groups.value = Array.isArray(response.data) ? response.data : []
    error.value = ''
  } catch (requestError) {
    console.error(requestError)
    error.value = requestError.response?.data?.message || 'Не вдалося завантажити групи.'
  } finally {
    loading.value = false
  }
}

const loadTemplates = async () => {
  templatesLoading.value = true
  templateError.value = ''
  try {
    const response = await api.get('/statements/templates')
    templates.value = Array.isArray(response.data) ? response.data : []
  } catch (requestError) {
    console.error(requestError)
    templateError.value = requestError.response?.status === 404
      ? 'API шаблонів не знайдено (404). Перезапустіть backend, щоб завантажити нові маршрути.'
      : requestError.response?.data?.message || 'Не вдалося завантажити список шаблонів.'
  } finally {
    templatesLoading.value = false
  }
}

const uploadTemplate = async (event, report) => {
  const file = event.target.files?.[0]
  if (!file) return

  uploadingType.value = report.type
  error.value = ''
  successMessage.value = ''
  try {
    const formData = new FormData()
    formData.append('template', file)
    const uploadResponse = await api.post(`/statements/templates/${report.type}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    await loadTemplates()
    successMessage.value = uploadResponse.data?.message || 'Шаблон відомості імпортовано.'
  } catch (requestError) {
    console.error(requestError)
    error.value = requestError.response?.data?.message || 'Не вдалося імпортувати шаблон відомості.'
  } finally {
    uploadingType.value = ''
    event.target.value = ''
  }
}

const deleteTemplate = async (template) => {
  if (!window.confirm(`Видалити завантажений шаблон «${template.label}»? Буде використовуватися стандартний шаблон.`)) return

  deletingType.value = template.type
  error.value = ''
  templateError.value = ''
  successMessage.value = ''
  try {
    const response = await api.delete(`/statements/templates/${template.type}`)
    await loadTemplates()
    successMessage.value = response.data?.message || 'Шаблон видалено.'
  } catch (requestError) {
    console.error(requestError)
    templateError.value = requestError.response?.data?.message || 'Не вдалося видалити шаблон.'
  } finally {
    deletingType.value = ''
  }
}

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

const downloadGroupList = async () => {
  if (!selectedGroup.value) return

  try {
    downloading.value = true
    downloadingType.value = 'group-list'
    error.value = ''
    const response = await api.get(`/statements/group-list/${selectedGroup.value}`, { responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `Список студентів ${selectedGroupName.value}.docx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (requestError) {
    console.error(requestError)
    error.value = requestError.response?.status === 404
      ? 'Групу не знайдено. Оновіть сторінку та спробуйте ще раз.'
      : 'Не вдалося сформувати список студентів групи.'
  } finally {
    downloading.value = false
    downloadingType.value = ''
  }
}
</script>

<style scoped>
.statements-page {
  width: 100%;
  max-width: none;
  min-width: 0;
}

.page-header {
  margin-bottom: 24px;
  padding: 28px 32px;
  border-radius: 18px;
  background: linear-gradient(120deg, #1d4ed8, #2563eb 60%, #3b82f6);
  color: white;
  box-shadow: 0 14px 30px rgba(29, 78, 216, 0.18);
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
  font-size: clamp(28px, 3vw, 36px);
}

.content-card {
  width: 100%;
  max-width: none;
  min-width: 0;
  padding: clamp(18px, 3vw, 30px);
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 14px 35px rgba(15, 23, 42, 0.06);
}

.statements-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.statements-layout.admin-layout {
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
}

.statement-workspace {
  min-width: 0;
}

.template-manager {
  min-width: 0;
  margin: 0;
  padding: 20px;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  background: #f8fafc;
}

.template-manager-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.template-manager-heading h2 {
  margin: 0 0 6px;
  color: #0f172a;
  font-size: 20px;
}

.template-manager-heading p {
  max-width: 600px;
  margin: 0;
  color: #64748b;
  font-size: 14px;
  line-height: 1.5;
}

.template-list {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
}

.template-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 16px;
  border-bottom: 1px solid #e2e8f0;
  transition: background 0.18s ease;
}

.template-item:last-child {
  border-bottom: 0;
}

.template-item:hover {
  background: #f8fbff;
}

.template-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.template-info strong {
  color: #1e293b;
}

.template-info span {
  overflow-wrap: anywhere;
  color: #64748b;
  font-size: 13px;
}

.template-controls {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.template-empty {
  padding: 12px 0;
  color: #64748b;
}

.field {
  display: block;
  margin-bottom: 0;
  color: #334155;
  font-size: 15px;
  font-weight: 700;
}

.group-picker {
  display: flex;
  flex-direction: column;
  gap: 9px;
  max-width: 640px;
  padding: 18px;
  border: 1px solid #dbe5f1;
  border-radius: 14px;
  background: linear-gradient(135deg, #f8fbff, #fff);
}

.group-picker > span {
  color: #64748b;
  font-size: 13px;
}

.group-picker select {
  width: 100%;
  min-height: 48px;
  padding: 11px 42px 11px 14px;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  background: white;
  color: #0f172a;
  font-size: 15px;
  font-weight: 600;
  outline: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.group-picker select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
}

.empty-state,
.state-message {
  margin-top: 20px;
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  color: #64748b;
}

.empty-state {
  max-width: 640px;
  text-align: center;
}

.statement-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.statement-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.template-upload {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  padding: 10px 14px;
  background: #e2e8f0;
  color: #1e293b;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.template-upload input {
  display: none;
}

.template-upload.disabled {
  opacity: 0.6;
  cursor: wait;
}

.secondary-button,
.delete-button {
  background: #e2e8f0;
  color: #1e293b;
}

.delete-button {
  background: #fee2e2;
  color: #991b1b;
}

.secondary-button:disabled,
.delete-button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.selected-group {
  margin-top: 24px;
}

.selected-group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  padding: 18px 20px;
  border: 1px solid #dbeafe;
  border-radius: 14px;
  background: linear-gradient(115deg, #eff6ff, #f8fbff);
}

.selected-group-heading div,
.statement-row div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.selected-group-heading div { gap: 5px; }

.selected-group-label {
  color: #2563eb;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.selected-group-heading strong {
  color: #0f172a;
  font-size: 20px;
}

.selected-group-heading div > span:last-child {
  color: #64748b;
  font-size: 14px;
}

.selected-group-heading > span {
  color: #64748b;
  font-size: 14px;
  white-space: nowrap;
}

.selected-group-heading .student-count-badge {
  padding: 8px 12px;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  background: #fff;
  color: #1d4ed8;
  font-size: 13px;
  font-weight: 700;
}

.report-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.report-list .statement-row {
  min-height: 152px;
  flex-direction: column;
  align-items: stretch;
  justify-content: space-between;
  padding: 18px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.03);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.report-list .statement-row:hover {
  transform: translateY(-2px);
  border-color: #bfdbfe;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.08);
}

.statement-row strong {
  color: #172554;
  font-size: 15px;
  line-height: 1.35;
}

.group-list-row {
  margin-top: 14px;
  padding: 18px 20px;
  border: 1px solid #cbdcf5;
  border-radius: 14px;
  background: #f8fbff;
}

.group-list-row > div:first-child {
  max-width: 660px;
}

.statement-row span {
  color: #64748b;
  font-size: 14px;
}

.statement-row small {
  color: #475569;
  font-size: 12px;
}

button {
  border: 0;
  border-radius: 8px;
  padding: 10px 14px;
  background: #1d4ed8;
  color: white;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  transition: background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.statement-actions button {
  min-width: 132px;
  box-shadow: 0 5px 12px rgba(29, 78, 216, 0.16);
}

.statement-actions button:hover:not(:disabled) {
  transform: translateY(-1px);
  background: #1e40af;
  box-shadow: 0 8px 16px rgba(29, 78, 216, 0.22);
}

button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.error {
  color: #b42318;
  background: #fef3f2;
}

.success {
  color: #166534;
  background: #f0fdf4;
}

@media (max-width: 700px) {
  .statement-row,
  .selected-group-heading,
  .template-item,
  .template-manager-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .statement-actions,
  .template-controls {
    justify-content: flex-start;
  }

  .report-list {
    grid-template-columns: 1fr;
  }

  .report-list .statement-row {
    min-height: 0;
    gap: 18px;
  }

  .selected-group-heading .student-count-badge {
    align-self: flex-start;
  }

  .group-list-row {
    align-items: stretch;
    flex-direction: column;
  }

  .statement-actions button {
    width: 100%;
  }

  .template-manager {
    padding: 16px;
  }
}

@media (max-width: 1050px) {
  .report-list {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 760px) {
  .statements-layout.admin-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
