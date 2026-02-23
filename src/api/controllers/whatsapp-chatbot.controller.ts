import { NextFunction, Request, Response } from 'express';
import { handleWhatsappChatbotWebhook } from '../models/whatsapp-chatbot.model';

function readWebhookToken(req: Request) {
  const headerToken = req.get('x-whatsapp-webhook-token') ?? req.get('x-webhook-token');
  const queryToken = typeof req.query?.token === 'string' ? req.query.token : '';
  return headerToken || queryToken || '';
}

export const WhatsappChatbotController = {
  async inbound(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await handleWhatsappChatbotWebhook({
        payload: req.body,
        providedToken: readWebhookToken(req),
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};
