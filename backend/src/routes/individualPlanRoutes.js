import express from 'express'
import { downloadIndividualPlans } from '../controllers/individualPlanController.js'

const router = express.Router()

router.post('/groups/:groupId/archive', downloadIndividualPlans)

export default router
