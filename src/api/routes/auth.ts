import { Router } from 'express';
import { validate } from '../middlewares/validation';
import { AuthController } from '../controllers/auth.controller';
import { loginSchema, setupUserSchema } from '../../types/auth.types';
import { requireAuth } from '../middlewares/auth';

export const authRouter = Router();

authRouter.get('/status', AuthController.status);
authRouter.post('/setup', validate(setupUserSchema), AuthController.setup);
authRouter.post('/login', validate(loginSchema), AuthController.login);
authRouter.post('/logout', requireAuth, AuthController.logout);
authRouter.get('/me', requireAuth, AuthController.me);
