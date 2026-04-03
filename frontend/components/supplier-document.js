
// ===============================
// FILE SELECT HANDLER
// ===============================

function handleFileSelect(input) {
  const fileNameDisplay = document.getElementById("selectedFileName");
  const fileNameText = document.getElementById("fileNameText");
  
  if (input.files && input.files[0]) {
    const fileName = input.files[0].name;
    if (fileNameText) fileNameText.textContent = fileName;
    if (fileNameDisplay) fileNameDisplay.classList.remove("hidden");
  } else {
    if (fileNameDisplay) fileNameDisplay.classList.add("hidden");
  }
}

// ===============================
// CREATE
// ===============================

async function addSupplierDocument() {

  // ตรวจสอบว่า tab ไหนกำลัง active อยู่
  const basicTab = document.getElementById("pills-basic");
  const documentTab = document.getElementById("pills-document");
  const isBasicTabActive = basicTab?.classList.contains("active");
  const isDocumentTabActive = documentTab?.classList.contains("active");

  // เลือก file input ตาม tab ที่ active
  let fileInput, descInput;
  if (isBasicTabActive) {
    fileInput = document.getElementById("supplierDocFile_basic");
    descInput = document.getElementById("supplierDocDesc_basic");
  } else if (isDocumentTabActive) {
    fileInput = document.getElementById("supplierDocFile");
    descInput = document.getElementById("supplierDocDesc");
  } else {
    // fallback: ลองหาทั้ง 2 แบบ
    fileInput = document.getElementById("supplierDocFile_basic") || document.getElementById("supplierDocFile");
    descInput = document.getElementById("supplierDocDesc_basic") || document.getElementById("supplierDocDesc");
  }

  console.log("FILE INPUT:", fileInput);
  console.log("FILES:", fileInput?.files);

  const file = fileInput?.files?.[0];
  const description = descInput?.value || "";

  if (!file) {
    alert("กรุณาเลือกไฟล์");
    return;
  }

  // กำหนด source ตาม tab ที่ active
  const source = isBasicTabActive ? "basic" : "document";

  const formData = new FormData();
  formData.append("file", file);
  formData.append("description", description);
  formData.append("source", source);

  try {
    const res = await fetch(
      `${API_BASE}/api/suppliers/${window.supplierNo}/documents`,
      {
        method: "POST",
        body: formData
      }
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      alert("Upload ไม่สำเร็จ: " + (errorData.message || "Unknown error"));
      return;
    }

    alert("Upload สำเร็จ");

    // reset
    fileInput.value = "";
    descInput.value = "";

    loadSupplierDocuments(window.supplierNo, source);
  } catch (err) {
    console.error("Upload error:", err);
    alert("Upload ไม่สำเร็จ: " + err.message);
  }
  
}


async function loadSupplierDocuments(supplierNo, source = null) {
  try {
    const res = await fetch(
      `${API_BASE}/api/suppliers/${supplierNo}/documents`
    );

    if (!res.ok) {
      console.error("Failed to load documents:", res.status);
      return;
    }

    const docs = await res.json();
    console.log("🔥 DOCS FROM API:", docs);
    renderSupplierDocuments(docs, source);
  } catch (err) {
    console.error("Load documents error:", err);
  }
}

function renderSupplierDocuments(docs, source = null) {

  // กรองเอกสารตาม source ถ้าระบุ
  let filteredDocs = docs;
  if (source) {
    filteredDocs = docs.filter(doc => {
      // ถ้า doc.source เป็น undefined ให้ถือว่าเป็น "basic" (เอกสารเก่า)
      const docSource = doc.source || "basic";
      return docSource === source;
    });
  }

  // รองรับทั้ง 2 container: basic และ document tab
  // แต่ต้อง render ตาม source ที่ระบุเท่านั้น
  let containers = [];
  if (source === "basic") {
    // แสดงเฉพาะใน basic tab
    const basicContainer = document.getElementById("supplierDocumentContainer");
    if (basicContainer) containers.push(basicContainer);
  } else if (source === "document") {
    // แสดงเฉพาะใน document tab
    const documentContainer = document.getElementById("supplierDocumentList");
    if (documentContainer) containers.push(documentContainer);
  } else {
    // ถ้าไม่ระบุ source ให้แสดงทั้ง 2 container
    containers = [
      document.getElementById("supplierDocumentContainer"),
      document.getElementById("supplierDocumentList")
    ].filter(Boolean);
  }

  if (!containers.length) {
    console.warn("No document container found for source:", source);
    return;
  }

  const htmlContent = filteredDocs.length
    ? filteredDocs.map(doc => `
      <div class="border rounded p-3 mb-2 flex justify-between items-center">

        <div>
          <div><b>${doc.description || "-"}</b></div>
          <div class="text-sm text-gray-500">${doc.file_name}</div>
        </div>

        <div class="flex gap-2">
          <a href="${API_BASE}/${doc.file_path.startsWith('/') ? doc.file_path.substring(1) : doc.file_path}" 
             target="_blank"
             class="btn btn-sm btn-outline-primary">
             ดู
          </a>
          <button 
            onclick="deleteSupplierDocument(${doc.id}, '${source}')"
            class="btn btn-sm btn-outline-danger">
            ลบ
          </button>
        </div>

      </div>
    `).join("")
    : "<div>ยังไม่มีเอกสาร</div>";

  // อัปเดตทุก container
  containers.forEach(container => {
    container.innerHTML = htmlContent;
  });

  // อัปเดตจำนวนเอกสารถ้ามี element
  const countEl = document.getElementById("documentCount");
  if (countEl) {
    countEl.textContent = `${filteredDocs.length} ไฟล์`;
  }
}


async function deleteSupplierDocument(id, source = null) {
  if (!confirm("ลบเอกสารออกจากหน้าหรือไม่?")) return;

  try {
    const res = await fetch(
      `${API_BASE}/api/suppliers/documents/${id}/delete`,
      { method: "PATCH" }
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      alert("ลบไม่สำเร็จ: " + (errorData.message || "Unknown error"));
      return;
    }

    alert("ลบสำเร็จ");
    loadSupplierDocuments(window.supplierNo, source);
  } catch (err) {
    console.error("Delete error:", err);
    alert("ลบไม่สำเร็จ: " + err.message);
  }
}