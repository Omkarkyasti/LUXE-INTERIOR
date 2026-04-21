A backend system for a luxury interior design website, supporting contact form submissions, admin dashboard, and enquiry management.
# Luxe Interior — Backend

Node.js + Express + SQLite backend for the Luxe Interior Studio website.

---

## 📁 Project Structure

```
luxe-backend/
├── server.js          ← Main Express server
├── package.json
├── luxe.db            ← SQLite database (auto-created on first run)
└── public/
    └── admin/
        └── index.html ← Admin dashboard UI
```

---

## 🚀 Setup & Run

### 1. Install dependencies
```bash
npm install
```

### 2. Start the server
```bash
# Production
npm start

# Development (auto-restart on changes)
npm run dev
```

Server runs at: **http://localhost:3000**

---

## 🔐 Admin Dashboard

Visit: **http://localhost:3000/admin**

Default password: `luxe@admin2026`

> ⚠️ Change the password before going live!
> Set via environment variable: `ADMIN_PASSWORD=yourpassword node server.js`

---

## 📡 API Endpoints

### Public
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/contact` | Submit contact form |

**Contact form body:**
```json
{ "name": "...", "email": "...", "message": "..." }
```

### Admin (requires `x-admin-token` header)
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/admin/login` | Login → returns token |
| POST | `/api/admin/logout` | Logout |
| GET | `/api/admin/enquiries` | List enquiries (filter, search, paginate) |
| PATCH | `/api/admin/enquiries/:id/status` | Update status |
| DELETE | `/api/admin/enquiries/:id` | Delete enquiry |
| GET | `/api/admin/stats` | Dashboard stats + 7-day trend |

---

## 🌐 Connect Your Frontend

In your `contact.html`, replace the Formspree action with:

```javascript
const res = await fetch('http://localhost:3000/api/contact', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name, email, message })
});
const data = await res.json();
if (data.success) { /* show success */ }
```

---

## 🚢 Deployment Options

| Platform | Steps |
|----------|-------|
| **Railway** | Connect GitHub repo → Deploy |
| **Render** | New Web Service → Free tier available |
| **VPS** | `npm install` → use PM2 to keep it running |

SQLite works great for small-to-medium sites. For high traffic, swap to PostgreSQL.
