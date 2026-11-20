import express from 'express'
import {
  downloadGroupCertificates,
  getCertificateGroups
} from '../controllers/certificateController.js'

const router = express.Router()

router.get('/groups', getCertificateGroups)
router.get('/groups/:groupId/archive', downloadGroupCertificates)

export default router
