import { startHttpServer } from './http/server.js';

try {
  const { port, locked } = await startHttpServer(process.env);
  console.log(`XVfinance startup OK — locked Supabase project ${locked.ref} (${locked.url})`);
  console.log(`XVfinance listening on :${port}`);

  const stop = () => {
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
} catch (err) {
  console.error(`XVfinance startup aborted: ${err.message}`);
  process.exit(1);
}
