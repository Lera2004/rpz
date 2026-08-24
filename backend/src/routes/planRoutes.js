import { Router } from 'express'
import { getPlans, updatePlanDiscipline } from '../controllers/planController.js'

const router = Router()

router.get('/', getPlans)
router.patch('/disciplines/:id', updatePlanDiscipline)

export default router
