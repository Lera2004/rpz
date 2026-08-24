import express from 'express'
import { getCommissions, createCommission } from '../controllers/teacherController.js'

const router = express.Router()

router.get('/', getCommissions)
router.post('/', createCommission)

export default router