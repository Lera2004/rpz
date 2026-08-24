import express from 'express'
import {
  createTask,
  deleteTask,
  getMyTasks,
  getTasks,
  updateTask,
  updateTaskAssignmentStatus
} from '../controllers/taskController.js'

const router = express.Router()

router.get('/', getTasks)
router.get('/my', getMyTasks)
router.post('/', createTask)
router.put('/:id', updateTask)
router.delete('/:id', deleteTask)
router.patch('/:taskId/assignments/:assignmentId/status', updateTaskAssignmentStatus)

export default router
