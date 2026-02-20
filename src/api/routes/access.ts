import { Router } from 'express';
import { AccessController } from '../controllers/access.controller';
import { validate } from '../middlewares/validation';
import {
  createRoleSchema,
  createUserSchema,
  idParamSchema,
  updateRoleSchema,
  updateUserPasswordSchema,
  updateUserSchema,
} from '../../types/access.types';

export const accessRouter = Router();

accessRouter.get('/permissions', AccessController.permissions);
accessRouter.get('/roles', AccessController.roles);
accessRouter.post('/roles', validate(createRoleSchema), AccessController.createRole);
accessRouter.put('/roles/:id', validate(idParamSchema, 'params'), validate(updateRoleSchema), AccessController.updateRole);
accessRouter.delete('/roles/:id', validate(idParamSchema, 'params'), AccessController.deleteRole);

accessRouter.get('/users', AccessController.users);
accessRouter.post('/users', validate(createUserSchema), AccessController.createUser);
accessRouter.put('/users/:id', validate(idParamSchema, 'params'), validate(updateUserSchema), AccessController.updateUser);
accessRouter.put('/users/:id/password', validate(idParamSchema, 'params'), validate(updateUserPasswordSchema), AccessController.updateUserPassword);
accessRouter.delete('/users/:id', validate(idParamSchema, 'params'), AccessController.deleteUser);
