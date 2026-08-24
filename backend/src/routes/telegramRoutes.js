import express from 'express'
import { listTelegramMessages, getTelegramMessage, reprocessTelegramMessage } from '../controllers/telegramController.js'

const router = express.Router()

router.get('/messages', listTelegramMessages)
router.get('/messages/:id', getTelegramMessage)
router.post('/messages/:id/reprocess', reprocessTelegramMessage)

export default router
