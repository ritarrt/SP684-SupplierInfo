
// ===============================
// CREATE
// ===============================

async function addSupplierDocument() {

  const fileInput = document.getElementById("supplierDocFile_basic");
  const descInput = document.getElementById("supplierDocDesc_basic");

  console.log("FILE INPUT:", fileInput);
  console.log("FILES:", fileInput?.files);

  const file = fileInput.files[0];
  const description = descInput.value;

  if (!file) {
    alert("กรุณาเลือกไฟล์");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("description", description);

  const res = await fetch(
    `${API_BASE}/api/suppliers/${window.supplierNo}/documents`,
    {
      method: "POST",
      body: formData
    }
  );

  if (!res.ok) {
    alert("Upload ไม่สำเร็จ");
    return;
  }

  alert("Upload สำเร็จ");

  // reset
  fileInput.value = "";
  descInput.value = "";

  loadSupplierDocuments(window.supplierNo);
  
}


async function loadSupplierDocuments(supplierNo) {
  const res = await fetch(
    `${API_BASE}/api/suppliers/${supplierNo}/documents`
  );

  const docs = await res.json();
  renderSupplierDocuments(docs);
}

function renderSupplierDocuments(docs) {

  const container = document.getElementById("supplierDocumentList");
  container.innerHTML = "";

  if (!docs.length) {
    container.innerHTML = "<div>ยังไม่มีเอกสาร</div>";
    return;
  }

  docs.forEach(doc => {

    container.innerHTML += `
      <div class="border rounded p-3 mb-2 flex justify-between items-center">

        <div>
          <div><b>${doc.description || "-"}</b></div>
          <div class="text-sm text-gray-500">${doc.file_name}</div>
        </div>

        <div class="flex gap-2">
          <a href="${API_BASE}/${doc.file_path}" 
             target="_blank"
             class="btn btn-sm btn-outline-primary">
             ดู
          </a>
        </div>

      </div>
    `;
  });
}


async function deleteSupplierDocument(id) {
  if (!confirm("ลบเอกสารออกจากหน้าหรือไม่?")) return;

  await fetch(
    `${API_BASE}/api/suppliers/documents/${id}/delete`, // ✅ มี s
    { method: "PATCH" }
  );

  loadSupplierDocuments(window.supplierNo);
}