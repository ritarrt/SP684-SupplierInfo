import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import supplierRoutes from "./routes/supplier.routes.js";
import targetRoutes from "./routes/target.routes.js";
import masterRoutes from "./routes/master.routes.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/master", masterRoutes);

// จำลอง __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// serve uploads
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ✅ API FIRST
app.use("/api/suppliers", supplierRoutes);
app.use("/api/targets", targetRoutes);

// ✅ THEN static
app.use(express.static(path.join(__dirname, "../frontend")));

const PORT = Number(process.env.PORT || 3003);
app.listen(PORT, () => {
  console.log(`Supplier API running on port ${PORT}`);
});

app.get("/api/me", async (req, res) => {
  try {
    const r = await fetch("http://192.192.0.37:52683/auth/profile", {
      headers: {
        cookie: req.headers.cookie   // 🔥 ส่ง cookie จาก DX ต่อไป
      }
    });

    const data = await r.json();

    if (!data?.user) {
      return res.status(401).json({ user: null });
    }

    res.json({ user: data.user });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});