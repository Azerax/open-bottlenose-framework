README.md
# Open Bottlenose Framework
# Skip to SETUP INSTRUCTIONS for a detailed step by step guy

This repository contains the persistence layer used by OpenClaw agents.

OpenClaw agents are intentionally not allowed to access databases directly.  
Instead, they interact with memory through two controlled services:

• **overlay-reader** → safe read-only access  
• **overlay-writer** → controlled write access

This separation prevents agents from corrupting state, hallucinating schema usage, or performing unsafe operations.

The agents reason.  
The overlays persist.

---

## What this repo provides

This repo installs and runs the database boundary layer for agent systems.

It does NOT include a full agent runtime.  
It provides the safety layer that agent frameworks (including OpenClaw) connect to.

Services:

| Service | Purpose | Port |
|--------|-------|------|
| overlay-reader | Database read API | 18795 |
| overlay-writer | Database write API | 18794 |

---

## First Time Setup (Windows)

Clone the repo:


git clone https://github.com/Azerax/open-bottlenose-framework.git

cd open-bottlenose-framework


Run bootstrap:


powershell -ExecutionPolicy Bypass -File .\setup.ps1


This creates:


C:\Users<you>.openclaw\


and copies configuration templates into it.

---

## Configure

Open and edit:


%USERPROFILE%.openclaw\overlay-reader.env
%USERPROFILE%.openclaw\overlay-writer.env


You must set:


OVERLAY_READER_DB_URL=
OVERLAY_WRITER_DB_URL=
OVERLAY_READER_TOKEN=
OVERLAY_WRITER_TOKEN=


These services will refuse to start without them.

---

## Install Dependencies


cd services\overlay-reader
npm install

cd ..\overlay-writer
npm install


---

## Start the Services

In two terminals:

### Terminal 1

node services\overlay-reader\server.js


### Terminal 2

node services\overlay-writer\server.js


---

## Verify

Reader:


irm http://127.0.0.1:18795/health


Writer:


irm http://127.0.0.1:18794/health


You should see:


ok : True
service : overlay-reader


and


ok : True
service : overlay-writer


---

## How agents use this

Agents never connect to Postgres.

Instead:

| Action | Endpoint |
|------|------|
| Read memory | overlay-reader |
| Write memory | overlay-writer |

Overlay usage rules:

1) Local reasoning first
2) Workspace files second
3) Execution outputs third
4) Overlay services last

If an agent can solve a task without persistence, it must not use the overlay.

---

## Security Model

The overlay services are intentionally local-only:


127.0.0.1


They are not designed to be internet exposed.

Authentication uses bearer tokens from the `.openclaw` configuration directory.

---

## Relationship to open-bottlenose (npm)

The `open-bottlenose` npm package provides agent-side memory management and context governance.

This repo provides the **server-side persistence boundary**.

They are designed to work together, but are version-independent.

---

## Why this exists

LLM agents cannot safely use databases directly.

Without a boundary they will:

• invent tables  
• corrupt schema  
• overwrite history  
• create infinite loops of writes  

The overlay architecture gives agents memory while preventing them from controlling storage.

This repo is the storage boundary.

-----SETUP INSTRUCTIONS----
OpenClaw Overlay Memory (Open-Bottlenose)
First-Time Setup Guide — Windows (Clean Version)

Follow the steps in order.

Overview

This setup creates persistent agent memory:

OpenClaw
→ Overlay Reader (retrieves memory)
→ Overlay Writer (stores memory)
→ PostgreSQL (durable storage)

After completion, agents can remember information across sessions.

1) Install Required Software

Install these before anything else:

Node.js LTS (20 or newer)

PostgreSQL (16 or newer)

Git

During PostgreSQL installation, create a password for the postgres user and record it.
Example used below:

username: postgres
password: admin

2) Install the Runtime Package (First Action)

Open PowerShell and run:

npm install -g open-bottlenose

Wait until the install finishes successfully.

3) Download the Service Framework
cd C:\
mkdir lab
cd C:\lab
git clone https://github.com/<repo>/open-bottlenose-framework
cd C:\lab\openclaw\open-bottlenose-framework
npm install
4) Create the Database

Open SQL Shell (psql).

Log in using:

Server: localhost
Database: postgres
Port: 5432
Username: postgres
Password: (your chosen password)

You will see:

postgres=#

Create the overlay database:

CREATE DATABASE openclaw_overlay;

Connect to it:

\c openclaw_overlay

Enable UUID generation:

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
5) Create the Tables
Memory table
CREATE TABLE public.memory_tiers (
  entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_hash CHAR(64) NOT NULL,
  tier CHAR(1) NOT NULL CHECK (tier IN ('Q','W','S')),
  content TEXT NOT NULL,
  ttl_days INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
Evidence table
CREATE TABLE public.cc_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
6) Create the Configuration Folder

Create:

C:\Users\<your username>\.openclaw
7) Create Environment Files
overlay-writer.env

Create:

C:\Users\<user>\.openclaw\overlay-writer.env

Contents:

OVERLAY_WRITER_BIND=127.0.0.1
OVERLAY_WRITER_PORT=18794
OVERLAY_WRITER_DB_URL=postgres://postgres:admin@127.0.0.1:5432/openclaw_overlay
OVERLAY_WRITER_TOKEN=superlongrandomstring123456789
overlay-reader.env

Create:

C:\Users\<user>\.openclaw\overlay-reader.env

Contents:

OVERLAY_READER_BIND=127.0.0.1
OVERLAY_READER_PORT=18795
OVERLAY_READER_DB_URL=postgres://postgres:admin@127.0.0.1:5432/openclaw_overlay
OVERLAY_READER_TOKEN=superlongrandomstring123456789

Both files reference the same database.

8) Start the Services
Start writer
cd C:\lab\openclaw\open-bottlenose-framework\services\overlay-writer
node server.js
Start reader
cd C:\lab\openclaw\open-bottlenose-framework\services\overlay-reader
node server.js
9) Verify Services

Open in a browser or PowerShell:

http://127.0.0.1:18794/health
http://127.0.0.1:18795/health

Both should return JSON with "ok": true.

10) Write a Test Memory

PowerShell:

$writer="http://127.0.0.1:18794"
$token=(Select-String "$env:USERPROFILE\.openclaw\overlay-writer.env" -Pattern '^OVERLAY_WRITER_TOKEN=').Line.Split('=',2)[1]

$body=@{
 memory_hash=("a"*64)
 content="first memory"
 tier="Q"
 ttl_days=7
}|ConvertTo-Json

irm -Method Post -Uri "$writer/write/memory_tiers/insert" -Headers @{Authorization="Bearer $token"} -ContentType "application/json" -Body $body

You should receive an entry_id.

11) Read the Memory
$reader="http://127.0.0.1:18795"
$token=(Select-String "$env:USERPROFILE\.openclaw\overlay-reader.env" -Pattern '^OVERLAY_READER_TOKEN=').Line.Split('=',2)[1]
$hash=("a"*64)

irm "$reader/read/memory_tiers/by_hash?memory_hash=$hash" -Headers @{Authorization="Bearer $token"}

You should see the stored content returned.

Result

The system now provides:

• persistent agent memory
• retrievable evidence records
• session-independent state storage

OpenClaw can now store and retrieve structured information across runs.
