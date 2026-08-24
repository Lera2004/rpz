import pool from '../config/database.js'
import { notifyTeachersForTask } from '../telegramBot.js'

const COMMISSION_NAME = 'Інженерія програмного забезпечення'

const TASK_STATUS_LABELS = {
  not_started: 'Не виконано',
  in_progress: 'В процесі',
  completed: 'Виконано'
}

const TASK_PRIORITY_LABELS = {
  low: 'Низький',
  medium: 'Середній',
  high: 'Високий'
}

const TASK_STATUS_VALUES = Object.keys(TASK_STATUS_LABELS)
const TASK_PRIORITY_VALUES = Object.keys(TASK_PRIORITY_LABELS)

function normalizeStatus(value) {
  if (value === 'in_progress') return 'in_progress'
  if (value === 'completed') return 'completed'
  return 'not_started'
}

function normalizePriority(value) {
  if (TASK_PRIORITY_VALUES.includes(value)) return value
  return 'medium'
}

function mapLegacyStatus(value) {
  if (value === 'in_progress') return 'in_progress'
  if (value === 'done' || value === 'completed') return 'completed'
  return 'not_started'
}

function parseTeacherIds(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0)
  }

  if (value === 'all') {
    return 'all'
  }

  if (value !== undefined && value !== null && value !== '') {
    const single = Number(value)
    if (Number.isFinite(single) && single > 0) {
      return [single]
    }
  }

  return []
}

function computeEffectivePriorityLocal(originalPriority, deadline) {
  const ranks = { low: 1, medium: 2, high: 3 }
  const now = new Date()
  if (!deadline) return { effectivePriority: originalPriority || 'medium', overdue: false }
  const d = new Date(deadline)
  if (isNaN(d)) return { effectivePriority: originalPriority || 'medium', overdue: false }
  const utc1 = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const utc2 = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.floor((utc2 - utc1) / (24 * 60 * 60 * 1000))

  let defaultEffective = 'medium'
  if (diffDays > 3) defaultEffective = 'medium'
  else if (diffDays <= 3 && diffDays >= 0) defaultEffective = 'high'
  else if (diffDays < 0) defaultEffective = 'high'

  const orig = originalPriority && ['low','medium','high'].includes(originalPriority) ? originalPriority : 'medium'
  const eff = ranks[orig] >= ranks[defaultEffective] ? orig : defaultEffective
  return { effectivePriority: eff, overdue: diffDays < 0 }
}

function formatTaskRow(task, assignments = []) {
  const total = assignments.length
  const completed = assignments.filter((assignment) => assignment.status === 'completed').length
  const inProgress = assignments.filter((assignment) => assignment.status === 'in_progress').length
  const notStarted = assignments.filter((assignment) => assignment.status === 'not_started').length

  const { effectivePriority, overdue } = computeEffectivePriorityLocal(task.priority, task.deadline)

  return {
    ...task,
    originalPriority: task.priority,
    effectivePriority,
    overdue: Boolean(overdue),
    priority_label: TASK_PRIORITY_LABELS[task.priority] || TASK_PRIORITY_LABELS.medium,
    effective_priority_label: TASK_PRIORITY_LABELS[effectivePriority] || TASK_PRIORITY_LABELS.medium,
    deadline: task.deadline || null,
    assignments: assignments.map((assignment) => ({
      ...assignment,
      status_label: TASK_STATUS_LABELS[assignment.status] || TASK_STATUS_LABELS.not_started
    })),
    stats: {
      total,
      completed,
      in_progress: inProgress,
      not_started: notStarted
    }
  }
}

async function getCommissionTeachers() {
  const [rows] = await pool.query(`
    SELECT t.id, t.full_name, t.commission_id, c.name AS commission_name
    FROM teachers t
    JOIN commissions c ON c.id = t.commission_id
    WHERE c.name = ?
    ORDER BY t.full_name
  `, [COMMISSION_NAME])

  return rows
}

async function ensureTaskTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      created_by INT NULL,
      deadline DATE NULL,
      priority ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
      telegram_message_id INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES teachers(id)
        ON DELETE SET NULL
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_assignments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      task_id INT NOT NULL,
      teacher_id INT NOT NULL,
      status ENUM('not_started', 'in_progress', 'completed') NOT NULL DEFAULT 'not_started',
      completed_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_task_teacher (task_id, teacher_id),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
        ON DELETE CASCADE,
      FOREIGN KEY (teacher_id) REFERENCES teachers(id)
        ON DELETE CASCADE
    )
  `)

  // Attempt to create foreign key to telegram_messages if table exists and constraint not present
  try {
    const [tmTables] = await pool.query("SHOW TABLES LIKE 'telegram_messages'")
    if (tmTables.length) {
      // populate telegram_message_id for existing tasks if telegram_messages has created_task_id/task_id mapping
      try {
        await pool.query("UPDATE tasks t JOIN telegram_messages tm ON tm.created_task_id = t.id SET t.telegram_message_id = tm.id")
      } catch (e) {
        // ignore if column doesn't exist or tm doesn't have created_task_id
      }
      try {
        await pool.query("UPDATE tasks t JOIN telegram_messages tm ON tm.task_id = t.id SET t.telegram_message_id = tm.id")
      } catch (e) {
        // ignore
      }

      // Add foreign key if not exists
      try {
        await pool.query("ALTER TABLE tasks ADD CONSTRAINT fk_tasks_telegram_message FOREIGN KEY (telegram_message_id) REFERENCES telegram_messages(id) ON DELETE CASCADE")
      } catch (e) {
        // constraint might already exist or column missing — ignore
      }
    }
  } catch (e) {
    // ignore
  }

  await migrateLegacyTeacherTasks()
  await ensureSeedTasks()
}

async function migrateLegacyTeacherTasks() {
  const [legacyTable] = await pool.query(`SHOW TABLES LIKE 'teacher_tasks'`)
  if (!legacyTable.length) {
    return
  }

  const [taskCount] = await pool.query('SELECT COUNT(*) AS total FROM tasks')
  if (Number(taskCount[0]?.total || 0) > 0) {
    return
  }

  const [legacyRows] = await pool.query('SELECT * FROM teacher_tasks ORDER BY id')
  if (!legacyRows.length) {
    return
  }

  for (const row of legacyRows) {
    const [taskResult] = await pool.query(
      `INSERT INTO tasks (title, description, created_by, deadline, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        row.title,
        row.description || '',
        row.teacher_id || null,
        row.due_date || null,
        row.priority || 'medium',
        row.created_at || new Date(),
        row.updated_at || new Date()
      ]
    )

    await pool.query(
      `INSERT INTO task_assignments (task_id, teacher_id, status, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        taskResult.insertId,
        row.teacher_id,
        mapLegacyStatus(row.status),
        null,
        row.created_at || new Date(),
        row.updated_at || new Date()
      ]
    )
  }
}

async function ensureSeedTasks() {
  const [taskCount] = await pool.query('SELECT COUNT(*) AS total FROM tasks')
  if (Number(taskCount[0]?.total || 0) > 0) {
    return
  }

  const teachers = await getCommissionTeachers()
  if (!teachers.length) {
    return
  }

  const taskTemplates = [
    {
      title: 'Перевірити робочі програми дисциплін',
      description: 'Перевірити актуальність робочих програм дисциплін та відповідність навчальним планам.',
      deadline: '2026-08-25',
      priority: 'high'
    },
    {
      title: 'Підготувати матеріали до засідання ЦК',
      description: 'Підготувати необхідні матеріали та документи до чергового засідання циклової комісії.',
      deadline: '2026-08-30',
      priority: 'high'
    },
    {
      title: 'Оновити методичні матеріали',
      description: 'Перевірити та оновити методичні матеріали з навчальних дисциплін.',
      deadline: '2026-09-05',
      priority: 'medium'
    },
    {
      title: 'Перевірити навчальне навантаження',
      description: 'Перевірити розподіл педагогічного навантаження викладачів та виявити можливі невідповідності.',
      deadline: '2026-09-10',
      priority: 'high'
    },
    {
      title: 'Підготувати пропозиції щодо навчальних дисциплін',
      description: 'Підготувати пропозиції щодо оновлення та вдосконалення переліку навчальних дисциплін комісії.',
      deadline: '2026-09-15',
      priority: 'medium'
    }
  ]

  const statusPool = ['not_started', 'in_progress', 'completed']

  for (const [index, template] of taskTemplates.entries()) {
    const creatorId = teachers[index % teachers.length]?.id || teachers[0].id
    const [taskResult] = await pool.query(
      `INSERT INTO tasks (title, description, created_by, deadline, priority)
       VALUES (?, ?, ?, ?, ?)`,
      [template.title, template.description, creatorId, template.deadline, template.priority]
    )

    const selectedTeachers = teachers.slice(0, Math.min(teachers.length, 4))
    for (const [teacherIndex, teacher] of selectedTeachers.entries()) {
      const status = statusPool[(teacherIndex + index) % statusPool.length]
      await pool.query(
        `INSERT INTO task_assignments (task_id, teacher_id, status)
         VALUES (?, ?, ?)`,
        [taskResult.insertId, teacher.id, status]
      )
    }
  }
}

async function getTaskListForCommission() {
  await ensureTaskTables()

  const [tasksRows] = await pool.query(`
    SELECT t.id, t.title, t.description, t.created_by, t.deadline, t.priority, t.created_at, t.updated_at,
           teacher.full_name AS created_by_name
    FROM tasks t
    LEFT JOIN teachers teacher ON teacher.id = t.created_by
    WHERE EXISTS (
      SELECT 1
      FROM task_assignments ta
      JOIN teachers tr ON tr.id = ta.teacher_id
      JOIN commissions c ON c.id = tr.commission_id
      WHERE ta.task_id = t.id AND c.name = ?
    )
    ORDER BY t.deadline IS NULL, t.deadline ASC, t.created_at DESC
  `, [COMMISSION_NAME])

  const taskIds = tasksRows.map((task) => task.id)

  if (!taskIds.length) {
    return []
  }

  const [assignmentRows] = await pool.query(`
    SELECT ta.id AS assignment_id, ta.task_id, ta.teacher_id, ta.status, ta.completed_at, ta.created_at, ta.updated_at,
           tr.full_name AS teacher_name
    FROM task_assignments ta
    JOIN teachers tr ON tr.id = ta.teacher_id
    JOIN commissions c ON c.id = tr.commission_id
    WHERE c.name = ? AND ta.task_id IN (?)
    ORDER BY tr.full_name
  `, [COMMISSION_NAME, taskIds])

  const assignmentsByTask = new Map()
  for (const assignment of assignmentRows) {
    if (!assignmentsByTask.has(assignment.task_id)) {
      assignmentsByTask.set(assignment.task_id, [])
    }
    assignmentsByTask.get(assignment.task_id).push({
      id: assignment.assignment_id,
      task_id: assignment.task_id,
      teacher_id: assignment.teacher_id,
      teacher_name: assignment.teacher_name,
      status: assignment.status,
      completed_at: assignment.completed_at,
      created_at: assignment.created_at,
      updated_at: assignment.updated_at,
      status_label: TASK_STATUS_LABELS[assignment.status] || TASK_STATUS_LABELS.not_started
    })
  }

  return tasksRows.map((task) => formatTaskRow(task, assignmentsByTask.get(task.id) || []))
}

export async function getTasks(req, res) {
  try {
    const tasks = await getTaskListForCommission()
    res.json(tasks)
  } catch (error) {
    console.error('ПОМИЛКА ЗАВАНТАЖЕННЯ ЗАВДАНЬ:', error)
    res.status(500).json({
      message: 'Не вдалося завантажити завдання циклової комісії.',
      details: error.message
    })
  }
}

export async function getMyTasks(req, res) {
  try {
    const teacherId = Number(req.query.teacher_id)
    if (!Number.isFinite(teacherId) || teacherId <= 0) {
      return res.status(400).json({ message: 'Не вказано teacher_id для фільтрації завдань.' })
    }

    const [rows] = await pool.query(`
      SELECT
        t.id,
        t.title,
        t.description,
        t.created_by,
        t.deadline,
        t.priority,
        t.created_at,
        t.updated_at,
        ta.id AS assignment_id,
        ta.teacher_id,
        ta.status,
        ta.completed_at,
        teacher.full_name AS teacher_name,
        creator.full_name AS created_by_name
      FROM task_assignments ta
      JOIN tasks t ON t.id = ta.task_id
      JOIN teachers teacher ON teacher.id = ta.teacher_id
      LEFT JOIN teachers creator ON creator.id = t.created_by
      WHERE ta.teacher_id = ?
      ORDER BY t.deadline IS NULL, t.deadline ASC, t.created_at DESC
    `, [teacherId])

    const tasks = rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      created_by: row.created_by,
      created_by_name: row.created_by_name,
      deadline: row.deadline,
      priority: row.priority,
      priority_label: TASK_PRIORITY_LABELS[row.priority] || TASK_PRIORITY_LABELS.medium,
      assignment_id: row.assignment_id,
      teacher_id: row.teacher_id,
      teacher_name: row.teacher_name,
      status: row.status,
      status_label: TASK_STATUS_LABELS[row.status] || TASK_STATUS_LABELS.not_started,
      completed_at: row.completed_at,
      created_at: row.created_at,
      updated_at: row.updated_at
    }))

    res.json(tasks)
  } catch (error) {
    console.error('ПОМИЛКА ЗАВАНТАЖЕННЯ МОЇХ ЗАВДАНЬ:', error)
    res.status(500).json({
      message: 'Не вдалося завантажити завдання викладача.',
      details: error.message
    })
  }
}

export async function createTask(req, res) {
  try {
    await ensureTaskTables()

    const title = String(req.body?.title || '').trim()
    if (!title) {
      return res.status(400).json({ message: 'Назва завдання є обов’язковою.' })
    }

    const rawTeacherIds = parseTeacherIds(req.body?.teacher_ids)
    let teacherIds = rawTeacherIds

    if (req.body?.select_all === true || req.body?.all_teachers === true) {
      const teachers = await getCommissionTeachers()
      teacherIds = teachers.map((teacher) => teacher.id)
    }

    if (!teacherIds.length) {
      return res.status(400).json({ message: 'Потрібно вибрати хоча б одного викладача.' })
    }

    const createdBy = Number(req.body?.created_by || teacherIds[0])
    if (!Number.isFinite(createdBy) || createdBy <= 0) {
      return res.status(400).json({ message: 'Некоректний автор завдання.' })
    }

    const [createdByTeacher] = await pool.query(
      `SELECT t.id FROM teachers t JOIN commissions c ON c.id = t.commission_id WHERE t.id = ? AND c.name = ?`,
      [createdBy, COMMISSION_NAME]
    )

    if (!createdByTeacher.length) {
      return res.status(400).json({ message: `Автор завдання повинен належати до комісії "${COMMISSION_NAME}".` })
    }

    const normalizedPriority = normalizePriority(req.body?.priority)
    const deadline = req.body?.deadline || null

    const [taskResult] = await pool.query(
      `INSERT INTO tasks (title, description, created_by, deadline, priority, telegram_message_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        title,
        String(req.body?.description || '').trim(),
        createdBy,
        deadline,
        normalizedPriority,
        req.body?.telegram_message_id || null
      ]
    )

    const taskId = taskResult.insertId
    const uniqueTeacherIds = [...new Set(teacherIds)]

    for (const teacherId of uniqueTeacherIds) {
      await pool.query(
        `INSERT INTO task_assignments (task_id, teacher_id, status)
         VALUES (?, ?, 'not_started')`,
        [taskId, teacherId]
      )
    }

    const taskPayload = {
      title,
      description: String(req.body?.description || '').trim(),
      deadline,
      priority: normalizedPriority,
      created_by: createdBy
    }

    await notifyTeachersForTask(taskId, taskPayload)

    const tasks = await getTaskListForCommission()
    const createdTask = tasks.find((task) => task.id === taskId)

    res.status(201).json(createdTask || { id: taskId })
  } catch (error) {
    console.error('ПОМИЛКА СТВОРЕННЯ ЗАВДАННЯ:', error)
    res.status(500).json({
      message: 'Не вдалося створити завдання.',
      details: error.message
    })
  }
}

export async function updateTask(req, res) {
  try {
    const { id } = req.params
    const title = req.body?.title !== undefined ? String(req.body.title).trim() : undefined
    const description = req.body?.description !== undefined ? String(req.body.description).trim() : undefined
    const priority = req.body?.priority !== undefined ? normalizePriority(req.body.priority) : undefined
    const deadline = req.body?.deadline !== undefined ? req.body.deadline || null : undefined

    const rawTeacherIds = req.body?.teacher_ids !== undefined ? parseTeacherIds(req.body.teacher_ids) : null
    let teacherIds = rawTeacherIds

    if (req.body?.select_all === true || req.body?.all_teachers === true) {
      const teachers = await getCommissionTeachers()
      teacherIds = teachers.map((teacher) => teacher.id)
    }

    if (!title && !description && !priority && !deadline && teacherIds === null) {
      return res.status(400).json({ message: 'Немає даних для оновлення.' })
    }

    const [taskRows] = await pool.query('SELECT * FROM tasks WHERE id = ?', [id])
    if (!taskRows.length) {
      return res.status(404).json({ message: 'Завдання не знайдено.' })
    }

    const currentTask = taskRows[0]

    if (teacherIds !== null) {
      if (!teacherIds.length) {
        return res.status(400).json({ message: 'Потрібно вибрати хоча б одного викладача.' })
      }

      const uniqueTeacherIds = [...new Set(teacherIds.map(Number).filter((value) => Number.isFinite(value) && value > 0))]
      const [teacherRows] = await pool.query(
        `SELECT t.id FROM teachers t
         JOIN commissions c ON c.id = t.commission_id
         WHERE c.name = ? AND t.id IN (?)`,
        [COMMISSION_NAME, uniqueTeacherIds]
      )

      const validTeacherIds = teacherRows.map((teacher) => Number(teacher.id))
      if (validTeacherIds.length !== uniqueTeacherIds.length) {
        return res.status(400).json({ message: 'До завдання можна призначати лише викладачів комісії "Інженерія програмного забезпечення".' })
      }

      const [existingAssignments] = await pool.query(
        'SELECT teacher_id FROM task_assignments WHERE task_id = ?',
        [id]
      )

      const existingTeacherIds = new Set(existingAssignments.map((assignment) => Number(assignment.teacher_id)))
      const targetTeacherIds = new Set(uniqueTeacherIds)

      for (const teacherId of uniqueTeacherIds) {
        if (!existingTeacherIds.has(Number(teacherId))) {
          await pool.query(
            `INSERT INTO task_assignments (task_id, teacher_id, status)
             VALUES (?, ?, 'not_started')`,
            [id, teacherId]
          )
        }
      }

      for (const teacherId of existingTeacherIds) {
        if (!targetTeacherIds.has(Number(teacherId))) {
          await pool.query(
            'DELETE FROM task_assignments WHERE task_id = ? AND teacher_id = ?',
            [id, teacherId]
          )
        }
      }
    }

    await pool.query(
      `UPDATE tasks
       SET title = ?, description = ?, deadline = ?, priority = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        title || currentTask.title,
        description !== undefined ? description : currentTask.description,
        deadline !== undefined ? deadline : currentTask.deadline,
        priority || currentTask.priority,
        id
      ]
    )

    const tasks = await getTaskListForCommission()
    const updatedTask = tasks.find((task) => task.id === Number(id))

    if (teacherIds !== null) {
      const [assignmentRows] = await pool.query(
        'SELECT teacher_id FROM task_assignments WHERE task_id = ? ORDER BY teacher_id',
        [id]
      )

      const assignedIds = assignmentRows.map((assignment) => Number(assignment.teacher_id))
      if (assignedIds.length) {
        const taskPayload = {
          title: title || currentTask.title,
          description: description !== undefined ? description : currentTask.description,
          deadline: deadline !== undefined ? deadline : currentTask.deadline,
          priority: priority || currentTask.priority,
          created_by: currentTask.created_by
        }

        for (const teacherId of assignedIds) {
          await notifyTeachersForTask(id, {
            ...taskPayload,
            title: taskPayload.title || 'Оновлено завдання'
          })
        }
      }
    }

    res.json(updatedTask || { id: Number(id) })
  } catch (error) {
    console.error('ПОМИЛКА ОНОВЛЕННЯ ЗАВДАННЯ:', error)
    res.status(500).json({
      message: 'Не вдалося оновити завдання.',
      details: error.message
    })
  }
}

export async function deleteTask(req, res) {
  try {
    const { id } = req.params
    const [taskRows] = await pool.query('SELECT id, telegram_message_id FROM tasks WHERE id = ?', [id])
    if (!taskRows.length) {
      return res.status(404).json({ message: 'Завдання не знайдено.' })
    }
    const task = taskRows[0]

    // If task references a telegram_message_id, delete that telegram message first
    if (task.telegram_message_id) {
      // Deleting telegram_messages will cascade-delete tasks via FK if set
      await pool.query('DELETE FROM telegram_messages WHERE id = ?', [task.telegram_message_id])
      return res.json({ success: true, id: Number(id), deleted_via: 'telegram_message' })
    }

    // Otherwise, cleanup any telegram_messages linked by legacy columns (created_task_id or task_id)
    try {
      await pool.query('DELETE FROM telegram_messages WHERE created_task_id = ? OR task_id = ?', [id, id])
    } catch (e) {
      // ignore if columns don't exist
    }

    // Finally delete the task
    const [result] = await pool.query('DELETE FROM tasks WHERE id = ?', [id])
    if (!result.affectedRows) {
      return res.status(404).json({ message: 'Завдання не знайдено.' })
    }

    res.json({ success: true, id: Number(id) })
  } catch (error) {
    console.error('ПОМИЛКА ВИДАЛЕННЯ ЗАВДАННЯ:', error)
    res.status(500).json({
      message: 'Не вдалося видалити завдання.',
      details: error.message
    })
  }
}

export async function updateTaskAssignmentStatus(req, res) {
  try {
    const { taskId, assignmentId } = req.params
    const nextStatus = normalizeStatus(req.body?.status)

    if (!TASK_STATUS_VALUES.includes(nextStatus)) {
      return res.status(400).json({ message: 'Некоректний статус завдання.' })
    }

    const [assignmentRows] = await pool.query(
      `SELECT * FROM task_assignments WHERE id = ? AND task_id = ?`,
      [assignmentId, taskId]
    )

    if (!assignmentRows.length) {
      return res.status(404).json({ message: 'Призначення не знайдено.' })
    }

    const assignment = assignmentRows[0]
    const completedAt = nextStatus === 'completed' ? new Date() : null

    await pool.query(
      `UPDATE task_assignments
       SET status = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND task_id = ?`,
      [nextStatus, completedAt, assignmentId, taskId]
    )

    const [updatedRows] = await pool.query(
      `SELECT ta.id, ta.task_id, ta.teacher_id, ta.status, ta.completed_at, ta.created_at, ta.updated_at,
              t.full_name AS teacher_name
       FROM task_assignments ta
       JOIN teachers t ON t.id = ta.teacher_id
       WHERE ta.id = ?`,
      [assignmentId]
    )

    res.json(updatedRows[0] || null)
  } catch (error) {
    console.error('ПОМИЛКА ОНОВЛЕННЯ СТАТУСУ ЗАВДАННЯ:', error)
    res.status(500).json({
      message: 'Не вдалося оновити статус призначення.',
      details: error.message
    })
  }
}

export async function initializeTaskData() {
  await ensureTaskTables()
}
