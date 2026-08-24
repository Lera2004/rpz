<template>
  <section class="workload-page">
    <div class="page-toolbar">
      <label class="teacher-select-wrap">
        <span>Викладач</span>
        <select v-model="teacherId">
          <option value="">Оберіть викладача</option>
          <option v-for="teacher in teachers" :key="teacher.id" :value="teacher.id">{{ teacher.full_name }}</option>
        </select>
      </label>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="loading" class="loading-text">Завантаження...</p>
    <p v-else-if="teacherId && !loading && !rows.length" class="empty-state">Для викладача дисциплін не знайдено.</p>

    <div v-if="workload && rows.length" class="workload-document">
      <div class="document-meta-grid">
        <div class="meta-item">
          <span>Викладач</span>
          <strong>{{ workload.teacher.full_name }}</strong>
        </div>
        <div class="meta-item">
          <span>Циклова комісія</span>
          <strong>{{ workload.teacher.commission_name || '—' }}</strong>
        </div>
        <div class="meta-item">
          <span>Навчальний рік</span>
          <strong>{{ workload.studyPlan.academic_year }}</strong>
        </div>
        <div class="meta-item">
          <span>Фактичне навантаження</span>
          <strong>{{ format(summary.officialHours) }}</strong>
        </div>
        <div class="meta-item">
          <span>До наказу</span>
          <strong>{{ format(summary.orderHours) }}</strong>
        </div>
      </div>

      <div class="export-actions">
        <button type="button" class="secondary" @click="exportExcel">Експорт в Excel</button>
        <button type="button" class="primary" @click="exportPdf">Експорт у PDF</button>
      </div>

      <div class="summary-grid">
        <div><small>Планові години</small><b>{{ format(summary.plannedHours) }}</b></div>
        <div><small>Аудиторні години</small><b>{{ format(summary.contactHours) }}</b></div>
        <div><small>Самостійна робота</small><b>{{ format(summary.selfStudyHours) }}</b></div>
        <div><small>ОКР</small><b>{{ format(summary.okrHours) }}</b></div>
        <div class="summary-accent"><small>Фактичне навантаження</small><b>{{ format(summary.officialHours) }}</b></div>
        <div class="summary-accent"><small>До наказу</small><b>{{ format(summary.orderHours) }}</b></div>
      </div>

      <p class="edit-hint">Для редагування всіх даних рядка двічі натисніть на нього.</p>

      <div class="table-wrapper">
        <table class="template-table">
          <thead>
            <tr>
              <th rowspan="3" class="vertical">№ за НП</th>
              <th rowspan="3">Група</th>
              <th rowspan="3" class="vertical">Кількість студентів</th>
              <th rowspan="3" class="vertical">Курс</th>
              <th rowspan="3" class="vertical">Семестр</th>
              <th rowspan="3" class="vertical">Тривалість семестру (тижн.)</th>
              <th rowspan="3" class="vertical">Кількість годин в тиждень</th>
              <th rowspan="3">Назва предмета</th>
              <th colspan="8">Кількість годин</th>
              <th colspan="2">Курсові проекти та роботи</th>
              <th colspan="3">Контрольні роботи</th>
              <th rowspan="3" class="vertical">ОКР</th>
              <th rowspan="3" class="vertical">Всього до оплати</th>
            </tr>
            <tr>
              <th rowspan="2" class="vertical">Всього за навчальним планом</th>
              <th rowspan="2" class="vertical">Аудиторні</th>
              <th colspan="4">З них</th>
              <th rowspan="2" class="vertical">Самостійна</th>
              <th rowspan="2" class="vertical">Інші</th>
              <th rowspan="2" class="vertical">На виконання</th>
              <th rowspan="2" class="vertical">На захист</th>
              <th rowspan="2" class="vertical">Залік</th>
              <th rowspan="2" class="vertical">Консультації</th>
              <th rowspan="2" class="vertical">Іспит</th>
            </tr>
            <tr>
              <th class="vertical">Лекції</th>
              <th class="vertical">Практичні</th>
              <th class="vertical">Лабораторні</th>
              <th class="vertical">Семінари</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in rows" :key="row.id" :class="{ backup: row.teacherRole === 'Дублер' }" @dblclick="Number.isInteger(Number(row.id)) && editRow(row)">
              <td>{{ row.code || '—' }}</td>
              <td>{{ row.group }}</td>
              <td>{{ format(row.studentsCount) || '' }}</td>
              <td>{{ row.course || '—' }}</td>
              <td>{{ formatSemester(row.semester) }}</td>
              <td>{{ format(row.semesterWeeks) || '' }}</td>
              <td>{{ format(row.hoursPerWeek) || '' }}</td>
              <td>{{ row.name }}</td>
              <td>{{ isBackupRow(row) || isAllocationOnlyRow(row) ? '' : format(row.totalHours) }}</td>
              <td>{{ isBackupRow(row) || isAllocationOnlyRow(row) ? '' : format(row.contactHours) }}</td>
              <td>{{ format(row.lectures) }}</td>
              <td>{{ format(row.practical) }}</td>
              <td>{{ format(row.laboratory) }}</td>
              <td>{{ format(row.seminars) }}</td>
              <td>{{ format(row.selfStudy) }}</td>
              <td>{{ format(row.otherWorkHours) }}</td>
              <td>{{ format(row.courseWorkExecution) }}</td>
              <td>{{ format(row.courseWorkDefense) }}</td>
              <td>{{ format(row.creditAcceptanceHours) }}</td>
              <td>{{ format(row.examConsultationHours) }}</td>
              <td>{{ format(row.examAcceptanceHours) }}</td>
              <td>{{ format(row.okrHours) }}</td>
              <td><strong>{{ format(row.officialHours) }}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import api from '../services/api'
import * as XLSX from 'xlsx-js-style'

const teachers = ref([])
const route = useRoute()
const teacherId = ref('')
const rows = ref([])
const workload = ref(null)
const loading = ref(false)
const error = ref('')
const confirming = ref(false)
const summary = ref({})
const format = value => {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue) || numericValue === 0) return ''
  return numericValue.toLocaleString('uk-UA', { maximumFractionDigits: 2 })
}
const formatSemester = value => {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return '—'
  return numericValue % 2 === 0 ? '2' : '1'
}
const isAllocationOnlyRow = row => row.teacherRole === 'Розподіл'
const isBackupRow = row => row.teacherRole === 'Дублер'

const exportRows = () => rows.value.map((row, index) => ({
  '№': index + 1,
  'Код': row.code || '',
  'Дисципліна / робота': row.name,
  'Група': row.group,
  'Кількість студентів': Number(row.studentsCount || 0) === 0 ? '' : Number(row.studentsCount || 0),
  'Курс': row.course || '',
  'Семестр': formatSemester(row.semester),
  'Всього за навчальним планом': isAllocationOnlyRow(row) ? '' : (Number(row.totalHours || 0) === 0 ? '' : Number(row.totalHours || 0)),
  'Аудиторні години': isAllocationOnlyRow(row) ? '' : (Number(row.contactHours || 0) === 0 ? '' : Number(row.contactHours || 0)),
  'Лекції': Number(row.lectures || 0) === 0 ? '' : Number(row.lectures || 0),
  'Практичні заняття': Number(row.practical || 0) === 0 ? '' : Number(row.practical || 0),
  'Самостійна робота': Number(row.selfStudy || 0) === 0 ? '' : Number(row.selfStudy || 0),
  'Інші роботи': Number(row.otherWorkHours || 0) === 0 ? '' : Number(row.otherWorkHours || 0),
  'Курсові — виконання': Number(row.courseWorkExecution || 0) === 0 ? '' : Number(row.courseWorkExecution || 0),
  'Курсові — захист': Number(row.courseWorkDefense || 0) === 0 ? '' : Number(row.courseWorkDefense || 0),
  'На прийняття заліку': Number(row.creditAcceptanceHours || 0) === 0 ? '' : Number(row.creditAcceptanceHours || 0),
  'На консультації до іспиту': Number(row.examConsultationHours || 0) === 0 ? '' : Number(row.examConsultationHours || 0),
  'На прийняття іспиту': Number(row.examAcceptanceHours || 0) === 0 ? '' : Number(row.examAcceptanceHours || 0),
  'ОКР': Number(row.okrHours || 0) === 0 ? '' : Number(row.okrHours || 0),
  'Всього до оплати': Number(row.officialHours || 0) === 0 ? '' : Number(row.officialHours || 0)
}))

const getColumnIndex = (columnLetter) => {
  const normalized = String(columnLetter || '').toUpperCase()
  let result = 0
  for (let i = 0; i < normalized.length; i++) {
    result = result * 26 + (normalized.charCodeAt(i) - 64)
  }
  return result - 1
}

const toExcelCell = (rowIndex, columnLetter) => XLSX.utils.encode_cell({ r: rowIndex, c: getColumnIndex(columnLetter) })

const setCellValue = (sheet, rowIndex, columnLetter, value) => {
  if (value === null || value === undefined || value === '') {
    delete sheet[toExcelCell(rowIndex, columnLetter)]
    return
  }

  const cellAddress = toExcelCell(rowIndex, columnLetter)
  const isNumeric = typeof value === 'number' && Number.isFinite(value)

  sheet[cellAddress] = {
    t: isNumeric ? 'n' : 's',
    v: isNumeric ? value : String(value),
    s: sheet[cellAddress]?.s || undefined
  }
}

const templateRowToExportArray = row => {
  const studentsCount = Number(row.studentsCount || 0)
  const course = Number(row.course || 0)
  const semester = Number(row.semester || 0)
  const duration = Number(row.semesterWeeks || row.hoursPerWeek || 0)
  const totalHours = Number(row.totalHours || 0)
  const contactHours = Number(row.contactHours || 0)
  const lectures = Number(row.lectures || 0)
  const practical = Number(row.practical || 0)
  const laboratory = Number(row.laboratory || 0)
  const seminars = Number(row.seminars || 0)
  const selfStudy = Number(row.selfStudy || 0)
  const practiceWork = Number(row.calculationWork || 0)
  const consultationWithSelfStudy = Number(row.fieldTraining || 0)
  const courseWorkExecution = Number(row.courseWorkExecution || 0)
  const courseWorkDefense = Number(row.courseWorkDefense || 0)
  const controlWorks = Number(row.controlWorks || 0)
  const okr = Number(row.okrHours || 0)
  const creditAcceptance = Number(row.creditAcceptanceHours || 0)
  const examConsultation = Number(row.examConsultationHours || 0)
  const examAcceptance = Number(row.examAcceptanceHours || 0)
  const totalToPay = Number(row.officialHours || 0)

  return [
    row.code || '',
    row.group || '',
    studentsCount === 0 ? '' : studentsCount,
    course === 0 ? '' : course,
    semester === 0 ? '' : semester,
    duration === 0 ? '' : duration,
    Number(row.hoursPerWeek || 0) === 0 ? '' : Number(row.hoursPerWeek || 0),
    row.name || '',
    totalHours === 0 ? '' : totalHours,
    contactHours === 0 ? '' : contactHours,
    lectures === 0 ? '' : lectures,
    practical === 0 ? '' : practical,
    laboratory === 0 ? '' : laboratory,
    seminars === 0 ? '' : seminars,
    selfStudy === 0 ? '' : selfStudy,
    practiceWork === 0 ? '' : practiceWork,
    consultationWithSelfStudy === 0 ? '' : consultationWithSelfStudy,
    courseWorkExecution === 0 ? '' : courseWorkExecution,
    courseWorkDefense === 0 ? '' : courseWorkDefense,
    controlWorks === 0 ? '' : controlWorks,
    okr === 0 ? '' : okr,
    creditAcceptance === 0 ? '' : creditAcceptance,
    examConsultation === 0 ? '' : examConsultation,
    examAcceptance === 0 ? '' : examAcceptance,
    totalToPay === 0 ? '' : totalToPay
  ]
}

const exportExcel = async () => {
  if (!teacherId.value) {
    window.alert('Оберіть викладача для експорту.')
    return
  }

  try {
    const response = await fetch(`${api.defaults.baseURL}/workload/export/${teacherId.value}`)

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}))
      throw new Error(errorPayload.message || 'Export endpoint returned an error')
    }

    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const teacherName = (workload.value?.teacher?.full_name || 'teacher')
      .replace(/\s+/g, '_')
      .replace(/[^A-Za-zА-Яа-яЇїІіЄєҐґ0-9_]/g, '')

    link.href = objectUrl
    link.download = `pedagogichne-navantazhennia-${teacherName}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  } catch (error) {
    console.error('Failed to export workload template:', error)
    window.alert(error.message || 'Не вдалося експортувати Excel.')
  }
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))

const exportPdf = () => {
  const teacher = escapeHtml(workload.value.teacher.full_name)
  const rowsHtml = exportRows().map(row => `<tr>${Object.values(row).map(value => `<td>${escapeHtml(typeof value === 'number' ? format(value) : value)}</td>`).join('')}</tr>`).join('')
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Педагогічне навантаження</title><style>@page{size:A4 portrait;margin:10mm}body{font-family:Arial,sans-serif;margin:0;padding:0;color:#111;background:#fff}.header-actions{display:flex;justify-content:flex-end;margin-bottom:10px}.save-pdf{padding:8px 14px;cursor:pointer;background:#2563eb;color:#fff;border:0;border-radius:6px}.document-shell{padding:8mm}.header-grid{display:grid;grid-template-columns:1.2fr 1.7fr 1.2fr;gap:10px;align-items:start}.header-block{min-height:84px;border:1px solid #000;padding:6px 10px;background:#fff}.header-block.center{text-align:center}.header-title{font-size:18px;font-weight:700;text-align:center;margin-bottom:6px}.header-subtitle{font-size:11px;line-height:1.3}.order-row{display:flex;justify-content:center;align-items:center;gap:8px;margin-top:8px;font-size:16px;font-weight:700}.order-box{display:inline-block;padding:0 6px;background:#ff0;color:#111;border:1px solid #000}.signature-row{margin-top:8px;font-size:11px}.document-title{margin:18px 0 14px;font-size:20px;font-weight:700;line-height:1.4}.meta{display:grid;grid-template-columns:repeat(2,minmax(180px,1fr));gap:8px 18px;margin:12px 0 16px}.meta strong{display:block}table{border-collapse:collapse;width:100%;font-size:8px}th,td{border:1px solid #777;padding:4px;text-align:left;vertical-align:middle}th{background:#f1f5f9;text-align:center;white-space:nowrap}td{background:#fff}@media print{.save-pdf{display:none}}</style></head><body><div class="header-actions"><button class="save-pdf" onclick="window.print()">Зберегти у PDF</button></div><div class="document-shell"><div class="header-grid"><div class="header-block"><div style="font-size:13px;font-weight:700;text-transform:uppercase">ПОГОДЖЕНО</div><div class="header-subtitle" style="margin-top:8px">Заступник директора з НР</div><div class="signature-row">________________</div><div class="signature-row">«__» __________ 20__ р.</div></div><div class="header-block center"><div class="header-title">Міністерство освіти і науки України</div><div class="header-subtitle">Відокремлений структурний підрозділ</div><div class="header-subtitle">«Запорізький електротехнічний фаховий коледж</div><div class="header-subtitle">Національного університету</div><div class="header-subtitle">«Запорізька політехніка»</div><div class="order-row">До наказу: <span class="order-box">720</span></div></div><div class="header-block" style="text-align:right"><div style="font-size:13px;font-weight:700;text-transform:uppercase">ЗАТВЕРДЖУЮ</div><div class="header-subtitle" style="margin-top:8px">В.о. директора / Директор</div><div class="signature-row">______________</div><div class="signature-row">«__» __________ 20__ р.</div></div></div><div class="document-title">Педагогічне навантаження викладача ${teacher}<br>циклової комісії ${escapeHtml(workload.value.teacher.commission_name || 'спеціальності 121')}<br>на ${escapeHtml(workload.value.studyPlan.academic_year)} н.р.</div><div class="meta"><div><span>Викладач:</span><strong>${teacher}</strong></div><div><span>Навчальний план:</span><strong>${escapeHtml(workload.value.studyPlan.academic_year)}</strong></div><div><span>Посада / категорія:</span><strong>${escapeHtml(`${workload.value.teacher.position || '—'}${workload.value.teacher.category ? ` / ${workload.value.teacher.category}` : ''}`)}</strong></div><div><span>Офіційне навантаження:</span><strong>${format(summary.value.officialHours)}</strong></div></div><table><thead><tr><th rowspan="2">№</th><th rowspan="2">Код</th><th rowspan="2">Дисципліна / робота</th><th rowspan="2">Група</th><th rowspan="2">Кількість студентів</th><th rowspan="2">Курс</th><th rowspan="2">Семестр</th><th colspan="6">Кількість годин за навчальним планом</th><th colspan="2">Курсові проекти та роботи</th><th colspan="3">Контрольні роботи</th><th rowspan="2">ОКР</th><th rowspan="2">Всього до оплати</th></tr><tr><th>Всього</th><th>Аудиторні</th><th>Лекції</th><th>Практичні</th><th>Самостійна</th><th>Інші</th><th>На виконання</th><th>На захист</th><th>Залік</th><th>Консультації</th><th>Іспит</th></tr></thead><tbody>${rowsHtml}</tbody></table></div></body></html>`
  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  printWindow.document.write(html)
  printWindow.document.close()
}

const reloadWorkload = async () => {
  const response = await api.get('/workload', { params: { teacher_id: teacherId.value } })
  workload.value = response.data
  rows.value = response.data.rows || []
  summary.value = response.data.summary || {}
}

const confirmWorkload = async () => {
  if (!window.confirm(`Підтвердити навантаження викладача «${workload.value.teacher.full_name}»?`)) return
  confirming.value = true
  try {
    await api.post(`/workload/confirm/${teacherId.value}`)
    await reloadWorkload()
  } catch (e) { window.alert(e.response?.data?.message || 'Не вдалося підтвердити навантаження.') } finally { confirming.value = false }
}

const cancelConfirmation = async () => {
  if (!window.confirm(`Скасувати підтвердження навантаження викладача «${workload.value.teacher.full_name}»?`)) return
  confirming.value = true
  try {
    await api.delete(`/workload/confirm/${teacherId.value}`)
    await reloadWorkload()
  } catch (e) { window.alert(e.response?.data?.message || 'Не вдалося скасувати підтвердження.') } finally { confirming.value = false }
}

const editRow = async row => {
  const changes = {}
  const numberFields = [
    ['semester', 'Семестр', row.semester], ['hours_per_week', 'Години на тиждень', row.hoursPerWeek],
    ['total_hours', 'Всього годин', row.totalHours], ['lectures_hours', 'Лекції', row.lectures],
    ['practical_hours', 'Практичні заняття', row.practical], ['laboratory_hours', 'Лабораторні', row.laboratory],
    ['seminars_hours', 'Семінари', row.seminars], ['self_study_hours', 'Самостійна робота', row.selfStudy],
    ['course_projects_hours', 'Курсові проекти та роботи', row.courseWork],
    ['calculation_graphic_hours', 'Розрахунково-графічні роботи', row.calculationWork],
    ['field_training_hours', 'Навчальна практика', row.fieldTraining]
  ]
  for (const [field, label, current] of numberFields) {
    const value = window.prompt(`${label} (порожнє значення — 0):`, String(current || 0))
    if (value === null) return
    const number = Number(value.replace(',', '.'))
    if (!Number.isFinite(number) || number < 0) {
      window.alert(`Некоректне значення для поля «${label}».`)
      return
    }
    changes[field] = number
  }
  const textFields = [
    ['control_type', 'Вид контролю', row.controlType], ['exam', 'Іспит', row.exam],
    ['control_works', 'Контрольні роботи', row.controlWorks],
    ['teacher_id', 'ID основного викладача', row.teacherId], ['backup_teacher_id', 'ID дублера (порожньо — без дублера)', row.backupTeacherId]
  ]
  for (const [field, label, current] of textFields) {
    const value = window.prompt(label, String(current ?? ''))
    if (value === null) return
    changes[field] = value.trim() === '' ? null : (field.endsWith('_id') ? Number(value) : value.trim())
  }
  try {
    await api.patch(`/workload/${row.id}`, changes)
    await reloadWorkload()
  } catch (e) { window.alert(e.response?.data?.message || 'Не вдалося зберегти зміни.') }
}

onMounted(async () => {
  try {
    teachers.value = (await api.get('/teachers')).data
    if (route.query.teacher_id) teacherId.value = String(route.query.teacher_id)
  } catch (e) { error.value = 'Не вдалося завантажити викладачів.' }
})

watch(teacherId, async id => {
  rows.value = []
  workload.value = null
  summary.value = {}
  if (!id) return
  loading.value = true
  error.value = ''
  try {
    workload.value = (await api.get('/workload', { params: { teacher_id: id } })).data
    rows.value = workload.value.rows || []
    summary.value = workload.value.summary || {}
  } catch (e) { error.value = e.response?.data?.message || 'Не вдалося завантажити навантаження.' } finally { loading.value = false }
})
</script>

<style scoped>
.workload-page {
  width: 100%;
  color: #172033;
}
.page-toolbar {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 18px;
}
.teacher-select-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 600;
}
.teacher-select-wrap select {
  padding: 10px 12px;
  min-width: 320px;
  border: 1px solid #d4d9e2;
  border-radius: 8px;
  background: white;
  font-size: 14px;
}
.loading-text,
.empty-state,
.edit-hint,
.error {
  margin: 0 0 14px;
}
.error { color: #b42318; }
.loading-text,
.empty-state,
.edit-hint { color: #475467; }

.workload-document {
  background: linear-gradient(180deg, #ffffff 0%, #fafbff 100%);
  border: 1px solid #dfe7f5;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
  padding: 24px 20px 20px;
}
.document-header {
  display: grid;
  grid-template-columns: 1.2fr 1.7fr 1.2fr;
  gap: 22px;
  align-items: start;
  margin-bottom: 22px;
  padding-bottom: 12px;
  border-bottom: 2px solid #e5ebf6;
}
.approval-header-block,
.institution-block {
  border: 1px solid #dfe7f5;
  border-radius: 10px;
  background: #f8faff;
  padding: 12px 14px;
}
.approval-header-block.right {
  text-align: right;
}
.approval-label,
.order-block {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}
.approval-text,
.institution-name,
.institution-subtitle,
.order-number {
  font-size: 12px;
  line-height: 1.5;
  color: #24364e;
}
.signature-placeholder {
  min-height: 20px;
  margin: 10px 0 6px;
  letter-spacing: 0.08em;
}
.small {
  font-size: 11px;
}
.institution-block {
  text-align: center;
}
.institution-name {
  font-weight: 700;
  margin-bottom: 8px;
}
.institution-subtitle {
  font-size: 11px;
}
.order-block {
  margin-top: 12px;
}
.document-title-wrap {
  margin: 18px 0 22px;
}
.document-title-wrap h1 {
  margin: 0;
  font-size: clamp(1.5rem, 2vw, 2.2rem);
  letter-spacing: 0.02em;
  line-height: 1.4;
  text-align: left;
}
.document-status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  font-weight: 700;
  color: #475467;
}
.document-status.confirmed {
  color: #067647;
}
.header-actions {
  display: flex;
  gap: 10px;
}
.confirm-button,
.cancel-confirm-button,
.export-actions button {
  border: 0;
  border-radius: 8px;
  padding: 9px 14px;
  font-weight: 600;
  cursor: pointer;
  transition: filter 0.2s ease;
}
.confirm-button,
.export-actions .primary {
  background: #067647;
  color: white;
}
.cancel-confirm-button,
.export-actions .secondary {
  background: #475467;
  color: white;
}
.confirm-button:hover,
.cancel-confirm-button:hover,
.export-actions button:hover {
  filter: brightness(0.98);
}
.confirm-button:disabled,
.cancel-confirm-button:disabled {
  opacity: 0.6;
  cursor: wait;
}

.document-meta-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}
.meta-item {
  border: 1px solid #dfe7f5;
  border-radius: 10px;
  background: #f8faff;
  padding: 12px 14px;
}
.meta-item span {
  display: block;
  color: #667085;
  font-size: 12px;
  margin-bottom: 6px;
}
.meta-item strong {
  display: block;
  font-size: 14px;
  line-height: 1.4;
}

.export-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin: 0 0 18px;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}
.summary-grid div {
  padding: 14px;
  background: white;
  border: 1px solid #dfe7f5;
  border-radius: 10px;
}
.summary-grid small,
.summary-grid b {
  display: block;
}
.summary-grid small {
  color: #667085;
  margin-bottom: 6px;
}
.summary-grid b {
  font-size: 20px;
}
.summary-accent {
  border-color: #9cc3ff !important;
  background: #edf5ff !important;
}

.table-wrapper {
  overflow: auto;
  border: 1px solid #dfe7f5;
  border-radius: 12px;
  background: white;
}
.template-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 1200px;
  font-size: 12px;
}
.template-table th,
.template-table td {
  border: 1px solid #dfe7f5;
  padding: 8px 6px;
  text-align: center;
  vertical-align: middle;
  white-space: nowrap;
}
.template-table thead th {
  background: #f1f5f9;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.template-table th.vertical {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  min-width: 28px;
  white-space: normal;
  height: 100px;
}
.template-table tbody td {
  background: #fff;
}
.template-table tbody tr.backup td {
  background: #fffaf0;
}
.template-table tbody tr:hover td {
  background: #eef6ff;
  cursor: pointer;
}

.approval-panel {
  margin-top: 28px;
  padding: 18px 20px;
  border: 1px solid #dfe7f5;
  border-radius: 12px;
  background: #f9fbff;
}
.approval-panel-title {
  font-weight: 700;
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.approval-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid #e5ebf6;
}
.approval-row:first-of-type {
  border-top: 0;
}
.approval-check {
  color: #067647;
  font-weight: 800;
  font-size: 18px;
  line-height: 1.2;
}
.approval-row strong {
  display: block;
  margin-bottom: 4px;
}
.approval-row small {
  color: #667085;
}

@media (max-width: 960px) {
  .document-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .document-status {
    align-items: flex-start;
  }
  .document-meta-grid,
  .summary-grid {
    grid-template-columns: repeat(2, minmax(140px, 1fr));
  }
  .signatures-block {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
