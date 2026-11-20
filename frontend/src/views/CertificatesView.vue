<template>
  <section class="certificates-page">
    <header class="page-heading">
      <div>
        <p class="eyebrow">Документи студентів</p>
        <h1>Створення довідок</h1>
        <p class="muted">Оберіть групу, щоб сформувати ZIP-архів з окремою довідкою для кожного студента.</p>
      </div>
    </header>

    <div v-if="loading" class="state-card">Завантаження груп…</div>
    <div v-else-if="error" class="state-card error">{{ error }}</div>
    <div v-else class="certificate-panel">
      <label class="group-select">
        <span>Група</span>
        <select v-model="selectedGroupId">
          <option value="">Оберіть групу</option>
          <option v-for="group in groups" :key="group.id" :value="String(group.id)">
            {{ group.name }} · {{ group.students_count }} студентів
          </option>
        </select>
      </label>

      <div v-if="selectedGroup" class="group-preview">
        <h2>{{ selectedGroup.name }}</h2>
        <dl class="group-details">
          <div>
            <dt>Курс</dt>
            <dd>{{ selectedGroup.course || '—' }}</dd>
          </div>
          <div>
            <dt>Спеціальність</dt>
            <dd>{{ selectedGroup.specialty || '—' }}</dd>
          </div>
          <div>
            <dt>Довідок в архіві</dt>
            <dd>{{ selectedGroup.students_count }}</dd>
          </div>
        </dl>

        <div v-if="selectedGroup.missing_study_term_students?.length" class="missing-terms">
          <strong>У картках не заповнено початок або завершення навчання:</strong>
          <ul>
            <li v-for="student in selectedGroup.missing_study_term_students" :key="student">
              {{ student }}
            </li>
          </ul>
          <p>Заповніть ці дати в картках студентів, щоб сформувати повний архів.</p>
        </div>

        <p class="date-note">Дата довідок буде встановлена автоматично на момент формування архіву.</p>
        <button
          type="button"
          class="download-button"
          :disabled="downloading || !selectedGroup.students_count || selectedGroup.missing_study_term_students?.length"
          @click="downloadArchive"
        >
          {{ downloading ? 'Формування архіву…' : 'Завантажити архів довідок' }}
        </button>
      </div>

      <p v-if="downloadError" class="download-error">{{ downloadError }}</p>
      <p v-if="downloadSuccess" class="download-success">{{ downloadSuccess }}</p>
      <p v-if="!groups.length" class="empty-state">Немає груп для створення довідок.</p>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import api from '../services/api'

const groups = ref([])
const selectedGroupId = ref('')
const loading = ref(true)
const downloading = ref(false)
const error = ref('')
const downloadError = ref('')
const downloadSuccess = ref('')

const selectedGroup = computed(() =>
  groups.value.find(group => Number(group.id) === Number(selectedGroupId.value)) || null
)

onMounted(async () => {
  try {
    groups.value = (await api.get('/certificates/groups')).data
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Не вдалося завантажити список груп.'
  } finally {
    loading.value = false
  }
})

async function getErrorMessage(requestError) {
  const responseData = requestError.response?.data
  if (responseData instanceof Blob) {
    try {
      const data = JSON.parse(await responseData.text())
      const students = Array.isArray(data.students) ? ` ${data.students.join(', ')}` : ''
      return `${data.message || 'Не вдалося сформувати архів.'}${students}`
    } catch (parseError) {
      console.error('Не вдалося прочитати відповідь про помилку створення довідок:', parseError)
    }
  }

  return responseData?.message || 'Не вдалося сформувати архів довідок.'
}

function getArchiveFileName(disposition) {
  const encodedName = String(disposition || '').match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encodedName) {
    try {
      return decodeURIComponent(encodedName)
    } catch (error) {
      console.error('Не вдалося прочитати назву архіву з відповіді сервера:', error)
    }
  }

  return 'довідки-групи.zip'
}

async function downloadArchive() {
  if (!selectedGroup.value || downloading.value) return

  downloading.value = true
  downloadError.value = ''
  downloadSuccess.value = ''

  try {
    const response = await api.get(
      `/certificates/groups/${selectedGroup.value.id}/archive`,
      { responseType: 'blob' }
    )
    const archive = new Blob([response.data], { type: 'application/zip' })
    const url = URL.createObjectURL(archive)
    const link = document.createElement('a')
    link.href = url
    link.download = getArchiveFileName(response.headers['content-disposition'])
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    downloadSuccess.value = `Архів групи «${selectedGroup.value.name}» сформовано.`
  } catch (requestError) {
    downloadError.value = await getErrorMessage(requestError)
  } finally {
    downloading.value = false
  }
}
</script>

<style scoped>
.certificates-page { max-width: 1050px; margin: 0 auto; }
.page-heading { margin-bottom: 24px; }
.eyebrow { margin: 0 0 8px; color: #5673c8; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
h1 { margin: 0 0 8px; color: #152238; font-size: 32px; }
.muted { margin: 0; color: #738096; }
.certificate-panel, .state-card { padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; box-shadow: 0 8px 24px rgba(38, 57, 84, .05); }
.group-select { display: grid; max-width: 560px; gap: 8px; color: #475467; font-size: 13px; font-weight: 700; }
select { width: 100%; padding: 12px 14px; border: 1px solid #dce3ee; border-radius: 9px; background: #fff; color: #24324a; font: inherit; }
.group-preview { margin-top: 24px; padding-top: 20px; border-top: 1px solid #edf0f4; }
.group-preview h2 { margin: 0 0 16px; color: #17253a; font-size: 21px; }
.group-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin: 0 0 18px; }
.group-details > div { padding: 12px; border-radius: 9px; background: #f8fafc; }
.group-details dt { margin-bottom: 5px; color: #8490a2; font-size: 12px; }
.group-details dd { margin: 0; color: #24324a; font-size: 14px; font-weight: 700; }
.missing-terms { padding: 14px 16px; border: 1px solid #fecdca; border-radius: 10px; background: #fff6f5; color: #912018; }
.missing-terms ul { margin: 8px 0; padding-left: 22px; }
.missing-terms p { margin: 8px 0 0; font-size: 13px; }
.date-note { margin: 0 0 16px; color: #667085; font-size: 13px; }
.download-button { padding: 11px 16px; border: 0; border-radius: 8px; background: #2563eb; color: #fff; font-weight: 700; cursor: pointer; }
.download-button:disabled { opacity: .55; cursor: not-allowed; }
.download-error, .error { color: #b42318; }
.download-success { color: #067647; }
.empty-state { color: #667085; }
.state-card { color: #667085; text-align: center; }
@media (max-width: 600px) {
  .certificate-panel, .state-card { padding: 18px; }
  h1 { font-size: 27px; }
}
</style>
