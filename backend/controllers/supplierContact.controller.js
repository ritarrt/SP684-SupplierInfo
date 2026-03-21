import { getPool, sql } from "../config/db.js";

// ===============================
// POST /api/suppliers/:supplierNo/contacts
// ===============================
export async function createSupplierContact(req, res) {
  try {
    const supplierNo = req.params.supplierNo;
    const {
      contactType,
      name,
      position,
      region,
      province,
      brand,
      productGroup,
      startDate,
      email,
      lineId,
      phones
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    const pool = await getPool();

    await pool.request()
      .input("supplierNo", sql.VarChar, supplierNo)
      .input("contactType", sql.NVarChar, contactType || null)
      .input("name", sql.NVarChar, name)
      .input("position", sql.NVarChar, position || null)
      .input("region", sql.NVarChar, region || null)
      .input("province", sql.NVarChar, province || null)
      .input("brand", sql.NVarChar, brand || null)
      .input("productGroup", sql.NVarChar, productGroup || null)
      .input("startDate", sql.Date, startDate || null)
      .input("email", sql.NVarChar, email || null)
      .input("lineId", sql.NVarChar, lineId || null)
      .input("phones", sql.NVarChar, phones || null)
      .query(`
        INSERT INTO supplier_contacts (
          supplier_no,
          contact_type,
          name,
          position,
          region,
          province,
          brand,
          product_group,
          start_date,
          email,
          line_id,
          phones
        )
        VALUES (
          @supplierNo,
          @contactType,
          @name,
          @position,
          @region,
          @province,
          @brand,
          @productGroup,
          @startDate,
          @email,
          @lineId,
          @phones
        )
      `);

    res.json({ success: true });

  } catch (err) {
    console.error("createSupplierContact error:", err);
    res.status(500).json({ message: "Failed to save contact" });
  }
}

// ===============================
// GET /api/suppliers/:supplierNo/contacts
// ===============================
export async function getSupplierContacts(req, res) {
  try {
    const { supplierNo } = req.params;
    const pool = await getPool();

    const result = await pool.request()
      .input("supplierNo", sql.VarChar, supplierNo)
      .query(`
        SELECT
          id,
          contact_type,
          name,
          position,
          region,
          province,
          brand,
          product_group,
          start_date,
          email,
          line_id,
          phones,
          status,
          created_at
        FROM supplier_contacts
        WHERE supplier_no = @supplierNo
        ORDER BY id DESC
      `);

    res.json(result.recordset);

  } catch (err) {
    console.error("getSupplierContacts error:", err);
    res.status(500).json({ message: "load contacts failed" });
  }
}

// ===============================
// PATCH /api/suppliers/contacts/:id/cancel
// ===============================
export async function cancelSupplierContact(req, res) {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "contact id is required" });

    const pool = await getPool();

    const result = await pool.request()
      .input("id", sql.Int, Number(id))
      .query(`
        UPDATE supplier_contacts
        SET status = 'CANCELLED'
        WHERE id = @id
      `);

    if (!result.rowsAffected?.[0]) {
      return res.status(404).json({ message: "contact not found" });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("cancelSupplierContact error:", err);
    res.status(500).json({ message: "cancel contact failed" });
  }
}

