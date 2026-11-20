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
        <label class="import-button" :class="{ disabled: photoImportLoading }">
          <input
            ref="photoArchiveInput"
            type="file"
            accept=".zip,application/zip"
            multiple
            :disabled="photoImportLoading"
            @change="handlePhotoArchiveChange"
            hidden
          />
          <span>{{ photoImportLoading ? 'Завантаження фото...' : 'Імпорт фото (ZIP)' }}</span>
        </label>
        <label class="import-button" :class="{ disabled: contactsImportLoading }">
          <input
            ref="contactsFileInput"
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            :disabled="contactsImportLoading"
            @change="handleContactsFileChange"
            hidden
          />
          <span>{{ contactsImportLoading ? 'Завантаження контактів...' : 'Імпорт контактів (Excel)' }}</span>
        </label>
      </div>
    </div>

    <div v-if="importMessage" class="import-message">
      {{ importMessage }}
    </div>

    <div v-if="photoImportMessage" class="import-message">
      {{ photoImportMessage }}
    </div>

    <details v-if="unmatchedPhotoStudents.length" class="unmatched-import-list">
      <summary>Студенти без зіставлених фото ({{ unmatchedPhotoStudents.length }})</summary>
      <ul>
        <li v-for="(student, index) in unmatchedPhotoStudents" :key="`${student.applicant}-${student.group || ''}-${index}`">
          {{ student.applicant }}<span v-if="student.group"> — {{ student.group }}</span>
        </li>
      </ul>
    </details>

    <div v-if="contactsImportMessage" class="import-message">
      {{ contactsImportMessage }}
    </div>

    <details v-if="unmatchedContactStudents.length" class="unmatched-import-list">
      <summary>Студенти, яких не зіставлено під час імпорту контактів ({{ unmatchedContactStudents.length }})</summary>
      <ul>
        <li v-for="(student, index) in unmatchedContactStudents" :key="`${student.applicant}-${index}`">
          {{ student.applicant }} — {{ student.reason }}
        </li>
      </ul>
    </details>

    <div v-if="importLoading" class="loading compact">
      Імпорт файлу...
    </div>

    <div v-if="photoImportLoading" class="loading compact">
      Обробка ZIP-архівів та зіставлення фото зі студентами...
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
          <div>
            <button class="student-name-button" type="button" @click="openStudentDetails(student)">{{ student.applicant || '—' }}</button>
            <span>{{ student.group_name || 'Без групи' }} · {{ student.specialty || '—' }} · {{ student.course || '—' }} курс · {{ student.funding_source || '—' }}</span>
          </div>
        </div>
      </div>
      <div class="status-list-panel dismissed-panel">
        <div class="status-list-header">
          <h3>Відраховані</h3>
          <span>{{ dismissedApplicantsList.length }}</span>
        </div>
        <div v-if="!dismissedApplicantsList.length" class="empty-state compact-empty">Немає студентів</div>
        <div v-for="student in dismissedApplicantsList" :key="student.id" class="status-student-row">
          <div><button class="student-name-button" type="button" @click="openStudentDetails(student)">{{ student.applicant || '—' }}</button><span>{{ student.group_name || 'Без групи' }} · {{ student.specialty || '—' }} · {{ student.course || '—' }} курс · {{ student.funding_source || '—' }}</span></div>
          <button class="edit-button small" type="button" @click="openApplicantEditor(student.group_id, student)">Редагувати</button>
        </div>
      </div>
    </div>

    <!-- ================================= -->
    <!-- Фільтри -->
    <!-- ================================= -->

    <div class="toolbar">
      <div class="filter-group">
        <label class="filter-control">
          <span>Курс</span>
          <select v-model="courseFilter" @change="applyGroupFilter">
            <option value="all">Всі курси</option>
            <option v-for="course in courseOptions" :key="course" :value="course">
              {{ course }} курс
            </option>
          </select>
        </label>

        <label class="filter-control">
          <span>Форма фінансування</span>
          <select v-model="fundingFilter" @change="applyGroupFilter">
            <option value="all">Усі форми</option>
            <option value="budget">Є бюджетні місця</option>
            <option value="contract">Є контрактні місця</option>
          </select>
        </label>

        <label class="filter-control student-search-box">
          <span>Пошук студента</span>
          <input
            v-model="studentSearchQuery"
            type="text"
            placeholder="Пошук студента за ПІБ"
            @input="searchStudentByName"
          />
        </label>

        <button v-if="hasActiveFilters" class="reset-button" type="button" @click="resetFilters">
          Скинути
        </button>
      </div>

    </div>
    <p class="filter-results-count">
      Показано груп: <strong>{{ groups.length }}</strong> із {{ allGroups.length }}
    </p>

    <div v-if="studentSearchResults.length" class="student-search-results">
      <h3>Результати пошуку</h3>
      <div class="student-search-items">
        <button
          v-for="match in studentSearchResults"
          :key="match.id"
          type="button"
          class="student-search-item"
          @click="openStudentDetails(match)"
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
            <button class="student-name-button" type="button" @click="openStudentDetails(student)">{{ student.applicant || '—' }}</button>
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

      <section v-if="combinedSpecialtySummaries.length" class="combined-summary-section">
        <div class="combined-summary-heading">
          <div>
            <span class="combined-summary-eyebrow">Зведена статистика</span>
            <h3>Разом за спорідненими спеціальностями</h3>
          </div>
          <span class="combined-summary-count">{{ combinedSpecialtySummaries.length }} напрямки</span>
        </div>
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
            <tr v-for="summary in combinedSpecialtySummaries" :key="summary.specialty">
              <td>{{ summary.specialty }}</td>
              <td>{{ summary.students_count }}</td>
              <td>{{ summary.budget_count }}</td>
              <td>{{ summary.contract_count }}</td>
            </tr>
          </tbody>
        </table>
      </section>
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
                  <span v-if="groupDisplayStats(group).academic_leave_count > 0" class="academic-badge">Є академвідпустка: {{ groupDisplayStats(group).academic_leave_count }}</span>
                </button>
              </td>

              <td>
                {{ group.specialty || '—' }}
              </td>

              <td>
                {{ group.course || '—' }}
              </td>

              <td>
                {{ groupDisplayStats(group).budget_count }} <small>(активних: {{ groupDisplayStats(group).active_budget_count }})</small>
              </td>

              <td>
                {{ groupDisplayStats(group).contract_count }} <small>(активних: {{ groupDisplayStats(group).active_contract_count }})</small>
              </td>

              <td>
                {{ groupDisplayStats(group).all_students_count }} <small>(активних: {{ groupDisplayStats(group).active_students_count }})</small>
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
                  <h3>
                    Студенти групи {{ group.name }}
                    <span class="class-teacher-label">
                      Класний керівник: {{ group.class_teacher_name || 'не призначено' }}
                    </span>
                  </h3>

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
                              <td><button class="student-name-button" type="button" @click="openStudentDetails(applicant)">{{ applicant.applicant || '—' }}</button></td>
                              <td>{{ applicant.funding_source || '—' }}</td>
                              <td>{{ applicant.specialty || '—' }}</td>
                              <td>{{ applicant.category_code || '—' }}</td>
                              <td>
                                <div class="inline-actions">
                                  <button
                                    class="edit-button small academic-leave-edit"
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
                                <td><button class="student-name-button" type="button" @click="openStudentDetails(applicant)">{{ applicant.applicant || '—' }}</button></td>
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

          <div v-if="editingId" class="form-group">
            <label>Класний керівник</label>
            <select v-model="form.class_teacher_id">
              <option value="">Не призначено</option>
              <option v-for="teacher in teachers" :key="teacher.id" :value="String(teacher.id)">
                {{ teacher.full_name }}
              </option>
            </select>
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

    <div v-if="showApplicantDetails && selectedApplicantDetails" class="modal-background" @click.self="closeStudentDetails">
      <section class="modal student-details-modal" role="dialog" aria-modal="true" aria-labelledby="student-details-title">
        <div class="modal-header">
          <h2 id="student-details-title">{{ selectedApplicantDetails.applicant || 'Інформація про студента' }}</h2>
          <div class="student-modal-actions">
            <button
              v-if="isAdmin"
              class="student-edit-button"
              type="button"
              @click="toggleManualDetailsEditor"
            >
              {{ isEditingManualDetails ? 'Скасувати редагування' : 'Редагувати контакти' }}
            </button>
            <button class="close-button" type="button" aria-label="Закрити" @click="closeStudentDetails">×</button>
          </div>
        </div>

        <div class="student-details-layout">
          <aside class="student-photo-wrap">
            <img
              v-if="studentPhotoUrl"
              :src="studentPhotoUrl"
              :alt="selectedApplicantDetails.applicant || 'Фото студента'"
            />
            <div v-else class="student-photo-placeholder">Фото відсутнє</div>
            <template v-if="isAdmin">
              <input
                ref="manualPhotoInput"
                class="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                @change="uploadManualPhoto"
              />
              <button
                class="student-photo-button"
                type="button"
                :disabled="uploadingManualPhoto"
                @click="manualPhotoInput?.click()"
              >
                {{ uploadingManualPhoto ? 'Завантаження фото...' : (studentPhotoUrl ? 'Замінити фото' : 'Додати фото') }}
              </button>
            </template>
          </aside>

          <div class="student-information">
            <div v-if="!Object.keys(importedStudentData).length" class="student-import-notice">
              Додаткові поля ще не збережені для цього студента. Повторно імпортуйте актуальний CSV, щоб завантажити їх.
            </div>
            <p v-if="manualDetailsError" class="manual-student-error">{{ manualDetailsError }}</p>
            <p v-if="manualDetailsSuccess" class="manual-student-success">{{ manualDetailsSuccess }}</p>

            <section class="student-info-section">
              <h3>Основна інформація</h3>
              <dl class="student-details-list">
                <div v-for="field in studentMainFields" :key="field.label" class="student-detail-row">
                  <dt>{{ field.label }}</dt>
                  <dd v-if="isWebLink(field.value)">
                    <a :href="field.value" target="_blank" rel="noopener noreferrer">{{ field.value }}</a>
                  </dd>
                  <dd v-else>{{ field.value }}</dd>
                </div>
              </dl>
            </section>

            <section v-if="isEditingManualDetails && isAdmin" class="manual-student-editor">
              <h3>Редагування контактів і категорії</h3>
              <form @submit.prevent="saveManualStudentDetails">
                <label class="manual-student-field">
                  <span>Пільгова категорія</span>
                  <input v-model="manualStudentForm.benefit_category" type="text" maxlength="255" />
                </label>
                <label
                  v-for="field in editableContactFields"
                  :key="field.key"
                  class="manual-student-field"
                >
                  <span>{{ field.label }}</span>
                  <textarea
                    v-model="manualStudentForm.contacts[field.key]"
                    rows="2"
                    maxlength="2000"
                  />
                </label>
                <div class="manual-student-actions">
                  <button type="button" class="manual-cancel-button" @click="cancelManualDetailsEditor">Скасувати</button>
                  <button type="submit" class="manual-save-button" :disabled="savingManualDetails">
                    {{ savingManualDetails ? 'Збереження...' : 'Зберегти контакти' }}
                  </button>
                </div>
              </form>
            </section>

            <details v-if="studentContactFields.length" class="student-contacts-disclosure">
              <summary>Контакти студента</summary>
              <dl class="student-details-list">
                <div v-for="field in studentContactFields" :key="field.label" class="student-detail-row">
                  <dt>{{ field.label }}</dt>
                  <dd v-if="isWebLink(field.value)">
                    <a :href="field.value" target="_blank" rel="noopener noreferrer">{{ field.value }}</a>
                  </dd>
                  <dd v-else>{{ field.value }}</dd>
                </div>
              </dl>
            </details>

            <details class="student-contacts-disclosure">
              <summary>Контакти батьків</summary>
              <dl v-if="studentParentFields.length" class="student-details-list">
                <div v-for="field in studentParentFields" :key="field.label" class="student-detail-row">
                  <dt>{{ field.label }}</dt>
                  <dd>{{ field.value }}</dd>
                </div>
              </dl>
              <p v-else class="student-contacts-empty">Контактні дані батьків не імпортовані.</p>
            </details>
          </div>
        </div>
      </section>
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
              <optgroup v-for="course in groupsByCourse" :key="course.label" :label="course.label">
                <option v-for="group in course.groups" :key="group.id" :value="group.id">
                  {{ group.name }}
                </option>
              </optgroup>
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
const teachers = ref([])
const groupsByCourse = computed(() => {
  const grouped = new Map()
  for (const group of allGroups.value) {
    const courseLabel = group.course ? `${group.course} курс` : 'Без курсу'
    if (!grouped.has(courseLabel)) grouped.set(courseLabel, [])
    grouped.get(courseLabel).push(group)
  }
  return [...grouped.entries()]
    .sort(([courseA], [courseB]) => {
      if (courseA === 'Без курсу') return 1
      if (courseB === 'Без курсу') return -1
      return Number.parseInt(courseA, 10) - Number.parseInt(courseB, 10)
    })
    .map(([label, courseGroups]) => ({
      label,
      groups: courseGroups.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'uk'))
    }))
})

const loading = ref(false)

const saving = ref(false)

const errorMessage = ref('')

const importMessage = ref('')
const importLoading = ref(false)
const fileInput = ref(null)
const photoArchiveInput = ref(null)
const contactsFileInput = ref(null)
const photoImportLoading = ref(false)
const photoImportMessage = ref('')
const unmatchedPhotoStudents = ref([])
const contactsImportLoading = ref(false)
const contactsImportMessage = ref('')
const unmatchedContactStudents = ref([])

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

const combinedSpecialtySummaries = computed(() => {
  const families = [
    {
      key: '121/F2 Інженерія програмного забезпечення',
      label: '121 / F2 Інженерія програмного забезпечення'
    },
    {
      key: '171/G5',
      label: '171 / G5 Електроніка, електронні комунікації, приладобудування та радіотехніка'
    }
  ]

  return families.flatMap((family) => {
    const matchingSummaries = (specialtySummaries.value || []).filter(
      (summary) => getSpecialtyFamilyKey(summary.specialty) === family.key
    )
    if (!matchingSummaries.length) return []

    return [{
      specialty: family.label,
      students_count: matchingSummaries.reduce((total, summary) => total + (Number(summary.students_count) || 0), 0),
      budget_count: matchingSummaries.reduce((total, summary) => total + (Number(summary.budget_count) || 0), 0),
      contract_count: matchingSummaries.reduce((total, summary) => total + (Number(summary.contract_count) || 0), 0)
    }]
  })
})

const courseFilter = ref('all')
const fundingFilter = ref('all')
const studentSearchQuery = ref('')
const studentSearchResults = ref([])

const showApplicantForm = ref(false)
const showHistoryModal = ref(false)
const showApplicantDetails = ref(false)
const selectedApplicantDetails = ref(null)
const manualPhotoInput = ref(null)
const isEditingManualDetails = ref(false)
const savingManualDetails = ref(false)
const uploadingManualPhoto = ref(false)
const manualDetailsError = ref('')
const manualDetailsSuccess = ref('')
const manualStudentForm = ref({
  benefit_category: '',
  contacts: {
    telegram: '',
    student_phone: '',
    email: '',
    home_address: '',
    location: '',
    mother_name: '',
    mother_contacts: '',
    father_name: '',
    father_contacts: ''
  }
})
const editableContactFields = [
  { key: 'telegram', label: 'Контакт Телеграм' },
  { key: 'student_phone', label: 'Мобільні телефони' },
  { key: 'email', label: 'Електронна пошта' },
  { key: 'home_address', label: 'Адреса' },
  { key: 'location', label: 'Місце знаходження' },
  { key: 'mother_name', label: 'ПІБ матері (або опікуна №1)' },
  { key: 'mother_contacts', label: 'Контакти матері (телефони, телеграм)' },
  { key: 'father_name', label: 'ПІБ батька (або опікуна №2)' },
  { key: 'father_contacts', label: 'Контакти батька (телефони, телеграм)' }
]
const isAdmin = computed(() => {
  try {
    return JSON.parse(localStorage.getItem('ped_user') || 'null')?.role === 'admin'
  } catch (error) {
    console.error('Не вдалося прочитати роль користувача', error)
    return false
  }
})
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

const importedStudentData = computed(() => {
  const student = selectedApplicantDetails.value
  if (!student) return []

  let importedData = student.imported_data || {}
  if (typeof importedData === 'string') {
    try {
      importedData = JSON.parse(importedData)
    } catch (error) {
      console.error('Не вдалося прочитати додаткові дані студента', error)
      importedData = {}
    }
  }

  return importedData && typeof importedData === 'object' && !Array.isArray(importedData) ? importedData : {}
})

const studentDetailFields = computed(() => {
  const student = selectedApplicantDetails.value
  if (!student) return []

  const importedData = importedStudentData.value
  const studentFields = importedData.student_fields && typeof importedData.student_fields === 'object'
    ? importedData.student_fields
    : {}
  const findImportedValue = (pattern) => {
    const entry = Object.entries(importedData).find(([header, value]) =>
      header !== 'student_fields' && pattern.test(header) &&
      value !== null && value !== undefined && String(value).trim() !== ''
    )
    return entry ? entry[1] : ''
  }
  const valueFor = (key, pattern, fallback = '') => {
    const canonicalValue = studentFields[key]
    const value = canonicalValue !== null && canonicalValue !== undefined && String(canonicalValue).trim() !== ''
      ? canonicalValue
      : findImportedValue(pattern) || fallback
    return value === null || value === undefined || String(value).trim() === '' ? '—' : String(value)
  }

  const fields = [
    { label: 'Здобувач', value: valueFor('applicant', /здобувач|студент|піб|фио|applicant|student.?name/, student.applicant) },
    { label: 'Дата народження', value: valueFor('birth_date', /дата.?народжен|народив|birth|^dob$/, importedData.birth_date) },
    { label: 'Стать', value: valueFor('gender', /стать|gender|sex/) },
    { label: 'Вступ на основі', value: valueFor('admission_basis', /вступ.*основ|основ.*вступ|основа вступу|admission.*basis|basis.*admission/) },
    { label: 'Джерело фінансування', value: student.funding_source || '—' },
    { label: 'Спеціальність', value: student.group_specialty || student.specialty || '—' },
    { label: 'Курс', value: student.course ?? '—' },
    { label: 'Група', value: student.group_name || 'Без групи' },
    {
      label: 'Початок навчання',
      value: formatDateValue(valueFor(
        'study_start_date',
        /початок.*навчан|зарахування.*навчан|навчан.*з$|study.?start|enrollment.?date/
      ))
    },
    {
      label: 'Завершення навчання',
      value: formatDateValue(valueFor(
        'study_end_date',
        /заверш.*навчан|закінч.*навчан|кінець.*навчан|навчан.*до$|study.?end|graduation.?date/
      ))
    },
    { label: 'Код категорії', value: valueFor('category_code', /категор|category/, student.category_code) },
    { label: 'Наказ про зарахування', value: valueFor('enrollment_order', /наказ.*зарах|зарах.*наказ|enrollment.?order|admission.?order/) },
    { label: 'КБ при вступі', value: valueFor('admission_score', /кб.*(вступ|поступ)|((вступ|поступ).*кб)|competitive.?score|бал.*вступ/) }
  ]

  if (/академ/i.test(String(student.status || ''))) {
    fields.push(
      { label: 'Академвідпустка з', value: formatDateValue(student.academic_leave_from) },
      { label: 'Академвідпустка по', value: formatDateValue(student.academic_leave_to) }
    )
  }

  const contacts = student.student_contacts || {}
  fields.push({ label: 'Пільгова категорія', value: String(contacts.benefit_category || '—') })
  const contactFields = [
    { label: 'Контакт Телеграм', value: contacts.telegram },
    { label: 'Мобільні телефони', value: contacts.student_phone },
    { label: 'Електронна Пошта', value: contacts.email },
    { label: 'Адреса', value: contacts.home_address },
    { label: 'Місце знаходження', value: contacts.location },
    { label: 'Де саме знаходиться', value: contacts.location_details },
    { label: 'ПІБ Матері (або опікуна №1)', value: contacts.mother_name },
    { label: 'Контакти Матері (Телефони, телеграм)', value: contacts.mother_contacts },
    { label: 'ПІБ Батька (або опікуна №2)', value: contacts.father_name },
    { label: 'Контакти Батька (Телефони, телеграм)', value: contacts.father_contacts }
  ]
  fields.push(...contactFields
    .filter((field) => String(field.value || '').trim())
    .map((field) => ({ label: field.label, value: String(field.value) })))

  return fields
})

const studentContactLabels = new Set([
  'Пільгова категорія',
  'Контакт Телеграм',
  'Мобільні телефони',
  'Електронна Пошта',
  'Адреса',
  'Місце знаходження',
  'Де саме знаходиться'
])

const isParentContactField = (field) =>
  /Матері|Батька|батьків\/опікунів/i.test(field.label)

const studentMainFields = computed(() =>
  studentDetailFields.value.filter((field) =>
    !studentContactLabels.has(field.label) && !isParentContactField(field)
  )
)

const studentContactFields = computed(() =>
  studentDetailFields.value.filter((field) => studentContactLabels.has(field.label))
)

const studentParentFields = computed(() =>
  studentDetailFields.value.filter(isParentContactField)
)

const studentPhotoUrl = computed(() => {
  const photoEntry = Object.entries(importedStudentData.value).find(([label, value]) => isPhotoField(label) && value)
  const value = String(selectedApplicantDetails.value?.photo_url || importedStudentData.value.photo_url || photoEntry?.[1] || '').trim()
  if (/^https?:\/\//i.test(value) || /^data:image\/[a-z0-9.+-]+;base64,/i.test(value)) return value
  if (value.startsWith('/uploads/')) {
    return new URL(value, api.defaults.baseURL || window.location.origin).toString()
  }
  if (value.startsWith('/groups/applicants/')) {
    const apiBaseUrl = String(api.defaults.baseURL || window.location.origin).replace(/\/+$/, '')
    return new URL(value.slice(1), `${apiBaseUrl}/`).toString()
  }
  return ''
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

  if (/(?:^|[^a-zа-яїієґ0-9])(?:171|g5)(?=$|[^a-zа-яїієґ0-9])/i.test(text)) {
    return '171/G5'
  }

  if ((compact.includes('інженеріяпрограмногозабезпечення') || compact.includes('softwareengineering')) &&
    (compact.includes('121') || compact.includes('f2'))) {
    return '121/F2 Інженерія програмного забезпечення'
  }

  return normalized
}

const courseOptions = computed(() => [...new Set(
  (allGroups.value || [])
    .map((group) => Number(group.course))
    .filter((course) => Number.isInteger(course) && course > 0)
)].sort((a, b) => a - b))

const hasActiveFilters = computed(() => {
  return Boolean(studentSearchQuery.value.trim()) ||
    courseFilter.value !== 'all' ||
    fundingFilter.value !== 'all'
})

const groupDisplayStats = (group) => {
  const isBudgetOnly = fundingFilter.value === 'budget'
  const isContractOnly = fundingFilter.value === 'contract'
  const total = isBudgetOnly
    ? Number(group.budget_count) || 0
    : isContractOnly
      ? Number(group.contract_count) || 0
      : Number(group.all_students_count ?? group.applicant_count) || 0
  const active = isBudgetOnly
    ? Number(group.active_budget_count) || 0
    : isContractOnly
      ? Number(group.active_contract_count) || 0
      : Number(group.active_students_count) || 0

  return {
    all_students_count: total,
    active_students_count: active,
    academic_leave_count: Number(group.academic_leave_count) || 0,
    budget_count: isContractOnly ? 0 : Number(group.budget_count) || 0,
    active_budget_count: isContractOnly ? 0 : Number(group.active_budget_count) || 0,
    contract_count: isBudgetOnly ? 0 : Number(group.contract_count) || 0,
    active_contract_count: isBudgetOnly ? 0 : Number(group.active_contract_count) || 0
  }
}

const filteredUngroupedApplicants = computed(() => {
  return (ungroupedApplicants.value || []).filter((student) => {
    if (courseFilter.value !== 'all' && Number(student.course) !== Number(courseFilter.value)) return false

    const fundingSource = String(student.funding_source || '').toLocaleLowerCase('uk')
    if (fundingFilter.value === 'budget' && !fundingSource.includes('бюджет')) return false
    if (fundingFilter.value === 'contract' && !fundingSource.includes('контракт')) return false

    return true
  })
})

const groupStats = computed(() => {
  const currentGroups = groups.value || []
  const ungroupedCount = Number(filteredUngroupedApplicants.value.length || 0)

  const groupStatsList = currentGroups.map(groupDisplayStats)
  const groupBudget = groupStatsList.reduce((sum, stats) => sum + stats.budget_count, 0)
  const groupContract = groupStatsList.reduce((sum, stats) => sum + stats.contract_count, 0)
  const groupActiveBudget = groupStatsList.reduce((sum, stats) => sum + stats.active_budget_count, 0)
  const groupActiveContract = groupStatsList.reduce((sum, stats) => sum + stats.active_contract_count, 0)

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
    totalStudents: groupStatsList.reduce((sum, stats) => sum + stats.all_students_count, 0) + ungroupedCount,
    activeStudents: groupStatsList.reduce((sum, stats) => sum + stats.active_students_count, 0) + filteredUngroupedApplicants.value.filter((student) => isActiveApplicant(student)).length,
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

  students_count: 0,

  class_teacher_id: ''

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

async function loadTeachers() {
  try {
    const response = await api.get('/teachers')
    teachers.value = response.data || []
  } catch (error) {
    console.error(error)
    errorMessage.value = error.response?.data?.message || 'Не вдалося завантажити список викладачів.'
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

  if (courseFilter.value !== 'all') {
    result = result.filter((group) => Number(group.course) === Number(courseFilter.value))
  }

  if (fundingFilter.value === 'budget') {
    result = result.filter((group) => groupDisplayStats(group).budget_count > 0)
  } else if (fundingFilter.value === 'contract') {
    result = result.filter((group) => groupDisplayStats(group).contract_count > 0)
  }

  result.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'uk'))

  groups.value = result
}

function resetFilters() {
  courseFilter.value = 'all'
  fundingFilter.value = 'all'
  studentSearchQuery.value = ''
  studentSearchResults.value = []
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

function openStudentDetails(student) {
  selectedApplicantDetails.value = student
  showApplicantDetails.value = true
  isEditingManualDetails.value = false
  manualDetailsError.value = ''
  manualDetailsSuccess.value = ''
  studentSearchResults.value = []
}

function closeStudentDetails() {
  showApplicantDetails.value = false
  selectedApplicantDetails.value = null
  isEditingManualDetails.value = false
  manualDetailsError.value = ''
  manualDetailsSuccess.value = ''
}

function initializeManualStudentForm() {
  const contacts = selectedApplicantDetails.value?.student_contacts || {}
  manualStudentForm.value = {
    benefit_category: String(contacts.benefit_category || ''),
    contacts: Object.fromEntries(
      editableContactFields.map(({ key }) => [key, String(contacts[key] || '')])
    )
  }
}

function toggleManualDetailsEditor() {
  if (isEditingManualDetails.value) {
    cancelManualDetailsEditor()
    return
  }
  initializeManualStudentForm()
  manualDetailsError.value = ''
  manualDetailsSuccess.value = ''
  isEditingManualDetails.value = true
}

function cancelManualDetailsEditor() {
  isEditingManualDetails.value = false
  manualDetailsError.value = ''
  manualDetailsSuccess.value = ''
}

function getAdminAuthHeaders() {
  const token = localStorage.getItem('ped_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function saveManualStudentDetails() {
  const student = selectedApplicantDetails.value
  if (!student?.id) {
    manualDetailsError.value = 'Не вдалося визначити студента.'
    return
  }

  savingManualDetails.value = true
  manualDetailsError.value = ''
  manualDetailsSuccess.value = ''
  try {
    await api.put(`/groups/applicants/${student.id}/manual-details`, {
      contacts: manualStudentForm.value.contacts,
      benefit_category: manualStudentForm.value.benefit_category
    }, { headers: getAdminAuthHeaders() })

    selectedApplicantDetails.value = {
      ...student,
      student_contacts: {
        ...(student.student_contacts || {}),
        ...manualStudentForm.value.contacts,
        benefit_category: manualStudentForm.value.benefit_category
      }
    }
    manualDetailsSuccess.value = 'Контактні дані збережено.'
    isEditingManualDetails.value = false
  } catch (requestError) {
    console.error(requestError)
    manualDetailsError.value = requestError.response?.data?.message || 'Не вдалося зберегти контактні дані.'
  } finally {
    savingManualDetails.value = false
  }
}

async function uploadManualPhoto(event) {
  const file = event.target.files?.[0]
  const student = selectedApplicantDetails.value
  if (!file || !student?.id) return

  uploadingManualPhoto.value = true
  manualDetailsError.value = ''
  manualDetailsSuccess.value = ''
  try {
    const formData = new FormData()
    formData.append('photo', file)
    const response = await api.post(
      `/groups/applicants/${student.id}/manual-photo`,
      formData,
      { headers: getAdminAuthHeaders() }
    )
    selectedApplicantDetails.value = { ...student, photo_url: response.data.photo_url }
    manualDetailsSuccess.value = response.data.message || 'Фото студента збережено.'
  } catch (requestError) {
    console.error(requestError)
    manualDetailsError.value = requestError.response?.data?.message || 'Не вдалося зберегти фото студента.'
  } finally {
    uploadingManualPhoto.value = false
    if (manualPhotoInput.value) manualPhotoInput.value.value = ''
  }
}

function isPhotoField(label) {
  return /(фото|photo|avatar|зображ|image|picture)/i.test(String(label || ''))
}

function isWebLink(value) {
  return /^https?:\/\//i.test(String(value || '').trim())
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
  return sortApplicantsAlphabetically((applicantsByGroup.value[groupId] || []).filter((applicant) =>
    isActiveApplicant(applicant) &&
    matchesFundingFilter(applicant)
  ))
}

function academicLeaveApplicants(groupId) {
  return sortApplicantsAlphabetically((applicantsByGroup.value[groupId] || []).filter((applicant) =>
    isAcademicLeaveApplicant(applicant) &&
    matchesFundingFilter(applicant)
  ))
}

function matchesFundingFilter(applicant) {
  const source = String(applicant.funding_source || '').toLocaleLowerCase('uk')
  if (fundingFilter.value === 'budget') return source.includes('бюджет')
  if (fundingFilter.value === 'contract') return source.includes('контракт')
  return true
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

    students_count: 0,
    class_teacher_id: ''

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
    students_count: group.students_count ?? group.applicant_count ?? 0,
    class_teacher_id: group.class_teacher_id ? String(group.class_teacher_id) : ''
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

    const importedApplicants = Number(response.data.importedApplicants)
    const applicantsWithDetails = Number(response.data.applicantsWithImportedDetails)
    if (Number.isFinite(importedApplicants) && Number.isFinite(applicantsWithDetails)) {
      importMessage.value = `Імпортовано ${response.data.inserted} нових груп, оновлено ${response.data.updated}. Дані CSV збережено для ${applicantsWithDetails} з ${importedApplicants} студентів.`
      if (importedApplicants > 0 && applicantsWithDetails === 0) {
        errorMessage.value = 'Імпорт завершився без додаткових даних студентів. Перезапустіть backend і повторіть імпорт CSV.'
      }
    } else {
      importMessage.value = `Імпортовано ${response.data.inserted} нових груп, оновлено ${response.data.updated}. Backend не підтвердив збереження даних студентів; перезапустіть його та повторіть імпорт CSV.`
    }
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

function handlePhotoArchiveChange(event) {
  const files = Array.from(event.target.files || [])
  if (!files.length) return
  importStudentPhotoArchives(files)
}

async function importStudentPhotoArchives(files) {
  photoImportLoading.value = true
  errorMessage.value = ''
  photoImportMessage.value = ''
  unmatchedPhotoStudents.value = []

  try {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    const response = await api.post('/groups/applicants/photos/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    const archiveErrors = (response.data.archives || [])
      .filter((archive) => archive.error)
      .map((archive) => `${archive.filename}: ${archive.error}`)
    photoImportMessage.value =
      `Фото збережено в базі для ${response.data.matched} студентів. Без фото в архіві (це нормально): ${response.data.missingPhotos}. Не вдалося зіставити через неоднозначні дані: ${response.data.unmatched}. Архівів: ${files.length}.` +
      (archiveErrors.length ? ` Помилки: ${archiveErrors.join('; ')}` : '')
    unmatchedPhotoStudents.value = response.data.unmatchedStudents || []
    await loadGroups()
  } catch (error) {
    console.error(error)
    const archives = error.response?.data?.archives || []
    const archiveErrors = archives
      .map((archive) => `${archive.filename}: ${archive.error || 'помилка обробки'}`)
      .join('; ')
    errorMessage.value = archiveErrors ||
      error.response?.data?.message ||
      'Не вдалося імпортувати фото студентів.'
  } finally {
    photoImportLoading.value = false
    if (photoArchiveInput.value) photoArchiveInput.value.value = null
  }
}

function handleContactsFileChange(event) {
  const file = event.target.files?.[0]
  if (file) importStudentContacts(file)
}

async function importStudentContacts(file) {
  contactsImportLoading.value = true
  errorMessage.value = ''
  contactsImportMessage.value = ''
  unmatchedContactStudents.value = []

  try {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post('/groups/applicants/contacts/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    contactsImportMessage.value =
      `Контакти збережено для ${response.data.matched} студентів. Не зіставлено: ${response.data.unmatched}. Класних керівників прив'язано: ${response.data.linkedClassTeachers || 0}.` +
      (response.data.classTeacherWarnings?.length
        ? ` Перевірте дані класних керівників: ${response.data.classTeacherWarnings.join('; ')}.`
        : '')
    unmatchedContactStudents.value = response.data.unmatchedStudents || []

    const expandedGroup = allGroups.value.find((group) => Number(group.id) === Number(expandedGroupId.value))
    applicantsByGroup.value = {}
    expandedGroupId.value = null
    await loadGroups()
    if (expandedGroup) {
      const refreshedGroup = allGroups.value.find((group) => Number(group.id) === Number(expandedGroup.id))
      if (refreshedGroup) await loadGroupApplicants(refreshedGroup)
    }
  } catch (error) {
    console.error(error)
    errorMessage.value = error.response?.data?.message || 'Не вдалося імпортувати контакти студентів.'
  } finally {
    contactsImportLoading.value = false
    if (contactsFileInput.value) contactsFileInput.value.value = null
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
  loadTeachers()
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

.import-button.disabled {
  opacity: 0.6;
  pointer-events: none;
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

.unmatched-import-list {
  padding: 11px 14px;
  border: 1px solid #fcd34d;
  border-radius: 12px;
  background: #fffbeb;
  color: #92400e;
}

.unmatched-import-list summary {
  cursor: pointer;
  font-weight: 700;
}

.unmatched-import-list ul {
  max-height: 240px;
  overflow-y: auto;
  margin: 10px 0 0;
  padding-left: 22px;
}

.unmatched-import-list li + li {
  margin-top: 5px;
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
  display: grid;
  grid-template-columns: repeat(2, minmax(155px, 1fr)) minmax(210px, 1.4fr) auto;
  align-items: end;
  gap: 10px;
  width: 100%;
}

.filter-control {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  color: #475569;
  font-size: 0.78rem;
  font-weight: 700;
}

.filter-control input,
.filter-control select {
  width: 100%;
  min-width: 0;
  height: 42px;
  padding: 0 12px;
  border: 1px solid #dbe4f0;
  border-radius: 12px;
  background: #f8fafc;
  color: #0f172a;
  outline: none;
  font: inherit;
  font-weight: 500;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.filter-control input:focus,
.filter-control select:focus {
  border-color: #7aa7f7;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.filter-control input::placeholder { color: #94a3b8; }

.student-search-box {
  min-width: 0;
}

.filter-results-count {
  margin: 8px 4px 0;
  color: #64748b;
  font-size: 0.86rem;
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

.combined-summary-section {
  margin: 18px 20px 20px;
  overflow: hidden;
  border: 1px solid #cfe0fa;
  border-radius: 14px;
  background: linear-gradient(145deg, #f8fbff, #fff);
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.07);
}

.combined-summary-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid #dce8f8;
  background: linear-gradient(110deg, #edf5ff, #f8fbff);
}

.combined-summary-eyebrow {
  display: block;
  margin-bottom: 4px;
  color: #2563eb;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.combined-summary-heading h3 {
  margin: 0;
  color: #16325c;
  font-size: 1rem;
}

.combined-summary-count {
  flex: 0 0 auto;
  padding: 6px 10px;
  border: 1px solid #cfe0fa;
  border-radius: 999px;
  background: #fff;
  color: #315b91;
  font-size: 0.76rem;
  font-weight: 700;
}

.combined-summary-section .summary-table th {
  background: #f5f9ff;
}

.combined-summary-section .summary-table tbody tr:last-child td {
  border-bottom: 0;
}

.combined-summary-section .summary-table tbody tr:hover td {
  background: #f8fbff;
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
  .filter-group { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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

.inline-actions .academic-leave-edit {
  padding: 8px 13px;
  border: 0;
  border-radius: 10px;
  background: #245be8;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  box-shadow: 0 5px 12px rgba(37, 99, 235, 0.24);
}

.inline-actions .academic-leave-edit:hover {
  background: #1f4fd1;
  box-shadow: 0 7px 15px rgba(37, 99, 235, 0.3);
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

.class-teacher-label {
  display: block;
  margin-top: 5px;
  color: #64748b;
  font-size: 0.88rem;
  font-weight: 500;
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

.student-name-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: #1d4ed8;
  font: inherit;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}

.student-name-button:hover {
  text-decoration: underline;
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

.student-details-modal {
  width: min(1120px, 100%);
  max-width: 1120px;
  max-height: min(92vh, 960px);
  overflow-y: auto;
  padding: 24px;
}

.student-details-modal .modal-header {
  margin-bottom: 20px;
}

.student-modal-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.student-edit-button,
.student-photo-button,
.manual-save-button,
.manual-cancel-button {
  border: 0;
  border-radius: 9px;
  padding: 9px 12px;
  font-weight: 700;
  cursor: pointer;
}

.student-edit-button,
.student-photo-button {
  color: #1d4ed8;
  background: #eff6ff;
}

.student-details-layout {
  display: grid;
  grid-template-columns: minmax(250px, 0.75fr) minmax(0, 1.6fr);
  align-items: start;
  gap: 24px;
}

.student-photo-wrap {
  position: sticky;
  top: 0;
  min-height: 340px;
  margin: 0;
  overflow: hidden;
  border: 1px solid #dbe4f0;
  border-radius: 16px;
  background: #f1f5f9;
}

.student-photo-wrap img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 340px;
  max-height: 480px;
  object-fit: contain;
}

.student-photo-placeholder {
  display: grid;
  min-height: 340px;
  place-items: center;
  color: #64748b;
  font-weight: 700;
}

.student-photo-button {
  position: absolute;
  right: 12px;
  bottom: 12px;
  left: 12px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.12);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  clip-path: inset(50%);
}

.student-information {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 18px;
}

.student-info-section h3 {
  margin: 0 0 10px;
  color: #334155;
  font-size: 0.98rem;
}

.student-import-notice {
  padding: 11px 14px;
  border: 1px solid #fcd34d;
  border-radius: 10px;
  background: #fffbeb;
  color: #92400e;
  font-size: 0.9rem;
}

.manual-student-editor {
  padding: 16px;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  background: #f8fbff;
}

.manual-student-editor h3 {
  margin: 0 0 12px;
  color: #1e3a8a;
  font-size: 1rem;
}

.manual-student-editor form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.manual-student-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.manual-student-field span {
  color: #475569;
  font-size: 0.82rem;
  font-weight: 700;
}

.manual-student-field input,
.manual-student-field textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 9px 10px;
  background: #fff;
  color: #0f172a;
  font: inherit;
}

.manual-student-field textarea {
  resize: vertical;
}

.manual-student-actions {
  display: flex;
  grid-column: 1 / -1;
  justify-content: flex-end;
  gap: 8px;
}

.manual-save-button {
  color: #fff;
  background: #1d4ed8;
}

.manual-cancel-button {
  color: #334155;
  background: #e2e8f0;
}

.manual-save-button:disabled,
.student-photo-button:disabled {
  opacity: 0.65;
  cursor: wait;
}

.manual-student-error,
.manual-student-success {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
}

.manual-student-error {
  color: #b91c1c;
  background: #fef2f2;
}

.manual-student-success {
  color: #047857;
  background: #ecfdf5;
}

.student-details-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.student-detail-row {
  min-width: 0;
  padding: 11px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
}

.student-detail-row dt {
  margin-bottom: 5px;
  color: #64748b;
  font-size: 0.86rem;
  font-weight: 700;
}

.student-detail-row dd {
  margin: 0;
  color: #0f172a;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  line-height: 1.45;
}

.student-detail-row a {
  color: #1d4ed8;
}

.student-contacts-disclosure {
  overflow: hidden;
  border: 1px solid #dbe4f0;
  border-radius: 12px;
  background: #fff;
}

.student-contacts-disclosure summary {
  padding: 14px 16px;
  color: #1e3a8a;
  background: #eff6ff;
  font-weight: 700;
  cursor: pointer;
}

.student-contacts-disclosure[open] summary {
  border-bottom: 1px solid #dbe4f0;
}

.student-contacts-disclosure .student-details-list {
  padding: 14px;
}

.student-contacts-empty {
  margin: 0;
  padding: 14px 16px;
  color: #64748b;
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

  .applicants-groups {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .filter-group { grid-template-columns: 1fr; }

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

  .student-details-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }

  .student-photo-wrap,
  .student-photo-placeholder {
    position: static;
    min-height: 260px;
    max-height: 340px;
  }

  .student-photo-wrap img {
    min-height: 260px;
    max-height: 340px;
  }

  .student-details-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .manual-student-editor form {
    grid-template-columns: minmax(0, 1fr);
  }

  .student-details-modal {
    padding: 14px;
  }
}

@media (min-width: 561px) and (max-width: 760px) {
  .student-details-layout {
    grid-template-columns: minmax(180px, 0.7fr) minmax(0, 1.3fr);
    gap: 16px;
  }

  .student-photo-wrap,
  .student-photo-placeholder {
    min-height: 280px;
  }

  .student-photo-wrap img {
    min-height: 280px;
  }
}
</style>
