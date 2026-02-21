README.md
# Open Bottlenose Framework

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