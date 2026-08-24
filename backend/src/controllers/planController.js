import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import pool from '../config/database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const planPath = path.join(__dirname, '../../parsed-plan.json')

export async function getPlans(req, res) {
  try {
    if (req.query.source !== 'json') {
      return res.json(await getPlansFromDatabase(req.query))
    }

    const content = await fs.readFile(planPath, 'utf8')
    const plans = JSON.parse(content)
    const course = req.query.course ? Number(req.query.course) : null
    const group = req.query.group ? String(req.query.group) : null

    const filtered = plans.filter(plan => {
      const matchesCourse = !course || plan.course === course
      const matchesGroup = !group || plan.group === group
      return matchesCourse && matchesGroup
    })

    res.json(filtered)
  } catch (error) {
    console.error('ПОМИЛКА ОТРИМАННЯ НАВЧАЛЬНИХ ПЛАНІВ:', error)
    res.status(500).json({ message: error.message })
  }
}

export async function updatePlanDiscipline(req, res) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ message: 'Некоректний ідентифікатор рядка плану' })
    const fields = {
      semester: req.body.semester, total_hours: req.body.total_hours,
      hours_per_week: req.body.hours_per_week, lectures_hours: req.body.lectures_hours,
      practical_hours: req.body.practical_hours, laboratory_hours: req.body.laboratory_hours,
      seminars_hours: req.body.seminars_hours, self_study_hours: req.body.self_study_hours,
      course_projects_hours: req.body.course_projects_hours,
      calculation_graphic_hours: req.body.calculation_graphic_hours,
      field_training_hours: req.body.field_training_hours,
      control_type: req.body.control_type, exam: req.body.exam, control_works: req.body.control_works,
      teacher_id: req.body.teacher_id, backup_teacher_id: req.body.backup_teacher_id
    }
    const updates = Object.entries(fields).filter(([, value]) => value !== undefined)
    if (!updates.length) return res.status(400).json({ message: 'Немає даних для редагування' })
    const values = updates.map(([, value]) => value === '' ? null : value)
    const setClause = updates.map(([field]) => `\`${field}\` = ?`).join(', ')
    const [result] = await pool.query(`UPDATE plan_disciplines SET ${setClause} WHERE id = ?`, [...values, id])
    if (!result.affectedRows) return res.status(404).json({ message: 'Рядок навчального плану не знайдено' })
    if (req.body.code !== undefined || req.body.name !== undefined) {
      const [discipline] = await pool.query('SELECT discipline_id FROM plan_disciplines WHERE id = ?', [id])
      if (discipline.length) {
        const disciplineUpdates = []
        const disciplineValues = []
        if (req.body.code !== undefined) { disciplineUpdates.push('code = ?'); disciplineValues.push(req.body.code || null) }
        if (req.body.name !== undefined) { disciplineUpdates.push('name = ?'); disciplineValues.push(req.body.name || null) }
        await pool.query(`UPDATE disciplines SET ${disciplineUpdates.join(', ')} WHERE id = ?`, [...disciplineValues, discipline[0].discipline_id])
      }
    }
    res.json({ message: 'Дані навчального плану оновлено' })
  } catch (error) {
    res.status(500).json({ message: error.message, code: error.code })
  }
}

async function getPlansFromDatabase(query) {
  const [latestPlan] = await pool.query(`
    SELECT id
    FROM study_plans
    ORDER BY id DESC
    LIMIT 1
  `)

  if (!latestPlan.length) {
    return []
  }

  const studyPlanId = latestPlan[0].id
  const params = [studyPlanId]
  let where = 'pd.study_plan_id = ?'

  if (query.course) {
    where += " AND SUBSTRING_INDEX(ps.sheet_name, '-', 1) = ?"
    params.push(Number(query.course))
  }

  if (query.group) {
    where += ' AND sg.name = ?'
    params.push(String(query.group))
  }

  const [rows] = await pool.query(`
    SELECT
      ps.sheet_name AS sheet,
      ps.course,
      sg.name AS group_name,
      pd.id AS row_id,
      pd.discipline_id,
      pd.teacher_id,
      pd.backup_teacher_id,
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
      d.code,
      d.name,
      t.full_name AS teacher,
      bt.full_name AS substitute
    FROM plan_disciplines pd
    JOIN disciplines d ON d.id = pd.discipline_id
    LEFT JOIN teachers t ON t.id = pd.teacher_id
    LEFT JOIN teachers bt ON bt.id = pd.backup_teacher_id
    JOIN plan_sheets ps
      ON ps.study_plan_id = pd.study_plan_id
      AND ps.group_id = pd.group_id
    JOIN student_groups sg ON sg.id = pd.group_id
    WHERE ${where}
    ORDER BY ps.sheet_name, pd.id
  `, params)

  const plans = new Map()

  for (const row of rows) {
    const course = Number(row.course || String(row.sheet).split('-')[0])
    const key = `${row.group_name}-${course}`
    let plan = plans.get(key)

    if (!plan) {
      plan = {
        sheet: row.sheet,
        group: row.group_name,
        course,
        semesters: {},
        items: [],
        seenRows: new Set()
      }
      plans.set(key, plan)
    }

    /* Один запис plan_disciplines приєднується до двох
     * технічних аркушів однієї групи. Не дублюємо його. */
    if (plan.seenRows.has(row.row_id)) {
      continue
    }

    plan.seenRows.add(row.row_id)

    const itemKey = `${row.code}-${row.name}`
    let item = plan.items.find(value => value.key === itemKey)

    if (!item) {
      const type = row.code?.startsWith('PRACTICE_')
        ? 'practice'
        : row.code?.startsWith('ОК')
          ? 'ОК'
          : row.code?.startsWith('ВК')
            ? 'ВК'
            : 'discipline'

      item = {
        key: itemKey,
        row: row.row_id,
        disciplineId: row.discipline_id,
        teacherId: row.teacher_id,
        backupTeacherId: row.backup_teacher_id,
        code: row.code?.startsWith('PRACTICE_') ? '' : row.code,
        name: row.name,
        type,
        teacher: row.teacher || '',
        substitute: row.substitute || '',
        hours: {},
        semesters: []
      }
      plan.items.push(item)
    }

    const semester = {}
    semester.rowId = row.row_id
    addDbValue(semester, 'semester', row.semester)
    addDbValue(semester, 'totalHours', row.total_hours)
    addDbValue(semester, 'hoursPerWeek', row.hours_per_week)
    addDbValue(semester, 'lectures', row.lectures_hours)
    addDbValue(semester, 'practical', row.practical_hours)
    addDbValue(semester, 'laboratory', row.laboratory_hours)
    addDbValue(semester, 'seminars', row.seminars_hours)
    addDbValue(semester, 'selfStudy', row.self_study_hours)
    addDbValue(semester, 'courseWork', row.course_projects_hours)
    addDbValue(semester, 'calculationWork', row.calculation_graphic_hours)
    addDbValue(semester, 'fieldTraining', row.field_training_hours)
    addDbValue(semester, 'controlType', row.control_type)
    addDbValue(semester, 'exams', row.exam)
    addDbValue(semester, 'controlWorks', row.control_works)

    if (Object.keys(semester).length > 1) {
      item.semesters.push(semester)
    }

    addDbValue(item.hours, 'total', row.total_hours)
  }

  const result = [...plans.values()].map(({ seenRows, ...plan }) => ({
    ...plan,
    items: plan.items.map(({ key, ...item }) => item)
  }))

  // Після видалення викладача з БД teacher_id стає NULL, але прізвище
  // залишається у вихідному навчальному плані. Повертаємо його у /plans,
  // щоб сторінки планів і викладачів не втрачали викладача.
  return enrichTeachersFromSource(result)
}

async function enrichTeachersFromSource(plans) {
  const source = JSON.parse(await fs.readFile(planPath, 'utf8'))
  const sourceItems = new Map()
  const sourceItemsByCode = new Map()
  const sourceItemsByName = new Map()

  for (const plan of source) {
    for (const item of plan.items || []) {
      const key = `${normalize(plan.group)}|${plan.course}|${normalize(item.code)}|${normalize(item.name)}`
      sourceItems.set(key, item)
      sourceItemsByName.set(
        `${normalize(plan.group)}|${plan.course}|${normalize(item.name)}`,
        item
      )
      const codeKey = `${normalize(plan.group)}|${plan.course}|${normalize(item.code)}`
      const codeItems = sourceItemsByCode.get(codeKey) || []
      codeItems.push(item)
      sourceItemsByCode.set(codeKey, codeItems)
    }
  }

  return plans.map(plan => ({
    ...plan,
    items: plan.items.map(item => {
      const exactKey = `${normalize(plan.group)}|${plan.course}|${normalize(item.code)}|${normalize(item.name)}`
      const codeItems = sourceItemsByCode.get(
        `${normalize(plan.group)}|${plan.course}|${normalize(item.code)}`
      ) || []
      const nameItem = sourceItemsByName.get(
        `${normalize(plan.group)}|${plan.course}|${normalize(item.name)}`
      )
      const sourceItem = sourceItems.get(exactKey)
        || nameItem
        || (item.type === 'practice' ? sourceItemsByName.get(
          `${normalize(plan.group)}|${plan.course}|${normalize(item.name)}`
        ) : null)
        || (codeItems.length === 1 ? codeItems[0] : null)

      const databaseSemesters = item.semesters || []
      const sourceSemesters = sourceItem?.semesters?.length ? sourceItem.semesters : databaseSemesters
      const semesters = sourceSemesters.map((sourceSemester, index) => ({
        ...sourceSemester,
        rowId: databaseSemesters.find(databaseSemester => String(databaseSemester.semester) === String(sourceSemester.semester))?.rowId
          || databaseSemesters[index]?.rowId
      }))

      return {
        ...item,
        name: sourceItem?.name || item.name,
        hours: sourceItem?.hours || item.hours,
        semesters,
        teacher: item.teacher || sourceItem?.teacher || '',
        substitute: item.substitute || sourceItem?.substitute || ''
      }
    })
  }))
}

function normalize(value) {
  return String(value || '')
    .toLocaleLowerCase('uk-UA')
    .replace(/\s+/g, ' ')
    .trim()
}

function addDbValue(target, key, value) {
  if (value === null || value === undefined || value === '') {
    return
  }

  const numeric = Number(value)
  target[key] = Number.isNaN(numeric) || typeof value === 'string' && value.trim() !== ''
    ? value
    : numeric
}
