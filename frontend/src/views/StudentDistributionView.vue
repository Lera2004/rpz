<template>
  <section class="distribution-page">
    <div class="page-header">
      <div>
        <h1>Розподіл студентів</h1>
        <p>Дипломне проєктування та курсові роботи — 3 і 4 курс</p>
      </div>
      <span class="commission-badge">ЦК: {{ data.commission }}</span>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="loading">Завантаження...</p>

    <form v-if="!loading" class="distribution-form" @submit.prevent="save">
      <label>Група
        <select v-model="form.group_id" required>
          <option value="">Оберіть групу</option>
          <option v-for="group in data.groups" :key="group.id" :value="group.id">
            {{ group.name }} — {{ group.course }} курс ({{ group.students_count || 0 }} студентів)
          </option>
        </select>
      </label>
      <label>Вид роботи
        <select v-model="form.work_type" required>
          <option v-for="option in workTypeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </label>
      <label>Викладач ЦК
        <select v-model="form.teacher_id" required>
          <option value="">Оберіть викладача</option>
          <option v-for="teacher in data.teachers" :key="teacher.id" :value="teacher.id">
            {{ teacher.full_name }}
          </option>
        </select>
      </label>
      <label>Кількість студентів
        <input v-model.number="form.students_count" type="number" min="0" :max="selectedGroup?.students_count || 0" required />
      </label>
      <button :disabled="saving" type="submit">{{ saving ? 'Збереження...' : (editingId ? 'Оновити кількість' : 'Зберегти розподіл') }}</button>
      <button v-if="editingId" class="cancel-button" type="button" @click="cancelEdit">Скасувати</button>
    </form>

    <div v-if="selectedGroup" class="group-info">
      <strong>{{ selectedGroup.name }}</strong>
      <span>Всього студентів: {{ selectedGroup.students_count || 0 }}</span>
      <span>Вже розподілено: {{ assignedForSelectedGroup }}</span>
      <span>Залишилось: {{ remainingStudents }}</span>
    </div>

    <h2>Дипломне проєктування</h2>
    <p class="table-note">Керівник та консультанти зі спеціальної частини, охорони праці й економіки.</p>
    <div class="table-container">
      <table>
        <thead><tr><th>№</th><th>Група</th><th>Студентів</th><th>Роль</th><th>Викладач</th><th>Розподілено</th><th>Дія</th></tr></thead>
        <tbody>
          <tr v-if="!diplomaAllocations.length"><td colspan="7" class="empty">Розподілів на дипломне проєктування ще немає</td></tr>
          <tr v-for="(allocation, index) in diplomaAllocations" :key="allocation.id">
            <td>{{ index + 1 }}</td><td>{{ allocation.group_name }}</td><td>{{ groupStudents(allocation.group_id) }}</td><td>{{ workTypeLabel(allocation.work_type) }}</td><td>{{ allocation.teacher_name }}</td><td>{{ allocation.students_count }}</td>
            <td><button class="edit-button" @click="edit(allocation)">Редагувати</button><button class="delete-button" @click="remove(allocation.id)">Видалити</button></td>
          </tr>
        </tbody>
        <tfoot><tr><th colspan="5">Всього розподілено</th><th>{{ allocationTotal(diplomaAllocations) }}</th><th></th></tr></tfoot>
      </table>
    </div>

    <h2>Члени екзаменаційної комісії</h2>
    <p class="table-note">Викладачі ЦК, залучені до екзаменаційної комісії 4 курсу.</p>
    <div class="table-container">
      <table>
        <thead><tr><th>№</th><th>Група</th><th>Студентів</th><th>Викладач</th><th>Розподілено</th><th>Дія</th></tr></thead>
        <tbody>
          <tr v-if="!examCommissionAllocations.length"><td colspan="6" class="empty">Членів екзаменаційної комісії ще не додано</td></tr>
          <tr v-for="(allocation, index) in examCommissionAllocations" :key="allocation.id">
            <td>{{ index + 1 }}</td><td>{{ allocation.group_name }}</td><td>{{ groupStudents(allocation.group_id) }}</td><td>{{ allocation.teacher_name }}</td><td>{{ allocation.students_count }}</td>
            <td><button class="edit-button" @click="edit(allocation)">Редагувати</button><button class="delete-button" @click="remove(allocation.id)">Видалити</button></td>
          </tr>
        </tbody>
        <tfoot><tr><th colspan="4">Всього розподілено</th><th>{{ allocationTotal(examCommissionAllocations) }}</th><th></th></tr></tfoot>
      </table>
    </div>

    <h2>Курсові роботи — 3 курс</h2>
    <p class="table-note">Предмет: «Бази даних».</p>
    <div class="table-container">
      <table><thead><tr><th>№</th><th>Група</th><th>Студентів</th><th>Вид роботи</th><th>Викладач</th><th>Розподілено</th><th>Дія</th></tr></thead>
        <tbody><tr v-if="!coursework3Allocations.length"><td colspan="7" class="empty">Розподілів курсових робіт 3 курсу ще немає</td></tr>
          <tr v-for="(allocation, index) in coursework3Allocations" :key="allocation.id"><td>{{ index + 1 }}</td><td>{{ allocation.group_name }}</td><td>{{ groupStudents(allocation.group_id) }}</td><td>{{ workTypeLabel(allocation.work_type) }}</td><td>{{ allocation.teacher_name }}</td><td>{{ allocation.students_count }}</td><td><button class="edit-button" @click="edit(allocation)">Редагувати</button><button class="delete-button" @click="remove(allocation.id)">Видалити</button></td></tr>
        </tbody>
        <tfoot><tr><th colspan="5">Всього розподілено</th><th>{{ allocationTotal(coursework3Allocations) }}</th><th></th></tr></tfoot>
      </table>
    </div>

    <h2>Курсові роботи — 4 курс</h2>
    <p class="table-note">Предмет: «Візуальне об'єктно-орієнтоване програмування».</p>
    <div class="table-container">
      <table><thead><tr><th>№</th><th>Група</th><th>Студентів</th><th>Вид роботи</th><th>Викладач</th><th>Розподілено</th><th>Дія</th></tr></thead>
        <tbody><tr v-if="!coursework4Allocations.length"><td colspan="7" class="empty">Розподілів курсових робіт 4 курсу ще немає</td></tr>
          <tr v-for="(allocation, index) in coursework4Allocations" :key="allocation.id"><td>{{ index + 1 }}</td><td>{{ allocation.group_name }}</td><td>{{ groupStudents(allocation.group_id) }}</td><td>{{ workTypeLabel(allocation.work_type) }}</td><td>{{ allocation.teacher_name }}</td><td>{{ allocation.students_count }}</td><td><button class="edit-button" @click="edit(allocation)">Редагувати</button><button class="delete-button" @click="remove(allocation.id)">Видалити</button></td></tr>
        </tbody>
        <tfoot><tr><th colspan="5">Всього розподілено</th><th>{{ allocationTotal(coursework4Allocations) }}</th><th></th></tr></tfoot>
      </table>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import api from '../services/api.js'

const data = reactive({ commission: 'Інженерія програмного забезпечення', groups: [], teachers: [], allocations: [] })
const form = reactive({ group_id: '', teacher_id: '', work_type: 'diploma', students_count: 0 })
const loading = ref(false)
const saving = ref(false)
const error = ref('')

const workTypeOptions = [
  { value: 'diploma', label: 'Диплом — керівник' },
  { value: 'diploma_special', label: 'Диплом — консультант зі спеціальної частини' },
  { value: 'diploma_labor', label: 'Диплом — консультант з охорони праці' },
  { value: 'diploma_economics', label: 'Диплом — консультант з економіки' },
  { value: 'exam_commission_diploma', label: 'Диплом — член ДЕКК' },
  { value: 'exam_commission_coursework_3', label: 'Курсова 3 курс — член екзаменаційної комісії' },
  { value: 'exam_commission_coursework_4', label: 'Курсова 4 курс — член екзаменаційної комісії' },
  { value: 'coursework_3', label: 'Курсова робота — 3 курс, «Бази даних»' },
  { value: 'coursework_4', label: 'Курсова робота — 4 курс, «Візуальне ООП»' }
]

const selectedGroup = computed(() => data.groups.find(group => String(group.id) === String(form.group_id)))
const assignedForSelectedGroup = computed(() => data.allocations.filter(item => String(item.group_id) === String(form.group_id) && item.work_type === form.work_type).reduce((sum, item) => sum + Number(item.students_count || 0), 0))
const remainingStudents = computed(() => Math.max(0, Number(selectedGroup.value?.students_count || 0) - assignedForSelectedGroup.value))
const diplomaAllocations = computed(() => data.allocations.filter(item => item.work_type.startsWith('diploma') || item.work_type === 'exam_commission_diploma'))
const examCommissionAllocations = computed(() => data.allocations.filter(item => item.work_type === 'exam_commission'))
const coursework3Allocations = computed(() => data.allocations.filter(item => ['coursework_3', 'exam_commission_coursework_3'].includes(item.work_type)))
const coursework4Allocations = computed(() => data.allocations.filter(item => ['coursework_4', 'exam_commission_coursework_4'].includes(item.work_type)))

function workTypeLabel(type) {
  return workTypeOptions.find(option => option.value === type)?.label || type
}

function groupStudents(groupId) {
  return data.groups.find(group => group.id === groupId)?.students_count || 0
}

function allocationTotal(allocations) {
  return allocations.reduce((sum, allocation) => sum + Number(allocation.students_count || 0), 0)
}

const editingId = ref(null)

function edit(allocation) {
  editingId.value = allocation.id
  form.group_id = allocation.group_id
  form.teacher_id = allocation.teacher_id
  form.work_type = allocation.work_type
  form.students_count = allocation.students_count
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function load() {
  loading.value = true
  try { Object.assign(data, (await api.get('/student-distributions')).data) }
  catch (e) { error.value = e.response?.data?.message || 'Не вдалося завантажити розподіли.' }
  finally { loading.value = false }
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    if (editingId.value) await api.patch(`/student-distributions/${editingId.value}`, { students_count: form.students_count })
    else await api.post('/student-distributions', form)
    await load()
    form.students_count = 0
    editingId.value = null
  } catch (e) { error.value = e.response?.data?.message || 'Не вдалося зберегти розподіл.' }
  finally { saving.value = false }
}

function cancelEdit() {
  editingId.value = null
  form.students_count = 0
}

async function remove(id) {
  if (!confirm('Видалити цей розподіл?')) return
  try { await api.delete(`/student-distributions/${id}`); await load() }
  catch (e) { error.value = 'Не вдалося видалити розподіл.' }
}

onMounted(load)
</script>

<style scoped>
.distribution-page { max-width: 1500px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
h1 { margin: 0; }.page-header p { color: #667085; }.commission-badge { padding: 10px 14px; border-radius: 8px; background: #eff6ff; color: #1d4ed8; font-weight: 600; }
.distribution-form { display: grid; grid-template-columns: 1.3fr 1.3fr 1.3fr 0.8fr auto; gap: 12px; padding: 18px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 16px; }
label { display: flex; flex-direction: column; gap: 6px; color: #475467; font-size: 13px; } select, input { padding: 9px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; } form button { align-self: end; padding: 10px 14px; border: 0; border-radius: 6px; background: #2563eb; color: #fff; cursor: pointer; } form button:disabled { opacity: .6; }.cancel-button, .edit-button { padding: 8px 10px; border: 0; border-radius: 5px; cursor: pointer; }.cancel-button { align-self: end; background: #e2e8f0; color: #334155; }.edit-button { margin-right: 6px; background: #dbeafe; color: #1d4ed8; }
.group-info { display: flex; gap: 20px; flex-wrap: wrap; padding: 12px 16px; margin-bottom: 16px; background: #f8fafc; border-radius: 8px; color: #475467; }.table-container { overflow-x: auto; } table { width: 100%; border-collapse: collapse; background: #fff; } th, td { padding: 10px; border: 1px solid #e2e8f0; text-align: left; white-space: nowrap; } th { background: #f8fafc; }.delete-button { padding: 6px 10px; border: 0; border-radius: 5px; background: #fee4e2; color: #b42318; cursor: pointer; }.error { color: #b42318; }.empty { text-align: center; }
h2 { margin: 28px 0 4px; }.table-note { margin: 0 0 10px; color: #667085; }
@media (max-width: 1000px) { .distribution-form { grid-template-columns: repeat(2, 1fr); } .page-header { align-items: flex-start; gap: 12px; flex-direction: column; } }
</style>
