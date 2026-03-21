import { getPool, sql } from "../config/db.js";

/**
 * ==============================
 * GET MOQ BY SUPPLIER
 * ==============================
 */
export const getSupplierMoq = async (req, res) => {
  const { supplierNo } = req.params;

  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input("supplier_no", sql.NVarChar, supplierNo)
      .query(`
        SELECT *
        FROM supplier_moq
        WHERE supplier_no = @supplier_no
        ORDER BY
          CASE
            WHEN updated_at IS NULL THEN created_at
            ELSE updated_at
          END DESC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("getSupplierMoq error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * ==============================
 * CREATE / UPDATE MOQ
 * ==============================
 */
export const saveSupplierMoq = async (req, res) => {
  const { supplierNo } = req.params;
  const data = req.body;

  try {
    const pool = await getPool();

    // ======================
    // UPDATE
    // ======================
    if (data.moq_id && Number(data.moq_id) > 0) {
      await pool
        .request()
        .input("moq_id", sql.Int, data.moq_id)
        .input("moq_name", sql.NVarChar, data.moq_name)
        .input("region", sql.NVarChar, data.region)
        .input("branch", sql.NVarChar, data.branch)
        .input("category", sql.NVarChar, data.category)
        .input("brand", sql.NVarChar, data.brand)
        .input("product_group", sql.NVarChar, data.product_group)
        .input("sub_group", sql.NVarChar, data.sub_group)
        .input("color", sql.NVarChar, data.color)
        .input("mold", sql.NVarChar, data.mold)
        .input("thickness", sql.NVarChar, data.thickness)
        .input("sku", sql.NVarChar, data.sku)
        .input("moq_type", sql.NVarChar, data.moq_type)
        .input("vehicle_type", sql.NVarChar, data.vehicle_type)
        .input("measure_type", sql.NVarChar, data.measure_type)
        .input("moq_qty", sql.Decimal(18, 2), data.moq_qty)
        .input("moq_unit", sql.NVarChar, data.moq_unit)
        .query(`
          UPDATE supplier_moq
          SET
            moq_name = @moq_name,
            region = @region,
            branch = @branch,
            category = @category,
            brand = @brand,
            product_group = @product_group,
            sub_group = @sub_group,
            color = @color,
            mold = @mold,
            thickness = @thickness,
            sku = @sku,
            moq_type = @moq_type,
            vehicle_type = @vehicle_type,
            measure_type = @measure_type,
            moq_qty = @moq_qty,
            moq_unit = @moq_unit,
            updated_at = GETDATE()
          WHERE moq_id = @moq_id
        `);
    }

    // ======================
    // INSERT
    // ======================
    else {
      await pool
        .request()
        .input("supplier_no", sql.NVarChar, supplierNo)
        .input("moq_name", sql.NVarChar, data.moq_name)
        .input("status", sql.NVarChar, "OPEN")
        .input("region", sql.NVarChar, data.region)
        .input("branch", sql.NVarChar, data.branch)
        .input("category", sql.NVarChar, data.category)
        .input("brand", sql.NVarChar, data.brand)
        .input("product_group", sql.NVarChar, data.product_group)
        .input("sub_group", sql.NVarChar, data.sub_group)
        .input("color", sql.NVarChar, data.color)
        .input("mold", sql.NVarChar, data.mold)
        .input("thickness", sql.NVarChar, data.thickness)
        .input("sku", sql.NVarChar, data.sku)
        .input("moq_type", sql.NVarChar, data.moq_type)
        .input("vehicle_type", sql.NVarChar, data.vehicle_type)
        .input("measure_type", sql.NVarChar, data.measure_type)
        .input("moq_qty", sql.Decimal(18, 2), data.moq_qty)
        .input("moq_unit", sql.NVarChar, data.moq_unit)
        .query(`
          INSERT INTO supplier_moq (
            supplier_no,
            moq_name,
            status,
            region,
            branch,
            category,
            brand,
            product_group,
            sub_group,
            color,
            mold,
            thickness,
            sku,
            moq_type,
            vehicle_type,
            measure_type,
            moq_qty,
            moq_unit,
            created_at
          ) VALUES (
            @supplier_no,
            @moq_name,
            @status,
            @region,
            @branch,
            @category,
            @brand,
            @product_group,
            @sub_group,
            @color,
            @mold,
            @thickness,
            @sku,
            @moq_type,
            @vehicle_type,
            @measure_type,
            @moq_qty,
            @moq_unit,
            GETDATE()
          )
        `);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("saveSupplierMoq error:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * ==============================
 * CANCEL MOQ
 * ==============================
 */
export const toggleSupplierMoqStatus = async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await getPool();

    // ดึง status ปัจจุบันก่อน
    const result = await pool
      .request()
      .input("moq_id", sql.Int, id)
      .query(`
        SELECT status
        FROM supplier_moq
        WHERE moq_id = @moq_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "MOQ not found" });
    }

    const currentStatus = result.recordset[0].status;

    const newStatus =
      currentStatus === "OPEN" ? "CANCELLED" : "OPEN";

    await pool
      .request()
      .input("moq_id", sql.Int, id)
      .input("status", sql.NVarChar, newStatus)
      .query(`
        UPDATE supplier_moq
        SET
          status = @status,
          updated_at = GETDATE()
        WHERE moq_id = @moq_id
      `);

    res.json({ success: true, status: newStatus });

  } catch (err) {
    console.error("toggleSupplierMoqStatus error:", err);
    res.status(500).json({ message: err.message });
  }
};

