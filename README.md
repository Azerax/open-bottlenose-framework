# OpenClaw

OpenClaw is a local multi-agent orchestration workspace.

## Safety model (important)
Agents do not connect to the database directly.
All reads go through overlay-reader (http://127.0.0.1:18795).
All writes go through overlay-writer (http://127.0.0.1:18794).

## Quick start (Windows)
1) Bootstrap config templates:
   powershell -ExecutionPolicy Bypass -File .\setup.ps1

2) Edit:
   %USERPROFILE%\.openclaw\overlay-reader.env
   %USERPROFILE%\.openclaw\overlay-writer.env

3) Install service deps:
   cd services\overlay-reader; npm install
   cd ..\overlay-writer; npm install

4) Start services:
   node services\overlay-reader\server.js
   node services\overlay-writer\server.js

5) Health checks:
   irm http://127.0.0.1:18795/health
   irm http://127.0.0.1:18794/health