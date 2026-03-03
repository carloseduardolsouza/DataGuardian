import { Router } from 'express';
import { AccessController } from '../controllers/access.controller';
import { validate } from '../middlewares/validation';
import { requirePermission } from '../middlewares/auth';
import { PERMISSIONS } from '../../core/auth/permissions';
import {
  createRoleSchema,
  createUserSchema,
  idParamSchema,
  updateRoleSchema,
  updateAccessScopesSchema,
  updateUserPasswordSchema,
  updateUserSchema,
} from '../../types/access.types';

export const accessRouter = Router();

accessRouter.get('/permissions', requirePermission(PERMISSIONS.ACCESS_MANAGE), AccessController.permissions);
accessRouter.get('/roles', requirePermission(PERMISSIONS.ACCESS_MANAGE), AccessController.roles);
accessRouter.post('/roles', requirePermission(PERMISSIONS.ACCESS_MANAGE), validate(createRoleSchema), AccessController.createRole);
accessRouter.put('/roles/:id', requirePermission(PERMISSIONS.ACCESS_MANAGE), validate(idParamSchema, 'params'), validate(updateRoleSchema), AccessController.updateRole);
accessRouter.delete('/roles/:id', requirePermission(PERMISSIONS.ACCESS_MANAGE), validate(idParamSchema, 'params'), AccessController.deleteRole);

accessRouter.get('/users', requirePermission(PERMISSIONS.ACCESS_MANAGE), AccessController.users);
accessRouter.post('/users', requirePermission(PERMISSIONS.ACCESS_MANAGE), validate(createUserSchema), AccessController.createUser);
accessRouter.put('/users/:id', requirePermission(PERMISSIONS.ACCESS_MANAGE), validate(idParamSchema, 'params'), validate(updateUserSchema), AccessController.updateUser);
accessRouter.put('/users/:id/password', requirePermission(PERMISSIONS.ACCESS_MANAGE), validate(idParamSchema, 'params'), validate(updateUserPasswordSchema), AccessController.updateUserPassword);
accessRouter.delete('/users/:id', requirePermission(PERMISSIONS.ACCESS_MANAGE), validate(idParamSchema, 'params'), AccessController.deleteUser);

accessRouter.get('/users/:id/scopes', requirePermission(PERMISSIONS.ACCESS_MANAGE), validate(idParamSchema, 'params'), AccessController.getUserScopes);
accessRouter.put('/users/:id/scopes', requirePermission(PERMISSIONS.ACCESS_MANAGE), validate(idParamSchema, 'params'), validate(updateAccessScopesSchema), AccessController.updateUserScopes);
accessRouter.get('/roles/:id/scopes', requirePermission(PERMISSIONS.ACCESS_MANAGE), validate(idParamSchema, 'params'), AccessController.getRoleScopes);
accessRouter.put('/roles/:id/scopes', requirePermission(PERMISSIONS.ACCESS_MANAGE), validate(idParamSchema, 'params'), validate(updateAccessScopesSchema), AccessController.updateRoleScopes);
accessRouter.get('/me/scopes', AccessController.myScopes);
