import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { requirePermission } from '../middlewares/auth';
import { PERMISSIONS } from '../../core/auth/permissions';

export const dashboardRouter = Router();

dashboardRouter.get('/overview', requirePermission(PERMISSIONS.DASHBOARD_READ), DashboardController.overview);
