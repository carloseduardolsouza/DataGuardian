import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middlewares/validation';
import { WhatsappChatbotController } from '../controllers/whatsapp-chatbot.controller';

export const integrationsRouter = Router();

const webhookQuerySchema = z.object({
  token: z.string().optional(),
});

integrationsRouter.post(
  '/whatsapp/webhook',
  validate(webhookQuerySchema, 'query'),
  WhatsappChatbotController.inbound,
);
