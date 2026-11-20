<template>
  <section class="individual-plans-page">
    <header class="page-heading">
      <div>
        <p class="eyebrow">Навчальні плани</p>
        <h1>Індивідуальні плани</h1>
        <p class="muted">Оберіть групу та семестр, щоб завантажити архів планів усіх студентів.</p>
      </div>
    </header>

    <div v-if="loadingGroups" class="state-card">Завантаження груп…</div>
    <div v-else-if="pageError" class="state-card error">{{ pageError }}</div>
    <template v-else>
      <div class="form-panel">
        <div class="selection-grid">
          <label>
            <span>Група</span>
            <select v-model="selectedGroupId">
              <option value="">Оберіть групу</option>
              <option v-for="group in groups" :key="group.id" :value="String(group.id)">
                {{ group.name }}
              </option>
            </select>
          </label>

          <label>
            <span>Семестр</span>
            <select v-model="selectedSemester" :disabled="!semesters.length">
              <option value="">Оберіть семестр</option>
              <option v-for="semester in semesters" :key="semester" :value="String(semester)">
                {{ semester }} семестр
              </option>
            </select>
          </label>
        </div>

        <p v-if="loadingGroupData" class="inline-state">Завантаження робочого плану…</p>
        <p v-else-if="groupDataError" class="inline-state error">{{ groupDataError }}</p>
        <p v-else-if="selectedGroup && !plan" class="inline-state error">
          Для групи «{{ selectedGroup.name }}» не знайдено імпортований робочий план.
        </p>
        <p v-else-if="selectedGroup && !studentCount" class="inline-state error">
          У групі немає студентів із заповненим ПІБ.
        </p>

        <template v-if="selectedGroup && plan">
          <div class="semester-fields">
            <label>
              <span>Навчальний рік</span>
              <input v-model="academicYear" type="text" inputmode="numeric" placeholder="2026/2027">
            </label>
            <label>
              <span>Початок семестру</span>
              <input :value="semesterDates?.startDate || ''" type="date" readonly required>
            </label>
            <label>
              <span>Завершення семестру</span>
              <input :value="semesterDates?.endDate || ''" type="date" readonly required>
            </label>
            <label>
              <span>Кількість тижнів</span>
              <input v-model="weeks" type="number" min="1" step="1" placeholder="Необов’язково">
            </label>
            <label>
              <span>Екзаменаційна сесія</span>
              <input v-model="examSession" type="text" placeholder="не передбачено">
            </label>
            <label>
              <span>Класний керівник</span>
              <input v-model="classTeacher" type="text" placeholder="ПІБ класного керівника">
            </label>
            <label>
              <span>Завідувач відділення</span>
              <input v-model="departmentHead" type="text" placeholder="ПІБ завідувача відділення">
            </label>
          </div>
          <p v-if="scheduleError" class="inline-state error">{{ scheduleError }}</p>
          <p v-else-if="selectedSemester && !semesterDates" class="inline-state error">
            Не вдалося визначити період семестру з графіка навчального процесу для цієї групи.
          </p>

          <div v-if="selectedSemester" class="subjects-panel">
            <div class="subjects-heading">
              <div>
                <h2>Дисципліни семестру</h2>
                <p>{{ selectedGroup.name }} · {{ selectedSemester }} семестр · {{ studentCount }} студентів в архіві</p>
              </div>
              <span class="subject-count">{{ selectedItems.length }}</span>
            </div>

            <div v-if="!selectedItems.length" class="inline-state error">
              У робочому плані немає дисциплін для вибраного семестру.
            </div>
            <div v-else class="subject-list">
              <section v-for="section in selectedSections" :key="section.key" class="subject-section">
                <h3>{{ section.label }}</h3>
                <article v-for="entry in section.items" :key="entry.planIndex" class="subject-row">
                  <div class="subject-title">
                    <span>{{ entry.item.code || 'Дисципліна' }}</span>
                    <strong>{{ entry.item.name }}</strong>
                    <small>
                      {{ entry.semester.totalHours ?? '—' }} год.
                      <template v-if="entry.semester.controlType"> · {{ entry.semester.controlType }}</template>
                    </small>
                  </div>
                  <div class="teacher-name">
                    <span>Викладач за робочим планом</span>
                    <strong>{{ formatTeacherName(entry.item.teacher) || 'Не вказаний у робочому плані' }}</strong>
                  </div>
                </article>
              </section>
            </div>

            <button
              type="button"
              class="download-button"
              :disabled="downloading || !selectedItems.length || !studentCount || !semesterDates || !!scheduleError"
              @click="downloadPlans"
            >
              {{ downloading ? 'Формування архіву…' : 'Завантажити архів індивідуальних планів' }}
            </button>
            <p v-if="downloadError" class="inline-state error">{{ downloadError }}</p>
          </div>
        </template>
      </div>
      <p v-if="!groups.length" class="state-card">Немає груп для створення індивідуальних планів.</p>
    </template>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import api from '../services/api'
import { getSemesterDates } from '../utils/educationSchedule'

const groups = ref([])
const plan = ref(null)
const selectedGroupId = ref('')
const selectedSemester = ref('')
const academicYear = ref(getCurrentAcademicYear())
const educationSchedule = ref(null)
const scheduleLoadError = ref('')
const weeks = ref('')
const examSession = ref('не передбачено')
const classTeacher = ref('')
const departmentHead = ref('Олександр КОРОТКИЙ')
const studentCount = ref(0)
const loadingGroups = ref(true)
const loadingGroupData = ref(false)
const downloading = ref(false)
const pageError = ref('')
const groupDataError = ref('')
const downloadError = ref('')
let groupLoadVersion = 0

const selectedGroup = computed(() =>
  groups.value.find(group => Number(group.id) === Number(selectedGroupId.value)) || null
)
const selectedGroupSchedule = computed(() =>
  educationSchedule.value?.groups?.find(group => group.group === selectedGroup.value?.name) || null
)
const scheduleError = computed(() => scheduleLoadError.value || (
  selectedGroup.value && educationSchedule.value && !selectedGroupSchedule.value
    ? `У графіку навчального процесу не знайдено групу «${selectedGroup.value.name}».`
    : ''
))
const semesterDates = computed(() =>
  getSemesterDates(selectedGroupSchedule.value, selectedSemester.value)
)
const semesters = computed(() => {
  const values = new Set()
  for (const item of plan.value?.items || []) {
    for (const semester of item.semesters || []) {
      const number = Number(semester.semester)
      if (Number.isInteger(number) && number > 0) values.add(number)
    }
  }
  return [...values].sort((a, b) => a - b)
})
const selectedItems = computed(() => {
  if (!plan.value || !selectedSemester.value) return []
  return plan.value.items.flatMap((item, planIndex) => {
    const semester = item.semesters?.find(value => Number(value.semester) === Number(selectedSemester.value))
    return semester ? [{ item, semester, planIndex }] : []
  })
})
const selectedSections = computed(() => {
  const sections = [
    { key: 'profile', label: 'Предмети за програмою профільної середньої освіти', items: [] },
    { key: 'general', label: 'Дисципліни, що формують загальні компетенції', items: [] },
    { key: 'special', label: 'Дисципліни, що формують спеціальні компетенції', items: [] },
    { key: 'elective', label: 'Вибіркові освітні компоненти', items: [] }
  ]
  for (const entry of selectedItems.value) {
    const section = getItemSection(entry.item)
    sections.find(item => item.key === section).items.push(entry)
  }
  return sections.filter(section => section.items.length)
})

function formatTeacherName(value) {
  const parts = String(value || '')
    .replace(/,/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length <= 1) return parts[0] || ''
  const initials = parts.slice(1).map(part =>
    /^\p{L}\.?$/u.test(part) ? `${part.replace(/\.$/, '')}.` : `${Array.from(part)[0]}.`
  )
  return `${parts[0]} ${initials.join('')}`
}

function getItemSection(item) {
  const section = String(item.section || '')
    .toLocaleLowerCase('uk-UA')
    .replace(/[\s_-]+/g, ' ')
    .trim()
  if (section === 'general' || /загальн[\p{L}]*\s+компетенц/u.test(section)) return 'general'
  if (section === 'special' || /спеціальн[\p{L}]*\s+компетенц/u.test(section)) return 'special'
  if (section === 'elective' || /вибірков[\p{L}]*\s+освітн[\p{L}]*\s+компонент/u.test(section)) return 'elective'
  if (section === 'profile' || /профільної\s+середньої\s+освіти|базові\s+предмети/.test(section)) return 'profile'
  if (String(item.code || '').startsWith('ВК') || item.type === 'ВК') return 'elective'
  if (item.type === 'ОК' || /^ОК\s*\d+/.test(String(item.code || ''))) return 'special'
  return item.type === 'practice' ? 'special' : 'profile'
}

function getCurrentAcademicYear() {
  const now = new Date()
  const year = now.getFullYear()
  const start = now.getMonth() >= 8 ? year : year - 1
  return `${start}/${start + 1}`
}

onMounted(async () => {
  const [groupsResult, scheduleResult] = await Promise.allSettled([
    api.get('/groups'),
    api.get('/education-process')
  ])
  if (groupsResult.status === 'fulfilled') {
    groups.value = groupsResult.value.data || []
  } else {
    pageError.value = groupsResult.reason.response?.data?.message || 'Не вдалося завантажити групи.'
  }
  if (scheduleResult.status === 'fulfilled') {
    educationSchedule.value = scheduleResult.value.data?.records || null
  } else {
    scheduleLoadError.value = scheduleResult.reason.response?.data?.message ||
      'Не вдалося завантажити графік навчального процесу.'
  }
  loadingGroups.value = false
})

watch(selectedGroupId, async groupId => {
  const loadVersion = ++groupLoadVersion
  selectedSemester.value = ''
  plan.value = null
  studentCount.value = 0
  groupDataError.value = ''
  downloadError.value = ''
  classTeacher.value = selectedGroup.value?.class_teacher_name || ''
  weeks.value = ''
  if (!groupId || !selectedGroup.value) return

  loadingGroupData.value = true
  try {
    const [studentsResponse, plansResponse] = await Promise.all([
      api.get(`/groups/${groupId}/applicants`),
      api.get('/plans', {
        params: {
          group: selectedGroup.value.name,
          course: selectedGroup.value.course
        }
      })
    ])
    if (loadVersion !== groupLoadVersion) return
    studentCount.value = new Set((studentsResponse.data || [])
      .filter(student => String(student.applicant || '').trim())
      .map(student => student.inp_number
        ? `inp:${String(student.inp_number).trim().toLocaleLowerCase('uk-UA')}`
        : `name:${String(student.applicant).trim().replace(/\s+/g, ' ').toLocaleLowerCase('uk-UA')}|${String(student.specialty || selectedGroup.value.specialty || '').trim().toLocaleLowerCase('uk-UA')}`
      )
    ).size
    plan.value = (plansResponse.data || []).find(item => item.group === selectedGroup.value.name) || null
    if (semesters.value.length) selectedSemester.value = String(semesters.value[0])
  } catch (requestError) {
    if (loadVersion === groupLoadVersion) {
      groupDataError.value = requestError.response?.data?.message || 'Не вдалося завантажити студентів і робочий план.'
    }
  } finally {
    if (loadVersion === groupLoadVersion) loadingGroupData.value = false
  }
})

async function getErrorMessage(requestError) {
  const responseData = requestError.response?.data
  if (responseData instanceof Blob) {
    try {
      const data = JSON.parse(await responseData.text())
      return data.message || 'Не вдалося сформувати архів індивідуальних планів.'
    } catch (parseError) {
      console.error('Не вдалося прочитати помилку створення індивідуальних планів:', parseError)
    }
  }
  return responseData?.message || 'Не вдалося сформувати архів індивідуальних планів.'
}

function getFileName(disposition) {
  const encodedName = String(disposition || '').match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encodedName) {
    try {
      return decodeURIComponent(encodedName)
    } catch (error) {
      console.error('Не вдалося прочитати назву архіву індивідуальних планів:', error)
    }
  }
  return 'індивідуальні-плани.zip'
}

async function downloadPlans() {
  if (!selectedGroup.value || !selectedSemester.value || downloading.value) return

  downloading.value = true
  downloadError.value = ''
  try {
    const response = await api.post(
      `/individual-plans/groups/${selectedGroup.value.id}/archive`,
      {
        semester: Number(selectedSemester.value),
        academicYear: academicYear.value,
        startDate: semesterDates.value?.startDate,
        endDate: semesterDates.value?.endDate,
        weeks: weeks.value,
        examSession: examSession.value,
        classTeacher: classTeacher.value,
        departmentHead: departmentHead.value
      },
      { responseType: 'blob' }
    )
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = getFileName(response.headers['content-disposition'])
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (requestError) {
    downloadError.value = await getErrorMessage(requestError)
  } finally {
    downloading.value = false
  }
}
</script>

<style scoped>
.individual-plans-page { max-width: 1180px; margin: 0 auto; }
.page-heading { margin-bottom: 22px; }
.eyebrow { margin: 0 0 8px; color: #5673c8; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
h1 { margin: 0 0 8px; color: #152238; font-size: 32px; }
.muted { margin: 0; color: #738096; }
.form-panel, .state-card { padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; box-shadow: 0 8px 24px rgba(38, 57, 84, .05); }
.selection-grid, .semester-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; }
label { display: grid; gap: 7px; color: #475467; font-size: 13px; font-weight: 700; }
select, input { width: 100%; min-width: 0; padding: 10px 12px; border: 1px solid #dce3ee; border-radius: 8px; background: #fff; color: #24324a; font: inherit; }
select:disabled { background: #f5f7fa; color: #98a2b3; }
.semester-fields { margin-top: 20px; padding-top: 18px; border-top: 1px solid #edf0f4; }
.subjects-panel { margin-top: 24px; padding-top: 20px; border-top: 1px solid #edf0f4; }
.subjects-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.subjects-heading h2 { margin: 0 0 5px; color: #17253a; font-size: 20px; }
.subjects-heading p { margin: 0; color: #738096; font-size: 13px; }
.subject-count { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 50%; background: #eef4ff; color: #3156a8; font-weight: 700; }
.subject-list { display: grid; gap: 10px; }
.subject-section { display: grid; gap: 10px; }
.subject-section h3 { margin: 8px 0 0; color: #17253a; font-size: 15px; }
.subject-row { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(230px, 1fr); align-items: center; gap: 16px; padding: 12px 14px; border: 1px solid #e7ebf2; border-radius: 10px; }
.subject-title, .teacher-name { display: grid; gap: 4px; min-width: 0; }
.subject-title > span, .teacher-name > span { color: #5673c8; font-size: 11px; font-weight: 700; text-transform: uppercase; }
.subject-title strong, .teacher-name strong { color: #24324a; }
.subject-title small { color: #738096; }
.download-button { margin-top: 18px; padding: 11px 16px; border: 0; border-radius: 8px; background: #2563eb; color: #fff; font-weight: 700; cursor: pointer; }
.download-button:disabled { opacity: .55; cursor: not-allowed; }
.inline-state { margin: 16px 0 0; color: #667085; font-size: 14px; }
.error { color: #b42318; }
.state-card { margin-top: 12px; color: #667085; text-align: center; }
@media (max-width: 700px) {
  .form-panel, .state-card { padding: 18px; }
  h1 { font-size: 26px; }
  .subject-row { grid-template-columns: 1fr; }
}
</style>
