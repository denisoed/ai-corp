import { Router } from 'express';
import { authMiddleware } from './auth';
import authRoutes from './routes/auth';
import stateRoutes from './routes/state';
import agentRoutes from './routes/agents';
import workspaceRoutes from './routes/workspaces';
import taskRoutes from './routes/tasks';
import roleRoutes from './routes/roles';
import cronRoutes from './routes/crons';
import settingsRoutes from './routes/settings';
import messageRoutes from './routes/messages';
import subscriptionRoutes from './routes/subscriptions';
import skillRoutes from './routes/skills';

const router = Router();

// Auth routes are NOT protected (login/setup/logout must be accessible)
router.use(authRoutes);

// Apply auth middleware to all other API routes
router.use(authMiddleware);

router.use(stateRoutes);
router.use(agentRoutes);
router.use(workspaceRoutes);
router.use(taskRoutes);
router.use(roleRoutes);
router.use(cronRoutes);
router.use(settingsRoutes);
router.use(messageRoutes);
router.use(subscriptionRoutes);
router.use(skillRoutes);

export default router;
