// ============================================================
// auth.js — SP684 Supplier Info System
// ใช้ระบบ Auth เดียวกับ SupplySense (proxy /api/me)
// ============================================================

const AUTH_API = "http://192.192.0.37:5847";
const DX_URL   = "http://192.192.0.37:53683";

export const APP_NAME = "Stock Insight and Purchasing Plan";

// ==================================================
// Role → หน้าที่อนุญาต
// ==================================================
export const ROLE_PAGES = {
  // ── จัดซื้อ — เข้าได้ทุกหน้า ──────────────────────────────
  "จัดซื้อ": ["/supplier-list.html", "/Supplier-Info.html", "/price-list.html"],

  // ── WareHouse — เข้าได้ supplier-list + Supplier-Info ──────
  "WareHouse": ["/supplier-list.html", "/Supplier-Info.html"],

  // ── PM แต่ละ category ──────────────────────────────────────
  "PM_Glass":       ["/supplier-list.html", "/Supplier-Info.html", "/price-list.html"],
  "PM_Aluminium":   ["/supplier-list.html", "/Supplier-Info.html", "/price-list.html"],
  "PM_Gypsum":      ["/supplier-list.html", "/Supplier-Info.html", "/price-list.html"],
  "PM_Sealant":     ["/supplier-list.html", "/Supplier-Info.html", "/price-list.html"],
  "PM_CLine":       ["/supplier-list.html", "/Supplier-Info.html", "/price-list.html"],
  "PM_Accessories": ["/supplier-list.html", "/Supplier-Info.html", "/price-list.html"],

  // ── Admin แต่ละ category — เข้า price-list ได้ (ดูอย่างเดียว) ──
  "Admin_Glass":       ["/price-list.html"],
  "Admin_Aluminium":   ["/price-list.html"],
  "Admin_Gypsum":      ["/price-list.html"],
  "Admin_Sealant":     ["/price-list.html"],
  "Admin_CLine":       ["/price-list.html"],
  "Admin_Accessories": ["/price-list.html"],

  // ── Super Admin ────────────────────────────────────────────
  "admin": ["/supplier-list.html", "/Supplier-Info.html", "/price-list.html"],
};

// ==================================================
// Role → Category mapping
// ==================================================
const ROLE_CATEGORIES = {
  "PM_Glass":          ["Glass"],
  "PM_Aluminium":      ["Aluminum", "Aluminium"],
  "PM_Gypsum":         ["Gypsum"],
  "PM_Sealant":        ["Sealant"],
  "PM_CLine":          ["C-Line"],
  "PM_Accessories":    ["Accessories"],
  "Admin_Glass":       ["Glass"],
  "Admin_Aluminium":   ["Aluminum", "Aluminium"],
  "Admin_Gypsum":      ["Gypsum"],
  "Admin_Sealant":     ["Sealant"],
  "Admin_CLine":       ["C-Line"],
  "Admin_Accessories": ["Accessories"],
};

// ==================================================
// Helpers
// ==================================================

/** ดึง roles ทั้งหมดของ user สำหรับ app นี้ */
export function getUserRoles(user) {
  const roles = user?.roles ?? [];
  console.log("🔍 getUserRoles - all roles:", roles);
  console.log("🔍 getUserRoles - APP_NAME:", APP_NAME);
  const filtered = roles
    .filter(r => {
      console.log("  - Checking role:", r.app, "===", APP_NAME, "?", r.app === APP_NAME);
      return r.app === APP_NAME;
    })
    .map(r => r.role);
  console.log("✅ getUserRoles - filtered:", filtered);
  return filtered;
}

/** ดึง role แรก (ใช้แสดงผล) */
export function getUserRole(user) {
  return getUserRoles(user)[0] ?? null;
}

/**
 * คืน categories ที่ user มีสิทธิ์ดู
 * คืน [] = ดูได้ทุก category (จัดซื้อ / admin / WareHouse เท่านั้น)
 */
export function getUserCategories(user) {
  const roles = getUserRoles(user);
  console.log("🔍 getUserCategories - roles:", roles);

  // ถ้ามี Admin_* หรือ PM_* ให้จำกัด category
  const hasAdminOrPM = roles.some(r => r.startsWith("Admin_") || r.startsWith("PM_"));
  if (hasAdminOrPM) {
    console.log("✅ getUserCategories - has Admin_* or PM_* → restricted");
    // ไปต่อเพื่อ map categories
  } else if (
    roles.includes("admin") ||
    roles.includes("จัดซื้อ") ||
    roles.includes("WareHouse")
  ) {
    console.log("✅ getUserCategories - unrestricted (admin/จัดซื้อ/WareHouse)");
    return [];
  }

  const cats = new Set();
  roles.forEach(role => {
    const mapped = ROLE_CATEGORIES[role];
    console.log("  - Role:", role, "→ Categories:", mapped);
    if (mapped) mapped.forEach(c => cats.add(c));
  });

  const result = cats.size > 0 ? [...cats] : [];
  console.log("✅ getUserCategories - result:", result);
  return result;
}

/** เช็คว่า user เป็น PM (PM_*) */
export function isPM(user) {
  return getUserRoles(user).some(r => r.startsWith("PM_"));
}

/** เช็คว่า user เป็น Admin_* (ดูได้อย่างเดียว ไม่นำเข้าราคา) */
export function isAdminCat(user) {
  return getUserRoles(user).some(r => r.startsWith("Admin_"));
}

/** เช็คว่า user เป็น WareHouse */
export function isWareHouse(user) {
  return getUserRoles(user).includes("WareHouse");
}

/** เช็คว่า user เป็น จัดซื้อ */
export function isJadSue(user) {
  return getUserRoles(user).includes("จัดซื้อ");
}

/** เช็คว่า user นำเข้าราคาได้ (PM เท่านั้น) */
export function canImportPrice(user) {
  if (!user) return true;
  const roles = getUserRoles(user);
  // PM_* เท่านั้นที่นำเข้าราคาได้ (Admin_* ดูได้อย่างเดียว)
  return roles.some(r => r.startsWith("PM_")) ||
         roles.includes("admin") ||
         roles.includes("จัดซื้อ");
}

// ==================================================
// Cache
// ==================================================
let cachedUser = null;

// ==================================================
// GET PROFILE
// ==================================================
export async function getProfile({ force = false } = {}) {
  if (!force && cachedUser) {
    console.log("📦 Using cached user:", cachedUser);
    return cachedUser;
  }

  // DEV BYPASS: localhost
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    const devRole     = sessionStorage.getItem("devRole");
    const devBranches = JSON.parse(sessionStorage.getItem("devBranches") || "null");
    if (!devRole && !window.location.pathname.endsWith("dev-login.html")) {
      window.location.replace("/dev-login.html");
      return null;
    }
    cachedUser = {
      username: "dev",
      empname:  "Dev User",
      branches: devBranches ?? ["90HO"],
      roles:    [{ app: APP_NAME, role: devRole ?? "จัดซื้อ" }]
    };
    return cachedUser;
  }

  try {
    // เรียก auth server โดยตรง (ไม่ proxy) เพื่อให้ cookie ถูกส่งไปถูก domain
    console.log("🔄 Fetching fresh user profile from:", AUTH_API);
    const res = await fetch(`${AUTH_API}/api/me`, { credentials: "include" });
    if (!res.ok) { cachedUser = null; return null; }
    const data = await res.json();
    cachedUser = data?.user ?? null;
    console.log("✅ Fresh user profile:", cachedUser);
    console.log("✅ User roles:", cachedUser?.roles);
    console.log("✅ Filtered roles for this app:", getUserRoles(cachedUser));
    return cachedUser;
  } catch (err) {
    console.error("getProfile error:", err);
    cachedUser = null;
    return null;
  }
}

// ==================================================
// REQUIRE AUTH
// ==================================================
export async function requireAuth() {
  const user = await getProfile({ force: true });
  if (!user) {
    const returnUrl = window.location.origin + window.location.pathname;
    window.location.replace(`${DX_URL}?returnUrl=${encodeURIComponent(returnUrl)}`);
    return null;
  }
  return user;
}

// ==================================================
// REQUIRE ROLE
// ==================================================
export async function requireRole() {
  const user = await getProfile({ force: true });
  if (!user) {
    const returnUrl = window.location.origin + window.location.pathname;
    window.location.replace(`${DX_URL}?returnUrl=${encodeURIComponent(returnUrl)}`);
    return null;
  }

  // DEV bypass
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return user;
  }

  const pathname  = window.location.pathname;
  const userRoles = getUserRoles(user);

  const hasAccess = userRoles.some(role => {
    const allowed = ROLE_PAGES[role];
    return allowed && allowed.some(p => pathname.endsWith(p));
  });

  if (hasAccess) return user;

  showAccessDenied(user, userRoles.join(", "));
  return null;
}

// ==================================================
// LOGOUT
// ==================================================
export async function logout() {
  try {
    await fetch(`${AUTH_API}/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
  } catch (err) {
    console.error("logout error:", err);
  }
  cachedUser = null;
  window.location.replace(DX_URL);
}

// ==================================================
// UI helper — แสดง overlay ถ้าไม่มีสิทธิ์
// ==================================================
function showAccessDenied(user, role) {
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                min-height:100vh;font-family:sans-serif;background:#f9fafb;">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;
                  padding:40px 48px;text-align:center;max-width:400px;">
        <div style="font-size:48px;margin-bottom:16px;">🚫</div>
        <h2 style="font-size:20px;font-weight:700;margin-bottom:8px;">ไม่มีสิทธิ์เข้าถึง</h2>
        <p style="color:#6b7280;margin-bottom:4px;">สวัสดี <strong>${user?.empname ?? user?.username ?? ""}</strong></p>
        <p style="color:#6b7280;font-size:12px;margin-bottom:4px;">(${user?.username ?? ""})</p>
        <p style="color:#6b7280;margin-bottom:24px;">Role: <strong>${role || "ไม่ระบุ"}</strong> ไม่มีสิทธิ์เข้าหน้านี้</p>
        <button onclick="window.location.replace('${DX_URL}')"
          style="background:#1c3557;color:#fff;border:none;border-radius:8px;
                 padding:10px 24px;cursor:pointer;font-size:14px;">
          กลับหน้าหลัก
        </button>
      </div>
    </div>
  `;
}
