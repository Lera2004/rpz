import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import crypto from 'crypto'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const plans = JSON.parse(
  await fs.readFile(path.join(__dirname, 'parsed-plan.json'), 'utf8')
)

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 5
})

const teacherCache = new Map()
const disciplineCache = new Map()
const groupCache = new Map()

function value(value) {
  return value === undefined || value === null || value === ''
    ? null
    : value
}

function numeric(value) {
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function practiceCode(name) {
  return `PRACTICE_${crypto
    .createHash('sha1')
    .update(String(name), 'utf8')
    .digest('hex')
    .slice(0, 40)}`
}

function courseFromSheet(plan) {
  return Number(plan.course || String(plan.sheet).split('-')[0]) || null
}

async function getGroup(connection, plan) {
  if (groupCache.has(plan.group)) {
    return groupCache.get(plan.group)
  }

  const [existing] = await connection.query(
    'SELECT id FROM student_groups WHERE name = ? LIMIT 1',
    [plan.group]
  )

  let id = existing[0]?.id

  if (!id) {
    const [result] = await connection.query(
      `INSERT INTO student_groups
        (name, specialty, course, students_count)
       VALUES (?, ?, ?, ?)`,
      [plan.group, 'Інженерія програмного забезпечення', courseFromSheet(plan), 0]
    )
    id = result.insertId
  } else {
    await connection.query(
      'UPDATE student_groups SET course = ? WHERE id = ?',
      [courseFromSheet(plan), id]
    )
  }

  groupCache.set(plan.group, id)
  return id
}

async function getTeacher(connection, name) {
  const surname = String(name || '').trim().split(/\s+/)[0]

  if (!surname) {
    return null
  }

  if (teacherCache.has(surname)) {
    return teacherCache.get(surname)
  }

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
      `INSERT INTO teachers
        (full_name, category, position, rate)
       VALUES (?, ?, ?, ?)` ,
      [surname, 'Є в навчальному плані', 'ПІБ не заповнено', 0]
    )
    id = result.insertId
    console.log(`Додано викладача з навчального плану: ${surname}`)
  }

  teacherCache.set(surname, id)
  return id
}

async function getDiscipline(connection, item) {
  const code = item.code || practiceCode(item.name)
  const cacheKey = `${code}:${item.name}`

  if (disciplineCache.has(cacheKey)) {
    return disciplineCache.get(cacheKey)
  }

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
    await connection.query(
      'UPDATE disciplines SET name = ? WHERE id = ?',
      [item.name, id]
    )
  }

  disciplineCache.set(cacheKey, id)
  return id
}

function semesterRows(item) {
  if (item.semesters?.length) {
    return item.semesters
  }

  return [{
    semester: null,
    totalHours: item.hours?.total || item.hours?.totalHours || item.hours?.currentYear,
    classroomHours: item.hours?.classroom || item.hours?.classroomHours,
    selfStudy: item.hours?.selfStudy,
    hoursPerWeek: item.hours?.hoursPerWeek,
    weeks: item.hours?.weeks
  }]
}

async function main() {
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    const [planResult] = await connection.query(
      `INSERT INTO study_plans
        (name, academic_year, file_name)
       VALUES (?, ?, ?)`,
      [
        'Імпорт навчальних планів із parsed-plan.json',
        '2026-2027',
        'parsed-plan.json'
      ]
    )

    const studyPlanId = planResult.insertId
    let relationCount = 0

    for (const plan of plans) {
      const groupId = await getGroup(connection, plan)
      const course = courseFromSheet(plan)

      await connection.query(
        `INSERT INTO plan_sheets
          (study_plan_id, sheet_name, course, group_id, sheet_type)
         VALUES (?, ?, ?, ?, ?)`,
        [studyPlanId, plan.sheet, course, groupId, 'навчальний план']
      )

      for (const item of plan.items || []) {
        const disciplineId = await getDiscipline(connection, item)
        const teacherId = await getTeacher(connection, item.teacher)
        const substituteId = await getTeacher(connection, item.substitute)

        for (const semester of semesterRows(item)) {
          await connection.query(
            `INSERT INTO plan_disciplines
              (study_plan_id, group_id, discipline_id, semester,
               total_hours, hours_per_week, lectures_hours,
               practical_hours, laboratory_hours, seminars_hours,
               self_study_hours, course_projects_hours,
               calculation_graphic_hours, field_training_hours,
               control_type, exam, control_works,
               teacher_id, backup_teacher_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              studyPlanId,
              groupId,
              disciplineId,
              value(semester.semester),
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
              value(semester.differentialCredit || semester.credits),
              value(semester.exams),
              value(semester.controlWorks),
              teacherId,
              substituteId
            ]
          )
          relationCount++
        }
      }
    }

    await connection.commit()
    console.log(`Створено навчальний план у БД: ${studyPlanId}`)
    console.log(`Додано зв'язків дисциплін: ${relationCount}`)
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
    await pool.end()
  }
}

await main()
