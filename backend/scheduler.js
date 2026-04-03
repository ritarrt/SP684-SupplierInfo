import { getPool, sql } from "./config/db.js";

/* =====================================
   AUTO-CLOSE EXPIRED DEALS
===================================== */
export async function autoCloseExpiredDeals() {
  try {
    const pool = await getPool();
    
    const result = await pool.request()
      .query(`
        UPDATE supplier_deal_price
        SET status = 'CANCELLED',
            updated_at = GETDATE()
        WHERE status IN ('OPEN', 'USE')
          AND end_date IS NOT NULL
          AND GETDATE() > DATEADD(DAY, 1, end_date)
      `);
    
    const affectedRows = result.rowsAffected[0];
    if (affectedRows > 0) {
      console.log(`✅ Auto-closed ${affectedRows} expired deal(s)`);
    }
    
    return affectedRows;
  } catch (err) {
    console.error("❌ Auto-close deals error:", err);
    return 0;
  }
}

/* =====================================
   START SCHEDULER
===================================== */
export function startScheduler() {
  // Run immediately on startup
  autoCloseExpiredDeals();
  
  // Run daily at midnight (00:00)
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  
  setInterval(() => {
    const now = new Date();
    // Only run at midnight (between 00:00 and 00:01)
    if (now.getHours() === 0 && now.getMinutes() < 1) {
      autoCloseExpiredDeals();
    }
  }, 60 * 1000); // Check every minute
  
  console.log("✅ Deal auto-close scheduler started (runs daily at midnight)");
}
