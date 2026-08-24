<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import api from '../services/api.js'

const users = ref([])
const teachers = ref([])
const loading = ref(false)
const submitting = ref(false)
const generatePreview = ref(false)
const currentPreview = ref({ login: '', password: '' })
const editingUserId = ref(null)
const editingLogin = ref('')
const form = ref({
  teacher_id: '',
  role: 'teacher'
})
const message = ref('')

const selectedTeacher = computed(() =>
  teachers.value.find((teacher) => String(teacher.id) === String(form.value.teacher_id)) || null
)

const transliterate = (value = '') => {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', і: 'i', ї: 'i', й: 'i',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h',
    ц: 'c', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ъ: '', ы: 'y', э: 'e', ю: 'iu', я: 'ia',
    А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Є: 'Ie', Ж: 'Zh', З: 'Z', І: 'I', Ї: 'I', Й: 'I',
    К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'H',
    Ц: 'C', Ч: 'Ch', Ш: 'Sh', Щ: 'Shch', Ь: '', Ъ: '', Ы: 'Y', Э: 'E', Ю: 'Iu', Я: 'Ia'
  }

  return String(value)
    .split('')
    .map((char) => map[char] ?? char)
    .join('')
    .replace(/[^A-Za-z]/g, '')
}

const normalizeLogin = (value = '') => String(value || '')
  .trim()
  .replace(/\s+/g, '_')
  .replace(/[^A-Za-z0-9_]/g, '')
  .replace(/_+/g, '_')
  .toLowerCase()

const generateCredentialPair = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
  const surname = parts[0] || 'User'
  const first = parts[1] || 'User'

  const surnameEn = transliterate(surname) || 'User'
  const firstEn = transliterate(first) || 'User'

  const login = normalizeLogin(`${surnameEn}_${firstEn}`) || 'user_name'
  const password = `${surnameEn}${firstEn}${String(Math.floor(Math.random() * 900 + 100))}!`

  return {
    login,
    password
  }
}

const ensureCreds = () => {
  const fullName = selectedTeacher.value?.full_name || ''
  if (!fullName) {
    currentPreview.value = { login: '', password: '' }
    return
  }

  currentPreview.value = generateCredentialPair(fullName)
}

const refreshPreview = () => {
  if (!selectedTeacher.value) {
    currentPreview.value = { login: '', password: '' }
    message.value = 'Спочатку виберіть викладача.'
    return
  }

  ensureCreds()
  message.value = ''
}

const loadTeachers = async () => {
  try {
    const response = await api.get('/teachers')
    teachers.value = Array.isArray(response.data) ? response.data : []
  } catch (e) {
    console.error('Не вдалося завантажити викладачів', e)
  }
}

const loadUsers = async () => {
  loading.value = true
  try {
    const response = await api.get('/auth/users')
    users.value = Array.isArray(response.data) ? response.data : []
  } catch (e) {
    message.value = e.response?.data?.message || 'Не вдалося завантажити користувачів.'
  } finally {
    loading.value = false
  }
}

const submit = async () => {
  if (!selectedTeacher.value) {
    message.value = 'Оберіть викладача зі списку.'
    return
  }

  if (!currentPreview.value.login || !currentPreview.value.password) {
    refreshPreview()
    return
  }

  submitting.value = true
  message.value = ''

  try {
    const response = await api.post('/auth/users', {
      full_name: selectedTeacher.value.full_name,
      role: form.value.role,
      teacher_id: selectedTeacher.value.id
    })

    message.value = `Користувача створено. Логін: ${response.data.login}. Пароль: ${response.data.password}`
    form.value = {
      teacher_id: '',
      role: 'teacher'
    }
    currentPreview.value = { login: '', password: '' }
    generatePreview.value = false
    await loadUsers()
  } catch (e) {
    message.value = e.response?.data?.message || 'Не вдалося створити користувача.'
  } finally {
    submitting.value = false
  }
}

const startEditLogin = (user) => {
  editingUserId.value = user.id
  editingLogin.value = user.login || ''
}

const cancelEditLogin = () => {
  editingUserId.value = null
  editingLogin.value = ''
}

const saveLoginEdit = async (userId) => {
  const login = normalizeLogin(editingLogin.value)

  if (!login) {
    message.value = 'Логін не може бути порожнім.'
    return
  }

  try {
    const response = await api.put(`/auth/users/${userId}/login`, { login })
    message.value = response.data?.message || 'Логін оновлено.'
    cancelEditLogin()
    await loadUsers()
  } catch (e) {
    message.value = e.response?.data?.message || 'Не вдалося змінити логін.'
  }
}

watch(selectedTeacher, () => {
  if (!selectedTeacher.value) {
    currentPreview.value = { login: '', password: '' }
    return
  }

  generatePreview.value = true
  ensureCreds()
}, { immediate: true })

onMounted(async () => {
  await loadTeachers()
  await loadUsers()
})
</script>

<template>
  <div class="users-page">
    <div class="page-header">
      <div>
        <h1>Користувачі системи</h1>
        <p>Автоматичне формування логіну та пароля за вибраним викладачем</p>
      </div>
    </div>

    <div v-if="message" class="message-box">
      {{ message }}
    </div>

    <div class="panel">
      <h2>Створити обліковий запис</h2>
      <form class="user-form" @submit.prevent="submit">
        <label>
          <span>Викладач</span>
          <select v-model="form.teacher_id">
            <option value="">Оберіть викладача</option>
            <option v-for="teacher in teachers" :key="teacher.id" :value="String(teacher.id)">
              {{ teacher.full_name }}
            </option>
          </select>
        </label>

        <div class="two-columns">
          <label>
            <span>Роль</span>
            <select v-model="form.role">
              <option value="admin">Адміністратор</option>
              <option value="chair">Голова ЦК</option>
              <option value="teacher">Викладач</option>
            </select>
          </label>

          <label>
            <span>Прив’язка</span>
            <input :value="selectedTeacher ? selectedTeacher.full_name : '—'" disabled />
          </label>
        </div>

        <div v-if="selectedTeacher" class="preview-box">
          <div class="preview-row">
            <span>Логін</span>
            <strong>{{ currentPreview.login || '—' }}</strong>
          </div>
          <div class="preview-row">
            <span>Пароль</span>
            <strong>{{ currentPreview.password || '—' }}</strong>
          </div>

          <div class="preview-actions">
            <button type="button" class="secondary-button" @click="refreshPreview">
              Згенерувати ще раз
            </button>
          </div>
        </div>

        <button type="submit" class="primary-button" :disabled="submitting || !selectedTeacher">
          {{ submitting ? 'Створення...' : 'Створити користувача' }}
        </button>
      </form>
    </div>

    <div class="panel">
      <h2>Список користувачів</h2>
      <div v-if="loading" class="loading">Завантаження...</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ПІБ</th>
              <th>Логін</th>
              <th>Роль</th>
              <th>Прив’язка</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>{{ user.full_name }}</td>
              <td>
                <div v-if="editingUserId === user.id" class="login-edit-wrap">
                  <input v-model="editingLogin" class="login-edit-input" />
                  <div class="inline-actions">
                    <button type="button" class="small-button" @click="saveLoginEdit(user.id)">Зберегти</button>
                    <button type="button" class="small-button secondary" @click="cancelEditLogin">Скасувати</button>
                  </div>
                </div>
                <div v-else class="login-readonly">
                  <span>{{ user.login }}</span>
                  <button type="button" class="small-button" @click="startEditLogin(user)">Змінити</button>
                </div>
              </td>
              <td>{{ user.role_label }}</td>
              <td>{{ user.teacher_name || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.users-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header h1 {
  margin: 0;
  font-size: 2rem;
}

.page-header p {
  margin: 6px 0 0;
  color: #6b7280;
}

.login-readonly,
.login-edit-wrap,
.inline-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.login-edit-wrap {
  flex-wrap: wrap;
}

.login-edit-input {
  min-width: 150px;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
}

.small-button {
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: white;
  padding: 6px 10px;
  cursor: pointer;
}

.small-button.secondary {
  background: #e5e7eb;
  color: #111827;
}

.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 18px;
  padding: 18px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
}

.panel h2 {
  margin: 0 0 14px;
}

.user-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.user-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #374151;
}

.user-form input,
.user-form select {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
}

.two-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.preview-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: #374151;
}

.preview-actions {
  display: flex;
  justify-content: flex-end;
}

.primary-button,
.secondary-button {
  border: none;
  border-radius: 10px;
  padding: 11px 16px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.primary-button {
  align-self: flex-start;
  background: #2563eb;
  color: #fff;
}

.secondary-button {
  background: #eef2ff;
  color: #1f2937;
}

.message-box {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
  border-radius: 12px;
  padding: 12px 14px;
}

.table-wrap {
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
  padding: 12px 10px;
}

th {
  color: #475569;
  font-size: 0.8rem;
  text-transform: uppercase;
}

.loading {
  color: #475569;
}
</style>
