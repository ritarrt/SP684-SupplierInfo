// db.js
import sql from "mssql";
import dotenv from "dotenv";
dotenv.config();

// ============================
//  DB A: Main Database
// ============================
const mainConfig = {
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT || 1433),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === "true",
    trustServerCertificate:
      process.env.DB_TRUST_SERVER_CERTIFICATE === "true",
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  requestTimeout: 0,
};

// ============================
//  DB B: External Database
// ============================
const externalConfig = {
  server: process.env.EXTERNAL_DB_SERVER,
  port: Number(process.env.EXTERNAL_DB_PORT || 1433),
  database: process.env.EXTERNAL_DB_DATABASE,
  user: process.env.EXTERNAL_DB_USER,
  password: process.env.EXTERNAL_DB_PASSWORD,
  options: {
    encrypt: process.env.EXTERNAL_DB_ENCRYPT === "true",
    trustServerCertificate:
      process.env.EXTERNAL_DB_TRUST_SERVER_CERTIFICATE === "true",
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
};

// ============================
//  Connection Pool Promises
// ============================
let mainPoolPromise = null;
let externalPoolPromise = null;

// ============================
//  Main DB Pool
// ============================
export function getPool() {
  if (!mainPoolPromise) {
    mainPoolPromise = new sql.ConnectionPool(mainConfig)
      .connect()
      .then((pool) => {
        console.log("✅ Main DB connected");
        return pool;
      })
      .catch((err) => {
        mainPoolPromise = null; // allow retry
        console.error("❌ Main DB connection failed:", err);
        throw err;
      });
  }
  return mainPoolPromise;
}

// ============================
//  External DB Pool
// ============================
export function getExternalPool() {
  if (!externalPoolPromise) {
    externalPoolPromise = new sql.ConnectionPool(externalConfig)
      .connect()
      .then((pool) => {
        console.log("✅ External DB connected");
        return pool;
      })
      .catch((err) => {
        externalPoolPromise = null;
        console.error("❌ External DB connection failed:", err);
        throw err;
      });
  }
  return externalPoolPromise;
}

// ============================
//  Re-export sql
// ============================
export { sql };
