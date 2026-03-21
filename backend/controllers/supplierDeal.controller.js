import { getPool, sql } from "../config/db.js";

/* =====================================
   GET DEAL LIST
===================================== */
export const getSupplierDeals = async (req, res) => {
  try {
    const { supplierNo } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input("supplier_no", sql.NVarChar, supplierNo)
      .query(`
        SELECT 
          deal_id,
          supplier_no,
          status,
          deal_name,
          contact_person,
          region,
          branch,
          category,
          brand,
          product_group,
          sub_group,
          color,
          thickness,
          mold,
          sku,
          deal_type,
          price_value,
          price_unit,
          FORMAT(start_date, 'dd/MM/yyyy') AS start_date,
          FORMAT(end_date, 'dd/MM/yyyy') AS end_date,
          note,
          FORMAT(created_at, 'dd/MM/yyyy HH:mm:ss') AS created_at,
          FORMAT(ISNULL(updated_at, created_at), 'dd/MM/yyyy HH:mm:ss') AS updated_at
        FROM supplier_deal_price
        WHERE supplier_no = @supplier_no
        ORDER BY created_at DESC
      `);

    res.json(result.recordset);

  } catch (err) {
    console.error("❌ GET DEAL ERROR:", err);
    res.status(500).send(err.message);
  }
};


/* =====================================
   SAVE DEAL
===================================== */
export const saveSupplierDeal = async (req, res) => {
  try {
    const { supplierNo } = req.params;
    const pool = await getPool();

    const {
      deal_name,
      contact_person,
      region,
      branch,
      category,
      brand,
      product_group,
      sub_group,
      color,
      thickness,
      mold,
      sku,
      deal_type,
      price_value,
      price_unit,
      start_date,
      end_date,
      note
    } = req.body;

    if (!deal_name) {
      return res.status(400).send("deal_name is required");
    }

    await pool.request()
      .input("supplier_no", sql.NVarChar, supplierNo)
      .input("status", sql.NVarChar, "OPEN")
      .input("deal_name", sql.NVarChar, deal_name)
      .input("contact_person", sql.NVarChar, contact_person || null)
      .input("region", sql.NVarChar, region || null)
      .input("branch", sql.NVarChar, branch || null)
      .input("category", sql.NVarChar, category || null)
      .input("brand", sql.NVarChar, brand || null)
      .input("product_group", sql.NVarChar, product_group || null)
      .input("sub_group", sql.NVarChar, sub_group || null)
      .input("color", sql.NVarChar, color || null)
      .input("thickness", sql.NVarChar, thickness || null)
      .input("mold", sql.NVarChar, mold || null)
      .input("sku", sql.NVarChar, sku || null)
      .input("deal_type", sql.NVarChar, deal_type || null)
      .input("price_value", sql.Decimal(18,2), price_value || 0)
      .input("price_unit", sql.NVarChar, price_unit || null)
      .input("start_date", sql.Date, start_date || null)
      .input("end_date", sql.Date, end_date || null)
      .input("note", sql.NVarChar, note || null)
      .query(`
        INSERT INTO supplier_deal_price (
          supplier_no,
          status,
          deal_name,
          contact_person,
          region,
          branch,
          category,
          brand,
          product_group,
          sub_group,
          color,
          thickness,
          mold,
          sku,
          deal_type,
          price_value,
          price_unit,
          start_date,
          end_date,
          note,
          created_at
        )
        VALUES (
          @supplier_no,
          @status,
          @deal_name,
          @contact_person,
          @region,
          @branch,
          @category,
          @brand,
          @product_group,
          @sub_group,
          @color,
          @thickness,
          @mold,
          @sku,
          @deal_type,
          @price_value,
          @price_unit,
          @start_date,
          @end_date,
          @note,
          GETDATE()
        )
      `);

    res.json({ success: true });

  } catch (err) {
    console.error("❌ SAVE DEAL ERROR:", err);
    res.status(500).send(err.message);
  }
};


/* =====================================
   TOGGLE STATUS
===================================== */
export const toggleSupplierDealStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    await pool.request()
      .input("deal_id", sql.Int, id)
      .query(`
        UPDATE supplier_deal_price
        SET
          status = CASE 
                     WHEN status = 'OPEN' THEN 'CANCELLED'
                     ELSE 'OPEN'
                   END,
          updated_at = GETDATE()
        WHERE deal_id = @deal_id
      `);

    res.json({ success: true });

  } catch (err) {
    console.error("❌ TOGGLE DEAL ERROR:", err);
    res.status(500).send(err.message);
  }
};
