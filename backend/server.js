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
import { getPool, sql as mssql } from "./config/db.js";

dotenv.config();

const app = express();

const SUPPLYSENSE_AUTH = process.env.AUTH_SERVER || "http://localhost:3004";

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ── /api/me — verify session with DX + lookup Employee + single role ──────────
const APP_NAME = "Stock Insight and Purchasing Plan";

app.get("/api/me", async (req, res) => {
  try {
    // 1) verify session กับ DX
    const r = await fetch("http://192.192.0.37:52683/auth/profile", {
      headers: { cookie: req.headers.cookie || "" },
    });
    const data = await r.json();
    if (!data?.user) return res.status(401).json({ user: null });

    const username = data.user.username;

    // 2) ดึง employee info จากตาราง Employee + EmployeeRole
    const pool = await getPool();
    const result = await pool
      .request()
      .input("username", mssql.NVarChar, username)
      .query(`
        SELECT e.emname, e.username, r.role
        FROM dbo.Employee e
        JOIN dbo.EmployeeRole r ON r.employee_id = e.id
        WHERE e.username = @username
      `);

    const rows = result.recordset;

    // ถ้าไม่มีใน Employee ให้ถือว่าไม่มีสิทธิ์
    if (!rows.length) return res.status(401).json({ user: null });

    const { emname } = rows[0];

    // 3) ใช้ roles จาก DX โดยตรง — filter เฉพาะ app ของเรา
    //    รับได้แค่โรลเดียว (เอาตัวแรกที่ match)
    const dxRoles = Array.isArray(data.user.roles) ? data.user.roles : [];
    const matchedRole = dxRoles.find((r) => r.app === APP_NAME);

    // ถ้า DX ไม่มีโรลสำหรับ app นี้เลย → ไม่มีสิทธิ์
    if (!matchedRole) return res.status(401).json({ user: null });

    const roles = [{ app: APP_NAME, role: matchedRole.role }];

    // branches มาจาก DX profile โดยตรง
    const branches = Array.isArray(data.user.branches) ? data.user.branches : [];

    res.json({
      user: {
        ...data.user,
        empname: emname,
        username,
        roles,
        branches,
      },
    });
  } catch (err) {
    console.error("[/api/me] error:", err.message);
    res.status(500).json({ error: err.message });
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
