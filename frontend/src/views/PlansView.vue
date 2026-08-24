<template>
  <section class="plans-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">Навчальні плани</p>
        <h1>Робочий план групи</h1>
        <p class="muted">Оберіть курс і групу, щоб переглянути всі дисципліни, ОК, ВК та практики.</p>
      </div>

      <div class="filters">
        <label>
          <span>Курс</span>
          <select v-model="selectedCourse">
            <option v-for="course in courses" :key="course" :value="course">
              {{ course }} курс
            </option>
          </select>
        </label>

        <label>
          <span>Група</span>
          <select v-model="selectedGroup">
            <option v-for="group in groups" :key="group" :value="group">
              {{ group }}
            </option>
          </select>
        </label>
      </div>
    </div>

    <div v-if="loading" class="state-card">Завантаження навчального плану…</div>
    <div v-else-if="error" class="state-card error">{{ error }}</div>
    <div v-else-if="!selectedItems.length" class="state-card">
      Для цієї групи ще немає імпортованих дисциплін.
    </div>

    <template v-else>
      <div class="plan-summary">
        <div>
          <span>Курс</span>
          <strong>{{ selectedCourse }}</strong>
        </div>
        <div>
          <span>Група</span>
          <strong>{{ selectedGroup }}</strong>
        </div>
        <div>
          <span>Елементів плану</span>
          <strong>{{ selectedItems.length }}</strong>
        </div>
      </div>

      <div class="discipline-list">
        <article v-for="item in selectedItems" :key="itemKey(item)" class="discipline-card">
          <div class="card-header">
            <div>
              <span class="code-badge">{{ item.code || 'ПРАКТИКА' }}</span>
              <h2>{{ item.name }}</h2>
            </div>
            <div class="card-tools"><span class="type-badge" :class="item.type">{{ typeName(item.type) }}</span><button type="button" class="edit-button" aria-label="Редагувати всі дані предмета" title="Редагувати всі дані предмета" @click="editItem(item)">✎</button></div>
          </div>

          <div class="teacher-row">
            <div><span>Викладач</span><strong>{{ item.teacher || '—' }}</strong></div>
            <div><span>Дублер</span><strong>{{ item.substitute || '—' }}</strong></div>
          </div>

          <div v-if="hasHours(item.hours)" class="general-hours">
            <div v-for="(value, key) in item.hours" :key="key">
              <span>{{ hourLabel(key) }}</span>
              <strong>{{ value }}</strong>
            </div>
          </div>

          <div v-if="item.semesters?.length" class="semesters">
            <div v-for="semester in item.semesters" :key="semester.semester" class="semester-card">
                <h3>{{ formatSemesterDisplay(semester.semester) }}</h3>
              <div class="semester-grid">
                <template v-for="(value, key) in semester" :key="key">
                  <div v-if="key !== 'semester' && key !== 'rowId'">
                  <span>{{ semesterLabel(key) }}</span>
                  <strong>{{ value }}</strong>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </article>
      </div>
    </template>
    <div v-if="editingSemester" class="modal-backdrop" @click.self="closeEditor">
      <form class="edit-modal" @submit.prevent="saveEditor">
        <div class="modal-header"><div><p class="eyebrow">Редагування навчального плану</p><h2>Усі дані семестру</h2></div><button type="button" class="close-button" @click="closeEditor">×</button></div>
        <div class="edit-grid item-fields">
          <label><span>Код дисципліни</span><input v-model="editForm.code" type="text"></label>
          <label><span>Назва дисципліни</span><input v-model="editForm.name" type="text"></label>
          <label><span>Основний викладач</span><select v-model="editForm.teacher_id"><option :value="null">Не призначено</option><option v-for="teacher in teachers" :key="teacher.id" :value="teacher.id">{{ teacher.full_name }}</option></select></label>
          <label><span>Дублер</span><select v-model="editForm.backup_teacher_id"><option :value="null">Немає дублера</option><option v-for="teacher in teachers" :key="teacher.id" :value="teacher.id">{{ teacher.full_name }}</option></select></label>
        </div>
        <div v-for="(semesterForm, semesterIndex) in semesterForms" :key="semesterForm.rowId" class="semester-editor"><h3>{{ formatSemesterDisplay(semesterForm.semester || semesterIndex + 1) }}</h3><div class="edit-grid"><label v-for="field in editNumberFields" :key="field.key"><span>{{ field.label }}</span><input v-model.number="semesterForm[field.key]" type="number" min="0" step="0.01"></label><label><span>Вид контролю</span><input v-model="semesterForm.control_type" type="text"></label><label><span>Іспит</span><input v-model="semesterForm.exam" type="text"></label><label><span>Контрольні роботи</span><input v-model="semesterForm.control_works" type="text"></label></div></div>
        <div class="modal-actions"><button type="button" class="secondary-button" @click="closeEditor">Скасувати</button><button type="submit" class="save-button" :disabled="saving">{{ saving ? 'Збереження…' : 'Зберегти зміни' }}</button></div>
      </form>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import api from '../services/api'

const plans = ref([])
const selectedCourse = ref(1)
const selectedGroup = ref('')
const loading = ref(true)
const error = ref('')
const teachers = ref([])
const editingSemester = ref(null)
const saving = ref(false)
const editForm = reactive({})
const semesterForms = ref([])
const editNumberFields = [
  { key: 'semester', label: 'Семестр' }, { key: 'hours_per_week', label: 'Години на тиждень' },
  { key: 'total_hours', label: 'Всього годин' }, { key: 'lectures_hours', label: 'Лекції' },
  { key: 'practical_hours', label: 'Практичні заняття' }, { key: 'laboratory_hours', label: 'Лабораторні' },
  { key: 'seminars_hours', label: 'Семінари' }, { key: 'self_study_hours', label: 'Самостійна робота' },
  { key: 'course_projects_hours', label: 'Курсові роботи' }, { key: 'calculation_graphic_hours', label: 'Розрахункові роботи' },
  { key: 'field_training_hours', label: 'Практика' }
]

const courses = computed(() => [...new Set(plans.value.map(plan => plan.course))].sort())
const groups = computed(() => [...new Set(
  plans.value.filter(plan => plan.course === selectedCourse.value).map(plan => plan.group)
)].sort())

const selectedItems = computed(() => plans.value
  .filter(plan => plan.course === selectedCourse.value && plan.group === selectedGroup.value)
  .flatMap(plan => plan.items || []))

watch(selectedCourse, () => {
  selectedGroup.value = groups.value[0] || ''
})

onMounted(async () => {
  try {
    const [response, teachersResponse] = await Promise.all([api.get('/plans'), api.get('/teachers')])
    plans.value = response.data
    teachers.value = teachersResponse.data
    selectedCourse.value = courses.value[0] || 1
    selectedGroup.value = groups.value[0] || ''
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Не вдалося завантажити навчальні плани.'
  } finally {
    loading.value = false
  }
})

const labels = {
  plan: 'За планом', previousYear: 'Попередній рік', currentYear: 'Поточний рік',
  total: 'Усього годин', totalHours: 'Усього годин', classroom: 'Аудиторні', classroomHours: 'Аудиторні години',
  hoursPerWeek: 'Годин на тиждень', lectures: 'Лекції', practical: 'Практичні', laboratory: 'Лабораторні',
  seminars: 'Семінари', selfStudy: 'Самостійні', fieldTraining: 'Практика', weeks: 'Тижні',
  differentialCredit: 'Диференційований залік',
  courseWork: 'Курсова робота', calculationWork: 'Розрахункова робота', credits: 'Залік',
  exams: 'Екзамен', controlWorks: 'Контрольні роботи'
}

function formatSemesterDisplay(value) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return '—'
  return numericValue % 2 === 0 ? '2' : '1'
}

function hourLabel(key) { return labels[key] || key }
function semesterLabel(key) { return labels[key] || key }
function typeName(type) { return { discipline: 'Дисципліна', ОК: 'ОК', ВК: 'ВК', practice: 'Практика' }[type] || type }
function hasHours(hours) { return hours && Object.keys(hours).length > 0 }
function itemKey(item) { return `${item.type}-${item.row}-${item.code}-${item.name}` }

async function editItem(item) {
  if (!item.semesters?.length) return window.alert('Для цього елемента немає даних семестру для редагування.')
  editingSemester.value = item
  Object.assign(editForm, { code: item.code || '', name: item.name || '', teacher_id: item.teacherId ?? null, backup_teacher_id: item.backupTeacherId ?? null })
  semesterForms.value = item.semesters.map(semester => ({
    rowId: semester.rowId, semester: Number(semester.semester || 0), hours_per_week: Number(semester.hoursPerWeek || 0),
    total_hours: Number(semester.totalHours || 0), lectures_hours: Number(semester.lectures || 0), practical_hours: Number(semester.practical || 0),
    laboratory_hours: Number(semester.laboratory || 0), seminars_hours: Number(semester.seminars || 0), self_study_hours: Number(semester.selfStudy || 0),
    course_projects_hours: Number(semester.courseWork || 0), calculation_graphic_hours: Number(semester.calculationWork || 0),
    field_training_hours: Number(semester.fieldTraining || 0), control_type: semester.controlType || '', exam: semester.exams || '', control_works: semester.controlWorks || ''
  }))
}

function closeEditor() { editingSemester.value = null; semesterForms.value = [] }

async function saveEditor() {
  saving.value = true
  try {
    for (const semesterForm of semesterForms.value) {
      const changes = { ...semesterForm, ...editForm, control_type: semesterForm.control_type || null, exam: semesterForm.exam || null, control_works: semesterForm.control_works || null }
      await api.patch(`/plans/disciplines/${semesterForm.rowId}`, changes)
    }
    const response = await api.get('/plans')
    plans.value = response.data
    closeEditor()
  } catch (e) { window.alert(e.response?.data?.message || 'Не вдалося зберегти зміни.') } finally { saving.value = false }
}
</script>

<style scoped>
.plans-page { max-width: 1250px; margin: 0 auto; }
.page-heading { display: flex; justify-content: space-between; gap: 28px; align-items: end; margin-bottom: 26px; }
.eyebrow { margin: 0 0 8px; color: #5673c8; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
h1 { margin: 0 0 8px; font-size: 32px; color: #152238; }
.muted { margin: 0; color: #738096; }
.filters { display: flex; gap: 12px; }
label { display: grid; gap: 7px; color: #69778d; font-size: 12px; font-weight: 700; }
select { min-width: 180px; padding: 11px 13px; border: 1px solid #dce3ee; border-radius: 10px; background: white; color: #24324a; font-size: 14px; }
.plan-summary, .discipline-card, .state-card { background: white; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 8px 24px rgba(38, 57, 84, .05); }
.plan-summary { display: flex; gap: 44px; padding: 18px 24px; margin-bottom: 18px; }
.plan-summary span, .teacher-row span, .general-hours span, .semester-grid span { display: block; color: #8490a2; font-size: 12px; margin-bottom: 5px; }
.plan-summary strong { color: #1c2c45; font-size: 18px; }
.discipline-list { display: grid; gap: 18px; }
.discipline-card { padding: 21px; }
.card-header { display: flex; justify-content: space-between; gap: 20px; align-items: start; }
.card-tools { display: flex; align-items: center; gap: 10px; }
.edit-button, .semester-edit { display: inline-grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px; color: white; background: #2563eb; font-size: 18px; line-height: 1; cursor: pointer; }
.edit-button:hover, .semester-edit:hover { background: #1d4ed8; }
.code-badge, .type-badge { display: inline-block; padding: 5px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.code-badge { background: #edf2ff; color: #5270c9; }
.type-badge { background: #f1f4f8; color: #66758d; white-space: nowrap; }
.type-badge.ОК { background: #eaf7f0; color: #258056; }.type-badge.ВК { background: #fff3df; color: #a56a16; }.type-badge.practice { background: #f7eaff; color: #8b4cb0; }
h2 { margin: 10px 0 0; color: #17253a; font-size: 20px; }
h3 { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 16px; color: #263750; font-size: 16px; }
.teacher-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin: 20px 0; padding: 15px 0; border-top: 1px solid #edf0f4; border-bottom: 1px solid #edf0f4; }
.teacher-row strong { color: #24324a; font-size: 14px; }
.general-hours, .semester-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
.general-hours { margin-bottom: 18px; }.general-hours > div, .semester-grid > div { padding: 10px 12px; background: #f8fafc; border-radius: 9px; }
.general-hours strong, .semester-grid strong { color: #24324a; font-size: 15px; }
.semesters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 15px; }.semester-card { padding: 17px; background: #fbfcfe; border: 1px solid #e7ebf2; border-radius: 12px; }
.state-card { padding: 35px; text-align: center; color: #718096; }.state-card.error { color: #bd3f51; }
.modal-backdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 20px; background: rgba(15, 23, 42, .58); }
.edit-modal { width: min(760px, 100%); max-height: 90vh; overflow: auto; padding: 25px; border-radius: 18px; background: white; box-shadow: 0 24px 70px rgba(15, 23, 42, .3); }
.modal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 22px; }.modal-header h2 { margin: 0; }.close-button { border: 0; color: #64748b; background: transparent; font-size: 28px; line-height: 1; cursor: pointer; }
.edit-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }.edit-grid label { gap: 6px; color: #475467; font-size: 12px; }.edit-grid input { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #d0d5dd; border-radius: 8px; color: #172033; font-size: 14px; }.edit-grid input:focus { outline: 2px solid #bfdbfe; border-color: #2563eb; }
.item-fields { margin-bottom: 18px; }.semester-editor { margin-top: 18px; padding: 17px; border: 1px solid #dbe4f0; border-radius: 12px; background: #f8fafc; }.semester-editor h3 { margin: 0 0 14px; color: #2563eb; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }.modal-actions button { border: 0; border-radius: 8px; padding: 10px 16px; cursor: pointer; }.secondary-button { color: #344054; background: #f2f4f7; }.save-button { color: white; background: #2563eb; }.save-button:disabled { opacity: .6; cursor: wait; }
@media (max-width: 800px) { .page-heading { display: block; }.filters { margin-top: 20px; flex-wrap: wrap; }.plan-summary { flex-wrap: wrap; gap: 20px; }.semesters { grid-template-columns: 1fr; }.edit-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px) { .edit-grid { grid-template-columns: 1fr; } }
</style>