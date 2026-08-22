import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbClient } from './db/index';
import { log, errorFields } from './utils/logger';

// Import routes (to be created)
import authRoutes from './routes/auth';
import examRoutes from './routes/exams';
import branchRoutes from './routes/branches';
import distributionRoutes from './routes/distributions';
import classRoutes from './routes/classes';
import studentRoutes from './routes/students';
import parentRoutes from './routes/parents';
import attemptRoutes from './routes/attempts';
import reportRoutes from './routes/reports';
import adminRoutes from './routes/admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required');
}

// PostgreSQL session store
const PgSession = connectPgSimple(session);

// CORS configuration
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'],
  credentials: true,
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(
  session({
    store: new PgSession({
      // 세션 스토어는 자체 pg 풀을 만든다. 상한을 명시하지 않으면 기본값(10)이 잡혀
      // 앱 쿼리 풀과 합쳐 프로세스당 20 커넥션이 된다. 예산은 server/db/index.ts 주석 참고.
      conObject: {
        connectionString: process.env.DATABASE_URL,
        max: 5,
      },
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  })
);

// API Routes
/*
 * GET /health - 모니터링용. 인증 없음.
 * DB 가 죽어도 200 으로 응답하고 db:'down' 으로 알린다.
 * 여기서 비-200 을 내면 모니터가 "앱이 죽었다"로 오인해, 실제로는 살아 있는
 * 프로세스를 재시작시킬 수 있다. 앱 생존과 의존성 상태는 분리해서 알린다.
 */
app.get('/health', async (_req, res) => {
  let db: 'up' | 'down' = 'down';
  try {
    await dbClient`SELECT 1`;
    db = 'up';
  } catch (error) {
    log.error('health.db_check_failed', errorFields(error));
  }

  res.json({
    ok: true,
    db,
    uptime: Math.round(process.uptime()),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/distributions', distributionRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/parents', parentRoutes);
app.use('/api', attemptRoutes); // Mount at /api so /my-exams and /exam-attempts both work
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/branch-students', studentRoutes); // Branch manager stats

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist/public')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../dist/public/index.html'));
  });
}

// Error handling
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ message: '서버 오류가 발생했습니다.' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
