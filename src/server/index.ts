import express from 'express';
import { createServer, context, getServerPort, reddit } from '@devvit/web/server';
import type { DispatchRequest, DispatchResponse, ErrorResponse, InitResponse, SetSpeedResponse } from '../shared/types/signal';
import { createPost } from './core/post';
import { loadNetwork, loadSeason } from './core/season';
import { DispatchError, getDispatcherSnapshot, recordDispatch, clearDispatchLog, clearCooldownForUser, setDispatchDebugSpeed } from './core/dispatch';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.text());

const router = express.Router();

const sendError = (
  res: express.Response<ErrorResponse>,
  status: number,
  code: string,
  message: string
) => {
  res.status(status).json({ status: 'error', code, message });
};

router.get('/api/init', async (_req, res): Promise<void> => {
  const { postId } = context;
  if (!postId) {
    sendError(res, 400, 'MISSING_POST', 'postId is required but missing from context.');
    return;
  }

  try {
    const [season, network] = await Promise.all([
      loadSeason(),
      loadNetwork(),
    ]);
    const snapshot = await getDispatcherSnapshot(context.userId, network);
    const payload: InitResponse = {
      type: 'init',
      season,
      network,
      dispatchLog: snapshot.log,
      objectives: snapshot.objectives,
      events: snapshot.events,
    };
    res.json(payload);
  } catch (error) {
    console.error('Failed to load season or network', error);
    sendError(res, 500, 'INIT_FAILED', 'Unable to load the dispatcher state. Try again later.');
  }
});

router.post('/api/debug/clear-dispatches', async (_req, res): Promise<void> => {
  const { userId } = context;
  if (!userId) {
    sendError(res, 401, 'AUTH_REQUIRED', 'Log in to clear dispatches.');
    return;
  }

  try {
    await clearDispatchLog();
    const snapshot = await getDispatcherSnapshot(userId);
    res.json({ type: 'cleared', dispatchLog: snapshot.log, objectives: snapshot.objectives, events: snapshot.events });
  } catch (error) {
    console.error('Failed to clear dispatches', error);
    sendError(res, 500, 'CLEAR_FAILED', 'Unable to clear dispatches right now.');
  }
});

router.post('/api/debug/set-speed', async (req, res): Promise<void> => {
  const body = req.body as { multiplier?: unknown } | undefined;
  const raw = body?.multiplier;
  const multiplier =
    typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : 0;
  setDispatchDebugSpeed(multiplier);
  const response: SetSpeedResponse = { type: 'speed-set', multiplier };
  res.json(response);
});

router.post('/api/debug/reset-cooldown', async (_req, res): Promise<void> => {
  const { userId } = context;
  if (!userId) {
    sendError(res, 401, 'AUTH_REQUIRED', 'Log in to reset your cooldown.');
    return;
  }

  try {
    await clearCooldownForUser(userId);
    const snapshot = await getDispatcherSnapshot(userId);
    res.json({ type: 'cooldown-reset', dispatchLog: snapshot.log, objectives: snapshot.objectives, events: snapshot.events });
  } catch (error) {
    console.error('Failed to reset cooldown', error);
    sendError(res, 500, 'COOLDOWN_RESET_FAILED', 'Unable to reset cooldown right now.');
  }
});

router.post('/api/dispatch', async (req, res): Promise<void> => {
  const { userId } = context;
  if (!userId) {
    sendError(res, 401, 'AUTH_REQUIRED', 'Log in to dispatch a train.');
    return;
  }

  const username = await reddit.getCurrentUsername();
  if (!username) {
    sendError(res, 401, 'AUTH_REQUIRED', 'Unable to resolve username for dispatcher.');
    return;
  }

  const body = req.body as Partial<DispatchRequest> | undefined;
  if (!body || typeof body.from !== 'string' || typeof body.to !== 'string') {
    sendError(res, 400, 'INVALID_PAYLOAD', 'Provide from and to station ids.');
    return;
  }

  try {
    const network = await loadNetwork();
    const dispatch = await recordDispatch({ from: body.from, to: body.to }, username, userId, network);
    const snapshot = await getDispatcherSnapshot(userId, network);
    const payload: DispatchResponse = {
      type: 'dispatch',
      dispatch,
      dispatchLog: snapshot.log,
      objectives: snapshot.objectives,
      events: snapshot.events,
    };
    res.json(payload);
  } catch (error) {
    if (error instanceof DispatchError) {
      sendError(res, 400, error.code, error.message);
      return;
    }
    console.error('Unhandled dispatch error', error);
    sendError(res, 500, 'DISPATCH_FAILED', 'Unable to dispatch train right now.');
  }
});

router.post('/internal/on-app-install', async (_req, res): Promise<void> => {
  try {
    const post = await createPost();
    res.json({
      status: 'success',
      message: `Post created in subreddit ${context.subredditName} with id ${post.id}`,
    });
  } catch (error) {
    console.error('Error creating post during install', error);
    sendError(res, 400, 'POST_CREATE_FAILED', 'Failed to create post');
  }
});

router.post('/internal/menu/post-create', async (_req, res): Promise<void> => {
  try {
    const post = await createPost();
    res.json({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
    });
  } catch (error) {
    console.error('Error creating post from menu', error);
    sendError(res, 400, 'POST_CREATE_FAILED', 'Failed to create post');
  }
});

app.use(router);

const port = getServerPort();
const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port);
