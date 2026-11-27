import { execSync } from 'node:child_process';
import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { AuthService } from './middleware/auth.js';

function freePortOnWindows(port: number): void {
  if (process.platform !== 'win32') return;
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const pids = new Set<number>();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
      if (pid && pid !== process.pid) {
        pids.add(pid);
      }
    }
    for (const pid of pids) {
      try {
        process.kill(pid);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore if no process is listening
  }
}

async function bootstrap() {
  await AuthService.ensureDefaultUsers();
  const app = createApp();
  const server = http.createServer(app);

  let retried = false;
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && !retried) {
      retried = true;
      console.log(`[RAGE] Port ${env.PORT} sedang terpakai oleh proses lama, membebaskan port...`);
      freePortOnWindows(env.PORT);
      setTimeout(() => {
        server.listen(env.PORT, '0.0.0.0');
      }, 600);
      return;
    }
    console.error('Failed to start server:', err);
    process.exit(1);
  });

  server.listen(env.PORT, '0.0.0.0', () => {
    console.log(
      `[Roblox Account Generator Engine] API & Server listening on http://127.0.0.1:${env.PORT}`
    );
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
