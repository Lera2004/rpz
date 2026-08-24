<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import api from '../services/api.js'

const allTasks = ref([])
const allTeachers = ref([])
const loading = ref(false)
const formOpen = ref(false)
const editingTaskId = ref(null)
const selectedTeacherId = ref('')
const search = ref('')
const statusFilter = ref('all')
const priorityFilter = ref('all')
const teacherFilter = ref('all')
const submitting = ref(false)
const error = ref('')
const selectedTask = ref(null)
const selectedMonthIndex = ref(0)
// view mode for tasks page: 'calendar' or 'dashboard'

const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem('ped_user') || 'null')
  } catch {
    return null
  }
}

const currentUser = computed(() => getCurrentUser())
const isAdmin = computed(() => currentUser.value?.role === 'admin')
const isChair = computed(() => currentUser.value?.role === 'chair')
const canManageTasks = computed(() => isAdmin.value || isChair.value)
const currentTeacherId = computed(() => Number(currentUser.value?.teacher_id || currentUser.value?.id || 0))

const taskMonthOrder = ['Вересень', 'Жовтень', 'Листопад', 'Грудень', 'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень']

const statusOptions = [
  { value: 'all', label: 'Усі статуси' },
  { value: 'not_started', label: 'Не виконано' },
  { value: 'in_progress', label: 'В процесі' },
  { value: 'completed', label: 'Виконано' }
]

const priorityOptions = [
  { value: 'all', label: 'Усі пріоритети' },
  { value: 'high', label: 'Високий' },
  { value: 'medium', label: 'Середній' },
  { value: 'low', label: 'Низький' }
]

const taskForm = ref({
  title: '',
  description: '',
  deadline: '',
  priority: 'medium',
  select_all: false,
  teacher_ids: []
})

const statusColors = {
  not_started: 'status-not-started',
  in_progress: 'status-in-progress',
  completed: 'status-completed'
}

const priorityColors = {
  low: 'priority-low',
  medium: 'priority-medium',
  high: 'priority-high'
}

const summary = computed(() => {
  const total = allTasks.value.length
  const completed = allTasks.value.filter((task) => task.assignments?.some((assignment) => assignment.status === 'completed')).length
  const inProgress = allTasks.value.filter((task) => task.assignments?.some((assignment) => assignment.status === 'in_progress')).length
  const notStarted = allTasks.value.filter((task) => task.assignments?.some((assignment) => assignment.status === 'not_started')).length

  return { total, completed, inProgress, notStarted }
})

const chairTeachers = computed(() =>
  allTeachers.value.filter((teacher) => {
    const name = String(teacher.commission_name || teacher.commission || '').trim()
    return name.toLowerCase() === 'інженерія програмного забезпечення'
  })
)

const selectableTeachers = computed(() => chairTeachers.value)

const getMonthLabelFromDate = (value) => {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const jsMonth = date.getMonth()
  const monthIndex = (jsMonth + 12 - 8) % 12
  return taskMonthOrder[monthIndex] || null
}

const calendarMonths = computed(() => {
  const months = new Set()

  allTasks.value.forEach((task) => {
    const month = getMonthLabelFromDate(task.deadline)
    if (month) months.add(month)
  })

  return taskMonthOrder.filter((month) => months.has(month))
})

const selectedMonthLabel = computed(() => {
  if (!calendarMonths.value.length) return taskMonthOrder[0]
  return calendarMonths.value[selectedMonthIndex.value] || calendarMonths.value[0]
})

const visibleTasks = computed(() => {
  const tasks = allTasks.value

  return tasks.filter((task) => {
    const titleMatch = task.title.toLowerCase().includes(search.value.toLowerCase())
    const priorityMatch = priorityFilter.value === 'all' || task.priority === priorityFilter.value
    const teacherMatch = teacherFilter.value === 'all' || task.assignments.some((assignment) => String(assignment.teacher_id) === String(teacherFilter.value))
    const statusMatch = statusFilter.value === 'all' || task.assignments.some((assignment) => assignment.status === statusFilter.value)

    return titleMatch && priorityMatch && teacherMatch && statusMatch
  })
})

const selectedMonthTasks = computed(() => {
  return visibleTasks.value.filter((task) => {
    const monthLabel = getMonthLabelFromDate(task.deadline)
    return monthLabel === selectedMonthLabel.value
  })
})

const tasksByDay = computed(() => {
  const map = {}
  selectedMonthTasks.value.forEach((task) => {
    if (!task || !task.deadline) return
    const date = new Date(task.deadline)
    if (Number.isNaN(date.getTime())) return
    const day = String(date.getDate())
    if (!map[day]) map[day] = []
    map[day].push(task)
  })
  return map
})


const formatDate = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date)
}

const getAssignmentStatus = (assignment) => assignment?.status_label || 'Не виконано'

const canEditAssignment = (assignment) => {
  if (!assignment) return false
  if (canManageTasks.value) return true
  return Number(currentTeacherId.value) === Number(assignment.teacher_id)
}

const openTaskDetails = (task) => {
  selectedTask.value = task
}

const closeTaskDetails = () => {
  selectedTask.value = null
}

const getTaskProgress = (task) => {
  if (!task.assignments?.length) return '0 / 0'

  const completed = task.assignments.filter((assignment) => assignment.status === 'completed').length
  return `${completed} / ${task.assignments.length}`
}

const getTeacherSummary = (task) => {
  if (!task.assignments?.length) return 'Викладачі не призначені'

  const completed = task.assignments.filter((assignment) => assignment.status === 'completed').length
  const total = task.assignments.length
  return `${completed} із ${total} викладачів виконали`
}

const changeMonth = (delta) => {
  if (!calendarMonths.value.length) return

  const maxIndex = calendarMonths.value.length - 1
  selectedMonthIndex.value = Math.min(maxIndex, Math.max(0, selectedMonthIndex.value + delta))
}

const loadTeachers = async () => {
  try {
    const response = await api.get('/teachers')
    allTeachers.value = Array.isArray(response.data) ? response.data : []
  } catch (e) {
    console.error('Не вдалося завантажити викладачів', e)
  }
}

const loadTasks = async () => {
  loading.value = true
  error.value = ''

  try {
    const teacherId = currentTeacherId.value || selectedTeacherId.value
    const response = canManageTasks.value
      ? await api.get('/tasks')
      : await api.get('/tasks/my', { params: { teacher_id: teacherId } })

    const normalized = Array.isArray(response.data) ? response.data : []
    allTasks.value = normalized.map((task) => ({
      ...task,
      assignments: Array.isArray(task.assignments) ? task.assignments : []
    }))
  } catch (e) {
    error.value = e.response?.data?.message || 'Не вдалося завантажити завдання.'
  } finally {
    loading.value = false
  }
}

const closeForm = () => {
  formOpen.value = false
  editingTaskId.value = null
  taskForm.value = {
    title: '',
    description: '',
    deadline: '',
    priority: 'medium',
    select_all: false,
    teacher_ids: []
  }
}

const syncSelectAllState = () => {
  const allTeacherIds = selectableTeachers.value.map((teacher) => Number(teacher.id))
  taskForm.value.select_all = allTeacherIds.length > 0 && allTeacherIds.every((teacherId) => taskForm.value.teacher_ids.includes(teacherId))
}

const toggleTeacherSelection = (teacherId) => {
  const id = Number(teacherId)
  const ids = [...taskForm.value.teacher_ids]
  const foundIndex = ids.indexOf(id)

  if (foundIndex >= 0) {
    ids.splice(foundIndex, 1)
  } else {
    ids.push(id)
  }

  taskForm.value.teacher_ids = ids
  syncSelectAllState()
}

const selectAllTeachers = (event) => {
  const isChecked = event?.target?.checked ?? !taskForm.value.select_all

  taskForm.value.teacher_ids = isChecked
    ? selectableTeachers.value.map((teacher) => Number(teacher.id))
    : []
  taskForm.value.select_all = isChecked
}

const submitTask = async () => {
  const title = taskForm.value.title.trim()

  if (!title) {
    error.value = 'Назва завдання обов’язкова.'
    return
  }

  if (!taskForm.value.teacher_ids.length) {
    error.value = 'Оберіть хоча б одного викладача.'
    return
  }

  submitting.value = true
  error.value = ''

  try {
    const payload = {
      title,
      description: taskForm.value.description,
      deadline: taskForm.value.deadline,
      priority: taskForm.value.priority,
      teacher_ids: taskForm.value.teacher_ids,
      select_all: taskForm.value.select_all
    }

    if (editingTaskId.value) {
      await api.put(`/tasks/${editingTaskId.value}`, payload)
    } else {
      await api.post('/tasks', {
        ...payload,
        created_by: chairTeachers.value[0]?.id || null
      })
    }

    closeForm()
    await loadTasks()
  } catch (e) {
    error.value = e.response?.data?.message || (editingTaskId.value ? 'Не вдалося оновити завдання.' : 'Не вдалося створити завдання.')
  } finally {
    submitting.value = false
  }
}

const setAssignmentStatus = async (task, assignment, nextStatus) => {
  if (!assignment || assignment.status === nextStatus) return

  try {
    const response = await api.patch(`/tasks/${task.id}/assignments/${assignment.id}/status`, { status: nextStatus })
    const index = task.assignments.findIndex((item) => item.id === assignment.id)
    if (index >= 0) {
      task.assignments[index] = {
        ...task.assignments[index],
        ...response.data,
        status_label: response.data.status === 'not_started' ? 'Не виконано' : response.data.status === 'in_progress' ? 'В процесі' : 'Виконано'
      }
    }

    await loadTasks()
  } catch (e) {
    error.value = e.response?.data?.message || 'Не вдалося оновити статус.'
  }
}

const openCreateTask = () => {
  closeForm()
  formOpen.value = true
}

const openEditTask = (task) => {
  editingTaskId.value = task.id
  taskForm.value = {
    title: task.title || '',
    description: task.description || '',
    deadline: task.deadline || '',
    priority: task.priority || 'medium',
    select_all: false,
    teacher_ids: Array.isArray(task.assignments)
      ? task.assignments.map((assignment) => Number(assignment.teacher_id)).filter(Boolean)
      : []
  }
  formOpen.value = true
}

const deleteTask = async (task) => {
  if (!task?.id) return

  const confirmed = window.confirm(`Видалити завдання "${task.title}"?`)
  if (!confirmed) return

  try {
    await api.delete(`/tasks/${task.id}`)
    if (selectedTask.value?.id === task.id) {
      selectedTask.value = null
    }
    await loadTasks()
  } catch (e) {
    error.value = e.response?.data?.message || 'Не вдалося видалити завдання.'
  }
}

watch(canManageTasks, async () => {
  if (canManageTasks.value) {
    teacherFilter.value = 'all'
  }
  await loadTasks()
}, { immediate: true })

watch(selectedTeacherId, async () => {
  if (!canManageTasks.value) {
    await loadTasks()
  }
})

onMounted(async () => {
  await loadTeachers()
  if (!chairTeachers.value.length) {
    error.value = 'У БД не знайдено викладачів комісії "Інженерія програмного забезпечення".'
    return
  }

  if (!canManageTasks.value && !selectedTeacherId.value && currentTeacherId.value) {
    selectedTeacherId.value = String(currentTeacherId.value)
  }

  await loadTasks()
})
</script>

<template>
  <div class="tasks-page">
    "C:\OSPanel\modules\database\MySQL-8.0-Win10\bin\mysql.exe" -h be76zvpgpzz8wks2a5ol-mysql.services.clever-cloud.com -P 3306 -u usfwhwsue1rpzeu4 -p be76zvpgpzz8wks2a5ol    <div class="page-header">
        <div>
          <h1>Завдання</h1>
        <p>Циклова комісія «Інженерія програмного забезпечення»</p>
      </div>

      <button v-if="canManageTasks" class="primary-button" type="button" @click="openCreateTask">
        + Створити завдання
      </button>
        </div>

    <div v-if="error" class="error-message">
      {{ error }}
        </div>

    <div class="summary-grid">
      <div class="summary-card total">
        <span>Всього</span>
        <strong>{{ summary.total }}</strong>
          </div>
      <div class="summary-card completed">
        <span>Виконано</span>
        <strong>{{ summary.completed }}</strong>
          </div>
      <div class="summary-card in-progress">
        <span>В процесі</span>
        <strong>{{ summary.inProgress }}</strong>
        </div>
      <div class="summary-card not-started">
        <span>Не виконано</span>
        <strong>{{ summary.notStarted }}</strong>
        </div>
      </div>

    <div class="toolbar">
      <div v-if="canManageTasks" class="toolbar-group">
        <label for="teacher-filter">Викладач комісії:</label>
        <select id="teacher-filter" v-model="teacherFilter">
            <option value="all">Усі викладачі</option>
          <option v-for="teacher in chairTeachers" :key="teacher.id" :value="String(teacher.id)">
            {{ teacher.full_name }}
          </option>
          </select>
      </div>

      <div class="toolbar-group">
        <label for="status-filter">Статус:</label>
        <select id="status-filter" v-model="statusFilter">
          <option v-for="option in statusOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
          </select>
      </div>

      <div class="toolbar-group">
        <label for="priority-filter">Пріоритет:</label>
        <select id="priority-filter" v-model="priorityFilter">
          <option v-for="option in priorityOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
          </select>
        </div>

      <div class="toolbar-group search-box">
        <label for="task-search">Пошук:</label>
        <input id="task-search" v-model="search" type="text" placeholder="Назва завдання" />
      </div>
    </div>

    <div v-if="loading" class="loading-box">Завантаження завдань...</div>

    <div v-else-if="!calendarMonths.length || !selectedMonthTasks.length" class="empty-box">
      За вашим фільтру немає завдань у {{ selectedMonthLabel }}.
    </div>

    <div v-else class="calendar-section">
      <div class="month-nav">
        <button type="button" @click="changeMonth(-1)">← Попередній</button>
        <strong>{{ selectedMonthLabel }}</strong>
        <button type="button" @click="changeMonth(1)">Наступний →</button>
          </div>

      <div class="calendar-grid">
        <div class="calendar-day" v-for="day in (Array.from({length:31}, (_,i)=>i+1))" :key="day">
          <div class="calendar-day-number">{{ day }}</div>
          <div v-if="tasksByDay[String(day)]" class="calendar-day-tasks">
            <div v-for="task in tasksByDay[String(day)]" :key="task.id" class="calendar-task-pill" @click.stop="openTaskDetails(task)">
              {{ task.title }}
            </div>
          </div>
        </div>
      </div>

      <div class="task-list">
        <article v-for="task in selectedMonthTasks" :key="task.id" class="task-card task-card-clickable" @click="openTaskDetails(task)">
          <div class="task-header">
            <div>
              <h3>{{ task.title }}</h3>
              <p class="task-meta">Термін: {{ formatDate(task.deadline) }}</p>
            </div>
            <span :class="['priority-pill', priorityColors[task.priority]]">{{ task.priority_label }}</span>
        </div>

          <p class="task-description">{{ task.description || 'Опис не зазначений.' }}</p>

          <div class="task-progress-row">
            <span>Прогрес:</span>
            <strong>{{ getTeacherSummary(task) }}</strong>
        </div>

          <div v-if="task.assignments?.length" class="assignments-list">
            <div v-for="assignment in task.assignments" :key="assignment.id" class="assignment-item">
              <div class="assignment-teacher">
                <span>{{ assignment.teacher_name }}</span>
              </div>

              <span :class="['assignment-status', statusColors[assignment.status]]">
                {{ getAssignmentStatus(assignment) }}
              </span>

              <div v-if="canEditAssignment(assignment)" class="assignment-actions">
                <button type="button" class="status-button" @click.stop="setAssignmentStatus(task, assignment, 'not_started')">Не виконано</button>
                <button type="button" class="status-button" @click.stop="setAssignmentStatus(task, assignment, 'in_progress')">В процесі</button>
                <button type="button" class="status-button" @click.stop="setAssignmentStatus(task, assignment, 'completed')">Виконано</button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>

    <!-- Modals and forms remain unchanged -->
    <div v-if="selectedTask" class="modal-backdrop" @click.self="closeTaskDetails">
      <div class="modal task-detail-modal">
        <div class="modal-header">
          <h2>{{ selectedTask.title }}</h2>
          <button type="button" class="close-button" @click="closeTaskDetails">×</button>
        </div>

        <div class="task-detail-grid">
          <div class="detail-block">
            <span class="detail-label">Пріоритет</span>
            <span :class="['priority-pill', priorityColors[selectedTask.priority]]">{{ selectedTask.priority_label }}</span>
          </div>
          <div class="detail-block">
            <span class="detail-label">Термін</span>
            <strong>{{ formatDate(selectedTask.deadline) }}</strong>
          </div>
          <div class="detail-block">
            <span class="detail-label">Прогрес</span>
            <strong>{{ getTaskProgress(selectedTask) }}</strong>
          </div>
        </div>

        <div class="detail-section">
          <span class="detail-label">Опис</span>
          <p>{{ selectedTask.description || 'Опис не зазначений.' }}</p>
        </div>

        <div class="detail-section">
          <span class="detail-label">Статуси викладачів</span>

          <div v-if="selectedTask.assignments?.length" class="detail-assignments">
            <div v-for="assignment in selectedTask.assignments" :key="assignment.id" class="detail-assignment-item">
              <div>
                <strong>{{ assignment.teacher_name }}</strong>
              </div>

              <span :class="['assignment-status', statusColors[assignment.status]]">
                {{ getAssignmentStatus(assignment) }}

              </span>

              <div v-if="canEditAssignment(assignment)" class="assignment-actions">
                <button type="button" class="status-button" @click.stop="setAssignmentStatus(selectedTask, assignment, 'not_started')">Не виконано</button>
                <button type="button" class="status-button" @click.stop="setAssignmentStatus(selectedTask, assignment, 'in_progress')">В процесі</button>
                <button type="button" class="status-button" @click.stop="setAssignmentStatus(selectedTask, assignment, 'completed')">Виконано</button>
              </div>
            </div>
          </div>

          <div v-else class="empty-box">Для цього завдання ще не призначено викладачів.</div>
        </div>

        <div v-if="canManageTasks" class="detail-actions">
          <button type="button" class="secondary-button" @click="openEditTask(selectedTask)">Редагувати</button>
          <button type="button" class="danger-button" @click="deleteTask(selectedTask)">Видалити</button>
        </div>
      </div>
    </div>


    <div v-if="formOpen" class="modal-backdrop" @click.self="closeForm">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editingTaskId ? 'Редагувати завдання' : 'Створити завдання' }}</h2>
          <button type="button" class="close-button" @click="closeForm">×</button>
        </div>

        <form class="task-form" @submit.prevent="submitTask">
          <label>
            <span>Назва завдання</span>
            <input v-model="taskForm.title" type="text" placeholder="Наприклад: Перевірити робочі програми" />
          </label>

          <label>
            <span>Опис</span>
            <textarea v-model="taskForm.description" rows="4" placeholder="Коротко опишіть завдання"></textarea>
          </label>

          <div class="two-columns">
            <label>
              <span>Кінцевий термін</span>
              <input v-model="taskForm.deadline" type="date" />
            </label>

            <label>
              <span>Пріоритет</span>
              <select v-model="taskForm.priority">
                <option value="high">Високий</option>
                <option value="medium">Середній</option>
                <option value="low">Низький</option>
              </select>
            </label>
          </div>

          <div class="teacher-selector">
            <div class="checkbox-row">
              <label>
                <input :checked="taskForm.select_all" type="checkbox" @change="selectAllTeachers" />
                <span>Обрати всіх викладачів</span>
              </label>
            </div>

            <div class="teacher-list">
              <label v-for="teacher in selectableTeachers" :key="teacher.id" class="teacher-checkbox">
                <input
                  type="checkbox"
                  :checked="taskForm.teacher_ids.includes(Number(teacher.id))"
                  @change="toggleTeacherSelection(teacher.id)"
                />
                <span>{{ teacher.full_name }}</span>
              </label>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="secondary-button" @click="closeForm">Скасувати</button>
            <button type="submit" class="primary-button" :disabled="submitting">
              {{ submitting ? (editingTaskId ? 'Оновлення...' : 'Створення...') : (editingTaskId ? 'Оновити завдання' : 'Створити завдання') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tasks-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.page-header h1 {
  margin: 0;
  font-size: 2rem;
}

.page-header p {
  margin: 6px 0 0;
  color: #6b7280;
}

.primary-button,
.secondary-button,
.danger-button,
.close-button,
.status-button {
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font: inherit;
}

.primary-button {
  background: #2563eb;
  color: #fff;
  padding: 10px 16px;
  font-weight: 600;
}

.secondary-button {
  background: #edf2ff;
  color: #1f2937;
  padding: 10px 14px;
}

.danger-button {
  background: #fee2e2;
  color: #991b1b;
  padding: 10px 14px;
}

.detail-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.summary-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.summary-card span {
  display: block;
  font-size: 0.8rem;
  color: #6b7280;
  margin-bottom: 8px;
}

.summary-card strong {
  font-size: 2rem;
  color: #111827;
}

.summary-card.total { border-left: 6px solid #2563eb; }
.summary-card.completed { border-left: 6px solid #10b981; }
.summary-card.in-progress { border-left: 6px solid #f59e0b; }
.summary-card.not-started { border-left: 6px solid #ef4444; }

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 14px 16px;
}

.toolbar-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 160px;
}

.toolbar-group label {
  font-size: 0.72rem;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.toolbar-group select,
.toolbar-group input,
.task-form input,
.task-form textarea,
.task-form select {
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 9px 10px;
  font: inherit;
  background: #fff;
}

.search-box {
  flex: 1;
  min-width: 220px;
}

.calendar-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.month-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 16px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}

.month-nav button {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  padding: 8px 12px;
  font: inherit;
  cursor: pointer;
}

.month-nav strong {
  font-size: 1.1rem;
  color: #0f172a;
}

.task-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.task-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.03);
}

.task-card-clickable {
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}

.task-card-clickable:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 20px rgba(15, 23, 42, 0.06);
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 10px;
}

.task-header h3 {
  margin: 0;
  font-size: 1.15rem;
  color: #111827;
}

.task-meta {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 0.8rem;
}

.priority-pill {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
}

.priority-low { background: #e0f2fe; color: #0369a1; }
.priority-medium { background: #fef3c7; color: #92400e; }
.priority-high { background: #fee2e2; color: #991b1b; }

.task-description {
  margin: 0 0 12px;
  line-height: 1.5;
  color: #4b5563;
}

.task-progress-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.82rem;
  color: #374151;
  margin-bottom: 12px;
}

.assignments-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.assignment-item {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.assignment-teacher {
  font-weight: 600;
  color: #1f2937;
}

.assignment-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 9px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
}

.status-not-started { background: #fee2e2; color: #b91c1c; }
.status-in-progress { background: #fef3c7; color: #b45309; }
.status-completed { background: #dcfce7; color: #15803d; }

.assignment-actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 5px;
}

.status-button {
  padding: 5px 7px;
  background: #eef2ff;
  color: #1f2937;
  font-size: 0.72rem;
}

.loading-box,
.empty-box,
.error-message {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
}

.error-message {
  border-color: #fecaca;
  background: #fff1f2;
  color: #b91c1c;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}

.modal {
  width: min(760px, calc(100vw - 24px));
  background: #fff;
  border-radius: 18px;
  padding: 20px;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.modal-header h2 {
  margin: 0;
}

.close-button {
  width: 36px;
  height: 36px;
  background: #f3f4f6;
  font-size: 1.4rem;
}

.task-detail-modal {
  max-height: min(90vh, 820px);
  overflow: auto;
}

.task-detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.detail-block,
.detail-section {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
}

.detail-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.detail-section p {
  margin: 0;
  line-height: 1.6;
  color: #374151;
}

.detail-assignments {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-assignment-item {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) auto auto;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
}

.task-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.task-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #374151;
  font-size: 0.82rem;
}

.two-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.teacher-selector {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.checkbox-row {
  display: flex;
  align-items: center;
}

.checkbox-row label,
.teacher-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #1f2937;
}

.teacher-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
  max-height: 260px;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 10px;
  background: #f8fafc;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

.view-toggle{display:flex;gap:8px;margin-bottom:8px}
.view-btn{padding:8px 12px;border-radius:10px;border:1px solid #e5e7eb;background:#fff;cursor:pointer}
.view-btn.active{background:#2563eb;color:#fff;border-color:transparent}
.dashboard-grid{display:grid;grid-template-columns:1fr 360px;gap:16px}
.upcoming-tasks.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px}
.mini-task{padding:10px;border-bottom:1px solid #f3f4f6;cursor:pointer}
.mini-task-title{font-weight:600}
.mini-task-meta{font-size:0.82rem;color:#6b7280}
.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;background:#fff;padding:12px;border:1px solid #e5e7eb;border-radius:12px}
.calendar-day{min-height:80px;padding:8px;border-radius:8px;background:#f8fafc;border:1px solid #f1f5f9}
.calendar-day-number{font-size:0.8rem;color:#6b7280;margin-bottom:6px}
.calendar-task-pill{background:#eff6ff;padding:6px 8px;border-radius:8px;font-size:0.85rem;margin-bottom:6px;cursor:pointer}

@media (max-width: 760px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .two-columns,
  .assignment-item {
    grid-template-columns: 1fr;
  }
}
</style>
