import { boot } from './config/startup.js';

try {
  const { ref, url } = boot(process.env);
  console.log(`XVfinance startup OK — locked Supabase project ${ref} (${url})`);
} catch (err) {
  console.error(`XVfinance startup aborted: ${err.message}`);
  process.exitCode = 1;
}
