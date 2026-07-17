# Plan B v1.1 Deploy Guide

> **架構**：`ui.madxauusd.cloud-ip.cc` 唯一對外入口，Dashboard 完全內網。

---

## 🔧 環境變量

### Backend (api_server)

| 變量 | 必填？ | 用途 |
|------|--------|------|
| `JWT_SECRET` | **Production 必填** | JWT signing key（固定，重啟不變） |
| `HERMES_ENV` | dev 可省略 | 設 `production` 強制 JWT_SECRET + CORS 校驗 |
| `ALLOWED_ORIGINS` | **Production 必填** | CORS 許可的 origins（comma-separated，無 wildcard） |
| `HERMES_STATE_DB` | 可選 | state.db 路徑（預設 `~/.hermes/state.db`） |
| `HERMES_HOME` | 可選 | hermes home 目錄 |

**Example (production):**
```bash
export HERMES_ENV=production
export JWT_SECRET=your-fixed-secret-at-least-32-chars
export ALLOWED_ORIGINS=http://localhost:5173,http://192.168.31.233:5173
```

### Frontend (Vite build)

| 變量 | 用途 |
|------|------|
| `VITE_API_BASE_URL` | 構建時寫入 JS bundle 的 API URL（預設 `http://localhost:8080`） |
| `VITE_SERVER_IP` | DashboardEmbed 顯示的 server IP（預設 `192.168.31.233`） |

**Production build：**
```bash
VITE_API_BASE_URL=http://192.168.31.233:8080/ npm run build
```

---

## 🚀 部署步驟（Production）

### 前置條件
1. **停止 Caddy**（不再需要）
2. **Router port forwarding**：只保留 `80 → 192.168.31.233:5173`
3. **確認 dashboard 8501 不在 port forwarding 中**

### Step 1 — Build Web UI

```bash
cd C:\Users\madwa\projects\hermes-web-ui

# Set API URL for production LAN access
set VITE_API_BASE_URL=http://192.168.31.233:8080/
npm run build
```

輸出：`dist/` 目錄（含所有靜態 JS/CSS/HTML）

### Step 2 — 啟動 Backend API

```bash
cd C:\Users\madwa\projects\hermes-web-ui\api_server

set HERMES_ENV=production
set JWT_SECRET=***YOUR_FIXED_SECRET_AT_LEAST_32_CHARS***
set ALLOWED_ORIGINS=http://localhost:5173,http://192.168.31.233:5173

python -m uvicorn main:app --port 8080 --host 0.0.0.0
```

**驗證：**
```bash
curl -s http://localhost:8080/health
curl -s -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"admin123\"}"
```

### Step 3 — 啟動 Dashboard（LAN-only）

```bash
cd C:\Users\madwa\projects\daily-xauusd-bot

python -m streamlit run src/daily_xauusd_brief/dashboard.py \
  --server.port 8501 \
  --server.address 0.0.0.0 \
  --server.headless true \
  --server.enableCORS true \
  --server.enableXsrfProtection false
```

**⚠️ 注意：此端口不進行 port forwarding**

### Step 4 — 啟動 Web UI (Production Static)

```bash
cd C:\Users\madwa\projects\hermes-web-ui

npx serve dist -l 5173 --single
```

**驗證：**
- 本機：`http://localhost:5173` → 見到登入頁
- 同一 WiFi：`http://192.168.31.233:5173` → 見到登入頁
- 外部：用 `http://112.120.148.207/` → 見到登入頁（需 router port forwarding）

### Step 5 — 確認 Dashboard 不可達

外部用戶嘗試 `http://112.120.148.207:8501` → 應 connection refused/timeout。

---

## 🔄 Rollback 步驟

### 快速回滾（dev 模式）

```batch
hermes-start.bat dev
```

### 停止 production services

```batch
hermes-start.bat stop
```

### 恢復 Caddy（可選）

如果需要暫時恢復 HTTPS reverse proxy：
```batch
C:\Caddy\caddy.exe run --config C:\Users\madwa\Caddy\Caddyfile
```

### 回到舊版 Web UI

1. `cd C:\Users\madwa\projects\hermes-web-ui`
2. `git log --oneline` 找舊 commit hash
3. `git checkout <old-hash>`
4. `npm install`
5. `hermes-start.bat dev`

---

## 🌐 Router Port Forwarding 設定

| 外部端口 | 目標 IP | 目標端口 | 用途 |
|---------|---------|---------|------|
| 80 | 192.168.31.233 | 5173 | **Web UI 唯一入口** |
| 443 | — | **移除或停用** | — |
| 8501 | — | **移除或停用** | Dashboard LAN-only |

**確認事項：**
- Dashboard (8501) **不要** forwarding
- 只 forwarding 80（HTTP）到 Web UI
- HTTPS (443) 可選（如需 HTTPS 先修復 Caddy）

---

## 🔐 Dashboard 最終可達範圍

| 訪問方式 | 可達？ | 原因 |
|---------|--------|------|
| `http://localhost:8501` (server 本機) | ✅ | localhost |
| `http://192.168.31.233:8501` (同 LAN) | ✅ | 內網 |
| `http://112.120.148.207:8501` (外網) | ❌ | 未 port-forwarded |
| `http://<vpn-ip>:8501` (VPN) | ✅ | 如果 VPN 橋接 LAN |

---

## 🧪 Smoke Test

### 前置
```batch
hermes-start.bat prod
# 或
hermes-start.sh prod
```

### 1. Login / Logout
```
POST /auth/login
Body: {"username":"admin","password":"admin123"}
→ 200 {"access_token":"***","refresh_token":"***","token_type":"bearer","expires_in":3600}

GET /auth/me
Header: Authorization: Bearer ***
→ 200 {"id":"...","username":"admin","email":"..."}

POST /auth/logout
Header: Authorization: Bearer ***
→ 200 {"message":"Logged out successfully"}
```

### 2. Session List
```
GET /api/sessions?limit=5
→ 200 [...sessions]
```

### 3. Chat (Message Send)
```
POST /api/sessions/:id/messages
Header: Authorization: Bearer ***
Body: {"role":"user","content":"test"}
→ 200 {id, created_at, ...}
```

### 4. Dashboard Route
```
GET /dashboard → 重定向到 /login（未認證）
GET /dashboard → 200 Dashboard UI（已登入）
```

### 5. Prod Build Serving
```
# 確認 dist/ 存在
dir C:\Users\madwa\projects\hermes-web-ui\dist\

# 確認靜態檔可達
curl -s http://localhost:5173/ | grep "<!DOCTYPE html>"
→ 200 <!DOCTYPE html>
```

### 6. CORS（預生產）
```
# 使用瀏覽器 console 測試
fetch('http://localhost:8080/api/sessions?limit=1', {
  headers: { 'Authorization': 'Bearer ...' }
}).then(r => r.json()).then(console.log)
→ 200 [...]

# 跨 origin 測試（如果有多個 origins 配置）
```

### 7. Token Persistence
```
1. Login → 獲得 access_token
2. 等待 55 分鐘（access token 60 分鐘有效）
3. 嘗試訪問受保護端點 → 401
4. POST /auth/refresh → 獲得新 access_token
```

---

## 📁 關鍵檔案

| 檔案 | 用途 |
|------|------|
| `hermes-start.bat` | Windows 啟動腳本（dev/prod/stop） |
| `hermes-start.sh` | Linux/macOS 啟動腳本 |
| `DEPLOY.md` | 本文档 |
| `dist/` | Vite production build 輸出（需創建） |
| `.env.production.example` | 生產環境變量示例 |

---

## ⚠️ 已知限制

1. **HTTPS 未修復**：外網 HTTPS 仍然失敗，目前只支持 HTTP
2. **JWT token 重啟後失效**（dev mode）：無 `JWT_SECRET` 時每次重啟新 key
3. **CORS wildcard in dev**：dev mode `ALLOWED_ORIGINS` 未設置時用 `*`
4. **Dashboard iframe 依賴 LAN**：外網用戶無法看到 Dashboard，這是安全設計