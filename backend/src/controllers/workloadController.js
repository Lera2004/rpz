import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'
import pool from '../config/database.js'
import { exportWorkloadToExcel } from '../workloadExcelExporter.js'
import { buildOrderHoursDiagnostics } from '../utils/workloadHours.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ======================================================
// ШАБЛОН EXCEL
// ======================================================

const projectRoot = path.resolve(__dirname, '../../..')
const uploadsRoot = path.resolve(projectRoot, 'uploads')

const templateDirectory = path.resolve(
  uploadsRoot,
  'templates'
)

const fallbackTemplatePath = path.resolve(
  uploadsRoot,
  'Басок_Pednavantazhennia_blank_28_08_2025.xlsx'
)

const templateFileName =
  'Басок_Pednavantazhennia_blank_28_08_2025.xlsx'

// ======================================================
// ПОЛЯ, ЯКІ МОЖНА РЕДАГУВАТИ
// ======================================================

const editableFields = new Set([
  'total_hours',
  'hours_per_week',
  'lectures_hours',
  'practical_hours',
  'laboratory_hours',
  'seminars_hours',
  'self_study_hours',
  'course_projects_hours',
  'calculation_graphic_hours',
  'field_training_hours',
  'control_type',
  'exam',
  'control_works',
  'teacher_id',
  'backup_teacher_id'
])

// ======================================================
// ТАБЛИЦЯ ПІДТВЕРДЖЕННЯ НАВАНТАЖЕННЯ
// ======================================================

async function ensureWorkloadConfirmationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS workload_confirmations (
      teacher_id INT PRIMARY KEY,
      confirmed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_workload_confirmation_teacher
        FOREIGN KEY (teacher_id)
        REFERENCES teachers(id)
        ON DELETE CASCADE
    )
  `)
}

// ======================================================
// ОТРИМАННЯ НАВАНТАЖЕННЯ ВИКЛАДАЧА
// ======================================================

async function buildWorkloadPayload(teacherId) {

  // ----------------------------------------------------
  // Викладач
  // ----------------------------------------------------

  const [teacher] = await pool.query(`
    SELECT
      t.id,
      t.full_name,
      t.category,
      t.position,
      t.rate,
      c.name AS commission_name
    FROM teachers t
    LEFT JOIN commissions c
      ON c.id = t.commission_id
    WHERE t.id = ?
    LIMIT 1
  `, [teacherId])

  if (!teacher.length) {
    throw new Error('Викладача не знайдено у teachers')
  }

  // ----------------------------------------------------
  // Останній навчальний план
  // ----------------------------------------------------

  const [latest] = await pool.query(`
    SELECT
      id,
      name,
      academic_year,
      file_name
    FROM study_plans
    ORDER BY id DESC
    LIMIT 1
  `)

  if (!latest.length) {
    return {
      teacher: teacher[0],
      studyPlan: null,
      rows: []
    }
  }

  // ----------------------------------------------------
  // Дисципліни
  // ----------------------------------------------------

  const [rows] = await pool.query(`
    SELECT
      pd.id,
      pd.teacher_id,
      pd.backup_teacher_id,

      d.code,
      d.name,

      sg.name AS group_name,
      COALESCE((SELECT COUNT(*) FROM group_applicants ga_active WHERE ga_active.group_id = sg.id AND (ga_active.status IS NULL OR LOWER(TRIM(ga_active.status)) IN ('active', 'активний', 'активний студент', 'повернено з академвідпустки'))), 0) AS students_count,

      ps.sheet_name,

      pd.semester,
      pd.total_hours,
      pd.hours_per_week,

      pd.lectures_hours,
      pd.practical_hours,
      pd.laboratory_hours,
      pd.seminars_hours,

      pd.self_study_hours,
      pd.course_projects_hours,
      pd.calculation_graphic_hours,
      pd.field_training_hours,

      pd.control_type,
      pd.exam,
      pd.control_works,

      CASE
        WHEN pd.teacher_id = ?
        THEN 'Основний викладач'
        ELSE 'Дублер'
      END AS teacher_role

    FROM plan_disciplines pd

    JOIN disciplines d
      ON d.id = pd.discipline_id

    JOIN student_groups sg
      ON sg.id = pd.group_id

    JOIN (
      SELECT
        study_plan_id,
        group_id,
        MIN(sheet_name) AS sheet_name
      FROM plan_sheets
      GROUP BY study_plan_id, group_id
    ) ps
      ON ps.study_plan_id = pd.study_plan_id
      AND ps.group_id = pd.group_id

    WHERE pd.study_plan_id = ?
      AND (
        pd.teacher_id = ?
        OR pd.backup_teacher_id = ?
      )

    ORDER BY
      sg.name,
      pd.semester,
      d.name
  `, [
    teacherId,
    latest[0].id,
    teacherId,
    teacherId
  ])

  // ====================================================
  // ДОПОМІЖНА ФУНКЦІЯ
  // ====================================================

  const toNumber = value => {
    const number = Number(value || 0)

    return Number.isFinite(number)
      ? number
      : 0
  }

  const isCreditControlType = value => {
    const text = String(value || '').trim().toLowerCase()

    if (!text) {
      return false
    }

    return [
      'залік',
      'диф. залік',
      'диф залік',
      'диференційний залік',
      'зв',
      'зв.'
    ].includes(text)
  }

  // ====================================================
  // ФОРМУВАННЯ РЯДКІВ
  // ====================================================

  const resultRows = rows.map(row => {

    const lectures =
      toNumber(row.lectures_hours)

    const practicalHours =
      toNumber(row.practical_hours)

    const laboratory =
      toNumber(row.laboratory_hours)

    const seminars =
      toNumber(row.seminars_hours)

    const selfStudy =
      toNumber(row.self_study_hours)

    const courseWork =
      toNumber(row.course_projects_hours)

    const calculationWork =
      toNumber(row.calculation_graphic_hours)

    const fieldTraining =
      toNumber(row.field_training_hours)

    const isPrimary =
      row.teacher_role === 'Основний викладач'

    const isPractice =
      row.code?.startsWith('PRACTICE_')

    const studentsCount =
      toNumber(row.students_count)

    const practiceAuditoryHours =
      practicalHours + fieldTraining ||
      (
        isPractice
          ? toNumber(row.total_hours)
          : 0
      )

    const practical =
      isPractice
        ? practiceAuditoryHours
        : practicalHours

    const contactHours =
      lectures + practical

    const otherWorkHours =
      courseWork +
      calculationWork +
      (
        isPractice
          ? 0
          : fieldTraining
      )

    const canCountControl =
      isPrimary || isPractice

    const hasCredit =
      isCreditControlType(row.control_type) &&
      !row.exam

    const hasExam =
      Boolean(row.exam)

    const examConsultationHours =
      canCountControl && hasExam
        ? 2
        : 0

    const examAcceptanceHours =
      canCountControl && hasExam
        ? studentsCount * 0.33
        : 0

    const okrHours =
      isPrimary && !isPractice
        ? studentsCount * 0.25
        : 0

    const result = {

      id: row.id,

      teacherId:
        row.teacher_id,

      backupTeacherId:
        row.backup_teacher_id,

      code:
        row.code?.startsWith('PRACTICE_')
          ? ''
          : row.code,

      name:
        row.name,

      type:
        row.code?.startsWith('PRACTICE_')
          ? 'practice'
          : row.code?.startsWith('ОК')
            ? 'ОК'
            : row.code?.startsWith('ВК')
              ? 'ВК'
              : 'discipline',

      course:
        Number(
          String(row.sheet_name).split('-')[0]
        ) || null,

      group:
        row.group_name,

      semester:
        row.semester,

      teacherRole:
        row.teacher_role,

      totalHours:
        toNumber(row.total_hours),

      hoursPerWeek:
        toNumber(row.hours_per_week),

      lectures,

      practical,

      laboratory,

      seminars,

      contactHours,

      selfStudy,

      courseWork,

      calculationWork,

      fieldTraining,

      otherWorkHours,

      creditAcceptanceHours:
        canCountControl && hasCredit
          ? 1
          : 0,

      examConsultationHours,

      examAcceptanceHours,

      courseWorkExecution: 0,

      courseWorkDefense: 0,

      okrHours,

      officialHours:
        contactHours +
        otherWorkHours +
        (
          canCountControl && hasCredit
            ? 1
            : 0
        ) +
        examConsultationHours +
        examAcceptanceHours +
        okrHours,

      countedInTotal: true,

      studentsCount,

      controlType:
        row.control_type,

      exam:
        row.exam,

      // ДКР/керівництво дипломною роботою
      // не прив'язується до загальних контрольних робіт із плану.
      // Воно заповнюється тільки в окремих рядках розподілу для дипломників.
      controlWorks:
        ''
    }

    // --------------------------------------------------
    // ДУБЛЕР
    // --------------------------------------------------

    if (!isPrimary && !isPractice) {

      result.lectures = 0

      result.practical =
        practicalHours

      result.contactHours =
        practicalHours

      result.selfStudy = 0

      result.courseWork = 0

      result.calculationWork = 0

      result.fieldTraining = 0

      result.otherWorkHours = 0

      result.creditAcceptanceHours = 0

      result.examConsultationHours = 0

      result.examAcceptanceHours = 0

      result.okrHours = 0

      result.officialHours =
        practicalHours
    }

    return result
  })

  // ====================================================
  // РОЗПОДІЛ НАВАНТАЖЕННЯ
  // ====================================================

  const [distributionRows] = await pool.query(`
    SELECT
      sd.id,
      sd.group_id,
      sd.work_type,
      sd.students_count,

      sg.name AS group_name,
      sg.course,
      COALESCE((SELECT COUNT(*) FROM group_applicants ga_active WHERE ga_active.group_id = sg.id AND (ga_active.status IS NULL OR LOWER(TRIM(ga_active.status)) IN ('active', 'активний', 'активний студент', 'повернено з академвідпустки'))), 0) AS group_students_count

    FROM student_distributions sd

    JOIN student_groups sg
      ON sg.id = sd.group_id

    WHERE sd.teacher_id = ?
      AND sg.course IN (3, 4)

    ORDER BY
      sg.name,
      sd.work_type
  `, [teacherId])

  const distributionByGroup =
    new Map()

  const distributionResult = []

  // ====================================================
  // ОБРОБКА РОЗПОДІЛУ
  // ====================================================

  distributionRows.forEach(row => {

    const allocated =
      toNumber(row.students_count)

    const groupStudents =
      toNumber(row.group_students_count)

    const current =
      distributionByGroup.get(row.group_id) || {
        courseWorkExecution: 0,
        courseWorkDefense: 0,
        okrHours: 0,
        studentsCount: 0,
        courseworkStudentsCount: 0,
        diplomaStudentsCount: 0
      }

    let distributionHours = 0

    let distributionName = ''

    // --------------------------------------------------
    // Курсова
    // --------------------------------------------------

    if (
      row.work_type === 'coursework_3' ||
      row.work_type === 'coursework_4'
    ) {

      current.courseWorkExecution +=
        allocated * 3

      current.courseworkStudentsCount +=
        allocated

      current.studentsCount +=
        allocated
    }

    // --------------------------------------------------
    // Захист курсової
    // --------------------------------------------------

    else if (
      row.work_type ===
        'exam_commission_coursework_3' ||
      row.work_type ===
        'exam_commission_coursework_4'
    ) {

      current.courseWorkDefense +=
        groupStudents * 0.33

      current.studentsCount +=
        groupStudents
    }

    // --------------------------------------------------
    // Диплом
    // --------------------------------------------------

    else if (
      row.work_type === 'diploma'
    ) {

      distributionHours =
        groupStudents * 2

      distributionName =
        'Керівництво ДП'

      current.diplomaStudentsCount +=
        groupStudents

      current.studentsCount +=
        groupStudents
    }

    // --------------------------------------------------
    // Спеціальна частина
    // --------------------------------------------------

    else if (
      row.work_type === 'diploma_special'
    ) {

      distributionHours =
        allocated * 11

      distributionName =
        'Консультації зі спец. частини'

      current.diplomaStudentsCount +=
        allocated

      current.studentsCount +=
        allocated
    }

    // --------------------------------------------------
    // Економічна частина
    // --------------------------------------------------

    else if (
      row.work_type === 'diploma_economics'
    ) {

      distributionHours =
        groupStudents * 2

      distributionName =
        'Консультації з економічної частини'

      current.diplomaStudentsCount +=
        groupStudents

      current.studentsCount +=
        groupStudents
    }

    // --------------------------------------------------
    // Охорона праці
    // --------------------------------------------------

    else if (
      row.work_type === 'diploma_labor'
    ) {

      distributionHours =
        groupStudents

      distributionName =
        'Консультації з охорони праці'

      current.diplomaStudentsCount +=
        groupStudents

      current.studentsCount +=
        groupStudents
    }

    // --------------------------------------------------
    // Екзаменаційна комісія
    // --------------------------------------------------

    else if (
      row.work_type ===
        'exam_commission_diploma' ||
      row.work_type ===
        'exam_commission'
    ) {

      distributionHours =
        groupStudents * 0.5 +
        groupStudents * 0.25

      current.okrHours +=
        groupStudents * 0.25

      current.studentsCount +=
        groupStudents

      distributionName =
        'ДЕКК — член екзаменаційної комісії з дипломування'
    }

    // --------------------------------------------------
    // Створюємо окремий рядок
    // --------------------------------------------------

    if (
      distributionHours &&
      distributionName
    ) {

      distributionResult.push({

        id:
          `distribution-${row.id}`,

        code:
          '',

        name:
          distributionName,

        type:
          'розподіл',

        course:
          Number(row.course),

        group:
          row.group_name,

        semester:
          row.work_type === 'diploma_special'
            ? 8
            : '—',

        teacherRole:
          'Розподіл',

        totalHours:
          distributionHours,

        hoursPerWeek:
          0,

        lectures:
          0,

        practical:
          0,

        contactHours:
          distributionHours,

        selfStudy:
          0,

        courseWork:
          0,

        calculationWork:
          0,

        fieldTraining:
          0,

        otherWorkHours:
          0,

        officialHours:
          distributionHours,

        countedInTotal:
          true,

        studentsCount:
          (
            row.work_type ===
              'exam_commission_diploma' ||
            row.work_type ===
              'exam_commission'
          )
            ? groupStudents
            : allocated,

        okrHours:
          row.work_type.startsWith(
            'exam_commission'
          )
            ? groupStudents * 0.25
            : 0,

        creditAcceptanceHours:
          0,

        examConsultationHours:
          0,

        courseWorkExecution:
          0,

        courseWorkDefense:
          0,

        controlType:
          '',

        exam:
          '',

        controlWorks:
          row.work_type === 'diploma'
            ? distributionHours
            : ''
      })
    }

    distributionByGroup.set(
      row.group_id,
      current
    )
  })

  // ====================================================
  // ДОДАЄМО КУРСОВІ ДО ДИСЦИПЛІН
  // ====================================================

  for (
    const [groupId, distribution]
    of distributionByGroup
  ) {

    const groupDistribution =
      distributionRows.find(
        item =>
          item.group_id === groupId
      )

    const hasCoursework =
      distribution.courseWorkExecution ||
      distribution.courseWorkDefense

    const isFourthCourse =
      Number(
        groupDistribution?.course
      ) === 4

    const target =
      resultRows.find(row => {

        if (
          row.group !==
            groupDistribution?.group_name
        ) {
          return false
        }

        if (
          row.teacherRole ===
            'Розподіл'
        ) {
          return false
        }

        if (
          hasCoursework &&
          isFourthCourse
        ) {

          return (
            row.name ===
            "Візуальне об'єктно-орієнтоване програмування"
          )
        }

        return true
      })

    // --------------------------------------------------
    // Якщо дисципліна вже є
    // --------------------------------------------------

    if (target) {

      target.courseWorkExecution +=
        distribution.courseWorkExecution

      target.courseWorkDefense +=
        distribution.courseWorkDefense

      target.okrHours +=
        distribution.okrHours

      target.studentsCount =
        distribution.courseworkStudentsCount || 0

      target.officialHours +=
        distribution.courseWorkExecution +
        distribution.courseWorkDefense +
        distribution.okrHours
    }

    // --------------------------------------------------
    // Якщо дисципліни немає
    // --------------------------------------------------

    else if (
      distribution.courseWorkExecution ||
      distribution.courseWorkDefense
    ) {

      const courseworkHours =
        distribution.courseWorkExecution +
        distribution.courseWorkDefense

      resultRows.push({

        id:
          `coursework-${groupId}`,

        code:
          isFourthCourse
            ? 'ОК16'
            : '',

        name:
          isFourthCourse
            ? "Візуальне об'єктно-орієнтоване програмування"
            : 'Курсова робота',

        type:
          'розподіл',

        semester:
          isFourthCourse
            ? 7
            : '—',

        course:
          Number(
            groupDistribution.course
          ),

        group:
          groupDistribution.group_name,

        teacherRole:
          'Розподіл',

        totalHours:
          courseworkHours,

        hoursPerWeek:
          0,

        lectures:
          0,

        practical:
          0,

        contactHours:
          courseworkHours,

        selfStudy:
          0,

        courseWork:
          0,

        calculationWork:
          0,

        fieldTraining:
          0,

        otherWorkHours:
          0,

        officialHours:
          courseworkHours,

        countedInTotal:
          true,

        studentsCount:
          distribution.courseworkStudentsCount || 0,

        okrHours:
          0,

        creditAcceptanceHours:
          0,

        examConsultationHours:
          0,

        examAcceptanceHours:
          0,

        courseWorkExecution:
          distribution.courseWorkExecution,

        courseWorkDefense:
          distribution.courseWorkDefense,

        controlType:
          '',

        exam:
          '',

        controlWorks:
          ''
      })
    }
  }

  // ====================================================
  // ДОДАЄМО ОКРЕМІ РЯДКИ РОЗПОДІЛУ
  // ====================================================

  resultRows.push(
    ...distributionResult
  )

  // ====================================================
  // ПІДСУМКИ
  // ====================================================

  const sum = key =>
    resultRows.reduce(
      (total, row) =>
        total +
        toNumber(row[key]),
      0
    )

  const backupRows =
    resultRows.filter(
      row =>
        row.teacherRole ===
        'Дублер'
    )

  const totalSum = key =>
    resultRows.reduce(
      (total, row) =>
        total +
        toNumber(row[key]),
      0
    )

  const calculatedHours = totalSum('officialHours')
  const orderHoursDiagnostics = buildOrderHoursDiagnostics(calculatedHours)

  console.log('[WORKLOAD HOURS]', JSON.stringify(orderHoursDiagnostics))

  // ====================================================
  // ПІДТВЕРДЖЕННЯ
  // ====================================================

  await ensureWorkloadConfirmationsTable()

  const [confirmation] =
    await pool.query(
      `
        SELECT confirmed_at
        FROM workload_confirmations
        WHERE teacher_id = ?
      `,
      [teacherId]
    )

  // ====================================================
  // РЕЗУЛЬТАТ
  // ====================================================

  return {

    teacher:
      teacher[0],

    confirmed:
      confirmation.length > 0,

    confirmedAt:
      confirmation[0]?.confirmed_at ||
      null,

    studyPlan:
      latest[0],

    policy: {

      primaryTeacherOnly:
        false,

      backupIncluded:
        true,

      contactHours:
        'лекції + практичні; лабораторні та семінари винесені з таблиці навантаження',

      officialHours:
        'аудиторні та інші викладацькі години основного викладача і дублера; самостійна робота не включається'
    },

    rows:
      resultRows,

    summary: {

      rows:
        resultRows.length,

      primaryRows:
        resultRows.length -
        backupRows.length,

      backupRows:
        backupRows.length,

      plannedHours:
        sum('totalHours'),

      contactHours:
        totalSum('contactHours'),

      selfStudyHours:
        totalSum('selfStudy'),

      otherWorkHours:
        totalSum('otherWorkHours'),

      okrHours:
        totalSum('okrHours'),

      officialHours:
        calculatedHours,

      calculatedHours,

      orderHours:
        orderHoursDiagnostics.orderHours,

      reservePercent:
        orderHoursDiagnostics.reservePercent,

      hoursWithReserve:
        orderHoursDiagnostics.hoursWithReserve
    }
  }
}

// ======================================================
// GET НАВАНТАЖЕННЯ
// ======================================================

export async function getWorkload(req, res) {

  try {

    const teacherId =
      Number(req.query.teacher_id)

    if (!teacherId) {
      return res.json([])
    }

    const payload =
      await buildWorkloadPayload(
        teacherId
      )

    res.json(payload)

  } catch (error) {

    console.error(
      'ПОМИЛКА ОТРИМАННЯ ПЕДАГОГІЧНОГО НАВАНТАЖЕННЯ:',
      error
    )

    res.status(500).json({
      message: error.message,
      code: error.code
    })
  }
}

// ======================================================
// ПЕРЕВІРКА ШАБЛОНУ
// ======================================================

async function ensureTemplateFile() {

  await fs.mkdir(
    templateDirectory,
    {
      recursive: true
    }
  )

  const targetPath =
    path.join(
      templateDirectory,
      templateFileName
    )

  try {

    await fs.access(
      targetPath
    )

  } catch {

    await fs.copyFile(
      fallbackTemplatePath,
      targetPath
    )
  }

  return targetPath
}

// ======================================================
// ЧИСЛОВЕ ЗНАЧЕННЯ ДЛЯ EXCEL
// ======================================================

function toNumericCell(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return ''
  }

  const number =
    Number(value)

  if (
    !Number.isFinite(number) ||
    number === 0
  ) {
    return ''
  }

  return number
}

// ======================================================
// ВИБІР РЯДКІВ ДЛЯ ЕКСПОРТУ
// ======================================================

function getExportRows(
  rows,
  teacherId
) {

  return rows.filter(row => {

    // Окремі рядки розподілу
    // сюди не вставляємо
    if (
      row.teacherRole ===
      'Розподіл'
    ) {
      return false
    }

    // Основний викладач
    if (
      row.teacherRole ===
      'Основний викладач'
    ) {

      return (
        Number(row.teacherId) ===
        Number(teacherId)
      )
    }

    // Дублер
    if (
      row.teacherRole ===
      'Дублер'
    ) {

      return (
        Number(row.backupTeacherId) ===
        Number(teacherId)
      )
    }

    return (
      Number(row.teacherId) ===
      Number(teacherId) ||
      Number(row.backupTeacherId) ===
      Number(teacherId)
    )
  })
}

// ======================================================
// СЕМЕСТР
// ======================================================

function normalizeSemester(value) {

  const number =
    Number(value)

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return ''
  }

  // Якщо вже 1 або 2
  if (
    number === 1 ||
    number === 2
  ) {
    return number
  }

  // Якщо з БД приходить 1..8
  return number % 2 === 0
    ? 2
    : 1
}

// ======================================================
// КІЛЬКІСТЬ ТИЖНІВ
// ======================================================

function calculateSemesterWeeks(row) {

  const totalHours =
    Number(row.totalHours || 0)

  const hoursPerWeek =
    Number(row.hoursPerWeek || 0)

  if (
    totalHours > 0 &&
    hoursPerWeek > 0
  ) {

    const weeks =
      totalHours /
      hoursPerWeek

    if (
      Number.isFinite(weeks) &&
      weeks > 0
    ) {

      return Number.isInteger(weeks)
        ? weeks
        : Number(
            weeks.toFixed(2)
          )
    }
  }

  return ''
}

// ======================================================
// ЗАПИС КЛІТИНКИ ШАБЛОНУ
// ======================================================
//
// ГОЛОВНИЙ ПРИНЦИП:
//
// Ми НЕ створюємо нову таблицю.
// Ми НЕ видаляємо клітинку.
// Ми НЕ змінюємо форматування.
//
// Беремо клітинку, яка вже існує
// у шаблоні, і змінюємо тільки value.
// ======================================================

function setTemplateCellValue(
  sheet,
  cellRef,
  value
) {

  const existingCell =
    sheet[cellRef] || {}

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {

    existingCell.v = ''

    existingCell.t = 's'

    if (existingCell.f) {
      delete existingCell.f
    }

    sheet[cellRef] =
      existingCell

    return
  }

  existingCell.v =
    value

  existingCell.t =
    typeof value === 'number' &&
    Number.isFinite(value)
      ? 'n'
      : 's'

  if (existingCell.f) {
    delete existingCell.f
  }

  sheet[cellRef] =
    existingCell
}

// ======================================================
// ОЧИЩЕННЯ СТАРИХ РЯДКІВ
// ======================================================
//
// У шаблоні:
//
// 15–34
// 40–57
//
// Ми НЕ видаляємо рядки.
// Тільки очищуємо старі значення.
// ======================================================

function clearTemplateRows(sheet) {

  const dataRanges = [

    {
      start: 15,
      end: 34
    },

    {
      start: 40,
      end: 57
    }
  ]

  for (
    const range
    of dataRanges
  ) {

    for (
      let row = range.start;
      row <= range.end;
      row++
    ) {

      for (
        let column = 0;
        column < 25;
        column++
      ) {

        const cellRef =
          XLSX.utils.encode_cell({
            r: row - 1,
            c: column
          })

        const cell =
          sheet[cellRef]

        // Якщо клітинки немає —
        // не створюємо її
        if (!cell) {
          continue
        }

        // Очищуємо тільки значення
        cell.v = ''
        cell.t = 's'

        if (cell.f) {
          delete cell.f
        }

        sheet[cellRef] =
          cell
      }
    }
  }
}

// ======================================================
// ЗАПИС ОДНОГО РЯДКА У ШАБЛОН
// ======================================================
//
// Структура шаблону:
//
// A = Код
// B = Група
// C = Кількість студентів
// D = Курс
// E = Семестр
// F = Тривалість семестру
// G = Годин у тиждень
// H = Назва предмета
// I = Всього за навчальним планом
// J = Аудиторні всього
// K = Лекції
// L = Практичні
// M = Лабораторні
// N = Семінари
// O = Самостійна робота
// P = РГР
// Q = Консультації з СР
// R = Курсові — виконання
// S = Курсові — захист
// T = ОКР
// U = ДКР / контрольні роботи
// V = Прийняття заліку
// W = Консультація до іспиту
// X = Прийняття іспиту
// Y = Всього до оплати
// ======================================================

function writeWorkloadRowToTemplate(
  sheet,
  rowNumber,
  row
) {

  const studentsCount =
    toNumericCell(
      row.studentsCount
    )

  const course =
    toNumericCell(
      row.course
    )

  const semester =
    normalizeSemester(
      row.semester
    )

  const semesterWeeks =
    calculateSemesterWeeks(
      row
    )

  const hoursPerWeek =
    toNumericCell(
      row.hoursPerWeek
    )

  const totalHours =
    toNumericCell(
      row.totalHours
    )

  const contactHours =
    toNumericCell(
      row.contactHours
    )

  const lectures =
    toNumericCell(
      row.lectures
    )

  const practical =
    toNumericCell(
      row.practical
    )

  const laboratory =
    toNumericCell(
      row.laboratory
    )

  const seminars =
    toNumericCell(
      row.seminars
    )

  const selfStudy =
    toNumericCell(
      row.selfStudy
    )

  const calculationWork =
    toNumericCell(
      row.calculationWork
    )

  const fieldTraining =
    toNumericCell(
      row.fieldTraining
    )

  const courseWorkExecution =
    toNumericCell(
      row.courseWorkExecution
    )

  const courseWorkDefense =
    toNumericCell(
      row.courseWorkDefense
    )

  const okrHours =
    toNumericCell(
      row.okrHours
    )

  const controlWorks =
    toNumericCell(
      row.controlWorks
    )

  const creditAcceptanceHours =
    toNumericCell(
      row.creditAcceptanceHours
    )

  const examConsultationHours =
    toNumericCell(
      row.examConsultationHours
    )

  const examAcceptanceHours =
    toNumericCell(
      row.examAcceptanceHours
    )

  const officialHours =
    toNumericCell(
      row.officialHours
    )

  // ====================================================
  // ДАНІ НАПРЯМУ В КЛІТИНКИ A:Y
  // ====================================================

  const values = {

    A:
      row.code || '',

    B:
      row.group || '',

    C:
      studentsCount,

    D:
      course,

    E:
      semester,

    F:
      semesterWeeks,

    G:
      hoursPerWeek,

    H:
      row.name || '',

    I:
      totalHours,

    J:
      contactHours,

    K:
      lectures,

    L:
      practical,

    M:
      laboratory,

    N:
      seminars,

    O:
      selfStudy,

    P:
      toNumericCell(row.otherWorkHours),

    Q:
      '',

    R:
      courseWorkExecution,

    S:
      courseWorkDefense,

    T:
      okrHours,

    U:
      controlWorks,

    V:
      creditAcceptanceHours,

    W:
      examConsultationHours,

    X:
      examAcceptanceHours,

    Y:
      officialHours
  }

  // ====================================================
  // ЗАПИС
  // ====================================================

  for (
    const [column, value]
    of Object.entries(values)
  ) {

    setTemplateCellValue(
      sheet,
      `${column}${rowNumber}`,
      value
    )
  }
}

// ======================================================
// ШАПКА ШАБЛОНУ
// ======================================================

function writeTeacherHeaderToTemplate(
  sheet,
  workload
) {

  const teacherName =
    workload.teacher?.full_name ||
    ''

  const commission =
    workload.teacher?.commission_name ||
    'спеціальності 121'

  const academicYear =
    workload.studyPlan?.academic_year ||
    ''

  const title =
    `Педагогічне навантаження викладача ${teacherName} ` +
    `циклової комісії ${commission} ` +
    `на ${academicYear} н.р.`

  // ----------------------------------------------------
  // Назва документа
  // ----------------------------------------------------

  setTemplateCellValue(
    sheet,
    'A9',
    title
  )

  // ----------------------------------------------------
  // ПІБ викладача
  // ----------------------------------------------------

  setTemplateCellValue(
    sheet,
    'G10',
    teacherName
  )
}

// ======================================================
// ДІАПАЗОНИ РЯДКІВ У ШАБЛОНІ
// ======================================================

function getTemplateDataRows() {

  return [

    {
      start: 15,
      end: 34
    },

    {
      start: 40,
      end: 57
    }
  ]
}

// ======================================================
// ЕКСПОРТ У EXCEL
// ======================================================

export async function exportWorkloadExcel(
  req,
  res
) {

  try {

    // --------------------------------------------------
    // ID викладача
    // --------------------------------------------------

    const teacherId =
      Number(
        req.params.teacherId
      )

    if (!teacherId) {

      return res.status(400).json({
        message:
          'Некоректний викладач'
      })
    }

    // --------------------------------------------------
    // Отримуємо навантаження
    // --------------------------------------------------

    const workload =
      await buildWorkloadPayload(
        teacherId
      )

    if (!workload.teacher) {

      return res.status(404).json({
        message:
          'Викладача не знайдено'
      })
    }

    // --------------------------------------------------
    // Знаходимо шаблон
    // --------------------------------------------------

    const originalTemplatePath =
      await ensureTemplateFile()

    // --------------------------------------------------
    // Папка експорту
    // --------------------------------------------------

    const exportDir =
      path.resolve(
        __dirname,
        '../../uploads/exports'
      )

    await fs.mkdir(
      exportDir,
      {
        recursive: true
      }
    )

    // --------------------------------------------------
    // Назва викладача
    // --------------------------------------------------

    const teacherName =
      (
        workload.teacher.full_name ||
        'викладач'
      )
        .replace(
          /\s+/g,
          '_'
        )
        .replace(
          /[^A-Za-zА-Яа-яЇїІіЄєҐґ0-9_]/g,
          ''
        )

    // --------------------------------------------------
    // Навчальний рік
    // --------------------------------------------------

    const studyPlanYear =
      workload.studyPlan?.academic_year ||
      '2026-2027'

    // --------------------------------------------------
    // Назва готового файлу
    // --------------------------------------------------

    const exportFileName =
      `Педагогічне_навантаження_${teacherName}_${studyPlanYear}.xlsx`

    const exportPath =
      path.join(
        exportDir,
        exportFileName
      )

    const outputBuffer = await exportWorkloadToExcel(workload)

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(exportFileName)}"`
    )

    res.send(outputBuffer)

  } catch (error) {

    console.error(
      'ПОМИЛКА ЕКСПОРТУ ПЕДАГОГІЧНОГО НАВАНТАЖЕННЯ:',
      error
    )

    res.status(500).json({

      message:
        error.message,

      code:
        error.code
    })
  }
}

// ======================================================
// РЕДАГУВАННЯ РЯДКА НАВАНТАЖЕННЯ
// ======================================================

export async function updateWorkloadRow(
  req,
  res
) {

  try {

    const id =
      Number(
        req.params.id
      )

    if (!id) {

      return res.status(400).json({
        message:
          'Некоректний ідентифікатор рядка'
      })
    }

    const updates =
      Object.entries(
        req.body || {}
      )
        .filter(
          ([field]) =>
            editableFields.has(field)
        )

    if (!updates.length) {

      return res.status(400).json({
        message:
          'Немає полів для редагування'
      })
    }

    const values =
      updates.map(
        ([, value]) =>
          value === ''
            ? null
            : value
      )

    const setClause =
      updates
        .map(
          ([field]) =>
            `\`${field}\` = ?`
        )
        .join(', ')

    const [result] =
      await pool.query(
        `
          UPDATE plan_disciplines
          SET ${setClause}
          WHERE id = ?
        `,
        [
          ...values,
          id
        ]
      )

    if (
      !result.affectedRows
    ) {

      return res.status(404).json({
        message:
          'Рядок навантаження не знайдено'
      })
    }

    res.json({
      message:
        'Рядок навантаження оновлено'
    })

  } catch (error) {

    res.status(500).json({
      message:
        error.message,

      code:
        error.code
    })
  }
}

// ======================================================
// ВИДАЛЕННЯ РЯДКА
// ======================================================

export async function deleteWorkloadRow(
  req,
  res
) {

  try {

    const id =
      Number(
        req.params.id
      )

    if (!id) {

      return res.status(400).json({
        message:
          'Некоректний ідентифікатор рядка'
      })
    }

    const [result] =
      await pool.query(
        `
          DELETE FROM plan_disciplines
          WHERE id = ?
        `,
        [id]
      )

    if (
      !result.affectedRows
    ) {

      return res.status(404).json({
        message:
          'Рядок навантаження не знайдено'
      })
    }

    res.json({
      message:
        'Рядок навантаження видалено'
    })

  } catch (error) {

    res.status(500).json({
      message:
        error.message,

      code:
        error.code
    })
  }
}

// ======================================================
// СТАТУС НАВАНТАЖЕННЯ ВСІХ ВИКЛАДАЧІВ
// ======================================================

export async function getWorkloadStatus(
  req,
  res
) {

  try {

    await ensureWorkloadConfirmationsTable()

    const [latest] =
      await pool.query(
        `
          SELECT id
          FROM study_plans
          ORDER BY id DESC
          LIMIT 1
        `
      )

    if (!latest.length) {
      return res.json([])
    }

    const [rows] =
      await pool.query(
        `
          SELECT

            t.id,

            t.full_name,

            c.name AS commission_name,

            COUNT(
              DISTINCT pd.id
            ) AS workload_rows,

            COALESCE(
              SUM(pd.total_hours),
              0
            ) AS planned_hours,

            (
              SELECT COUNT(*)
              FROM student_distributions sd
              WHERE sd.teacher_id = t.id
            ) AS distribution_rows,

            wc.confirmed_at

          FROM teachers t

          JOIN commissions c
            ON c.id = t.commission_id

          LEFT JOIN plan_disciplines pd
            ON pd.study_plan_id = ?
            AND (
              pd.teacher_id = t.id
              OR
              pd.backup_teacher_id = t.id
            )

          LEFT JOIN workload_confirmations wc
            ON wc.teacher_id = t.id

          WHERE
            c.name =
              'Інженерія програмного забезпечення'

          GROUP BY
            t.id,
            t.full_name,
            c.name,
            wc.confirmed_at

          ORDER BY
            t.full_name
        `,
        [
          latest[0].id
        ]
      )

    res.json(

      rows.map(row => ({

        ...row,

        workload_rows:
          Number(
            row.workload_rows
          ) +
          Number(
            row.distribution_rows
          ),

        has_workload:
          Boolean(
            row.confirmed_at
          ),

        confirmed_at:
          row.confirmed_at ||
          null
      }))
    )

  } catch (error) {

    res.status(500).json({

      message:
        error.message,

      code:
        error.code
    })
  }
}

// ======================================================
// ПІДТВЕРДИТИ НАВАНТАЖЕННЯ
// ======================================================

export async function confirmWorkload(
  req,
  res
) {

  try {

    const teacherId =
      Number(
        req.params.teacherId
      )

    if (!teacherId) {

      return res.status(400).json({
        message:
          'Некоректний викладач'
      })
    }

    await ensureWorkloadConfirmationsTable()

    await pool.query(
      `
        INSERT INTO workload_confirmations (
          teacher_id
        )
        VALUES (?)

        ON DUPLICATE KEY UPDATE
          confirmed_at =
            CURRENT_TIMESTAMP
      `,
      [teacherId]
    )

    res.json({
      confirmed: true
    })

  } catch (error) {

    res.status(500).json({

      message:
        error.message,

      code:
        error.code
    })
  }
}

// ======================================================
// СКАСУВАТИ ПІДТВЕРДЖЕННЯ
// ======================================================

export async function cancelWorkloadConfirmation(
  req,
  res
) {

  try {

    const teacherId =
      Number(
        req.params.teacherId
      )

    if (!teacherId) {

      return res.status(400).json({
        message:
          'Некоректний викладач'
      })
    }

    await ensureWorkloadConfirmationsTable()

    await pool.query(
      `
        DELETE FROM workload_confirmations
        WHERE teacher_id = ?
      `,
      [teacherId]
    )

    res.json({
      confirmed: false
    })

  } catch (error) {

    res.status(500).json({

      message:
        error.message,

      code:
        error.code
    })
  }
}