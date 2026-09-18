import { boot } from './config/startup.js';
import { startApiServer } from './server/http.js';

const listen = process.argv.includes('--serve');

try {
  const { ref, url } = boot(process.env);
  console.log(`XVfinance startup OK — locked Supabase project ${ref} (${url})`);

  if (listen) {
    const port = Number(process.env.PORT || 8787);
    const server = await startApiServer({ port, env: process.env });
    const address = server.address();
    console.log(`XVfinance API listening on http://127.0.0.1:${address.port}`);
  }
} catch (err) {
  console.error(`XVfinance startup aborted: ${err.message}`);
  process.exitCode = 1;
}
