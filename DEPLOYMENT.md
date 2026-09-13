# House - Deployment Guide

## Quick Start (Windows / Dell PC)

### 1. Prerequisites
- Windows 10/11
- PowerShell 5.1+
- Node.js 18+ (for frontend dev)
- Tailscale (for remote access)

### 2. One-Command Setup
```powershell
# Run from house repository root
.\scripts\setup-pocketbase.ps1
```

This will:
- Download PocketBase v0.25.3
- Run all database migrations
- Create admin user (imredavid64@gmail.com)

### 3. Set Admin Password
```powershell
$env:HOUSEBASE_ADMIN_PASSWORD = "your-secure-password"
```

### 4. Start the Server
```powershell
# Development (with Vite hot reload)
.\scripts\start.ps1 -DevFrontend

# Production (serves built frontend)
cd frontend && npm run build
.\scripts\start.ps1
```

### 5. Access
- **Local**: http://localhost:8090/_/ (admin), http://localhost:5173 (frontend dev)
- **Tailscale**: http://YOUR_TAILSCALE_IP:8090/_/

---

## Tailscale Setup (Recommended for Friend Access)

1. **On Dell PC (host)**:
   ```powershell
   # Install Tailscale
   winget install Tailscale.Tailscale
   
   # Start Tailscale
   tailscale up
   ```

2. **Get your Tailscale IP**:
   ```powershell
   tailscale ip -4
   # Output: 100.x.y.z
   ```

3. **Share with friends**:
   - Send them the IP: `100.x.y.z`
   - They install Tailscale and `tailscale up`
   - They access: `http://100.x.y.z:8090` (admin) or `http://100.x.y.z:5173` (frontend)

4. **Optional: MagicDNS** (easier names):
   - Enable in Tailscale admin console
   - Access via: `http://your-hostname:8090`

---

## Backup & Restore

### Daily Backup (run manually or schedule)
```powershell
.\scripts\backup.ps1
```

Creates timestamped ZIP in `backups/` folder. Keeps last 30 days by default.

### Restore from Backup
```powershell
# Interactive (shows menu)
.\scripts\restore.ps1

# Specific backup
.\scripts\restore.ps1 -BackupFile "house_backup_2026-01-15_03-00-00.zip"

# With auto-restart
.\scripts\restore.ps1 -BackupFile "..." -RestartPb
```

---

## Windows Service (Auto-start on Boot)

Using NSSM (Non-Sucking Service Manager):

```powershell
# Install NSSM
winget install nssm

# Install PocketBase as service
nssm install House-PocketBase "C:\path\to\house\pocketbase\pocketbase.exe" "serve --http=0.0.0.0:8090"
nssm set House-PocketBase AppDirectory "C:\path\to\house\pocketbase"
nssm set House-PocketBase Description "House Social Network - PocketBase Backend"
nssm set House-PocketBase Start SERVICE_AUTO_START

# Start service
net start House-PocketBase
```

---

## Docker Deployment (Future Migration to Linux Server)

When ready to move off the Dell PC:

```bash
# On Linux server
git clone https://github.com/imredavid64-glitch/house.git
cd house

# Set encryption key (generate once: openssl rand -base64 32)
export PB_ENCRYPTION_KEY="your-32-byte-base64-key"

# Start with Docker Compose
docker compose up -d

# Access at http://server-ip:8090 (PocketBase) and http://server-ip:5173 (frontend)
```

### With Custom Domain (Caddy)
1. Uncomment caddy service in docker-compose.yml
2. Create Caddyfile:
   ```
   house.yourdomain.com {
       reverse_proxy pocketbase:8090
   }
   app.house.yourdomain.com {
       reverse_proxy frontend:80
   }
   ```
3. `docker compose up -d`

---

## Admin Tasks

### Generate Invite Keys
1. Login to admin UI: `http://localhost:8090/_/`
2. Go to Storage page (💾 tab in app)
3. Enter number of keys and click "Generate"
4. Share keys with friends (format: `HOUSE-XXXX-XXXX-XXXX`)

### Manage Storage
- Monitor usage on Storage page (💾 tab)
- Create deletion proposals when approaching 10GB
- Community votes on what to clean up

### Configure Gaming Integrations
In Admin UI → Settings:
- `mc_server_host`: Your Minecraft server address (e.g., `mc.example.com:25565`)
- `roblox_watchlist`: Array of Roblox universe IDs `["123456", "789012"]`

---

## Troubleshooting

### PocketBase won't start
- Check port 8090 not in use: `netstat -ano | findstr :8090`
- Check logs: PocketBase outputs to console

### Frontend can't connect
- Verify `VITE_API_URL` in frontend/.env (empty for local dev with Vite proxy)
- Check PocketBase CORS settings in admin UI

### Tailscale not working
- Ensure both devices are on same Tailnet
- Check Windows Firewall allows port 8090
- Try `tailscale ping <other-device-ip>`

### Storage full
- Check Storage page for breakdown
- Create deletion proposal (auto-proposes at 8GB)
- Community votes to free space

---

## File Structure

```
house/
├── pocketbase/
│   ├── pb_data/           # SQLite DB + uploaded files (10GB limit)
│   ├── pb_migrations/     # Database schema migrations
│   ├── pb_hooks/          # Custom Go/JS hooks (API routes, cron, etc.)
│   └── pocketbase.exe     # PocketBase binary
├── frontend/
│   ├── src/               # React source
│   ├── dist/              # Production build
│   ├── Dockerfile         # Frontend container
│   └── nginx.conf         # Reverse proxy config
├── scripts/
│   ├── setup-pocketbase.ps1  # Initial setup
│   ├── backup.ps1            # Daily backup
│   ├── restore.ps1           # Restore from backup
│   └── start.ps1             # Start servers
├── docker-compose.yml       # Docker deployment
└── PLAN.md                  # Full specification
```

---

## Security Notes

- PocketBase admin UI only accessible via Tailscale (no public exposure)
- Invite keys are single-use, crypto-random
- 10GB storage limit prevents disk exhaustion
- All file uploads auto-compressed (WebP/gzip)
- Admin actions logged in deletion_log collection
- HTTPS via Tailscale MagicDNS or Caddy + Let's Encrypt