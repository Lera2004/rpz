import pool from '../config/database.js'

const COMMISSION_NAME = 'Інженерія програмного забезпечення'
const WORK_TYPES = [
  'diploma', 'diploma_special', 'diploma_labor', 'diploma_economics', 'exam_commission',
  'exam_commission_diploma', 'exam_commission_coursework_3', 'exam_commission_coursework_4',
  'coursework_3', 'coursework_4'
]

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_distributions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id INT NOT NULL,
      teacher_id INT NOT NULL,
      work_type VARCHAR(30) NOT NULL,
      students_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_distribution (group_id, teacher_id, work_type),
      CONSTRAINT fk_distribution_group FOREIGN KEY (group_id) REFERENCES student_groups(id) ON DELETE CASCADE,
      CONSTRAINT fk_distribution_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
    )
  `)
  await pool.query(`
    UPDATE student_distributions sd
    JOIN student_groups sg ON sg.id = sd.group_id
    SET sd.work_type = IF(sg.course = 3, 'coursework_3', 'coursework_4')
    WHERE sd.work_type = 'coursework'
  `)
}

async function getEligibleTeacher(teacherId) {
  const [rows] = await pool.query(`
    SELECT t.id, t.full_name, c.name AS commission_name
    FROM teachers t
    JOIN commissions c ON c.id = t.commission_id
    WHERE t.id = ? AND c.name = ?
  `, [teacherId, COMMISSION_NAME])
  return rows[0]
}

export async function getStudentDistributions(req, res) {
  try {
    await ensureTable()
    const [groups] = await pool.query(`
      SELECT sg.id, sg.name, sg.course,
        COALESCE(SUM(CASE WHEN ga.id IS NOT NULL AND (ga.status IS NULL OR LOWER(TRIM(ga.status)) IN ('active', 'активний', 'активний студент', 'повернено з академвідпустки')) THEN 1 ELSE 0 END), 0) AS students_count
      FROM student_groups sg
      LEFT JOIN group_applicants ga ON ga.group_id = sg.id
      WHERE course IN (3, 4)
      GROUP BY sg.id
      ORDER BY course, name
    `)
    const [teachers] = await pool.query(`
      SELECT t.id, t.full_name, c.name AS commission_name
      FROM teachers t
      JOIN commissions c ON c.id = t.commission_id
      WHERE c.name = ?
      ORDER BY t.full_name
    `, [COMMISSION_NAME])
    const [allocations] = await pool.query(`
      SELECT sd.id, sd.group_id, sd.teacher_id, sd.work_type, sd.students_count,
        sg.name AS group_name, sg.course, t.full_name AS teacher_name
      FROM student_distributions sd
      JOIN student_groups sg ON sg.id = sd.group_id
      JOIN teachers t ON t.id = sd.teacher_id
      WHERE sg.course IN (3, 4)
      ORDER BY sg.course, sg.name, sd.work_type, t.full_name
    `)
    res.json({ commission: COMMISSION_NAME, groups, teachers, allocations })
  } catch (error) {
    console.error('ПОМИЛКА РОЗПОДІЛУ СТУДЕНТІВ:', error)
    res.status(500).json({ message: error.message, code: error.code })
  }
}

export async function saveStudentDistribution(req, res) {
  try {
    await ensureTable()
    const groupId = Number(req.body.group_id)
    const teacherId = Number(req.body.teacher_id)
    const studentsCount = Number(req.body.students_count)
    const workType = String(req.body.work_type || '')
    if (!groupId || !teacherId || !WORK_TYPES.includes(workType) || !Number.isInteger(studentsCount) || studentsCount < 0) {
      return res.status(400).json({ message: 'Некоректні дані розподілу' })
    }

    const teacher = await getEligibleTeacher(teacherId)
    if (!teacher) return res.status(400).json({ message: `Викладач не належить до ЦК «${COMMISSION_NAME}»` })

    const [groups] = await pool.query(`
      SELECT sg.id, sg.course,
        COALESCE(SUM(CASE WHEN ga.id IS NOT NULL AND (ga.status IS NULL OR LOWER(TRIM(ga.status)) IN ('active', 'активний', 'активний студент', 'повернено з академвідпустки')) THEN 1 ELSE 0 END), 0) AS students_count
      FROM student_groups sg
      LEFT JOIN group_applicants ga ON ga.group_id = sg.id
      WHERE sg.id = ? AND sg.course IN (3, 4)
      GROUP BY sg.id
    `, [groupId])
    if (!groups.length) return res.status(400).json({ message: 'Група має бути 3 або 4 курсу' })
    const requiredCourse = workType === 'coursework_3' || workType === 'exam_commission_coursework_3' ? 3 :
      workType === 'coursework_4' || workType === 'exam_commission_coursework_4' || workType.startsWith('diploma') || workType === 'exam_commission_diploma' || workType === 'exam_commission' ? 4 : null
    if (requiredCourse && Number(groups[0].course) !== requiredCourse) {
      return res.status(400).json({ message: `Цей вид роботи призначений для ${requiredCourse} курсу` })
    }

    const [assigned] = await pool.query(`
      SELECT COALESCE(SUM(students_count), 0) AS total
      FROM student_distributions
      WHERE group_id = ? AND work_type = ? AND NOT (teacher_id = ?)
    `, [groupId, workType, teacherId])
    if (Number(assigned[0].total) + studentsCount > Number(groups[0].students_count || 0)) {
      return res.status(400).json({ message: 'Розподілена кількість студентів перевищує кількість у групі' })
    }

    await pool.query(`
      INSERT INTO student_distributions (group_id, teacher_id, work_type, students_count)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE students_count = VALUES(students_count)
    `, [groupId, teacherId, workType, studentsCount])
    res.json({ message: 'Розподіл збережено' })
  } catch (error) {
    console.error('ПОМИЛКА ЗБЕРЕЖЕННЯ РОЗПОДІЛУ:', error)
    res.status(500).json({ message: error.message, code: error.code })
  }
}

export async function updateStudentDistribution(req, res) {
  try {
    await ensureTable()
    const distributionId = Number(req.params.id)
    const studentsCount = Number(req.body.students_count)
    if (!distributionId || !Number.isInteger(studentsCount) || studentsCount < 0) {
      return res.status(400).json({ message: 'Некоректна кількість студентів' })
    }

    const [rows] = await pool.query(`
      SELECT sd.id, sd.group_id, sd.work_type,
        COALESCE((
          SELECT COUNT(*)
          FROM group_applicants ga_active
          WHERE ga_active.group_id = sg.id
            AND (ga_active.status IS NULL OR LOWER(TRIM(ga_active.status)) IN ('active', 'активний', 'активний студент', 'повернено з академвідпустки'))
        ), 0) AS group_students_count
      FROM student_distributions sd
      JOIN student_groups sg ON sg.id = sd.group_id
      WHERE sd.id = ? AND sg.course IN (3, 4)
    `, [distributionId])
    if (!rows.length) return res.status(404).json({ message: 'Розподіл не знайдено' })

    const [assigned] = await pool.query(`
      SELECT COALESCE(SUM(students_count), 0) AS total
      FROM student_distributions
      WHERE group_id = ? AND work_type = ? AND id <> ?
    `, [rows[0].group_id, rows[0].work_type, distributionId])
    if (Number(assigned[0].total) + studentsCount > Number(rows[0].group_students_count || 0)) {
      return res.status(400).json({ message: 'Розподілена кількість студентів перевищує кількість у групі' })
    }

    await pool.query('UPDATE student_distributions SET students_count = ? WHERE id = ?', [studentsCount, distributionId])
    res.json({ message: 'Кількість студентів оновлено' })
  } catch (error) {
    console.error('ПОМИЛКА ОНОВЛЕННЯ РОЗПОДІЛУ:', error)
    res.status(500).json({ message: error.message, code: error.code })
  }
}

export async function deleteStudentDistribution(req, res) {
  try {
    await ensureTable()
    await pool.query('DELETE FROM student_distributions WHERE id = ?', [Number(req.params.id)])
    res.json({ message: 'Розподіл видалено' })
  } catch (error) {
    res.status(500).json({ message: error.message, code: error.code })
  }
}