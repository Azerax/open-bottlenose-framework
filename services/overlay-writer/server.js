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

  // Best-effort atomic-ish copy: write temp, then rename
  const tmp = dst + '.tmp';
  fs.copyFileSync(src, tmp);
  fs.renameSync(tmp, dst);
  return true;
}

function loadWriterEnv() {
  // 1) Optional override
  const override = process.env.OVERLAY_WRITER_ENV_PATH && String(process.env.OVERLAY_WRITER_ENV_PATH).trim();
  if (override) {
    const p = path.resolve(override);
    if (!fs.existsSync(p)) {
      throw new Error(`[overlay-writer] OVERLAY_WRITER_ENV_PATH set but file not found: ${p}`);
    }
    dotenv.config({ path: p });
    process.env.OVERLAY_WRITER_ENV_SOURCE = p;
    return;
  }

  // 2) Canonical location in .openclaw
  const home = process.env.USERPROFILE || 'C:/Users/swhol';
  const openclawEnvPath = path.resolve(home, '.openclaw', 'overlay-writer.env');

  // 3) Local file beside server.js (bootstrap-friendly)
  const localEnvPath = path.resolve(__dirname, 'overlay-writer.env');

  // If local exists but openclaw does not, auto-copy it once.
  if (!fs.existsSync(openclawEnvPath) && fs.existsSync(localEnvPath)) {
    const copied = safeCopyIfMissing(localEnvPath, openclawEnvPath);
    if (copied) {
      console.log(`[overlay-writer] Bootstrapped env into .openclaw: ${openclawEnvPath}`);
    }
  }

  // Prefer .openclaw after bootstrap, otherwise fall back to local
  const chosen = fs.existsSync(openclawEnvPath)
    ? openclawEnvPath
    : (fs.existsSync(localEnvPath) ? localEnvPath : null);

  if (!chosen) {
    throw new Error(
      `[overlay-writer] Missing env file.\n` +
      `Checked:\n` +
      `  - ${openclawEnvPath}\n` +
      `  - ${localEnvPath}\n` +
      `Fix: put overlay-writer.env in one of those locations, or set OVERLAY_WRITER_ENV_PATH.`
    );
  }

  dotenv.config({ path: chosen });
  process.env.OVERLAY_WRITER_ENV_SOURCE = chosen;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`[overlay-writer] Missing required env var: ${name}`);
  return v;
}

function authMiddleware(req, res, next) {
  const token = requireEnv('OVERLAY_WRITER_TOKEN');
  const hdr = req.headers.authorization || '';
  const ok = hdr.startsWith('Bearer ') && hdr.slice('Bearer '.length) === token;
  if (!ok) return res.status(401).json({ ok: false, error: 'unauthorized' });
  next();
}

function requireFields(obj, fields) {
  for (const f of fields) {
    if (obj[f] === undefined || obj[f] === null || obj[f] === '') {
      throw new Error(`Missing required field: ${f}`);
    }
  }
}

async function withClient(fn) {
  const conn = requireEnv('OVERLAY_WRITER_DB_URL');
  const client = new Client({ connectionString: conn });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function main() {
  loadWriterEnv();

  const bind = process.env.OVERLAY_WRITER_BIND || '127.0.0.1';
  const port = Number(process.env.OVERLAY_WRITER_PORT || '18794');

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      service: 'overlay-writer',
      pid: process.pid,
      env_source: process.env.OVERLAY_WRITER_ENV_SOURCE,
      bind,
      port
    });
  });

  // Everything below this requires auth
  app.use(authMiddleware);

  app.post('/write/memory_tiers/insert', async (req, res) => {
    try {
      const body = req.body || {};
      requireFields(body, ['memory_hash', 'content', 'tier']);

      const memory_hash = String(body.memory_hash);
      const content = String(body.content);
      const tier = String(body.tier);

      if (!/^[a-fA-F0-9]{64}$/.test(memory_hash)) {
        throw new Error('memory_hash must be 64 hex chars');
      }
      if (!['Q', 'W', 'S'].includes(tier)) {
        throw new Error('tier must be one of Q, W, S');
      }

      const ttl_days = body.ttl_days === undefined ? null : Number(body.ttl_days);

      const result = await withClient(async (client) => {
        const q = `
          INSERT INTO public.memory_tiers (memory_hash, content, tier, ttl_days)
          VALUES ($1, $2, $3, COALESCE($4, ttl_days))
          RETURNING entry_id::text as entry_id;
        `;
        const r = await client.query(q, [memory_hash, content, tier, Number.isFinite(ttl_days) ? ttl_days : null]);
        return r.rows[0];
      });

      res.json({ ok: true, entry_id: result.entry_id });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  app.post('/write/evidence/append', async (req, res) => {
    try {
      const body = req.body || {};
      requireFields(body, ['task_id', 'kind', 'payload']);

      const task_id = String(body.task_id);
      const kind = String(body.kind);
      const payload = body.payload;

      const result = await withClient(async (client) => {
        const q = `
          INSERT INTO public.cc_evidence (task_id, kind, payload)
          VALUES ($1, $2, $3::jsonb)
          RETURNING id::text as id;
        `;
        const r = await client.query(q, [task_id, kind, JSON.stringify(payload)]);
        return r.rows[0];
      });

      res.json({ ok: true, id: result.id });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  const server = app.listen(port, bind, () => {
    console.log(`[overlay-writer] listening on http://${bind}:${port}`);
  });

  server.on('error', (err) => {
    console.error(`[overlay-writer] server error: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  });
}

main().catch((e) => {
  console.error(e && e.message ? e.message : String(e));
  process.exit(1);
});