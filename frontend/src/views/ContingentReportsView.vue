<template>
  <section class="reports-page">
    <header class="page-header">
      <div>
        <h1>Звіти контингенту</h1>
        <p>Сформовані PDF-звіти та архів їхніх знімків у базі даних.</p>
      </div>
      <button class="primary-button" type="button" :disabled="creating" @click="createReport">
        {{ creating ? 'Формування PDF...' : 'Сформувати контингент' }}
      </button>
    </header>

    <p v-if="error" class="error-message">{{ error }}</p>
    <p v-if="success" class="success-message">{{ success }}</p>
    <p v-if="loading" class="loading-message">Завантаження звітів...</p>

    <div v-else-if="reports.length" class="reports-table-wrap">
      <table class="reports-table">
        <thead>
          <tr>
            <th>Дата формування</th>
            <th>Контингент</th>
            <th>Дії за місяць</th>
            <th>Студентів</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="report in reports" :key="report.id">
            <td>{{ formatDate(report.created_at || report.snapshot_date) }}</td>
            <td>{{ report.title }}</td>
            <td>{{ report.actions_month }}</td>
            <td>{{ report.total }}</td>
            <td>
              <div class="report-actions">
                <button class="download-button" type="button" @click="downloadReport(report)">
                  Завантажити PDF
                </button>
                <button
                  class="delete-button"
                  type="button"
                  :disabled="deletingId === report.id"
                  @click="deleteReport(report)"
                >
                  {{ deletingId === report.id ? 'Видалення...' : 'Видалити' }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else-if="!loading" class="empty-reports">
      <strong>Звітів ще немає</strong>
      <span>Натисніть «Сформувати контингент», щоб створити та зберегти перший звіт.</span>
    </div>
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import api from '../services/api'

const reports = ref([])
const loading = ref(false)
const creating = ref(false)
const deletingId = ref(null)
const error = ref('')
const success = ref('')

function formatDate(value) {
  if (!value) return '—'
  const dateText = String(value).slice(0, 10)
  const isoDate = dateText.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoDate) return `${isoDate[3]}.${isoDate[2]}.${isoDate[1]}`
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return dateText
  return new Intl.DateTimeFormat('uk-UA').format(date)
}

async function loadReports() {
  loading.value = true
  error.value = ''
  try {
    const response = await api.get('/contingent-reports')
    reports.value = response.data || []
  } catch (requestError) {
    console.error(requestError)
    error.value = requestError.response?.data?.message || 'Не вдалося завантажити звіти контингенту.'
  } finally {
    loading.value = false
  }
}

async function createReport() {
  creating.value = true
  error.value = ''
  success.value = ''
  try {
    const response = await api.post('/contingent-reports')
    success.value = 'Звіт сформовано та збережено в базі даних.'
    await loadReports()
    const report = reports.value.find((item) => Number(item.id) === Number(response.data.id))
    if (report) await downloadReport(report)
  } catch (requestError) {
    console.error(requestError)
    error.value = requestError.response?.data?.message || 'Не вдалося сформувати звіт контингенту.'
  } finally {
    creating.value = false
  }
}

async function downloadReport(report) {
  error.value = ''
  try {
    const response = await api.get(`/contingent-reports/${report.id}/pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `контингент-${String(report.snapshot_date || '').slice(0, 10) || report.id}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (requestError) {
    console.error(requestError)
    error.value = 'Не вдалося завантажити PDF-звіт.'
  }
}

async function deleteReport(report) {
  if (!window.confirm(`Видалити звіт «${report.title}»? Цю дію неможливо скасувати.`)) return

  deletingId.value = report.id
  error.value = ''
  success.value = ''
  try {
    await api.delete(`/contingent-reports/${report.id}`)
    reports.value = reports.value.filter((item) => item.id !== report.id)
    success.value = 'Звіт видалено.'
  } catch (requestError) {
    console.error(requestError)
    error.value = requestError.response?.data?.message || 'Не вдалося видалити звіт контингенту.'
  } finally {
    deletingId.value = null
  }
}

onMounted(loadReports)
</script>

<style scoped>
.reports-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.page-header h1 {
  margin: 0;
}

.page-header p {
  margin: 6px 0 0;
  color: #64748b;
}

.primary-button,
.download-button,
.delete-button {
  border: 0;
  border-radius: 10px;
  padding: 11px 16px;
  background: #1d4ed8;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

.primary-button:disabled {
  opacity: 0.65;
  cursor: wait;
}

.download-button {
  padding: 8px 12px;
  background: #0f172a;
  font-size: 0.88rem;
}

.report-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.delete-button {
  padding: 8px 12px;
  background: #b91c1c;
  font-size: 0.88rem;
}

.delete-button:disabled {
  opacity: 0.65;
  cursor: wait;
}

.reports-table-wrap {
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}

.reports-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.reports-table th,
.reports-table td {
  padding: 12px 14px;
  border-bottom: 1px solid #e2e8f0;
}

.reports-table th {
  background: #f8fafc;
  color: #475569;
  font-size: 0.9rem;
}

.reports-table tr:last-child td {
  border-bottom: 0;
}

.empty-reports {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 32px;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  color: #64748b;
  text-align: center;
}

.empty-reports strong {
  color: #0f172a;
}

.error-message,
.success-message,
.loading-message {
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
}

.error-message {
  background: #fef2f2;
  color: #b91c1c;
}

.success-message {
  background: #ecfdf5;
  color: #047857;
}

.loading-message {
  color: #64748b;
}

@media (max-width: 700px) {
  .page-header {
    align-items: stretch;
    flex-direction: column;
  }

  .primary-button {
    width: 100%;
  }
}
</style>
