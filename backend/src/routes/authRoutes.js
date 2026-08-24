import express from 'express'
import {
  createUserAccount,
  getCurrentUser,
  getUsers,
  loginUser,
  updateUserLogin
} from '../controllers/authController.js'

const router = express.Router()

router.post('/login', loginUser)
router.get('/me', getCurrentUser)
router.get('/users', getUsers)
router.post('/users', createUserAccount)
router.put('/users/:id/login', updateUserLogin)

export default router
