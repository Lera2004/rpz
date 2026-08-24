<template>
  <div class="teachers-page">

    <div class="page-header">
      <div>
        <h1>Викладачі</h1>
        <p>Тільки викладачі циклової комісії "Інженерія програмного забезпечення"</p>
      </div>

      <button class="add-button" @click="openAddForm">
        + Додати викладача
      </button>
    </div>

    <!-- Повідомлення про помилку -->
    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>

    <!-- Завантаження -->
    <div v-if="loading" class="loading">
      Завантаження даних...
    </div>

    <div class="filters">
      <label for="commission-filter">Циклова комісія:</label>
      <select id="commission-filter" v-model="selectedCommission" v-if="targetCommission">
        <option :value="String(targetCommission.id)">{{ targetCommission.name }}</option>
      </select>
      <span v-else class="missing-commission">Комісія не знайдена</span>
      <input v-model="newCommissionName" class="commission-input" placeholder="Нова комісія" @keyup.enter="addCommission" />
      <button class="commission-add-button" :disabled="commissionSaving" @click="addCommission">
        {{ commissionSaving ? 'Додавання...' : '+ Комісія' }}
      </button>
      <span class="filter-count">Показано: {{ filteredTeachers.length }}</span>
    </div>

    <!-- Таблиця -->
    <div v-if="!loading" class="table-container">
      <table>
        <thead>
          <tr>
            <th>№</th>
            <th>ПІБ</th>
            <th>Циклова комісія</th>
            <th>Категорія</th>
            <th>Посада</th>
            <th>Ставка</th>
            <th>Дії</th>
          </tr>
        </thead>

        <tbody>

          <tr v-if="filteredTeachers.length === 0">
            <td colspan="7" class="empty">
              Викладачів поки немає
            </td>
          </tr>

          <template
            v-for="(teacher, index) in filteredTeachers"
            :key="teacher.id"
          >
          <tr>
            <td>{{ index + 1 }}</td>

            <td class="teacher-name-cell" @click="openTeacherDetail(teacher)">
              {{ teacher.full_name }}
            </td>

            <td>
              {{ commissionName(teacher.commission_id) }}
            </td>

            <td>
              {{ teacher.category }}
            </td>

            <td>
              {{ teacher.position }}
            </td>

            <td>
              {{ teacher.rate }}
            </td>

            <td class="actions">

              <button
                class="detail-button"
                @click="openTeacherDetail(teacher)"
              >
                Деталі
              </button>

              <button
                class="edit-button"
                @click="openEditForm(teacher)"
              >
                Редагувати
              </button>

              <button
                class="delete-button"
                @click="deleteTeacher(teacher.id)"
              >
                Видалити
              </button>

            </td>
          </tr>

          <tr
            v-if="expandedTeacherId === teacher.id"
            class="subjects-row"
          >
            <td colspan="7">
              <div class="subjects-panel">
                <div class="subjects-columns">
                  <div>
                    <h3>Основний викладач</h3>
                    <ul v-if="subjectsFor(teacher).main.length">
                      <li v-for="subject in subjectsFor(teacher).main" :key="subject.key">
                        {{ subject.name }}
                      </li>
                    </ul>
                    <p v-else class="no-subjects">Предметів не знайдено</p>
                  </div>

                  <div>
                    <h3>Дублер</h3>
                    <ul v-if="subjectsFor(teacher).substitute.length">
                      <li v-for="subject in subjectsFor(teacher).substitute" :key="subject.key">
                        {{ subject.name }}
                      </li>
                    </ul>
                    <p v-else class="no-subjects">Предметів не знайдено</p>
                  </div>
                </div>
              </div>
            </td>
          </tr>

          </template>

        </tbody>
      </table>
    </div>

    <div
      v-if="selectedTeacher"
      class="modal-background"
      @click.self="closeTeacherDetail"
    >
      <div class="teacher-detail-modal">
        <div class="modal-header">
          <h2>{{ selectedTeacher.full_name }}</h2>
          <button class="close-button" @click="closeTeacherDetail">×</button>
        </div>

        <div class="teacher-detail-grid">
          <div class="teacher-detail-item">
            <span class="label">Телефон</span>
            <strong>{{ getTeacherMeta(selectedTeacher).phone || '—' }}</strong>
          </div>

          <div class="teacher-detail-item">
            <span class="label">Email</span>
            <strong>{{ getTeacherMeta(selectedTeacher).email || '—' }}</strong>
          </div>

          <div class="teacher-detail-item">
            <span class="label">Дата народження</span>
            <strong>{{ formatDate(getTeacherMeta(selectedTeacher).dateOfBirth) }}</strong>
          </div>

          <div class="teacher-detail-item">
            <span class="label">Циклова комісія</span>
            <strong>{{ commissionName(selectedTeacher.commission_id) }}</strong>
          </div>
        </div>

        <div class="teacher-detail-columns">
          <div class="teacher-detail-card">
            <h3>Основний викладач</h3>
            <ul v-if="subjectsFor(selectedTeacher).main.length">
              <li v-for="subject in subjectsFor(selectedTeacher).main" :key="subject.key">
                {{ subject.name }}
              </li>
            </ul>
            <p v-else class="no-subjects">Немає дисциплін у ролі основного викладача</p>
          </div>

          <div class="teacher-detail-card">
            <h3>Дублер</h3>
            <ul v-if="subjectsFor(selectedTeacher).substitute.length">
              <li v-for="subject in subjectsFor(selectedTeacher).substitute" :key="subject.key">
                {{ subject.name }}
              </li>
            </ul>
            <p v-else class="no-subjects">Немає дисциплін у ролі дублера</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Модальне вікно -->
    <div
      v-if="showForm"
      class="modal-background"
      @click.self="closeForm"
    >

      <div class="modal">

        <div class="modal-header">

          <h2>
            {{ editingId
              ? 'Редагування викладача'
              : 'Новий викладач'
            }}
          </h2>

          <button
            class="close-button"
            @click="closeForm"
          >
            ×
          </button>

        </div>

        <form @submit.prevent="saveTeacher">

          <!-- ПІБ -->
          <div class="form-group">

            <label>
              Циклова комісія
            </label>

            <select v-model="form.commission_id">
              <option :value="null">Не призначена</option>
              <option v-for="commission in commissions" :key="commission.id" :value="commission.id">
                {{ commission.name }}
              </option>
            </select>

          </div>

          <!-- Категорія -->
          <div class="form-group">

            <label>
              ПІБ викладача
            </label>

            <input
              v-model="form.full_name"
              type="text"
              placeholder="Наприклад: Нерознак Вікторія Романівна"
              required
            />

          </div>

          <!-- Категорія -->
          <div class="form-group">

            <label>
              Категорія
            </label>

            <select
              v-model="form.category"
              required
            >

              <option
                value=""
                disabled
              >
                Оберіть категорію
              </option>

              <option>
                Спеціаліст
              </option>

              <option>
                ІІ категорія
              </option>

              <option>
                І категорія
              </option>

              <option>
                Вища категорія
              </option>

            </select>

          </div>

          <!-- Посада -->
          <div class="form-group">

            <label>
              Посада
            </label>

            <input
              v-model="form.position"
              type="text"
              placeholder="Викладач"
              required
            />

          </div>

          <!-- Ставка -->
          <div class="form-group">

            <label>
              Ставка
            </label>

            <input
              v-model.number="form.rate"
              type="number"
              min="0"
              step="0.25"
              placeholder="1"
              required
            />

          </div>

          <div class="form-group">
            <label>
              Телефон
            </label>
            <input
              v-model="form.phone"
              type="tel"
              placeholder="+38050..."
            />
          </div>

          <div class="form-group">
            <label>
              Email
            </label>
            <input
              v-model="form.email"
              type="email"
              placeholder="name@domain.com"
            />
          </div>

          <div class="form-group">
            <label>
              Дата народження
            </label>
            <input
              v-model="form.date_of_birth"
              type="date"
            />
          </div>

          <!-- Кнопки -->
          <div class="form-actions">

            <button
              type="button"
              class="cancel-button"
              @click="closeForm"
            >
              Скасувати
            </button>

            <button
              type="submit"
              class="save-button"
              :disabled="saving"
            >
              {{ saving ? 'Збереження...' : 'Зберегти' }}
            </button>

          </div>

        </form>

      </div>

    </div>

  </div>
</template>


<script setup>

import { ref, computed, onMounted } from 'vue'
import api from '../services/api.js'


// ------------------------------
// Дані
// ------------------------------

const teachers = ref([])
const commissions = ref([])
const selectedCommission = ref('')
const newCommissionName = ref('')
const commissionSaving = ref(false)
const selectedTeacher = ref(null)

const plans = ref([])

const expandedTeacherId = ref(null)

const loading = ref(false)

const saving = ref(false)

const errorMessage = ref('')

const showForm = ref(false)

const editingId = ref(null)


// ------------------------------
// Форма
// ------------------------------

const form = ref({
  full_name: '',
  category: '',
  position: 'Викладач',
  rate: 1,
  commission_id: null,
  phone: '',
  email: '',
  date_of_birth: ''
})

const TARGET_COMMISSION_NAME = 'Інженерія програмного забезпечення'

const targetCommission = computed(() =>
  commissions.value.find(
    commission => String(commission.name || '').trim() === TARGET_COMMISSION_NAME
  ) || null
)

const filteredTeachers = computed(() => {
  const targetId = targetCommission.value?.id
  if (!targetId && !teachers.value.length) return []

  return teachers.value.filter((teacher) => {
    const teacherCommissionId = String(teacher.commission_id || '')
    const teacherCommissionName = String(teacher.commission_name || '').trim()

    return (
      (targetId && teacherCommissionId === String(targetId)) ||
      teacherCommissionName === TARGET_COMMISSION_NAME
    )
  })
})

function commissionName(id) {
  return commissions.value.find(commission => String(commission.id) === String(id))?.name || (id ? `Комісія №${id}` : 'Не призначена')
}

function ensureTargetCommissionSelected() {
  if (!targetCommission.value) return
  selectedCommission.value = String(targetCommission.value.id)
}

function getTeacherMeta(teacher = {}) {
  return {
    phone: teacher.phone ?? teacher.phone_number ?? teacher.mobile_phone ?? '',
    email: teacher.email ?? '',
    dateOfBirth: teacher.date_of_birth ?? teacher.birth_date ?? teacher.birthday ?? ''
  }
}

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date)
}

async function addCommission() {
  const name = newCommissionName.value.trim()
  if (!name) return
  commissionSaving.value = true
  errorMessage.value = ''
  try {
    const commission = (await api.post('/commissions', { name })).data
    commissions.value = [...commissions.value, commission].sort((a, b) => a.name.localeCompare(b.name, 'uk'))
    selectedCommission.value = String(commission.id)
    newCommissionName.value = ''
  } catch (error) {
    errorMessage.value = error.response?.data?.message || 'Не вдалося додати комісію.'
  } finally {
    commissionSaving.value = false
  }
}


// ------------------------------
// Завантаження викладачів
// ------------------------------

async function loadTeachers() {

  loading.value = true

  errorMessage.value = ''

  try {

    const response = await api.get('/teachers')

    teachers.value = response.data

  } catch (error) {

    console.error(error)

    errorMessage.value =
      'Не вдалося завантажити викладачів.'

  } finally {

    loading.value = false

  }

}

async function loadCommissions() {
  try {
    commissions.value = (await api.get('/commissions')).data
    ensureTargetCommissionSelected()
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Не вдалося завантажити циклові комісії.'
  }
}


async function loadPlans() {
  try {
    const response = await api.get('/plans')
    plans.value = response.data
  } catch (error) {
    console.error(error)
  }
}


function normalize(value) {
  return String(value || '')
    .toLocaleLowerCase('uk-UA')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}


function mergePlanTeachers() {
  const existingSurnames = new Set(
    teachers.value.map(teacher => normalize(teacher.full_name).split(' ')[0])
  )
  const planTeachers = new Map()

  for (const plan of plans.value) {
    for (const item of plan.items || []) {
      for (const value of [item.teacher, item.substitute]) {
        const surname = String(value || '').trim()
        const key = normalize(surname)
        if (key && !existingSurnames.has(key)) {
          planTeachers.set(key, surname)
        }
      }
    }
  }

  teachers.value = [
    ...teachers.value,
    ...Array.from(planTeachers.entries()).map(([key, surname]) => ({
      id: `plan-${key}`,
      full_name: surname,
      category: 'Є в навчальному плані',
      position: 'ПІБ не заповнено',
      rate: '—',
      fromPlan: true
    }))
  ]
}


function teacherMatches(value, fullName) {
  const teacher = normalize(value)
  const nameParts = normalize(fullName)
    .split(' ')
    .filter(part => part.length > 2)

  return Boolean(teacher) && nameParts.some(part => teacher.includes(part))
}


function subjectsFor(teacher) {
  const main = []
  const substitute = []

  for (const plan of plans.value) {
    for (const item of plan.items || []) {
      const subject = {
        key: `${plan.sheet}-${item.row}-${item.code}-${item.name}`,
        name: item.name
      }

      if (teacherMatches(item.teacher, teacher.full_name)) {
        main.push(subject)
      }

      if (teacherMatches(item.substitute, teacher.full_name)) {
        substitute.push(subject)
      }
    }
  }

  return {
    main: uniqueSubjects(main),
    substitute: uniqueSubjects(substitute)
  }
}


function uniqueSubjects(subjects) {
  const seen = new Set()

  return subjects.filter(subject => {
    const key = normalize(subject.name)

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}


function toggleSubjects(id) {
  expandedTeacherId.value =
    expandedTeacherId.value === id ? null : id
}


// ------------------------------
// Відкрити форму додавання
// ------------------------------

function openAddForm() {

  editingId.value = null

  form.value = {
    full_name: '',
    category: '',
    position: 'Викладач',
    rate: 1,
    commission_id: targetCommission.value?.id ?? null,
    phone: '',
    email: '',
    date_of_birth: ''
  }

  showForm.value = true

}


// ------------------------------
// Відкрити форму редагування
// ------------------------------

function openEditForm(teacher) {

  editingId.value = teacher.id

  form.value = {
    full_name: teacher.full_name,
    category: teacher.category,
    position: teacher.position,
    rate: Number(teacher.rate),
    commission_id: teacher.commission_id || targetCommission.value?.id || null,
    phone: teacher.phone || '',
    email: teacher.email || '',
    date_of_birth: teacher.date_of_birth ? String(teacher.date_of_birth).slice(0, 10) : ''
  }

  showForm.value = true

}


// ------------------------------
// Закрити форму
// ------------------------------

function openTeacherDetail(teacher) {
  selectedTeacher.value = teacher
}

function closeTeacherDetail() {
  selectedTeacher.value = null
}

function closeForm() {

  showForm.value = false

}


// ------------------------------
// Зберегти
// ------------------------------

async function saveTeacher() {

  saving.value = true

  errorMessage.value = ''

  try {

    if (editingId.value) {

      await api.put(
        `/teachers/${editingId.value}`,
        form.value
      )

    } else {

      await api.post(
        '/teachers',
        form.value
      )

    }

    closeForm()

    await loadTeachers()

  } catch (error) {

    console.error(error)

    errorMessage.value =
      'Не вдалося зберегти викладача.'

  } finally {

    saving.value = false

  }

}


// ------------------------------
// Видалення
// ------------------------------

async function deleteTeacher(id) {

  const teacher = teachers.value.find(
    teacher => teacher.id === id
  )

  if (!teacher) {
    return
  }

  const confirmed = confirm(
    `Видалити викладача "${teacher.full_name}"?`
  )

  if (!confirmed) {
    return
  }

  try {

    await api.delete(
      `/teachers/${id}`
    )

    await loadTeachers()

  } catch (error) {

    console.error(error)

    errorMessage.value =
      'Не вдалося видалити викладача.'

  }

}


// ------------------------------
// Завантажити при відкритті
// ------------------------------

onMounted(async () => {
  await Promise.all([loadTeachers(), loadPlans(), loadCommissions()])
  mergePlanTeachers()
  ensureTargetCommissionSelected()
})

</script>


<style scoped>

.teachers-page {
  width: 100%;
}


/* Заголовок */

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
}

h1 {
  margin: 0;
  font-size: 28px;
}

.page-header p {
  margin: 7px 0 0;
  color: #6b7280;
}

.filters {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
  padding: 14px 16px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.filters select {
  min-width: 280px;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
}

.commission-input {
  width: 220px;
  padding: 8px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}

.commission-add-button {
  border: 0;
  border-radius: 6px;
  padding: 9px 12px;
  color: #fff;
  background: #2563eb;
  cursor: pointer;
}

.commission-add-button:disabled {
  opacity: 0.65;
  cursor: default;
}

.filter-count {
  margin-left: auto;
  color: #667085;
  font-size: 14px;
}


/* Кнопка додавання */

.add-button {
  border: none;
  background: #2563eb;
  color: white;
  padding: 11px 18px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.teacher-name-cell {
  cursor: pointer;
  color: #1d4ed8;
  font-weight: 600;
}

.teacher-name-cell:hover {
  text-decoration: underline;
}

.teacher-detail-modal {
  width: min(760px, 100%);
  background: #fff;
  border-radius: 18px;
  padding: 26px 28px;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.18);
}

.teacher-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 18px;
  margin-bottom: 24px;
}

.teacher-detail-item {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.teacher-detail-item .label {
  color: #64748b;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.teacher-detail-item strong {
  color: #0f172a;
  font-size: 15px;
}

.teacher-detail-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.teacher-detail-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 18px 18px 16px;
}

.teacher-detail-card h3 {
  margin: 0 0 12px;
  color: #1e293b;
  font-size: 15px;
}

.teacher-detail-card ul {
  margin: 0;
  padding-left: 18px;
  color: #334155;
}

.teacher-detail-card li {
  margin: 8px 0;
  line-height: 1.45;
}

.no-subjects {
  margin: 0;
  color: #64748b;
  font-size: 14px;
}

@media (max-width: 760px) {
  .teacher-detail-grid,
  .teacher-detail-columns {
    grid-template-columns: 1fr;
  }

  .teacher-detail-modal {
    padding: 18px 16px;
  }
}

.add-button:hover {
  background: #1d4ed8;
}


/* Помилка */

.error-message {
  margin-bottom: 20px;
  padding: 12px 15px;
  border-radius: 8px;
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}


/* Завантаження */

.loading {
  background: white;
  padding: 40px;
  text-align: center;
  color: #6b7280;
  border-radius: 12px;
}


/* Таблиця */

.table-container {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 14px 16px;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
}

th {
  background: #f9fafb;
  font-size: 14px;
  color: #4b5563;
}

td {
  font-size: 14px;
}

.empty {
  text-align: center;
  padding: 50px;
  color: #9ca3af;
}


/* Дії */

.actions {
  display: flex;
  gap: 8px;
}

.actions button {
  border: none;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.edit-button {
  background: #eff6ff;
  color: #2563eb;
}

.delete-button {
  background: #fef2f2;
  color: #dc2626;
}


/* Модальне вікно */

.modal-background {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
}

.modal {
  width: 100%;
  max-width: 500px;
  background: white;
  border-radius: 12px;
  padding: 25px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
}

.close-button {
  border: none;
  background: transparent;
  font-size: 26px;
  cursor: pointer;
  color: #6b7280;
}


/* Форма */

.form-group {
  margin-bottom: 18px;
}

.form-group label {
  display: block;
  margin-bottom: 7px;
  font-size: 14px;
  font-weight: 600;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 11px 12px;
  border: 1px solid #d1d5db;
  border-radius: 7px;
  outline: none;
  font-size: 14px;
}

.form-group input:focus,
.form-group select:focus {
  border-color: #2563eb;
}


/* Кнопки форми */

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 25px;
}

.form-actions button {
  padding: 10px 17px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 14px;
}

.cancel-button {
  border: 1px solid #d1d5db;
  background: white;
}

.save-button {
  border: none;
  background: #2563eb;
  color: white;
}

.save-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

</style>