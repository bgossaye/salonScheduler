const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/workerscontroller');
const auth = require('../../middleware/authmiddleware');

const { requirePermission, requireAnyPermission } = auth;

router.use(auth);

// Logged-in worker self-service.
router.get('/me', requireAnyPermission(['appointmentsViewOwn', 'workersView']), controller.getMyWorkerProfile);
router.post('/me/blocked-times', requireAnyPermission(['appointmentsViewOwn', 'workersManageSchedule']), controller.requestMyBlockedTime);
router.delete('/me/blocked-times/:blockId', requireAnyPermission(['appointmentsViewOwn', 'workersManageSchedule']), controller.cancelMyBlockedTime);

router.get('/roles', requireAnyPermission(['permissionsManage', 'workersAssignRoles', 'workersView']), controller.listRoles);
router.post('/roles', requirePermission('permissionsManage'), controller.createRole);
router.put('/roles/:id', requirePermission('permissionsManage'), controller.updateRole);
router.delete('/roles/:id', requirePermission('permissionsManage'), controller.deleteRole);
router.post('/migrate-rakeb', requirePermission('workersManage'), controller.runStaffMigration);

router.get('/', requireAnyPermission(['workersView', 'appointmentsViewAll', 'appointmentsCreate', 'appointmentsCreateOwn', 'appointmentsCreateForOthers', 'clientsAssignStylist']), controller.listWorkers);
router.post('/', requirePermission('workersManage'), controller.createWorker);
router.put('/:id', requirePermission('workersManage'), controller.updateWorker);
router.delete('/:id', requireAnyPermission(['workersDeactivate', 'workersManage']), controller.deleteWorker);

router.post('/:id/access', requireAnyPermission(['workersAssignRoles', 'workersManage']), controller.createOrResetStaffAccess);
router.post('/:id/invite', requireAnyPermission(['workersAssignRoles', 'workersManage']), controller.sendStaffInvite);
router.post('/:id/reset-password', requireAnyPermission(['workersAssignRoles', 'workersManage']), controller.sendStaffPasswordReset);
router.patch('/:id/access', requireAnyPermission(['workersAssignRoles', 'workersManage']), controller.updateStaffAccess);
router.post('/:id/blocked-times', requirePermission('workersManageSchedule'), controller.addWorkerBlockedTime);
router.patch('/:id/blocked-times/:blockId', requirePermission('workersManageSchedule'), controller.updateWorkerBlockedTime);

module.exports = router;
