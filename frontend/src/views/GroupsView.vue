<template>

  <div class="groups-page">

    <!-- ================================= -->
    <!-- Заголовок -->
    <!-- ================================= -->

    <div class="page-header">
      <div class="title-wrap">
        <div class="title-badge">G</div>
        <div>
          <h1>Групи</h1>
          <p>Контингент студентів</p>
        </div>
      </div>

      <div class="page-actions">
        <button class="add-button" @click="openAddForm">+ Додати групу</button>
        <label class="import-button">
          <input
            ref="fileInput"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            @change="handleFileChange"
            hidden
          />
          <span>Імпорт CSV</span>
        </label>
      </div>
    </div>

    <div v-if="importMessage" class="import-message">
      {{ importMessage }}
    </div>

    <div v-if="importLoading" class="loading compact">
      Імпорт файлу...
    </div>

    <!-- ================================= -->
    <!-- Повідомлення про помилку -->
    <!-- ================================= -->

    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>

    <!-- ================================= -->
    <!-- Статистика -->
    <!-- ================================= -->

    <div class="stats-grid">
      <div class="stat-card primary">
        <span>Всього груп</span>
        <strong>{{ groupStats.totalGroups }}</strong>
        <small>активні записи</small>
      </div>

      <div class="stat-card blue">
        <span>Студентів</span>
        <strong>{{ groupStats.totalStudents }} <small>(активних: {{ groupStats.activeStudents }})</small></strong>
        <small>усі студенти у вибірці</small>
      </div>

      <div class="stat-card green">
        <span>Бюджет</span>
        <strong>{{ groupStats.budgetCount }} <small>(активних: {{ groupStats.activeBudgetCount }})</small></strong>
        <small>усі бюджетники</small>
      </div>

      <div class="stat-card amber">
        <span>Контракт</span>
        <strong>{{ groupStats.contractCount }} <small>(активних: {{ groupStats.activeContractCount }})</small></strong>
        <small>усі контрактники</small>
      </div>
    </div>

    <div class="status-lists">
      <div class="status-list-panel academic-panel">
        <div class="status-list-header">
          <h3>В академічній відпустці</h3>
          <span>{{ academicLeaveApplicantsList.length }}</span>
        </div>
        <div v-if="!academicLeaveApplicantsList.length" class="empty-state compact-empty">Немає студентів</div>
        <div v-for="student in academicLeaveApplicantsList" :key="student.id" class="status-student-row">
          <div><strong>{{ student.applicant || '—' }}</strong><span>{{ student.group_name || 'Без групи' }} · {{ student.specialty || '—' }} · {{ student.course || '—' }} курс · {{ student.funding_source || '—' }}</span></div>
          <button class="edit-button small" type="button" @click="openApplicantEditor(student.group_id, student)">Редагувати</button>
        </div>
      </div>
      <div class="status-list-panel dismissed-panel">
        <div class="status-list-header">
          <h3>Відраховані</h3>
          <span>{{ dismissedApplicantsList.length }}</span>
        </div>
        <div v-if="!dismissedApplicantsList.length" class="empty-state compact-empty">Немає студентів</div>
        <div v-for="student in dismissedApplicantsList" :key="student.id" class="status-student-row">
          <div><strong>{{ student.applicant || '—' }}</strong><span>{{ student.group_name || 'Без групи' }} · {{ student.specialty || '—' }} · {{ student.course || '—' }} курс · {{ student.funding_source || '—' }}</span></div>
          <button class="edit-button small" type="button" @click="openApplicantEditor(student.group_id, student)">Редагувати</button>
        </div>
      </div>
    </div>

    <!-- ================================= -->
    <!-- Пошук та фільтри -->
    <!-- ================================= -->

    <div class="toolbar">
      <div class="filter-group">
        <select v-model="selectedSpecialty" @change="applyGroupFilter">
          <option value="all">Всі спеціальності</option>
          <option v-for="specialty in specialtyOptions" :key="specialty" :value="specialty">
            {{ specialty }}
          </option>
        </select>

        <select v-model="courseFilter" @change="applyGroupFilter">
          <option value="all">Всі курси</option>
          <option v-for="course in courseOptions" :key="course" :value="course">
            {{ course }} курс
          </option>
        </select>

        <div class="student-search-box">
          <input
            v-model="studentSearchQuery"
            type="text"
            placeholder="Пошук студента за ПІБ"
            @input="searchStudentByName"
          />
        </div>

        <button v-if="hasActiveFilters" class="reset-button" type="button" @click="resetFilters">
          Скинути
        </button>
      </div>

    </div>

    <div v-if="studentSearchResults.length" class="student-search-results">
      <h3>Результати пошуку</h3>
      <div class="student-search-items">
        <button
          v-for="match in studentSearchResults"
          :key="match.id"
          type="button"
          class="student-search-item"
          @click="focusApplicant(match)"
        >
          <strong>{{ match.applicant }}</strong>
          <span>{{ match.group_name || 'Без групи' }}</span>
        </button>
      </div>
    </div>

    <div v-if="filteredUngroupedApplicants.length" class="ungrouped-panel">
      <h3>Студенти без групи</h3>
      <div class="ungrouped-list">
        <div v-for="student in filteredUngroupedApplicants" :key="student.id" class="ungrouped-row">
          <div class="ungrouped-main">
            <strong>{{ student.applicant || '—' }}</strong>
            <span>{{ student.funding_source || '—' }} · {{ student.specialty || '—' }}</span>
          </div>
          <div class="ungrouped-actions">
            <button class="ungrouped-edit-button" type="button" @click="openApplicantEditor(null, student)">Редагувати</button>
          </div>
        </div>
      </div>
    </div>

    <div class="utility-row">
      <button class="history-trigger" type="button" @click="openHistoryModal">
        Подивитися історію дій
      </button>
    </div>

    <!-- ================================= -->
    <!-- Підсумки по спеціальностях -->
    <!-- ================================= -->

    <div v-if="specialtySummaries.length > 0" class="summary-container">
      <h2>Підсумки по спеціальностях</h2>
      <table class="summary-table">
        <thead>
          <tr>
            <th>Спеціальність</th>
            <th>Студентів</th>
            <th>Бюджет</th>
            <th>Контракт</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="summary in specialtySummaries" :key="summary.specialty">
            <td>{{ summary.specialty }}</td>
            <td>{{ summary.students_count }}</td>
            <td>{{ summary.budget_count }}</td>
            <td>{{ summary.contract_count }}</td>
          </tr>
          <tr class="summary-total">
            <td><strong>Всього</strong></td>
            <td><strong>{{ specialtySummaryTotal.students_count }}</strong></td>
            <td><strong>{{ specialtySummaryTotal.budget_count }}</strong></td>
            <td><strong>{{ specialtySummaryTotal.contract_count }}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>


    <!-- ================================= -->
    <!-- Завантаження -->
    <!-- ================================= -->

    <div
      v-if="loading"
      class="loading"
    >
      Завантаження даних...
    </div>


    <!-- ================================= -->
    <!-- Таблиця -->
    <!-- ================================= -->

    <div
      v-else
      class="table-container"
    >

      <table>

        <thead>

          <tr>

            <th>
              №
            </th>

            <th>
              Група
            </th>

            <th>
              Спеціальність
            </th>

            <th>
              Курс
            </th>

            <th>
              Бюджет
            </th>

            <th>
              Контракт
            </th>

            <th>
              Кількість студентів
            </th>

            <th>
              Дії
            </th>

          </tr>

        </thead>


        <tbody>


          <!-- Немає груп -->

          <tr v-if="groups.length === 0">
            <td colspan="8" class="empty">
              <div class="empty-state">
                <strong>Груп не знайдено</strong>
                <span>Спробуйте змінити пошук або фільтри.</span>
              </div>
            </td>
          </tr>

          <!-- Групи -->

          <template v-for="(group, index) in groups" :key="group.id">
            <tr class="group-row" :class="{ active: expandedGroupId === group.id, 'has-academic': Number(group.academic_leave_count || 0) > 0 }">
              <td>
                {{ index + 1 }}
              </td>

              <td>
                <button class="group-toggle" @click.stop="loadGroupApplicants(group)">
                  <span>{{ expandedGroupId === group.id ? '▾' : '▸' }}</span>
                  <strong>{{ group.name }}</strong>
                  <span v-if="Number(group.academic_leave_count || 0) > 0" class="academic-badge">Є академвідпустка: {{ group.academic_leave_count }}</span>
                </button>
              </td>

              <td>
                {{ group.specialty || '—' }}
              </td>

              <td>
                {{ group.course || '—' }}
              </td>

              <td>
                {{ group.budget_count ?? 0 }} <small>(активних: {{ group.active_budget_count ?? 0 }})</small>
              </td>

              <td>
                {{ group.contract_count ?? 0 }} <small>(активних: {{ group.active_contract_count ?? 0 }})</small>
              </td>

              <td>
                {{ group.all_students_count ?? group.applicant_count ?? 0 }} <small>(активних: {{ group.active_students_count ?? 0 }})</small>
              </td>

              <td class="actions">
                <button class="edit-button" @click="openEditForm(group)">
                  Редагувати
                </button>

                <button class="delete-button" @click="deleteGroup(group.id)">
                  Видалити
                </button>
              </td>
            </tr>

            <tr v-if="expandedGroupId === group.id">
              <td colspan="8" class="expanded-row">
                <div class="expanded-content">
                  <h3>Студенти групи {{ group.name }}</h3>

                  <div v-if="loadingApplicants && expandedGroupId === group.id" class="loading">
                    Завантаження студентів...
                  </div>

                  <div v-else>
                    <div class="applicants-groups">
                      <div class="applicants-section">
                        <h4>Основний список</h4>
                        <table class="nested-table">
                          <thead>
                            <tr>
                              <th>№</th>
                              <th>Здобувач</th>
                              <th>Джерело фінансування</th>
                              <th>Спеціальність</th>
                              <th>Код категорії</th>
                              <th>Дія</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-if="!regularApplicants(group.id).length">
                              <td colspan="6" class="empty">Заявників у основному списку не знайдено</td>
                            </tr>
                              <tr v-for="(applicant, ai) in regularApplicants(group.id)" :key="applicant.id || ai">
                              <td>{{ ai + 1 }}</td>
                              <td>{{ applicant.applicant || '—' }}</td>
                              <td>{{ applicant.funding_source || '—' }}</td>
                              <td>{{ applicant.specialty || '—' }}</td>
                              <td>{{ applicant.category_code || '—' }}</td>
                              <td>
                                <div class="inline-actions">
                                  <button
                                    class="edit-button small"
                                    @click.prevent="openApplicantEditor(group.id, applicant)"
                                  >
                                    Редагувати
                                  </button>
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div class="applicants-section accent">
                        <h4>В академічній відпустці</h4>
                        <div class="table-scroll-wrap">
                          <table class="nested-table">
                            <thead>
                              <tr>
                                <th>№</th>
                                <th>Здобувач</th>
                                <th>Джерело фінансування</th>
                                <th>Спеціальність</th>
                                <th>Код категорії</th>
                                <th>Статус з</th>
                                <th>Статус по</th>
                                <th>Дія</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr v-if="!academicLeaveApplicants(group.id).length">
                                <td colspan="8" class="empty">У академічній відпустці немає студентів</td>
                              </tr>
                              <tr v-for="(applicant, ai) in academicLeaveApplicants(group.id)" :key="applicant.id || ai">
                                <td>{{ ai + 1 }}</td>
                                <td>{{ applicant.applicant || '—' }}</td>
                                <td>{{ applicant.funding_source || '—' }}</td>
                                <td>{{ applicant.specialty || '—' }}</td>
                                <td>{{ applicant.category_code || '—' }}</td>
                                <td>{{ formatDateValue(applicant.academic_leave_from) }}</td>
                                <td>{{ formatDateValue(applicant.academic_leave_to) }}</td>
                                <td>
                                  <div class="inline-actions">
                                    <button
                                      class="edit-button small"
                                      @click.prevent="openApplicantEditor(group.id, applicant)"
                                    >
                                      Редагувати
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>

        </tbody>

      </table>

    </div>


    <!-- ================================= -->
    <!-- Модальне вікно -->
    <!-- ================================= -->

    <div
      v-if="showForm"
      class="modal-background"
      @click.self="closeForm"
    >


      <div class="modal">


        <!-- Заголовок -->

        <div class="modal-header">

          <h2>

            {{
              editingId
                ? 'Редагування групи'
                : 'Нова група'
            }}

          </h2>


          <button
            class="close-button"
            @click="closeForm"
          >
            ×
          </button>

        </div>


        <!-- Форма -->

        <form
          @submit.prevent="saveGroup"
        >


          <!-- Назва -->

          <div class="form-group">

            <label>
              Назва групи
            </label>


            <input
              v-model="form.name"
              type="text"
              placeholder="Наприклад: РПЗ 24 2/9"
              required
            />

          </div>


          <!-- Спеціальність -->

          <div class="form-group">

            <label>
              Спеціальність
            </label>


            <input
              v-model="form.specialty"
              type="text"
              placeholder="Розробка програмного забезпечення"
            />

          </div>


          <!-- Курс -->

          <div class="form-group">

            <label>
              Курс
            </label>


            <input
              v-model.number="form.course"
              type="number"
              min="1"
              max="4"
            />

          </div>


          <!-- Кількість студентів -->

          <div class="form-group">

            <label>
              Кількість студентів
            </label>


            <input
              v-model.number="form.students_count"
              type="number"
              min="0"
              required
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

              {{
                saving
                  ? 'Збереження...'
                  : 'Зберегти'
              }}

            </button>


          </div>


        </form>


      </div>

    </div>

    <div v-if="showHistoryModal" class="modal-background" @click.self="closeHistoryModal">
      <div class="modal history-modal">
        <div class="modal-header">
          <h2>Історія дій</h2>
          <button class="close-button" @click="closeHistoryModal">×</button>
        </div>

        <div v-if="applicantHistory.length" class="history-modal-body">
          <div v-for="event in applicantHistory" :key="event.id" class="history-item">
            <div class="history-main">
              <div class="history-row">
                <strong>{{ event.applicant_name || 'Студент' }}</strong>
                <span :class="['history-pill', getHistoryTone(event.action_type)]">
                  {{ event.action_label || 'Змінено' }}
                </span>
              </div>
              <div class="history-meta">
                <small>{{ event.group_name || 'Без групи' }}</small>
                <small>{{ formatDateTime(event.created_at) }}</small>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="empty-state compact-empty">
          <strong>Немає записів</strong>
          <span>Після змін у студентів тут з'явиться історія.</span>
        </div>
      </div>
    </div>

    <div v-if="showApplicantForm" class="modal-background" @click.self="closeApplicantForm">
      <div class="modal applicant-modal">
        <div class="modal-header">
          <h2>Редагування студента</h2>
          <button class="close-button" @click="closeApplicantForm">×</button>
        </div>

        <form @submit.prevent="saveApplicant">
          <div class="form-group">
            <label>ПІБ</label>
            <input v-model="applicantForm.applicant" type="text" required />
          </div>

          <div class="form-group">
            <label>Група</label>
            <select v-model="applicantForm.group_id">
              <option v-for="group in allGroups" :key="group.id" :value="group.id">
                {{ group.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>Джерело фінансування</label>
            <input v-model="applicantForm.funding_source" type="text" />
          </div>

          <div class="form-group">
            <label>Спеціальність</label>
            <input v-model="applicantForm.specialty" type="text" />
          </div>

          <div class="form-group">
            <label>Код категорії</label>
            <input v-model="applicantForm.category_code" type="text" />
          </div>

          <div class="form-group">
            <label>Статус</label>
            <select v-model="applicantForm.status">
              <option value="active">Активний студент</option>
              <option value="Надано академвідпустку">Надано академвідпустку</option>
              <option value="Повернено з академвідпустки">Повернено з академвідпустки</option>
              <option value="Відрахований">Відрахований</option>
            </select>
          </div>

          <div class="form-group">
            <label>Академвідпустка з</label>
            <input v-model="applicantForm.academic_leave_from" type="date" />
          </div>

          <div class="form-group">
            <label>Академвідпустка по</label>
            <input v-model="applicantForm.academic_leave_to" type="date" />
          </div>

          <div class="form-actions">
            <button type="button" class="cancel-button" @click="closeApplicantForm">Скасувати</button>
            <button type="submit" class="save-button">
              Зберегти
            </button>
          </div>
        </form>
      </div>
    </div>

  </div>

</template>


<script setup>

import {
  ref,
  computed,
  onMounted
} from 'vue'

import api from '../services/api.js'


// ============================================
// Дані
// ============================================

const allGroups = ref([])
const groups = ref([])

const loading = ref(false)

const saving = ref(false)

const errorMessage = ref('')

const importMessage = ref('')
const importLoading = ref(false)
const fileInput = ref(null)

const expandedGroupId = ref(null)
const applicantsByGroup = ref({})
const loadingApplicants = ref(false)

const showForm = ref(false)
const specialtySummaries = ref([])

const specialtySummaryTotal = computed(() => {
  return (specialtySummaries.value || []).reduce(
    (acc, summary) => {
      acc.students_count += Number(summary.students_count) || 0
      acc.budget_count += Number(summary.budget_count) || 0
      acc.contract_count += Number(summary.contract_count) || 0
      return acc
    },
    { specialty: 'Всього', students_count: 0, budget_count: 0, contract_count: 0 }
  )
})

const searchQuery = ref('')
const selectedSpecialty = ref('all')
const courseFilter = ref('all')
const studentSearchQuery = ref('')
const studentSearchResults = ref([])

const showApplicantForm = ref(false)
const showHistoryModal = ref(false)
const ungroupedApplicants = ref([])
const academicLeaveApplicantsList = ref([])
const dismissedApplicantsList = ref([])
const applicantHistory = ref([])
const applicantForm = ref({
  id: null,
  group_id: null,
  applicant: '',
  funding_source: '',
  specialty: '',
  category_code: '',
  status: 'active',
  academic_leave_from: '',
  academic_leave_to: ''
})

const normalizeSpecialtyKey = (value) => {
  const text = String(value || '').toLowerCase()
  const compact = text.replace(/[^a-zа-яїієґ0-9]/g, '')

  if (compact.includes('інженеріяпрограмногозабезпечення') || compact.includes('softwareengineering')) {
    if (compact.includes('121')) return '121 Інженерія програмного забезпечення'
    if (compact.includes('f2')) return 'F2 Інженерія програмного забезпечення'
  }

  return String(value || '').trim()
}

const getSpecialtyFamilyKey = (value) => {
  const normalized = normalizeSpecialtyKey(value)
  const text = String(normalized || '').toLowerCase()
  const compact = text.replace(/[^a-zа-яїієґ0-9]/g, '')

  if ((compact.includes('інженеріяпрограмногозабезпечення') || compact.includes('softwareengineering')) &&
    (compact.includes('121') || compact.includes('f2'))) {
    return '121/F2 Інженерія програмного забезпечення'
  }

  return normalized
}

const specialtyOptions = computed(() => {
  const allowed = (allGroups.value || [])
    .map((group) => normalizeSpecialtyKey(group.specialty))
    .filter((specialty) => {
      if (!specialty) return false

      const text = String(specialty).toLowerCase()
      const compact = text.replace(/[^a-zа-яїієґ0-9]/g, '')

      const hasSoftwareEngineering = compact.includes('інженеріяпрограмногозабезпечення') || compact.includes('softwareengineering')
      const is121 = compact.includes('121')
      const isF2 = compact.includes('f2')

      return hasSoftwareEngineering && (is121 || isF2)
    })

  return [...new Set(allowed)].sort((a, b) => String(a).localeCompare(String(b), 'uk'))
})

const courseOptions = computed(() => [1, 2, 3, 4])

const hasActiveFilters = computed(() => {
  return Boolean(searchQuery.value.trim()) || selectedSpecialty.value !== 'all' || courseFilter.value !== 'all'
})

const filteredUngroupedApplicants = computed(() => {
  return (ungroupedApplicants.value || []).filter((student) => {
    const selected = String(selectedSpecialty.value || '').trim()
    if (!selected || selected === 'all') {
      return true
    }

    const selectedKey = getSpecialtyFamilyKey(selected)
    return getSpecialtyFamilyKey(student.specialty) === selectedKey
  })
})

const groupStats = computed(() => {
  const currentGroups = groups.value || []
  const ungroupedCount = Number(filteredUngroupedApplicants.value.length || 0)

  const groupBudget = currentGroups.reduce((sum, group) => sum + Number(group.budget_count ?? 0), 0)
  const groupContract = currentGroups.reduce((sum, group) => sum + Number(group.contract_count ?? 0), 0)
  const groupActiveBudget = currentGroups.reduce((sum, group) => sum + Number(group.active_budget_count ?? 0), 0)
  const groupActiveContract = currentGroups.reduce((sum, group) => sum + Number(group.active_contract_count ?? 0), 0)

  const ungroupedBudget = (filteredUngroupedApplicants.value || []).filter((student) => {
    const source = String(student.funding_source || '').toLowerCase()
    return source.includes('бюджет')
  }).length

  const ungroupedContract = (filteredUngroupedApplicants.value || []).filter((student) => {
    const source = String(student.funding_source || '').toLowerCase()
    return source.includes('контракт')
  }).length

  return {
    totalGroups: currentGroups.length,
    totalStudents: currentGroups.reduce((sum, group) => sum + Number(group.all_students_count ?? group.applicant_count ?? 0), 0) + ungroupedCount,
    activeStudents: currentGroups.reduce((sum, group) => sum + Number(group.active_students_count ?? 0), 0) + (ungroupedApplicants.value || []).filter((student) => isActiveApplicant(student)).length,
    budgetCount: groupBudget + ungroupedBudget,
    contractCount: groupContract + ungroupedContract,
    activeBudgetCount: groupActiveBudget + (filteredUngroupedApplicants.value || []).filter((student) => isActiveApplicant(student) && String(student.funding_source || '').toLowerCase().includes('бюджет')).length,
    activeContractCount: groupActiveContract + (filteredUngroupedApplicants.value || []).filter((student) => isActiveApplicant(student) && String(student.funding_source || '').toLowerCase().includes('контракт')).length
  }
})

const editingId = ref(null)

// ============================================
// Форма
// ============================================

const form = ref({

  name: '',

  specialty: '',

  course: null,

  students_count: 0

})


// ============================================
// Отримати групи
// ============================================

async function loadGroups() {

  loading.value = true

  errorMessage.value = ''


  try {

    const response = await api.get('/groups')

    allGroups.value = response.data || []
    applicantsByGroup.value = {}
    await loadSpecialtySummaries()
    await loadUngroupedApplicants()
    await loadStatusApplicants()
    applyGroupFilter()

  } catch (error) {

    console.error(error)


    errorMessage.value =
      'Не вдалося завантажити групи.'

  } finally {

    loading.value = false

  }

}

async function loadStatusApplicants() {
  try {
    const [academicResponse, dismissedResponse] = await Promise.all([
      api.get('/groups/applicants/academic-leave'),
      api.get('/groups/applicants/dismissed')
    ])
    academicLeaveApplicantsList.value = academicResponse.data || []
    dismissedApplicantsList.value = dismissedResponse.data || []
  } catch (error) {
    console.error(error)
    academicLeaveApplicantsList.value = []
    dismissedApplicantsList.value = []
  }
}

async function loadSpecialtySummaries() {
  try {
    const response = await api.get('/groups/summaries')
    specialtySummaries.value = response.data || []
  } catch (error) {
    console.error(error)
    errorMessage.value = 'Не вдалося завантажити підсумки по спеціальностях.'
    specialtySummaries.value = []
  }
}

async function loadUngroupedApplicants() {
  try {
    const response = await api.get('/groups/applicants/ungrouped')
    ungroupedApplicants.value = response.data || []
  } catch (error) {
    console.error(error)
    ungroupedApplicants.value = []
  }
}

async function loadApplicantHistory() {
  try {
    const response = await api.get('/groups/applicants/history')
    applicantHistory.value = response.data || []
  } catch (error) {
    console.error(error)
    applicantHistory.value = []
  }
}

function buildSpecialtySummaries(groupsList) {
  const summaryMap = {}
  const groupsArray = Array.isArray(groupsList) ? groupsList : []

  groupsArray.forEach((group) => {
    const key = group.specialty || 'Інші'
    const existing = summaryMap[key] || {
      specialty: key,
      students_count: 0,
      budget_count: 0,
      contract_count: 0
    }

    const studentCount = Number(group.applicant_count ?? group.students_count) || 0
    existing.students_count += studentCount
    existing.budget_count += Number(group.budget_count) || 0
    existing.contract_count += Number(group.contract_count) || 0

    summaryMap[key] = existing
  })

  return Object.values(summaryMap).sort((a, b) => String(a.specialty).localeCompare(String(b.specialty), 'uk'))
}

function applyGroupFilter() {
  let result = [...(allGroups.value || [])]

  const query = String(searchQuery.value || '').trim().toLowerCase()

  if (query) {
    result = result.filter((group) => {
      const searchable = `${group.name || ''} ${group.specialty || ''}`.toLowerCase()
      return searchable.includes(query)
    })
  }

  if (selectedSpecialty.value !== 'all') {
    const selectedKey = getSpecialtyFamilyKey(selectedSpecialty.value)
    result = result.filter((group) => getSpecialtyFamilyKey(group.specialty) === selectedKey)
  }

  if (courseFilter.value !== 'all') {
    result = result.filter((group) => Number(group.course) === Number(courseFilter.value))
  }

  result.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'uk'))

  groups.value = result
}

function resetFilters() {
  searchQuery.value = ''
  selectedSpecialty.value = 'all'
  courseFilter.value = 'all'
  applyGroupFilter()
}

async function searchStudentByName() {
  const value = String(studentSearchQuery.value || '').trim()
  if (!value) {
    studentSearchResults.value = []
    return
  }

  try {
    const response = await api.get('/groups/applicants/search', { params: { q: value } })
    studentSearchResults.value = response.data || []
  } catch (error) {
    console.error(error)
    studentSearchResults.value = []
  }
}

function focusApplicant(match) {
  studentSearchQuery.value = match.applicant || ''
  studentSearchResults.value = []

  const targetGroup = allGroups.value.find((group) => Number(group.id) === Number(match.group_id))
  if (targetGroup) {
    const index = groups.value.findIndex((group) => Number(group.id) === Number(targetGroup.id))
    if (index >= 0) {
      const target = groups.value[index]
      loadGroupApplicants(target)
    }
  }
}

function openApplicantEditor(groupId, applicant) {
  applicantForm.value = {
    id: applicant.id,
    group_id: groupId ? Number(groupId) : null,
    applicant: applicant.applicant || '',
    funding_source: applicant.funding_source || '',
    specialty: applicant.specialty || '',
    category_code: applicant.category_code || '',
    status: applicant.status || 'active',
    academic_leave_from: applicant.academic_leave_from || '',
    academic_leave_to: applicant.academic_leave_to || ''
  }
  showApplicantForm.value = true
}

function openHistoryModal() {
  showHistoryModal.value = true
}

function closeHistoryModal() {
  showHistoryModal.value = false
}

function closeApplicantForm() {
  showApplicantForm.value = false
  applicantForm.value = {
    id: null,
    group_id: null,
    applicant: '',
    funding_source: '',
    specialty: '',
    category_code: '',
    status: 'active',
    academic_leave_from: '',
    academic_leave_to: ''
  }
}

function confirmAction(message) {
  return window.confirm(message)
}

function formatDateValue(value) {
  if (!value) return '—'

  const normalized = String(value).trim()
  if (!normalized) return '—'

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    return normalized
  }

  return parsed.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

function formatDateTime(value) {
  if (!value) return '—'

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return String(value)
  }

  return parsed.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function getHistoryTone(type) {
  const normalized = String(type || '').toLowerCase()

  if (normalized.includes('dismiss') || normalized.includes('delete') || normalized.includes('відрах')) {
    return 'tone-danger'
  }

  if (normalized.includes('restore') || normalized.includes('return') || normalized.includes('повер')) {
    return 'tone-success'
  }

  if (normalized.includes('leave') || normalized.includes('академ') || normalized.includes('відп')) {
    return 'tone-warn'
  }

  return 'tone-neutral'
}

async function saveApplicant() {
  if (!applicantForm.value.id || !applicantForm.value.group_id) {
    return
  }

  const confirmed = confirmAction('Зберегти зміни для цього студента?')
  if (!confirmed) {
    return
  }

  try {
    const savedGroupId = applicantForm.value.group_id
    await api.put(`/groups/${applicantForm.value.group_id}/applicants/${applicantForm.value.id}`, {
      applicant: applicantForm.value.applicant,
      funding_source: applicantForm.value.funding_source,
      specialty: applicantForm.value.specialty,
      category_code: applicantForm.value.category_code,
      status: applicantForm.value.status,
      academic_leave_from: applicantForm.value.academic_leave_from,
      academic_leave_to: applicantForm.value.academic_leave_to,
      group_id: applicantForm.value.group_id
    })

    closeApplicantForm()
    await loadGroups()
    await loadApplicantHistory()
    const currentGroup = allGroups.value.find((group) => Number(group.id) === Number(savedGroupId))
    if (currentGroup) {
      await loadGroupApplicants(currentGroup)
    }
  } catch (error) {
    console.error(error)
    errorMessage.value = error.response?.data?.message || 'Не вдалося оновити студента.'
  }
}

async function restoreApplicantToGroupFromModal() {
  if (!applicantForm.value.applicant || !applicantForm.value.group_id) {
    return
  }

  try {
    const payload = {
      applicantId: applicantForm.value.id,
      groupId: applicantForm.value.group_id,
      applicant: applicantForm.value.applicant,
      funding_source: applicantForm.value.funding_source,
      specialty: applicantForm.value.specialty,
      category_code: applicantForm.value.category_code,
      status: applicantForm.value.status,
      academic_leave_from: applicantForm.value.academic_leave_from,
      academic_leave_to: applicantForm.value.academic_leave_to
    }

    await api.post('/groups/applicants/restore', payload)
    closeApplicantForm()
    await loadGroups()
    await loadUngroupedApplicants()
    await loadApplicantHistory()
  } catch (error) {
    console.error(error)
    errorMessage.value = error.response?.data?.message || 'Не вдалося поновити студента.'
  }
}

async function restoreApplicantToGroupFromUnassigned(student) {
  if (!student?.applicant) return

  openApplicantEditor(null, student)
}

function isAcademicLeaveApplicant(applicant) {
  const status = String(applicant?.status || '').trim()
  const normalizedStatus = status.toLowerCase()

  if (normalizedStatus === 'повернено з академвідпустки' || normalizedStatus === 'returned from academic leave' || normalizedStatus.includes('returned from academic') || normalizedStatus.includes('повернено з академ')) {
    return false
  }

  if (normalizedStatus === 'надано академвідпустку' || normalizedStatus.includes('академ') && normalizedStatus.includes('відп') || normalizedStatus.includes('academic') && normalizedStatus.includes('leave')) {
    return true
  }

  const hasAcademicLeaveDates = Boolean(applicant?.academic_leave_from || applicant?.academic_leave_to)
  if (hasAcademicLeaveDates && !status) {
    return true
  }

  const text = [
    applicant?.applicant,
    applicant?.funding_source,
    applicant?.specialty,
    applicant?.category_code,
    applicant?.status
  ].filter(Boolean).join(' ').toLowerCase()

  return /(академ.*відп|academic.*leave|leave)/i.test(text) && !/(актив|active|повернено|returned)/i.test(text)
}

function isDismissedApplicant(applicant) {
  return String(applicant?.status || '').trim().toLowerCase() === 'відрахований'
}

function isActiveApplicant(applicant) {
  return !isAcademicLeaveApplicant(applicant) && !isDismissedApplicant(applicant)
}

function sortApplicantsAlphabetically(applicants) {
  return [...(applicants || [])].sort((a, b) => {
    const nameA = String(a?.applicant || '').trim().toLowerCase()
    const nameB = String(b?.applicant || '').trim().toLowerCase()
    return nameA.localeCompare(nameB, 'uk')
  })
}

function regularApplicants(groupId) {
  return sortApplicantsAlphabetically((applicantsByGroup.value[groupId] || []).filter((applicant) => isActiveApplicant(applicant)))
}

function academicLeaveApplicants(groupId) {
  return sortApplicantsAlphabetically((applicantsByGroup.value[groupId] || []).filter((applicant) => isAcademicLeaveApplicant(applicant)))
}

// ============================================
// Додати
// ============================================

function openAddForm() {

  editingId.value = null


  form.value = {

    name: '',

    specialty: '',

    course: null,

    students_count: 0

  }


  showForm.value = true

}


// ============================================
// Редагувати
// ============================================

function openEditForm(group) {

  editingId.value = group.id

  form.value = {
    name: group.name,
    specialty: group.specialty || '',
    course: group.course,
    students_count: group.students_count ?? group.applicant_count ?? 0
  }

  showForm.value = true

}

// ============================================
// Закрити
// ============================================

function closeForm() {

  showForm.value = false

}

function handleFileChange(event) {
  importMessage.value = ''
  const file = event.target.files && event.target.files[0]
  if (!file) {
    return
  }

  importCsv(file)
}

async function importCsv(file) {
  importLoading.value = true
  errorMessage.value = ''
  importMessage.value = ''

  try {
    const formData = new FormData()
    formData.append('file', file)

    const response = await api.post('/groups/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })

    importMessage.value = `Імпортовано ${response.data.inserted} нових груп, оновлено ${response.data.updated}.`
    await loadGroups()
  } catch (error) {
    console.error(error)
    errorMessage.value = error.response?.data?.message || 'Не вдалося імпортувати CSV.'
  } finally {
    importLoading.value = false
    const input = fileInput.value
    if (input) {
      input.value = null
    }
  }
}

async function loadGroupApplicants(group) {
  if (expandedGroupId.value === group.id) {
    expandedGroupId.value = null
    return
  }

  if (applicantsByGroup.value[group.id]) {
    expandedGroupId.value = group.id
    return
  }

  loadingApplicants.value = true
  errorMessage.value = ''

  try {
    const response = await api.get(`/groups/${group.id}/applicants`)
    const sortedApplicants = (response.data || []).slice().sort((a, b) => {
      const nameA = String(a.applicant || '').trim().toLowerCase()
      const nameB = String(b.applicant || '').trim().toLowerCase()
      return nameA.localeCompare(nameB, 'uk')
    })
    applicantsByGroup.value = {
      ...applicantsByGroup.value,
      [group.id]: sortedApplicants
    }
    expandedGroupId.value = group.id
  } catch (error) {
    console.error(error)
    errorMessage.value = error.response?.data?.message || 'Не вдалося завантажити заявників групи.'
  } finally {
    loadingApplicants.value = false
  }
}

async function markApplicantAcademicLeave(groupId, applicant) {
  if (!groupId || !applicant?.id) return

  try {
    await api.put(`/groups/${groupId}/applicants/${applicant.id}`, {
      ...applicant,
      status: 'Надано академвідпустку',
      academic_leave_from: applicant.academic_leave_from || new Date().toISOString().slice(0, 10),
      academic_leave_to: applicant.academic_leave_to || ''
    })

    const group = allGroups.value.find((item) => Number(item.id) === Number(groupId))
    if (group) {
      await loadGroupApplicants(group)
    }
    await loadGroups()
  } catch (error) {
    console.error(error)
    errorMessage.value = error.response?.data?.message || 'Не вдалося перевести студента в академвідпустку.'
  }
}

async function restoreApplicantFromAcademicLeave(groupId, applicant) {
  if (!groupId || !applicant?.id) return

  try {
    await api.put(`/groups/${groupId}/applicants/${applicant.id}`, {
      ...applicant,
      status: 'Повернено з академвідпустки',
      academic_leave_from: '',
      academic_leave_to: ''
    })

    const group = allGroups.value.find((item) => Number(item.id) === Number(groupId))
    if (group) {
      await loadGroupApplicants(group)
    }
    await loadGroups()
  } catch (error) {
    console.error(error)
    errorMessage.value = error.response?.data?.message || 'Не вдалося повернути студента з академвідпустки.'
  }
}

async function deleteGroupApplicant(groupId, applicantId) {
  if (!groupId || !applicantId) return

  const confirmed = confirmAction('Видалити цього заявника?')
  if (!confirmed) return

  try {
    const response = await api.delete(`/groups/${groupId}/applicants/${applicantId}`)
    applicantsByGroup.value = {
      ...applicantsByGroup.value,
      [groupId]: response.data.applicants || []
    }
    await loadGroups()
  } catch (error) {
    console.error(error)
    errorMessage.value = error.response?.data?.message || 'Не вдалося видалити заявника.'
  }
}


// ============================================
// Зберегти
// ============================================

async function saveGroup() {

  const confirmed = confirmAction(
    editingId.value
      ? 'Зберегти зміни в групі?' 
      : 'Додати нову групу?'
  )

  if (!confirmed) {
    return
  }

  saving.value = true

  errorMessage.value = ''


  try {


    // Редагування

    if (editingId.value) {

      await api.put(

        `/groups/${editingId.value}`,

        form.value

      )

    }


    // Додавання

    else {

      await api.post(

        '/groups',

        form.value

      )

    }


    closeForm()


    await loadGroups()


  } catch (error) {

    console.error(error)


    errorMessage.value =
      'Не вдалося зберегти групу.'

  } finally {

    saving.value = false

  }

}


// ============================================
// Видалити
// ============================================

async function deleteGroup(id) {


  const group =
    groups.value.find(
      group => group.id === id
    )


  if (!group) {

    return

  }


  const confirmed =
    confirmAction(
      `Видалити групу "${group.name}"?`
    )


  if (!confirmed) {

    return

  }


  try {


    await api.delete(
      `/groups/${id}`
    )


    await loadGroups()


  } catch (error) {

    console.error(error)


    errorMessage.value =
      'Не вдалося видалити групу.'

  }

}


// ============================================
// Завантажити при відкритті
// ============================================

onMounted(() => {
  loadGroups()
  loadUngroupedApplicants()
  loadApplicantHistory()
})

</script>


<style scoped>

.groups-page {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 8px 0 28px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 18px 20px;
  background: rgba(255,255,255,0.88);
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 18px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
  backdrop-filter: blur(8px);
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 14px;
}

.title-badge {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #2563eb, #7c3aed 65%, #8b5cf6);
  color: white;
  font-size: 1.15rem;
  font-weight: 800;
  box-shadow: 0 16px 28px rgba(79, 70, 229, 0.28);
}

h1 {
  margin: 0;
  font-size: 32px;
  line-height: 1.15;
  color: #0f172a;
  letter-spacing: -0.04em;
}

.page-header p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 0.96rem;
}

.page-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
}

.add-button,
.import-button,
.reset-button,
.edit-button,
.delete-button,
.save-button,
.cancel-button,
.group-toggle {
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, opacity 0.2s ease;
}

.add-button,
.import-button,
.reset-button,
.save-button {
  border: none;
  border-radius: 12px;
  padding: 11px 18px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.add-button {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  box-shadow: 0 14px 26px rgba(37, 99, 235, 0.22);
}

.import-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f172a, #1e293b);
  color: white;
  box-shadow: 0 12px 22px rgba(15, 23, 42, 0.18);
  border-radius: 12px;
  padding: 11px 18px;
  font-weight: 700;
}

.add-button:hover,
.import-button:hover,
.reset-button:hover,
.save-button:hover {
  transform: translateY(-1px);
}

.import-message {
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(16, 185, 129, 0.08);
  color: #047857;
  border: 1px solid rgba(16, 185, 129, 0.25);
  font-size: 0.94rem;
}

.error-message {
  margin: 0;
  padding: 12px 15px;
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.08);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.22);
  font-size: 0.94rem;
}

.loading {
  background: rgba(255,255,255,0.9);
  padding: 30px 18px;
  text-align: center;
  color: #64748b;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 16px;
  font-weight: 600;
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.04);
}

.loading.compact {
  padding: 18px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(180px, 1fr));
  gap: 16px;
}

.stat-card {
  background: rgba(255,255,255,0.86);
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 16px;
  padding: 16px 18px;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.03);
}

.stat-card span {
  display: block;
  color: #64748b;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.stat-card strong {
  display: block;
  margin-top: 10px;
  font-size: clamp(1.8rem, 2vw, 2.3rem);
  color: #0f172a;
  line-height: 1;
  letter-spacing: -0.05em;
}

.stat-card small {
  display: block;
  margin-top: 8px;
  color: #475569;
}

.stat-card.primary {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
}

.stat-card.blue {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
}

.stat-card.green {
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
}

.stat-card.amber {
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
}

.stat-card strong small {
  font-size: 0.72em;
  font-weight: 600;
  color: #475467;
}

.status-lists {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.status-list-panel {
  padding: 16px;
  border: 1px solid #e4e7ec;
  border-radius: 14px;
  background: #fff;
}

.academic-panel { border-left: 4px solid #d6a83d; }
.dismissed-panel { border-left: 4px solid #d66a6a; }

.status-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.status-list-header h3 { margin: 0; color: #344054; }
.status-list-header > span { color: #667085; font-weight: 700; }

.status-student-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid #f0f2f5;
}

.status-student-row div { min-width: 0; }
.status-student-row strong,
.status-student-row span { display: block; }
.status-student-row span { margin-top: 3px; overflow: hidden; color: #667085; font-size: 0.84rem; text-overflow: ellipsis; white-space: nowrap; }
.academic-badge { margin-left: 8px; color: #8a6116; font-size: 0.78rem; font-weight: 600; }
.group-row.has-academic { background: #fffaf0; }

.toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(255,255,255,0.88);
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 16px;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.03);
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 260px;
  min-width: 220px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0 12px;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.02);
}

.search-icon {
  color: #64748b;
  font-size: 1.2rem;
}

.search-box input {
  border: none;
  background: transparent;
  width: 100%;
  height: 42px;
  outline: none;
  color: #0f172a;
  font-size: 0.96rem;
}

.filter-group {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.filter-group select {
  min-width: 170px;
  height: 42px;
  padding: 0 12px;
  border: 1px solid #dbe4f0;
  border-radius: 12px;
  background: #f8fafc;
  color: #0f172a;
  outline: none;
  font-weight: 600;
}

.student-search-box {
  min-width: 220px;
  flex: 1 1 220px;
  background: #f8fafc;
  border: 1px solid #dbe4f0;
  border-radius: 12px;
  overflow: hidden;
}

.student-search-box input {
  width: 100%;
  height: 42px;
  border: none;
  background: transparent;
  padding: 0 12px;
  outline: none;
  color: #0f172a;
}

.student-search-results {
  background: rgba(255,255,255,0.95);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 16px;
  padding: 12px 14px;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.04);
}

.student-search-results h3 {
  margin: 0 0 10px;
  font-size: 0.96rem;
  color: #0f172a;
}

.student-search-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.student-search-item {
  background: linear-gradient(135deg, #eff6ff, #e0f2fe);
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  box-shadow: 0 8px 18px rgba(59, 130, 246, 0.08);
}

.student-search-item strong {
  font-size: 0.9rem;
}

.student-search-item span {
  font-size: 0.75rem;
  color: #475569;
}

.ungrouped-panel {
  background: linear-gradient(180deg, #fffaf3 0%, #fff7ed 100%);
  border: 1px solid rgba(251, 146, 60, 0.2);
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 16px 30px rgba(251, 146, 60, 0.06);
}

.ungrouped-panel h3 {
  margin: 0 0 12px;
  color: #9a4d16;
  font-size: 1rem;
}

.ungrouped-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ungrouped-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(251, 146, 60, 0.2);
  border-radius: 12px;
  background: rgba(255,255,255,0.35);
}

.ungrouped-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ungrouped-main strong {
  color: #0f172a;
}

.ungrouped-main span {
  color: #7c2d12;
  font-size: 0.8rem;
}

.ungrouped-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ungrouped-edit-button {
  border: none;
  border-radius: 10px;
  padding: 8px 12px;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 10px 18px rgba(37, 99, 235, 0.18);
}

.reset-button {
  background: #eef2ff;
  color: #3730a3;
}

.utility-row {
  display: flex;
  justify-content: flex-end;
}

.history-trigger {
  border: 1px solid #dbe4f0;
  border-radius: 12px;
  background: rgba(255,255,255,0.9);
  color: #0f172a;
  padding: 9px 14px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 700;
  box-shadow: 0 6px 14px rgba(15, 23, 42, 0.03);
}

.history-modal {
  max-width: 520px;
}

.history-modal-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 420px;
  overflow-y: auto;
  padding-right: 4px;
}

.history-item {
  padding: 10px 12px;
  background: #f8fafc;
  border: 1px solid #edf2f7;
  border-radius: 12px;
}

.history-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.history-main strong {
  color: #0f172a;
  font-size: 0.88rem;
}

.history-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}

.history-pill.tone-neutral {
  background: #e2e8f0;
  color: #334155;
}

.history-pill.tone-warn {
  background: #fef3c7;
  color: #92400e;
}

.history-pill.tone-success {
  background: #dcfce7;
  color: #166534;
}

.history-pill.tone-danger {
  background: #fee2e2;
  color: #991b1b;
}

.history-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  color: #64748b;
  font-size: 0.72rem;
}

.summary-container,
.table-container {
  background: rgba(255,255,255,0.92);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 18px 36px rgba(15, 23, 42, 0.04);
}

.summary-container h2 {
  margin: 0;
  padding: 18px 20px;
  font-size: 1.05rem;
  background: linear-gradient(180deg, #f8fafc 0%, #f3f7ff 100%);
  color: #0f172a;
  border-bottom: 1px solid #e2e8f0;
}

.summary-table {
  width: 100%;
  border-collapse: collapse;
}

.summary-table th,
.summary-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
}

.summary-table th {
  background: #f8fafc;
  font-size: 12px;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.summary-total td {
  background: #f8fafc;
}

.table-container {
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
  background: #f8fafc;
  font-size: 12px;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

td {
  font-size: 14px;
  color: #1f2937;
}

.group-row {
  background: rgba(255, 255, 255, 0.78);
}

.group-row.active {
  background: linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%);
}

@media (max-width: 900px) {
  .status-lists { grid-template-columns: 1fr; }
}

.group-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  padding: 0;
  color: #0f172a;
  cursor: pointer;
  font-size: 0.96rem;
}

.group-toggle span {
  color: #2563eb;
  font-weight: 700;
  font-size: 1rem;
}

.empty {
  text-align: center;
  padding: 42px 16px;
  color: #64748b;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.empty-state strong {
  font-size: 1.05rem;
  color: #1f2937;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.actions button,
.inline-actions button {
  border: none;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.inline-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.inline-actions button {
  padding: 6px 8px;
  font-size: 11px;
}

.pdf-button {
  background: #fff7ed;
  color: #c2410c;
}

.edit-button {
  background: #eff6ff;
  color: #2563eb;
}

.delete-button {
  background: #fef2f2;
  color: #dc2626;
}

.save-button {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: white;
}

.pdf-button:hover,
.edit-button:hover,
.delete-button:hover,
.save-button:hover {
  transform: translateY(-1px);
}

.expanded-row {
  background: linear-gradient(180deg, #f8fafc 0%, #f3f7ff 100%);
}

.expanded-content {
  padding: 10px 8px 6px;
}

.expanded-content h3 {
  margin: 0 0 12px;
  font-size: 1rem;
  color: #1f2937;
}

.applicants-groups {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.applicants-section {
  background: rgba(255,255,255,0.94);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.03);
}

.applicants-section h4 {
  margin: 0;
  padding: 10px 12px;
  font-size: 0.9rem;
  color: #0f172a;
  background: linear-gradient(180deg, #f8fafc 0%, #f2f7ff 100%);
  border-bottom: 1px solid #e2e8f0;
}

.applicants-section.accent h4 {
  background: linear-gradient(180deg, #fff7ed 0%, #fff3e0 100%);
}

.table-scroll-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.nested-table {
  width: 100%;
  min-width: 620px;
  background: white;
  border-radius: 0;
  overflow: hidden;
  border: none;
}

.nested-table th,
.nested-table td {
  padding: 8px 10px;
  white-space: nowrap;
}

.modal-background {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.56);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  z-index: 100;
}

.modal {
  width: 100%;
  max-width: 420px;
  background: white;
  border-radius: 16px;
  padding: 18px 18px 16px;
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.18);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.15rem;
  color: #0f172a;
}

.close-button {
  border: none;
  background: transparent;
  font-size: 28px;
  cursor: pointer;
  color: #64748b;
}

.form-group {
  margin-bottom: 12px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.86rem;
  font-weight: 700;
  color: #334155;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid #dbe4f0;
  border-radius: 9px;
  outline: none;
  font-size: 0.9rem;
  background: #f8fafc;
  color: #0f172a;
}

.form-group input:focus,
.form-group select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.form-actions button {
  padding: 9px 14px;
  border-radius: 9px;
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 700;
}

.cancel-button {
  border: 1px solid #d1d5db;
  background: white;
  color: #0f172a;
}

.save-button {
  border: none;
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: white;
}

.save-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

@media (max-width: 900px) {
  .page-header {
    flex-direction: column;
    align-items: stretch;
    padding: 20px 18px;
  }

  .title-wrap {
    align-items: flex-start;
  }

  .page-actions {
    justify-content: stretch;
  }

  .page-actions > * {
    flex: 1 1 100%;
  }

  .stats-grid {
    grid-template-columns: repeat(2, minmax(160px, 1fr));
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-group {
    justify-content: stretch;
  }

  .filter-group > * {
    flex: 1 1 100%;
  }

  .applicants-groups {
    grid-template-columns: 1fr;
  }

  .nested-table {
    min-width: 540px;
  }
}

@media (max-width: 560px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }

  th,
  td {
    padding: 12px 10px;
  }
}
</style>


