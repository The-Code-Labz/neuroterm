# NeuroTerm

> Self-hosted web SSH & tmux session manager. **Sessions never die.**

![NeuroTerm](https://img.shields.io/badge/NeuroTerm-v1.0.0-00d4ff?style=flat-square&logo=terminal)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

---

## What is it?

NeuroTerm is a self-hosted web terminal manager that gives you **persistent tmux sessions** accessible from any browser — phone, tablet, laptop, anywhere.

The key idea: instead of SSH-ing to a remote machine and praying your connection holds, the backend container **runs tmux internally**. Your sessions live in the container. When your browser tab closes or your network drops, **tmux keeps running**. Reconnect from anywhere and pick up exactly where you left off.

---

## How it works

```
Browser (xterm.js)
    ↓ WebSocket (auto-reconnects every 2s)
Node.js backend
    ↓
tmux server running INSIDE the container
    ↓
/workspace → mounted from your host machine
```

WebSocket drops? tmux doesn't care. It keeps running.  
Browser closes? tmux doesn't care. It keeps running.  
You open your phone? Re-attach instantly.

---

## Features

- **Persistent tmux sessions** — survive WebSocket disconnects, browser closes, network blips
- **Local tmux mode** — backend container runs tmux internally (no SSH needed)
- **SSH mode** — SSH into external machines and attach tmux there too
- **Multiple sessions as tabs** — open as many terminals as you want simultaneously
- **Auto-reconnect** — WebSocket retries every 2 seconds if dropped
- **Connection manager** — save SSH connections with encrypted credentials (AES-256-GCM)
- **Dark terminal UI** — VS Code-inspired theme with JetBrains Mono
- **Fully Dockerized** — one `docker compose up` and you're running

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/The-Code-Labz/neuroterm.git
cd neuroterm

# 2. Configure
cp .env.example .env
# Edit .env — set NEUROTERM_AUTH_TOKEN and CREDENTIAL_ENCRYPTION_KEY
# Generate both with: openssl rand -hex 32

# 3. Run
docker compose up -d --build

# 4. Open browser
# http://localhost:3000
```

---

## Configuration

| Variable | Required | Description |
|---|---|---|
| `NEUROTERM_AUTH_TOKEN` | ✅ | Bearer token for API + WebSocket auth |
| `CREDENTIAL_ENCRYPTION_KEY` | ✅ | AES-256 key for stored SSH credentials (min 32 chars) |
| `NEUROTERM_PORT` | ❌ | Web UI port (default: `3000`) |
| `DEFAULT_TMUX_SESSION` | ❌ | tmux session created on startup (default: `neuroterm`) |
| `HOST_WORKSPACE` | ❌ | Host path mounted as `/workspace` in container |

Generate secure values:
```bash
openssl rand -hex 32
```

---

## Project Structure

```
neuroterm/
├── backend/                  # Node.js + TypeScript backend
│   ├── src/
│   │   ├── index.ts          # Express + WebSocket server
│   │   ├── api/              # REST endpoints
│   │   ├── ws/               # WebSocket terminal handler
│   │   ├── services/         # tmux, crypto services
│   │   ├── middleware/       # Auth middleware
│   │   └── db/               # SQLite schema + connection
│   └── Dockerfile
├── frontend/                 # React + xterm.js frontend
│   ├── src/
│   │   ├── components/       # Terminal panes, tabs, connection forms
│   │   ├── hooks/            # WebSocket + session hooks
│   │   ├── pages/            # Connections + Terminal pages
│   │   └── store/            # Zustand session store
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Usage

### Local tmux session (default)

1. Open `http://localhost:3000`
2. The default **"Local tmux (container)"** connection is already there
3. Click **Connect**
4. Terminal opens — you're in a tmux session inside the container
5. Close the tab, come back, click Connect again — **everything still there**

### SSH to external machine

1. Click **New Connection**
2. Select **SSH mode**
3. Enter host, user, credentials
4. Click **Connect**
5. NeuroTerm SSHes in and runs `tmux new-session -A -s [name]` automatically

---

## Development

```bash
# Backend
cd backend
npm install
npm run dev   # tsx watch on port 3001

# Frontend  
cd frontend
npm install
npm run dev   # Vite dev server on port 5173 (proxies to 3001)
```

---

## Security Notes

- Set a strong `NEUROTERM_AUTH_TOKEN` — it protects both the API and WebSocket connections
- Set a strong `CREDENTIAL_ENCRYPTION_KEY` — SSH passwords/keys are AES-256-GCM encrypted at rest
- Don't expose port 3000 publicly without a reverse proxy + HTTPS
- Recommended: put behind Caddy/Nginx with HTTPS, or use Tailscale for private access only

---

## Built with

- [xterm.js](https://xtermjs.org/) — terminal rendering
- [node-pty](https://github.com/microsoft/node-pty) — local PTY for tmux
- [ssh2](https://github.com/mscdex/ssh2) — SSH client
- [React](https://react.dev/) — frontend framework
- [Zustand](https://zustand-demo.pmnd.rs/) — state management
- [TailwindCSS](https://tailwindcss.com/) — styling
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — connection storage

---

## License

MIT — built by [The-Code-Labz](https://github.com/The-Code-Labz)
