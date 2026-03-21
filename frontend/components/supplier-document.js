function saveSupplierDocument() {
  const file = document.getElementById("supplierDocFile").files[0];
  const desc = document.getElementById("supplierDocDesc").value;

  if (!file || !desc) {
    alert("กรุณาเลือกไฟล์และระบุชื่อเอกสาร");
    return;
  }

  const list = document.getElementById("supplierDocumentList");

  const li = document.createElement("li");
  li.className = "flex justify-between items-center border rounded px-3 py-1";

  li.innerHTML = `
    <span>${desc}</span>
    <span class="text-xs text-gray-500">${file.name}</span>
  `;

  list.appendChild(li);

  // reset
  document.getElementById("supplierDocFile").value = "";
  document.getElementById("supplierDocDesc").value = "";
}


async function addSupplierDocument() {

  const fileEl = document.getElementById("supplierDocFile");
  const descEl = document.getElementById("supplierDocDesc");

  const file = fileEl.files[0];
  const desc = descEl.value.trim();

  if (!file) return alert("กรุณาเลือกไฟล์");
  if (!desc) return alert("กรุณาระบุคำอธิบายเอกสาร");

  const supplierNo = getSupplierNoFromURL();

  const formData = new FormData();
  formData.append("file", file);
  formData.append("description", desc);

  const res = await fetch(
    `${window.API_BASE}/api/suppliers/${supplierNo}/documents`,
    { method: "POST", body: formData }
  );

  if (!res.ok) {
    console.error(await res.text());
    return alert("Upload ไม่สำเร็จ");
  }

  fileEl.value = "";
  descEl.value = "";

  loadSupplierDocuments(supplierNo);
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
  const countEl = document.getElementById("documentCount");

  container.innerHTML = "";
  countEl.textContent = `${docs.length} ไฟล์`;

  if (docs.length === 0) {
    container.innerHTML = `
      <div class="text-center text-gray-400 py-8">
        <i class="bi bi-folder-x text-3xl"></i>
        <div class="mt-2">ยังไม่มีเอกสาร</div>
      </div>
    `;
    return;
  }

  docs.forEach(doc => {

    container.innerHTML += `
      <div class="border rounded-lg p-4 bg-white shadow-sm hover:shadow transition">

        <div class="flex justify-between items-start">

          <div class="flex gap-3">

            <div class="text-blue-600 text-2xl">
              <i class="bi bi-file-earmark-text"></i>
            </div>

            <div>
              <div class="fw-bold text-gray-800">
                ${doc.description || "ไม่มีคำอธิบาย"}
              </div>

              <div class="text-sm text-gray-500">
                ${doc.file_name}
              </div>

              <div class="text-xs text-gray-400 mt-1">
                ${doc.file_type} • ${(doc.file_size/1024).toFixed(1)} KB
              </div>
            </div>

          </div>

          <div class="flex gap-2">

            <a href="${window.API_BASE}/${doc.file_path}"
               target="_blank"
               class="btn btn-sm btn-outline-primary">
               <i class="bi bi-eye"></i>
            </a>

            <button class="btn btn-sm btn-outline-danger"
                    onclick="deleteSupplierDocument(${doc.id})">
              <i class="bi bi-trash"></i>
            </button>

          </div>

        </div>

      </div>
    `;
  });
}


async function deleteSupplierDocument(id) {
  if (!confirm("ลบเอกสารออกจากหน้าหรือไม่?")) return;

  await fetch(`${API_BASE}/api/suppliers/documents/${id}/delete`
, {
    method: "PATCH"
  });

  const supplierNo = getSupplierNoFromURL();
  loadSupplierDocuments(supplierNo);
}
