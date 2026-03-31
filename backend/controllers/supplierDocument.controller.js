import { getPool, sql } from "../config/db.js";

/* =====================================================
   UPLOAD SUPPLIER DOCUMENT
===================================================== */
export async function uploadSupplierDocument(req, res) {
  try {
    const pool = await getPool();

    const { supplierNo } = req.params;
    const { description } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // 🔥 สร้าง path ให้เปิดผ่าน browser ได้
    const publicPath = `/uploads/supplier_docs/${file.filename}`;


    await pool.request()
      .input("supplier_no", sql.NVarChar(20), supplierNo)
      .input("file_name", sql.NVarChar(255), file.originalname)
      .input("file_path", sql.NVarChar(500), publicPath)
      .input("file_type", sql.NVarChar(100), file.mimetype)
      .input("file_size", sql.Int, file.size)
      .input("description", sql.NVarChar(255), description || null)
      .query(`
        INSERT INTO supplier_documents
        (
          supplier_no,
          file_name,
          file_path,
          file_type,
          file_size,
          description,
          uploaded_at,
          is_active
        )
        VALUES
        (
          @supplier_no,
          @file_name,
          @file_path,
          @file_type,
          @file_size,
          @description,
          GETDATE(),
          1
        )
      `);

    res.json({ success: true });

  } catch (err) {
    console.error("uploadSupplierDocument error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
}


/* =====================================================
   GET ACTIVE SUPPLIER DOCUMENTS
===================================================== */
export async function getSupplierDocuments(req, res) {
  try {
    const { supplierNo } = req.params;
    const pool = await getPool();

    const result = await pool.request()
  .input("supplierNo", sql.NVarChar(20), supplierNo)
  .query(`
    SELECT 
      id,
      supplier_no,
      file_name,
      file_path,
      description,
      uploaded_at

    FROM dbo.supplier_documents

    WHERE supplier_no = @supplierNo
      AND ISNULL(is_active,1) = 1

    ORDER BY uploaded_at DESC
  `);
    res.json(result.recordset);

  } catch (err) {
    console.error("❌ getSupplierDocuments error:", err);
    res.status(500).json({ error: "server error" });
  }
}


/* =====================================================
   SOFT DELETE SUPPLIER DOCUMENT
===================================================== */
export async function softDeleteSupplierDocument(req, res) {
  try {
    const pool = await getPool();
    const { id } = req.params;

    await pool.request()
      .input("id", sql.Int, id)
      .query(`
        UPDATE supplier_documents
        SET
          is_active = 0,
          deleted_at = GETDATE()
        WHERE id = @id
      `);

res.json({
  success: true,
  file: {
    file_name: file.originalname,
    file_path: publicPath,
    description
  }
});

if (!supplierNo) {
  return res.status(400).json({ error: "supplierNo required" });
}

  } catch (err) {
    console.error("softDeleteSupplierDocument error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
}
