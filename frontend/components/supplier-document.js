
// ===============================
// CUSTOM MODAL HELPERS
// ===============================

function showDocToast(message, type = "success") {
  console.log("showDocToast called:", message, type);
  const existing = document.getElementById("docToast");
  if (existing) existing.remove();

  const colors = {
    success: "#22c55e",
    error:   "#ef4444",
    info:    "#3b82f6",
  };

  const icons = {
    success: "bi-check-circle-fill",
    error:   "bi-x-circle-fill",
    info:    "bi-info-circle-fill",
  };

  const bg = colors[type] || colors.success;
  const icon = icons[type] || icons.success;

  const toast = document.createElement("div");
  toast.id = "docToast";
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;align-items:center;gap:10px;padding:12px 20px;border-radius:12px;background:${bg};color:#fff;font-size:14px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,0.15);transition:opacity 0.3s,transform 0.3s;opacity:0;transform:translateY(8px);font-family:inherit;`;
  toast.innerHTML = `<i class="bi ${icon}"></i><span>${message}</span>`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showConfirm(message) {
  return new Promise((resolve) => {
    // remove existing
    const existing = document.getElementById("docConfirmModal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "docConfirmModal";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);backdrop-filter:blur(2px);";
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.2);padding:24px;width:320px;text-align:center;">
        <div style="width:48px;height:48px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
          <i class="bi bi-trash3" style="color:#ef4444;font-size:20px;"></i>
        </div>
        <p style="color:#1f2937;font-weight:600;margin:0 0 4px;">ยืนยันการลบ</p>
        <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">${message}</p>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button id="confirmCancel"
            style="padding:8px 20px;border-radius:8px;border:1px solid #d1d5db;color:#374151;font-size:14px;cursor:pointer;background:#fff;font-family:inherit;">
            ยกเลิก
          </button>
          <button id="confirmOk"
            style="padding:8px 20px;border-radius:8px;border:none;background:#ef4444;color:#fff;font-size:14px;cursor:pointer;font-family:inherit;font-weight:600;">
            ลบเลย
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById("confirmOk").addEventListener("click", () => {
      overlay.remove();
      resolve(true);
    });
    document.getElementById("confirmCancel").addEventListener("click", () => {
      overlay.remove();
      resolve(false);
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) { overlay.remove(); resolve(false); }
    });
  });
}

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

  const basicTab = document.getElementById("pills-basic");
  const documentTab = document.getElementById("pills-document");
  const isBasicTabActive = basicTab?.classList.contains("active");
  const isDocumentTabActive = documentTab?.classList.contains("active");

  let fileInput, descInput;
  if (isBasicTabActive) {
    fileInput = document.getElementById("supplierDocFile_basic");
    descInput = document.getElementById("supplierDocDesc_basic");
  } else if (isDocumentTabActive) {
    fileInput = document.getElementById("supplierDocFile");
    descInput = document.getElementById("supplierDocDesc");
  } else {
    fileInput = document.getElementById("supplierDocFile_basic") || document.getElementById("supplierDocFile");
    descInput = document.getElementById("supplierDocDesc_basic") || document.getElementById("supplierDocDesc");
  }

  const file = fileInput?.files?.[0];
  const description = descInput?.value || "";

  if (!file) {
    showDocToast("กรุณาเลือกไฟล์", "error");
    return;
  }

  const source = isBasicTabActive ? "basic" : "document";

  const formData = new FormData();
  formData.append("file", file);
  formData.append("description", description);
  formData.append("source", source);

  try {
    const res = await fetch(
      `${API_BASE}/api/suppliers/${window.supplierNo}/documents`,
      { method: "POST", body: formData }
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      showDocToast("อัปโหลดไม่สำเร็จ: " + (errorData.message || "Unknown error"), "error");
      return;
    }

    showDocToast("อัปโหลดเอกสารสำเร็จ", "success");

    fileInput.value = "";
    descInput.value = "";
    const fileNameDisplay = document.getElementById("selectedFileName");
    if (fileNameDisplay) fileNameDisplay.classList.add("hidden");

    loadSupplierDocuments(window.supplierNo, source);
  } catch (err) {
    console.error("Upload error:", err);
    showDocToast("อัปโหลดไม่สำเร็จ: " + err.message, "error");
  }
}


// ===============================
// READ
// ===============================

async function loadSupplierDocuments(supplierNo, source = null) {
  try {
    const res = await fetch(`${API_BASE}/api/suppliers/${supplierNo}/documents`);

    if (!res.ok) {
      console.error("Failed to load documents:", res.status);
      return;
    }

    const docs = await res.json();
    renderSupplierDocuments(docs, source);
  } catch (err) {
    console.error("Load documents error:", err);
  }
}

function renderSupplierDocuments(docs, source = null) {

  let filteredDocs = docs;
  if (source) {
    filteredDocs = docs.filter(doc => (doc.source || "basic") === source);
  }

  let containers = [];
  if (source === "basic") {
    const c = document.getElementById("supplierDocumentContainer");
    if (c) containers.push(c);
  } else if (source === "document") {
    const c = document.getElementById("supplierDocumentList");
    if (c) containers.push(c);
  } else {
    containers = [
      document.getElementById("supplierDocumentContainer"),
      document.getElementById("supplierDocumentList")
    ].filter(Boolean);
  }

  if (!containers.length) {
    console.warn("No document container found for source:", source);
    return;
  }

  // icon per file type
  function fileIcon(fileName) {
    const ext = (fileName || "").split(".").pop().toLowerCase();
    if (["pdf"].includes(ext)) return `<i class="bi bi-file-earmark-pdf text-red-500 text-xl"></i>`;
    if (["xls","xlsx"].includes(ext)) return `<i class="bi bi-file-earmark-excel text-green-600 text-xl"></i>`;
    if (["doc","docx"].includes(ext)) return `<i class="bi bi-file-earmark-word text-blue-600 text-xl"></i>`;
    if (["png","jpg","jpeg","gif","webp"].includes(ext)) return `<i class="bi bi-file-earmark-image text-purple-500 text-xl"></i>`;
    return `<i class="bi bi-file-earmark text-gray-400 text-xl"></i>`;
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" });
  }

  const htmlContent = filteredDocs.length
    ? filteredDocs.map(doc => `
      <div class="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition mb-2">

        <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
          ${fileIcon(doc.file_name)}
        </div>

        <div class="flex-1 min-w-0">
          <div class="font-semibold text-gray-800 truncate">${doc.description || "-"}</div>
          <div class="text-xs text-gray-400 truncate">${doc.file_name}</div>
          <div class="text-xs text-gray-300">${formatDate(doc.uploaded_at)}</div>
        </div>

        <div class="flex gap-2 flex-shrink-0">
          <a href="${API_BASE}/${doc.file_path.startsWith('/') ? doc.file_path.substring(1) : doc.file_path}"
             target="_blank"
             class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 text-xs hover:bg-blue-50 transition">
            <i class="bi bi-eye"></i> ดู
          </a>
          <button
            onclick="deleteSupplierDocument(${doc.id}, '${source}')"
            class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 text-red-500 text-xs hover:bg-red-50 transition">
            <i class="bi bi-trash3"></i> ลบ
          </button>
        </div>

      </div>
    `).join("")
    : `<div class="text-center text-gray-400 text-sm py-8">
         <i class="bi bi-folder2-open text-3xl block mb-2"></i>
         ยังไม่มีเอกสาร
       </div>`;

  containers.forEach(container => {
    container.innerHTML = htmlContent;
  });

  const countEl = document.getElementById("documentCount");
  if (countEl) {
    countEl.textContent = `${filteredDocs.length} ไฟล์`;
  }
}


// ===============================
// DELETE
// ===============================

async function deleteSupplierDocument(id, source = null) {
  const confirmed = await showConfirm("เอกสารนี้จะถูกลบออกจากระบบ");
  if (!confirmed) return;

  try {
    const res = await fetch(
      `${API_BASE}/api/suppliers/documents/${id}/delete`,
      { method: "PATCH" }
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      showDocToast("ลบไม่สำเร็จ: " + (errorData.message || "Unknown error"), "error");
      return;
    }

    showDocToast("ลบเอกสารสำเร็จ", "success");
    loadSupplierDocuments(window.supplierNo, source);
  } catch (err) {
    console.error("Delete error:", err);
    showDocToast("ลบไม่สำเร็จ: " + err.message, "error");
  }
}
