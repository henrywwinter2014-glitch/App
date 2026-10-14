/*
 * The same proxy, with the handler signature Vercel and Netlify use.
 *
 * Put this file at `api/market-data.js` in a Vercel project (or `netlify/functions/market-data.js`
 * on Netlify, which also accepts the Web `Request`/`Response` style used here), set PROVIDER and
 * API_KEY as environment variables in the dashboard, and point Bullpen Trader at
 * `https://your-project.vercel.app/api/market-data`.
 *
 * The logic lives in ../market-data.js so there is only one copy of it to audit. Never commit a
 * key into either file: both read it from the environment, and that is the entire point of them.
 */
import { handle } from '../market-data.js';

export const config = { runtime: 'edge' };

export default function handler(request) {
  // On the edge runtime the environment arrives on process.env.
  const env = {
    PROVIDER: process.env.PROVIDER,
    API_KEY: process.env.API_KEY,
    ALLOW_ORIGIN: process.env.ALLOW_ORIGIN,
  };
  return handle(request, env);
}
