import crypto from 'crypto'
import { parseStudyPlan } from '../../import-study-plan.js'
import pool from '../config/database.js'
import { ensurePlanSourceDataColumn } from '../utils/planSchema.js'

function nullable(value) {
  return value === undefined || value === null || value === '' ? null : value
}

function numeric(value) {
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function academicYear() {
  const now = new Date()
  const year = now.getFullYear()
  return now.getMonth() >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

function practiceCode(name) {
  return `PRACTICE_${crypto.createHash('sha1').update(String(name), 'utf8').digest('hex')}`
}

async function getGroup(connection, plan, cache) {
  if (cache.has(plan.group)) return cache.get(plan.group)

  const [existing] = await connection.query(
    'SELECT id FROM student_groups WHERE name = ? LIMIT 1',
    [plan.group]
  )

  let id = existing[0]?.id
  if (!id) {
    const [result] = await connection.query(
      `INSERT INTO student_groups (name, specialty, course, students_count)
       VALUES (?, ?, ?, ?)`,
      [plan.group, 'Інженерія програмного забезпечення', plan.course, 0]
    )
    id = result.insertId
  } else {
    await connection.query('UPDATE student_groups SET course = ? WHERE id = ?', [plan.course, id])
  }

  cache.set(plan.group, id)
  return id
}

async function getTeacher(connection, name, cache) {
  const surname = String(name || '').trim().split(/\s+/)[0]
  if (!surname) return null
  if (cache.has(surname)) return cache.get(surname)

  const [existing] = await connection.query(
    `SELECT id
     FROM teachers
     WHERE LOWER(TRIM(full_name)) = LOWER(?)
        OR LOWER(SUBSTRING_INDEX(TRIM(full_name), ' ', 1)) = LOWER(?)
     ORDER BY CASE WHEN LOWER(TRIM(full_name)) = LOWER(?) THEN 0 ELSE 1 END
     LIMIT 1`,
    [surname, surname, surname]
  )

  let id = existing[0]?.id
  if (!id) {
    const [result] = await connection.query(
      `INSERT INTO teachers (full_name, category, position, rate)
       VALUES (?, ?, ?, ?)`,
      [surname, 'Є в навчальному плані', 'ПІБ не заповнено', 0]
    )
    id = result.insertId
  }

  cache.set(surname, id)
  return id
}

async function getDiscipline(connection, item, cache) {
  const code = item.code || practiceCode(item.name)
  const cacheKey = `${code}:${item.name}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  const [existing] = await connection.query(
    'SELECT id FROM disciplines WHERE code = ? LIMIT 1',
    [code]
  )

  let id = existing[0]?.id
  if (!id) {
    const [result] = await connection.query(
      'INSERT INTO disciplines (code, name) VALUES (?, ?)',
      [code, item.name]
    )
    id = result.insertId
  } else {
    await connection.query('UPDATE disciplines SET name = ? WHERE id = ?', [item.name, id])
  }

  cache.set(cacheKey, id)
  return id
}

function semesterRows(item) {
  if (item.semesters?.length) return item.semesters

  return [{
    semester: null,
    totalHours: item.hours?.total || item.hours?.totalHours || item.hours?.currentYear,
    classroomHours: item.hours?.classroom || item.hours?.classroomHours,
    selfStudy: item.hours?.selfStudy,
    hoursPerWeek: item.hours?.hoursPerWeek,
    weeks: item.hours?.weeks
  }]
}

export async function importStudyPlan(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: 'Оберіть файл робочого плану Excel.' })
  }

  let plans
  try {
    plans = parseStudyPlan(req.file.buffer)
  } catch (error) {
    console.error('ПОМИЛКА ЧИТАННЯ ФАЙЛУ РОБОЧОГО ПЛАНУ:', error)
    return res.status(400).json({ message: 'Не вдалося прочитати файл. Перевірте, що це коректний файл .xls або .xlsx.' })
  }

  const validPlans = plans.filter(plan =>
    plan.group && Number.isInteger(Number(plan.course)) && Number(plan.course) > 0
  )
  const disciplineCount = validPlans.reduce((total, plan) => total + (plan.items?.length || 0), 0)
  if (!validPlans.length || !disciplineCount) {
    return res.status(400).json({
      message: 'У файлі не знайдено дисциплін із визначеними групою та курсом. Перевірте назви аркушів і вміст плану.'
    })
  }

  const year = academicYear()
  let connection

  try {
    connection = await pool.getConnection()
    await ensurePlanSourceDataColumn(connection)
    await connection.beginTransaction()

    const [planResult] = await connection.query(
      `INSERT INTO study_plans (name, academic_year, file_name)
       VALUES (?, ?, ?)`,
      [`Робочий план ${year}`, year, req.file.originalname]
    )
    const studyPlanId = planResult.insertId
    const groupCache = new Map()
    const teacherCache = new Map()
    const disciplineCache = new Map()
    let semesterCount = 0

    for (const plan of validPlans) {
      const groupId = await getGroup(connection, plan, groupCache)
      await connection.query(
        `INSERT INTO plan_sheets (study_plan_id, sheet_name, course, group_id, sheet_type)
         VALUES (?, ?, ?, ?, ?)`,
        [studyPlanId, plan.sheet, Number(plan.course), groupId, 'навчальний план']
      )

      for (const item of plan.items || []) {
        if (!item.name) continue

        const disciplineId = await getDiscipline(connection, item, disciplineCache)
        const teacherId = await getTeacher(connection, item.teacher, teacherCache)
        const substituteId = await getTeacher(connection, item.substitute, teacherCache)

        for (const semester of semesterRows(item)) {
          await connection.query(
            `INSERT INTO plan_disciplines
              (study_plan_id, group_id, discipline_id, semester,
               total_hours, hours_per_week, lectures_hours,
               practical_hours, laboratory_hours, seminars_hours,
               self_study_hours, course_projects_hours,
               calculation_graphic_hours, field_training_hours,
                control_type, credits, differential_credit, exam, control_works,
               teacher_id, backup_teacher_id, source_data)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              studyPlanId,
              groupId,
              disciplineId,
              nullable(semester.semester),
              numeric(semester.totalHours),
              numeric(semester.hoursPerWeek),
              numeric(semester.lectures),
              numeric(semester.practical),
              numeric(semester.laboratory),
              numeric(semester.seminars),
              numeric(semester.selfStudy),
              numeric(semester.courseWork),
              numeric(semester.calculationWork),
              numeric(semester.fieldTraining),
              nullable(semester.controlType),
              nullable(semester.credits),
              nullable(semester.differentialCredit),
              nullable(semester.exams),
              nullable(semester.controlWorks),
              teacherId,
              substituteId,
              JSON.stringify(item.sourceData || {})
            ]
          )
          semesterCount += 1
        }
      }
    }

    await connection.commit()
    return res.status(201).json({
      message: 'Робочий план імпортовано.',
      studyPlanId,
      academicYear: year,
      groups: new Set(validPlans.map(plan => plan.group)).size,
      disciplines: disciplineCount,
      semesters: semesterCount
    })
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback()
      } catch (rollbackError) {
        console.error('ПОМИЛКА ВІДКОТУ ТРАНЗАКЦІЇ ІМПОРТУ РОБОЧОГО ПЛАНУ:', rollbackError)
      }
    }
    console.error('ПОМИЛКА ІМПОРТУ РОБОЧОГО ПЛАНУ:', error)
    return res.status(500).json({ message: 'Не вдалося зберегти робочий план у базі даних.' })
  } finally {
    connection?.release()
  }
}
