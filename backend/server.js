import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import supplierRoutes from "./routes/supplier.routes.js";
import targetRoutes from "./routes/target.routes.js";
import masterRoutes from "./routes/master.routes.js";
import excelRoutes from "./routes/excel.routes.js";
import { startScheduler } from "./scheduler.js";

dotenv.config();

const app = express();

const SUPPLYSENSE_AUTH = process.env.AUTH_SERVER || "http://localhost:3004";

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ── /api/me — proxy to auth server ───────────────────────────────────────────
app.get("/api/me", async (req, res) => {
  try {
    const r = await fetch(`${SUPPLYSENSE_AUTH}/api/me`, {
      headers: {
        cookie: req.headers.cookie || "",
        "x-forwarded-for": req.ip,
      },
      credentials: "include",
    });
    if (!r.ok) {
      return res.status(r.status).json({ user: null });
    }
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("[/api/me proxy] error:", err.message);
    res.status(500).json({ user: null, error: err.message });
  }
});

// ── /auth/logout — proxy logout ───────────────────────────────────────────────
app.post("/auth/logout", async (req, res) => {
  try {
    await fetch(`${SUPPLYSENSE_AUTH}/auth/logout`, {
      method: "POST",
      headers: { cookie: req.headers.cookie || "" },
      credentials: "include",
    });
  } catch {}
  res.json({ ok: true });
});

app.use("/api/master", masterRoutes);
app.use("/api/excel", excelRoutes);

// จำลอง __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// serve uploads
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));
app.use("/uploads/supplier_docs", express.static(path.join(process.cwd(), "uploads/supplier_docs")));

// ✅ API FIRST
app.use("/api/suppliers", supplierRoutes);
app.use("/api/targets", targetRoutes);

// ✅ THEN static
app.use(express.static(path.join(__dirname, "../frontend")));

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  Supplier API running on port ${PORT}`);
  console.log(`----------------------------------------`);
  console.log(`  [Dev Login]     http://localhost:${PORT}/dev-login.html`);
  console.log(`  [Supplier List] http://localhost:${PORT}/supplier-list.html`);
  console.log(`  [Supplier Info] http://localhost:${PORT}/Supplier-Info.html`);
  console.log(`  [Price Import]  http://localhost:${PORT}/price-list.html`);
  console.log(`========================================\n`);

  // Start the scheduler for auto-closing expired deals
  startScheduler();
});
