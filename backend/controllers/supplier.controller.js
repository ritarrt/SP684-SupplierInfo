import { getPool, sql } from "../config/db.js";

/**
 * =======================
 * GET /api/suppliers?q=...
 * ใช้สำหรับหน้า Supplier List
 * =======================
 */
export async function getSuppliers(req, res) {
  try {
    const q = (req.query.q || "").trim();
    const pool = await getPool();

    const result = await pool
      .request()
      .input("q", sql.NVarChar, `%${q}%`)
      .query(`
        SELECT
          s.supplier_no AS supplierNo,
          s.name,
          COALESCE(cat.CategoryList, '-') AS category
        FROM suppliers s

        OUTER APPLY (
            SELECT TOP 1 h.PayloadJson
            FROM Supplier_ProductCoverage_History h
            WHERE h.SupplierNo = s.supplier_no
            ORDER BY h.CreatedAt DESC
        ) latest

        OUTER APPLY (
            SELECT STRING_AGG(category, ', ') AS CategoryList
            FROM (
                SELECT DISTINCT j.category
                FROM OPENJSON(ISNULL(latest.PayloadJson, '[]'))
                WITH (
                    category NVARCHAR(50) '$.category'
                ) j
            ) x
        ) cat

        WHERE s.supplier_no LIKE @q
   OR s.name LIKE @q
   OR cat.CategoryList LIKE @q

        ORDER BY s.supplier_no
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("getSuppliers error:", err);
    res.status(500).json({ message: "Failed to fetch suppliers" });
  }
}

/**
 * =======================
 * GET /api/suppliers/:supplierNo
 * ใช้สำหรับหน้า Supplier Info
 * =======================
 */
export async function getSupplierByNo(req, res) {
  try {
    const supplierNo = req.params.supplierNo;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("supplierNo", sql.VarChar, supplierNo)
      .query(`
  SELECT
    supplier_no AS supplierNo,
    name,
    location_type AS locationType,
    vat_registration_no AS vatRegistrationNo,
    registered_address AS registeredAddress,
    email,
    mobile_phone AS mobilePhone,
    currency_code AS currencyCode,
    payment_terms_code AS paymentTermsCode,
    purchaser_code AS purchaserCode,
    country_code AS countryCode,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM suppliers
  WHERE supplier_no = @supplierNo
`);;

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("getSupplierByNo error:", err);
    res.status(500).json({ message: "Failed to fetch supplier" });
  }
}

/**
 * =======================
 * PUT /api/suppliers/:supplierNo
 * Update Supplier
 * =======================
 */
export async function updateSupplierByNo(req, res) {
  try {
    const supplierNo = req.params.supplierNo;

    const {
      name,
      locationType,
      vatRegistrationNo,
      registeredAddress,
      email,
      mobilePhone,
      currencyCode,
      paymentTermsCode,
      purchaserCode,
      countryCode
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }

    const pool = await getPool();

    const result = await pool
      .request()
      .input("supplierNo", sql.VarChar, supplierNo)
      .input("name", sql.NVarChar, name)
      .input("locationType", sql.NVarChar, locationType || null)
      .input("vatRegistrationNo", sql.NVarChar, vatRegistrationNo || null)
      .input("registeredAddress", sql.NVarChar, registeredAddress || null)
      .input("email", sql.NVarChar, email || null)
      .input("mobilePhone", sql.NVarChar, mobilePhone || null)
      .input("currencyCode", sql.NVarChar, currencyCode || null)
      .input("paymentTermsCode", sql.NVarChar, paymentTermsCode || null)
      .input("purchaserCode", sql.NVarChar, purchaserCode || null)
      .input("countryCode", sql.NVarChar, countryCode || null)
      .query(`
        UPDATE suppliers
        SET
          name = @name,
          location_type = @locationType,
          vat_registration_no = @vatRegistrationNo,
          registered_address = @registeredAddress,
          email = @email,
          mobile_phone = @mobilePhone,
          currency_code = @currencyCode,
          payment_terms_code = @paymentTermsCode,
          purchaser_code = @purchaserCode,
          country_code = @countryCode,
          updated_at = GETDATE()
        WHERE supplier_no = @supplierNo;

        SELECT @@ROWCOUNT AS affected;
      `);

    if (result.recordset[0].affected === 0) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    res.json({ success: true });

  } catch (err) {
    console.error("updateSupplierByNo error:", err);
    res.status(500).json({ message: "Failed to update supplier" });
  }
}