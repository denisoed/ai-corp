import { Router } from 'express';
import stateRoutes from './routes/state';
import agentRoutes from './routes/agents';
import workspaceRoutes from './routes/workspaces';
import taskRoutes from './routes/tasks';
import roleRoutes from './routes/roles';
import cronRoutes from './routes/crons';
import settingsRoutes from './routes/settings';

const router = Router();

router.use(stateRoutes);
router.use(agentRoutes);
router.use(workspaceRoutes);
router.use(taskRoutes);
router.use(roleRoutes);
router.use(cronRoutes);
router.use(settingsRoutes);

export default router;
