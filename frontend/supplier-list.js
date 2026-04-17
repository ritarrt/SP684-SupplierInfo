const API_BASE = "http://localhost:3000";

const tableBody = document.getElementById("supplierTableBody");
const searchInput = document.getElementById("searchInput");

async function fetchSuppliers(page = 1, keyword = "") {
  try {
    const res = await fetch(
      `${API_BASE}/api/suppliers?page=${page}&limit=100&q=${encodeURIComponent(keyword)}`
    );

    if (!res.ok) throw new Error("Fetch failed");

    const data = await res.json();
    renderTable(data);

  } catch (err) {
    console.error(err);

    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="py-6 text-center text-red-500">
          โหลดข้อมูลไม่สำเร็จ
        </td>
      </tr>`;
  }
}

function renderTable(list) {
  tableBody.innerHTML = "";

  if (!Array.isArray(list) || list.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="py-6 text-center text-gray-400">
          ไม่พบข้อมูล
        </td>
      </tr>`;
    return;
  }

  list.forEach((s) => {
    const tr = document.createElement("tr");
    tr.className = "border-b hover:bg-gray-50 cursor-pointer";

    tr.innerHTML = `
      <td class="py-4 font-medium">${s.supplierNo}</td>
      <td class="font-medium">${s.name}</td>
      <td>${s.category || "-"}</td>
    `;

    tr.onclick = () => {
      window.location.href = `Supplier-Info.html?id=${encodeURIComponent(
        s.supplierNo
      )}`;
    };

    tableBody.appendChild(tr);
  });
}

/* SEARCH */
searchInput.addEventListener("input", (e) => {
  fetchSuppliers(1, e.target.value);
});

/* FIRST LOAD */
fetchSuppliers();