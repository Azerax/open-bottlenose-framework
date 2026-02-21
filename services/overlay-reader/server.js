const fs = require('fs');
const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const { Client } = require('pg');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeCopyIfMissing(src, dst) {
  if (!fs.existsSync(src)) return false;
  if (fs.existsSync(dst)) return false;
  ensureDir(path.dirname(dst));
  const tmp = dst + '.tmp';
  fs.copyFileSync(src, tmp);
  fs.renameSync(tmp, dst);
  return true;
}

function loadReaderEnv() {
  const override = process.env.OVERLAY_READER_ENV_PATH && String(process.env.OVERLAY_READER_ENV_PATH).trim();
  if (override) {
    const p = path.resolve(override);
    if (!fs.existsSync(p)) throw new Error(`[overlay-reader] OVERLAY_READER_ENV_PATH set but file not found: ${p}`);
    dotenv.config({ path: p });
    process.env.OVERLAY_READER_ENV_SOURCE = p;
    return;
  }

  const home = process.env.USERPROFILE || 'C:/Users/swhol';
  const openclawEnvPath = path.resolve(home, '.openclaw', 'overlay-reader.env');
  const localEnvPath = path.resolve(__dirname, 'overlay-reader.env');

  if (!fs.existsSync(openclawEnvPath) && fs.existsSync(localEnvPath)) {
    const copied = safeCopyIfMissing(localEnvPath, openclawEnvPath);
    if (copied) console.log(`[overlay-reader] Bootstrapped env into .openclaw: ${openclawEnvPath}`);
  }

  const chosen = fs.existsSync(openclawEnvPath) ? openclawEnvPath : (fs.existsSync(localEnvPath) ? localEnvPath : null);
  if (!chosen) {
    throw new Error(
      `[overlay-reader] Missing env file.\nChecked:\n  - ${openclawEnvPath}\n  - ${localEnvPath}\n` +
      `Fix: put overlay-reader.env in one of those locations, or set OVERLAY_READER_ENV_PATH.`
    );
  }

  dotenv.config({ path: chosen });
  process.env.OVERLAY_READER_ENV_SOURCE = chosen;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`[overlay-reader] Missing required env var: ${name}`);
  return v;
}

function authMiddleware(req, res, next) {
  const token = requireEnv('OVERLAY_READER_TOKEN');
  const hdr = req.headers.authorization || '';
  const ok = hdr.startsWith('Bearer ') && hdr.slice('Bearer '.length) === token;
  if (!ok) return res.status(401).json({ ok: false, error: 'unauthorized' });
  next();
}

async function withClient(fn) {
  const conn = requireEnv('OVERLAY_READER_DB_URL');
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function requireQuery(req, name) {
  const v = req.query[name];
  if (v === undefined || v === null || String(v).trim() === '') {
    throw new Error(`Missing required query param: ${name}`);
  }
  return String(v).trim();
}

async function main() {
  loadReaderEnv();

  const bind = process.env.OVERLAY_READER_BIND || '127.0.0.1';
  const port = Number(process.env.OVERLAY_READER_PORT || '18795');

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      service: 'overlay-reader',
      pid: process.pid,
      env_source: process.env.OVERLAY_READER_ENV_SOURCE,
      bind,
      port
    });
  });

  // everything below requires auth
  app.use(authMiddleware);

  // GET /read/memory_tiers/by_hash?memory_hash=<64hex>
  app.get('/read/memory_tiers/by_hash', async (req, res) => {
    try {
      const memory_hash = requireQuery(req, 'memory_hash');

      if (!/^[a-fA-F0-9]{64}$/.test(memory_hash)) {
        throw new Error('memory_hash must be 64 hex chars');
      }

      const row = await withClient(async (client) => {
        const q = `
          SELECT entry_id::text as entry_id,
                 memory_hash,
                 tier,
                 ttl_days,
                 content
          FROM public.memory_tiers
          WHERE memory_hash = $1
          LIMIT 1;
        `;
        const r = await client.query(q, [memory_hash]);
        return r.rows[0] || null;
      });

      res.json({ ok: true, row });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // GET /read/evidence/by_task?task_id=<id>&limit=50
  app.get('/read/evidence/by_task', async (req, res) => {
    try {
      const task_id = requireQuery(req, 'task_id');
      const limitRaw = req.query.limit === undefined ? '50' : String(req.query.limit);
      const limit = Math.max(1, Math.min(200, Number(limitRaw)));

      if (!Number.isFinite(limit)) throw new Error('limit must be a number');

      const rows = await withClient(async (client) => {
        const q = `
          SELECT id::text as id,
                 task_id,
                 kind,
                 payload,
                 created_at
          FROM public.cc_evidence
          WHERE task_id = $1
          ORDER BY created_at DESC
          LIMIT $2;
        `;
        const r = await client.query(q, [task_id, limit]);
        return r.rows;
      });

      res.json({ ok: true, rows });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  const server = app.listen(port, bind, () => {
    console.log(`[overlay-reader] listening on http://${bind}:${port}`);
  });

  server.on('error', (err) => {
    console.error(`[overlay-reader] server error: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  });
}

main().catch((e) => {
  console.error(e && e.message ? e.message : String(e));
  process.exit(1);
});