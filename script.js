const state = {
    categories: [],
    books: [],
    sales: [],
    customers: [],
    supplierOrders: [],
    connected: false
};
const defaultCategories = [
    "Fiksi", "Nonfiksi", "Anak", "Pendidikan", "Komik",
    "Agama", "Sejarah", "Bisnis", "Sains", "Teknologi"
];

const money = value => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value) || 0);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
let toastTimer;

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

async function api(path, options = {}) {
    const config = window.NALA_SUPABASE_CONFIG;
    if (!config?.url || !config?.publishableKey) {
        throw new Error("Konfigurasi PostgreSQL Supabase belum tersedia.");
    }

    const method = options.method || "GET";
    let endpoint = path.replace(/^\//, "");
    let body = options.body ? JSON.parse(options.body) : undefined;

    if (path === "/books" && method === "GET") {
        endpoint = "books?select=book_id,isbn,title,author,publisher,category,price,stock,min_stock,is_active,warehouse_location&is_active=eq.true&order=title.asc";
    } else if (path === "/customers" && method === "GET") {
        endpoint = "customers?select=*&order=name.asc";
    } else if (path === "/supplier-orders" && method === "GET") {
        endpoint = "supplier_orders?select=*&order=received_at.desc";
    } else if (path === "/supplier-orders" && method === "POST") {
        endpoint = "rpc/record_supplier_order";
        body = {
            p_supplier_name: body.supplier_name,
            p_supplier_contact: body.supplier_contact || null,
            p_warehouse_location: body.warehouse_location,
            p_notes: body.notes || null,
            p_items: body.items
        };
    } else if (path === "/customers" && method === "POST") {
        body = { name: body.name.trim(), phone: body.phone?.trim() || null };
    } else if (path === "/sales" && method === "GET") {
        endpoint = "sales?select=*,customers(name,phone)&order=sold_at.desc";
    } else if (path === "/sales" && method === "POST") {
        endpoint = "rpc/record_sale";
        body = {
            p_customer_id: body.customer_id || null,
            p_customer_name: body.customer_name || null,
            p_customer_phone: body.customer_phone || null,
            p_payment_method: body.payment_method,
            p_amount_received: body.amount_received,
            p_items: body.items
        };
    } else if (path === "/books" && method === "POST") {
        body = bookDatabasePayload(body);
    } else {
        const bookMatch = path.match(/^\/books\/([^/]+)$/);
        if (bookMatch && method === "PATCH") {
            endpoint = `books?book_id=eq.${encodeURIComponent(bookMatch[1])}`;
            body = bookDatabasePayload(body);
        } else {
            const customerMatch = path.match(/^\/customers\/([^/]+)$/);
            if (customerMatch && method === "PATCH") {
                endpoint = `customers?customer_id=eq.${encodeURIComponent(customerMatch[1])}`;
                body = { name: body.name.trim(), phone: body.phone?.trim() || null };
            }
        }
    }

    const headers = {
        apikey: config.publishableKey,
        "Content-Type": "application/json",
        ...(method === "POST" || method === "PATCH" ? { Prefer: "return=representation" } : {}),
        ...(options.headers || {})
    };
    const response = await fetch(`${config.url.replace(/\/$/, "")}/rest/v1/${endpoint}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || result.error_description || result.error || "Permintaan PostgreSQL gagal.");
    return result;
}

async function fetchSalesHistory() {
    const pageSize = 1000;
    const sales = [];
    for (let from = 0; ; from += pageSize) {
        const page = await api("/sales", {
            headers: { "Range-Unit": "items", Range: `${from}-${from + pageSize - 1}` }
        });
        sales.push(...page);
        if (page.length < pageSize) return sales;
    }
}

function bookDatabasePayload(book) {
    return {
        title: book.title.trim(),
        author: book.author.trim(),
        publisher: book.publisher?.trim() || null,
        category: book.category_id || null,
        price: Number(book.price),
        stock: Number(book.stock),
        min_stock: Number(book.minimum_stock),
        warehouse_location: book.warehouse_location?.trim() || null,
        is_active: true
    };
}

async function loadData({ quiet = false } = {}) {
    try {
        const [books, sales, customers, supplierOrders] = await Promise.all([
            api("/books"), fetchSalesHistory(), api("/customers"), api("/supplier-orders")
        ]);
        state.customers = customers;
        state.supplierOrders = supplierOrders;
        state.books = books.map(book => ({
            ...book,
            id: book.book_id,
            category_id: book.category,
            minimum_stock: book.min_stock
        }));
        state.categories = [...new Set(state.books.map(book => book.category).filter(Boolean))]
            .map(name => ({ id: name, name }));
        state.sales = sales.map(sale => ({
            ...sale,
            customer_name: sale.customers?.name || "Pelanggan umum",
            sale_items: (Array.isArray(sale.items) ? sale.items : []).map(item => ({ ...item, books: { title: item.title } }))
        }));
        state.supplierOrders = supplierOrders.map(order => ({
            ...order,
            supplier_order_items: (Array.isArray(order.items) ? order.items : []).map(item => ({ ...item, books: { title: item.title } }))
        }));
        state.connected = true;
        document.getElementById("connectionLabel").textContent = "PostgreSQL aktif";
    } catch (error) {
        state.categories = [];
        state.books = [];
        state.sales = [];
        state.customers = [];
        state.supplierOrders = [];
        state.connected = false;
        document.getElementById("connectionLabel").textContent = "Database terputus";
        if (!quiet) showToast(`Tidak dapat memuat PostgreSQL: ${error.message}`);
    }
    renderAll();
}

function categoryName(id) { return state.categories.find(category => String(category.id) === String(id))?.name || "Tanpa kategori"; }
function saleBookTitles(sale) {
    return (sale.sale_items || []).map(item => item.books?.title || state.books.find(book => String(book.id) === String(item.book_id))?.title || "Buku").join(", ");
}
function formatDate(value, withTime = false) {
    return new Intl.DateTimeFormat("id-ID", withTime ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function receiptMarkup(sale) {
    const items = sale.sale_items || [];
    const amountReceived = Number(sale.amount_received ?? sale.total);
    const change = Math.max(0, amountReceived - Number(sale.total));
    const soldAt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(sale.sold_at));
    return `<div class="receipt-paper" data-width="${document.getElementById("receiptWidth").value}">
        <header class="receipt-header"><div class="receipt-stamp"><strong>n.</strong><span>NALA</span></div><strong>TOKO BUKU NALA</strong><span>Bandung, Jawa Barat</span><span>Telp. 085712345432</span></header>
        <div class="receipt-rule"></div><div class="receipt-meta"><span>${escapeHtml(soldAt)}</span><span>No. Nota: ${escapeHtml(sale.receipt_number)}</span></div>
        <div class="receipt-customer">Pelanggan: <strong>${escapeHtml(sale.customer_name || "Pelanggan umum")}</strong></div>
        <div class="receipt-rule"></div><table class="receipt-items"><thead><tr><th>Nama Buku</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead><tbody>${items.map(item => {
            const title = item.books?.title || item.title || state.books.find(book => String(book.id) === String(item.book_id))?.title || "Buku";
            const quantity = Number(item.quantity) || 0;
            const unitPrice = Number(item.unit_price) || 0;
            return `<tr><td>${escapeHtml(title)}</td><td>${quantity}</td><td>${money(unitPrice)}</td><td>${money(quantity * unitPrice)}</td></tr>`;
        }).join("")}</tbody></table>
        <div class="receipt-rule"></div><div class="receipt-summary"><div><span>Total Pembayaran</span><strong>${money(sale.total)}</strong></div><div><span>${escapeHtml(sale.payment_method)} dibayar</span><strong>${money(amountReceived)}</strong></div><div><span>Kembalian</span><strong>${money(change)}</strong></div></div>
        <div class="receipt-rule"></div><footer class="receipt-footer"><span>Setiap lembar adalah awal perjalanan.</span><span>Terima kasih telah memberi rumah bagi kisah-kisah ini.</span><strong>Selamat Membaca 📖</strong></footer>
    </div>`;
}

function printSaleReceipt(sale) {
    document.getElementById("printReceipt").innerHTML = receiptMarkup(sale);
    window.print();
}

function renderAll() {
    renderDashboard();
    renderBooks();
    renderSales();
    renderCustomers();
    renderSupplierOrders();
    renderCategoryOptions();
    renderCustomerOptions();
    renderSaleItems();
    document.getElementById("lastUpdated").textContent = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function renderDashboard() {
    const todaySales = state.sales.filter(sale => new Date(sale.sold_at).toDateString() === new Date().toDateString());
    const lowStock = state.books.filter(book => Number(book.stock) <= Number(book.minimum_stock));
    document.getElementById("todayRevenue").textContent = money(todaySales.reduce((sum, sale) => sum + Number(sale.total), 0));
    document.getElementById("todayCount").textContent = `${todaySales.length} transaksi tercatat`;
    document.getElementById("bookCount").textContent = state.books.length;
    document.getElementById("lowStockCount").textContent = lowStock.length;
    document.getElementById("totalStock").textContent = state.books.reduce((sum, book) => sum + Number(book.stock), 0).toLocaleString("id-ID");
    renderInventoryInsights();
    document.getElementById("lowStockList").innerHTML = lowStock.length ? lowStock.slice(0, 5).map((book, i) => `
        <div class="low-stock-row"><div class="book-line"><span class="book-cover ${i % 2 ? "coral" : ""}">${escapeHtml(book.title.slice(0, 1))}</span><div><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.author)}</small></div></div><span class="stock-amount">${book.stock} tersisa</span></div>`).join("") : `<div class="empty-state">Semua judul memiliki stok yang cukup.</div>`;
    const recent = [...state.sales].sort((a, b) => new Date(b.sold_at) - new Date(a.sold_at)).slice(0, 4);
    document.getElementById("recentSales").innerHTML = recent.length ? recent.map(sale => `
        <div class="recent-sale-row"><div class="sale-customer"><strong>${escapeHtml(sale.customer_name || "Pelanggan umum")}</strong><small>${escapeHtml(sale.receipt_number)} · ${formatDate(sale.sold_at, true)}</small></div><span class="sale-amount">${money(sale.total)}</span></div>`).join("") : `<div class="empty-state">Belum ada penjualan tercatat.</div>`;
}

function renderInventoryInsights() {
    const threshold = Date.now() - 180 * 24 * 60 * 60 * 1000;
    const soldInWindow = new Map();
    const lastSoldAt = new Map();

    state.sales.forEach(sale => {
        const timestamp = new Date(sale.sold_at).getTime();
        if (!Number.isFinite(timestamp)) return;
        (sale.sale_items || []).forEach(item => {
            const id = String(item.book_id);
            const previous = lastSoldAt.get(id) || 0;
            if (timestamp > previous) lastSoldAt.set(id, timestamp);
            if (timestamp >= threshold) {
                soldInWindow.set(id, (soldInWindow.get(id) || 0) + Number(item.quantity || 0));
            }
        });
    });

    const fastest = [...state.books]
        .map(book => ({ ...book, unitsSold: soldInWindow.get(String(book.id)) || 0 }))
        .filter(book => book.unitsSold > 0)
        .sort((a, b) => b.unitsSold - a.unitsSold || a.title.localeCompare(b.title, "id"))
        .slice(0, 10);
    const maxUnits = Math.max(1, ...fastest.map(book => book.unitsSold));

    document.getElementById("fastMovingBooks").innerHTML = fastest.length
        ? fastest.map((book, index) => {
            const stock = Number(book.stock) || 0;
            const minimum = Number(book.minimum_stock) || 0;
            const priority = stock <= minimum;
            const pace = Math.round((book.unitsSold / maxUnits) * 100);
            return `<div class="fast-row" style="--row-index:${index}">
                <span class="fast-rank">${String(index + 1).padStart(2, "0")}</span>
                <div class="fast-book"><strong>${escapeHtml(book.title)}</strong><span>${escapeHtml(categoryName(book.category_id))}</span><div class="pace-track"><i style="--pace:${pace}%"></i></div></div>
                <span class="units-sold">${book.unitsSold}<small>terjual</small></span>
                <span class="restock-priority ${priority ? "priority-now" : ""}">${priority ? "PESAN" : `Stok ${stock}`}</span>
            </div>`;
        }).join("")
        : `<div class="empty-state">Belum ada buku terjual dalam 180 hari terakhir.</div>`;

    const deadBooks = state.books
        .filter(book => !lastSoldAt.has(String(book.id)) || lastSoldAt.get(String(book.id)) < threshold)
        .sort((a, b) => (lastSoldAt.get(String(a.id)) || 0) - (lastSoldAt.get(String(b.id)) || 0));
    document.getElementById("deadStockCount").textContent = deadBooks.length;
    document.getElementById("deadStockBooks").innerHTML = deadBooks.length
        ? deadBooks.map((book, index) => {
            const lastSale = lastSoldAt.get(String(book.id));
            const daysWithoutSale = lastSale ? Math.floor((Date.now() - lastSale) / (24 * 60 * 60 * 1000)) : null;
            return `<div class="dead-row" style="--row-index:${index}">
                <span class="dead-mark">${escapeHtml(book.title.slice(0, 1))}</span>
                <div class="dead-book"><strong>${escapeHtml(book.title)}</strong><small>${lastSale ? `Terakhir terjual ${daysWithoutSale} hari lalu · ${formatDate(lastSale)}` : "Belum pernah tercatat terjual"}</small></div>
                <span class="dead-stock-count">${Number(book.stock) || 0}<small>stok</small></span>
            </div>`;
        }).join("")
        : `<div class="dead-empty"><span>✓</span><strong>Tidak ada dead stock</strong><small>Semua buku terjual dalam 180 hari terakhir.</small></div>`;
}

function renderBooks() {
    const query = document.getElementById("bookSearch").value.trim().toLocaleLowerCase("id");
    const categoryId = document.getElementById("categoryFilter").value;
    const books = state.books.filter(book => `${book.title} ${book.author}`.toLocaleLowerCase("id").includes(query) && (categoryId === "all" || String(book.category_id) === categoryId));
    document.getElementById("bookResultCount").textContent = `${books.length} judul`;
    document.getElementById("booksTable").innerHTML = books.length ? books.map(book => {
        const low = Number(book.stock) <= Number(book.minimum_stock);
        return `<tr><td><div class="table-book"><span class="book-cover ${low ? "coral" : ""}">${escapeHtml(book.title.slice(0, 1))}</span><span><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.author)}</small></span></div></td><td>${escapeHtml(book.publisher || "-")}</td><td>${escapeHtml(book.warehouse_location || "Belum ditempatkan")}</td><td>${escapeHtml(categoryName(book.category_id))}</td><td>${money(book.price)}</td><td>${Number(book.stock).toLocaleString("id-ID")} <small class="optional">/ min. ${book.minimum_stock}</small></td><td><span class="stock-pill ${low ? "low" : ""}">${low ? "Restok" : "Tersedia"}</span></td><td><button type="button" class="table-action" data-edit-book="${book.id}">Ubah</button></td></tr>`;
    }).join("") : `<tr><td colspan="8"><div class="empty-state">Tidak ada buku yang cocok dengan pencarian.</div></td></tr>`;
}

function renderSales() {
    const sales = [...state.sales].sort((a, b) => new Date(b.sold_at) - new Date(a.sold_at));
    document.getElementById("salesCount").textContent = sales.length;
    document.getElementById("salesHistory").innerHTML = sales.length ? sales.map(sale => `
        <article class="history-row"><div><span class="overline">${escapeHtml(sale.receipt_number)}</span><small>${escapeHtml(sale.customer_name || "Pelanggan umum")} · ${escapeHtml(sale.payment_method)}</small></div><strong>${money(sale.total)}</strong><div class="history-items">${escapeHtml(saleBookTitles(sale))} · ${formatDate(sale.sold_at, true)}</div><button type="button" class="receipt-action" data-print-sale="${escapeHtml(sale.receipt_number)}" aria-label="Cetak struk ${escapeHtml(sale.receipt_number)}" title="Cetak struk"><span aria-hidden="true">⎙</span> Cetak</button></article>`).join("") : `<div class="empty-state">Transaksi yang disimpan akan muncul di sini.</div>`;
}

function renderCategoryOptions() {
    const filter = document.getElementById("categoryFilter");
    const selected = filter.value || "all";
    const categories = [...new Set([
        ...defaultCategories,
        ...state.categories.map(category => category.name)
    ])].map(name => ({ id: name, name }));
    filter.innerHTML = `<option value="all">Semua kategori</option>${categories.map(category => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join("")}`;
    filter.value = [...filter.options].some(option => option.value === selected) ? selected : "all";
    document.getElementById("bookCategory").innerHTML = `<option value="">Tanpa kategori</option>${categories.map(category => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join("")}`;
}

function renderCustomerOptions() {
    const select = document.getElementById("saleCustomer");
    const selected = select.value;
    select.innerHTML = `<option value="">Pelanggan umum</option>${state.customers.map(customer => `<option value="${customer.customer_id}">${escapeHtml(customer.name)}${customer.phone ? ` · ${escapeHtml(customer.phone)}` : ""}</option>`).join("")}`;
    select.value = state.customers.some(customer => customer.customer_id === selected) ? selected : "";
}

function renderCustomers() {
    const body = document.getElementById("customersTable");
    body.innerHTML = state.customers.length
        ? state.customers.map(customer => `<tr><td><strong>${escapeHtml(customer.name)}</strong></td><td>${escapeHtml(customer.phone || "-")}</td><td>${formatDate(customer.created_at)}</td><td><button class="table-action" type="button" data-edit-customer="${customer.customer_id}">Ubah</button></td></tr>`).join("")
        : `<tr><td colspan="4"><div class="empty-state">Belum ada data pelanggan.</div></td></tr>`;
}

function renderSupplierOrders() {
    const body = document.getElementById("supplierOrdersTable");
    body.innerHTML = state.supplierOrders.length
        ? state.supplierOrders.map(order => {
            const itemCount = (order.supplier_order_items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
            const items = (order.supplier_order_items || []).map(item => `${item.books?.title || "Buku"} × ${item.quantity}`).join(", ");
            return `<tr><td><strong>${escapeHtml(order.order_number)}</strong><small class="table-subline">${escapeHtml(items)}</small></td><td>${escapeHtml(order.supplier_name)}</td><td>${escapeHtml(order.warehouse_location)}</td><td>${itemCount} buku</td><td>${money(order.total_cost)}</td><td>${formatDate(order.received_at)}</td><td><span class="status ready">${escapeHtml(order.status)}</span></td></tr>`;
        }).join("")
        : `<tr><td colspan="7"><div class="empty-state">Belum ada penerimaan supplier.</div></td></tr>`;
}

function renderSaleItems() {
    const container = document.getElementById("saleItems");
    const prior = [...container.querySelectorAll(".sale-item-row")].map(row => ({ bookId: row.querySelector("select").value, quantity: row.querySelector("input").value }));
    const items = prior.length ? prior : [{ bookId: "", quantity: "1" }];
    container.innerHTML = items.map(item => `<div class="sale-item-row"><select aria-label="Pilih buku"><option value="">Pilih judul buku</option>${state.books.filter(book => Number(book.stock) > 0).map(book => `<option value="${book.id}" ${String(book.id) === item.bookId ? "selected" : ""}>${escapeHtml(book.title)} · ${book.stock} ada</option>`).join("")}</select><input type="number" min="1" step="1" value="${escapeHtml(item.quantity || 1)}" aria-label="Jumlah buku"><button type="button" class="remove-item" aria-label="Hapus judul">×</button></div>`).join("");
    container.querySelectorAll("select,input").forEach(control => control.addEventListener("change", updateSaleTotal));
    container.querySelectorAll(".remove-item").forEach(button => button.addEventListener("click", () => {
        if (container.children.length === 1) { container.firstElementChild.querySelector("select").value = ""; container.firstElementChild.querySelector("input").value = "1"; }
        else button.closest(".sale-item-row").remove();
        updateSaleTotal();
    }));
    updateSaleTotal();
}

function updateSaleTotal() {
    const total = [...document.querySelectorAll(".sale-item-row")].reduce((sum, row) => {
        const book = state.books.find(item => String(item.id) === row.querySelector("select").value);
        return sum + (book ? Number(book.price) * Math.max(0, Number(row.querySelector("input").value) || 0) : 0);
    }, 0);
    document.getElementById("saleTotal").textContent = money(total);
    const amountInput = document.getElementById("amountReceived");
    const isCash = document.getElementById("paymentMethod").value === "Tunai";
    amountInput.disabled = !isCash;
    if (!isCash) amountInput.value = String(total);
    document.getElementById("saleChange").textContent = money(Math.max(0, Number(amountInput.value) - total));
}

function setView(name) {
    document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === `${name}View`));
    document.querySelectorAll(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.view === name));
    document.getElementById("pageLabel").textContent = { dashboard: "Dashboard", customers: "Pelanggan", books: "Katalog buku", sales: "Penjualan", supplierOrders: "Pemesanan Supplier" }[name];
}

function openBookDialog(book) {
    const form = document.getElementById("bookForm");
    form.reset();
    document.getElementById("bookId").value = book?.id || "";
    document.getElementById("dialogTitle").textContent = book ? "Ubah buku" : "Tambah buku";
    document.getElementById("bookTitle").value = book?.title || "";
    document.getElementById("bookAuthor").value = book?.author || "";
    document.getElementById("bookCategory").value = book?.category_id || "";
    document.getElementById("bookPublisher").value = book?.publisher || "";
    document.getElementById("bookWarehouseLocation").value = book?.warehouse_location || "Gudang Utama";
    document.getElementById("bookPrice").value = book?.price ?? "";
    document.getElementById("bookStock").value = book?.stock ?? 0;
    document.getElementById("bookMinimum").value = book?.minimum_stock ?? 5;
    document.getElementById("bookDialog").showModal();
}

function openCustomerDialog(customer) {
    document.getElementById("customerForm").reset();
    document.getElementById("customerId").value = customer?.customer_id || "";
    document.getElementById("customerDialogTitle").textContent = customer ? "Ubah pelanggan" : "Tambah pelanggan";
    document.getElementById("customerName").value = customer?.name || "";
    document.getElementById("customerPhone").value = customer?.phone || "";
    document.getElementById("customerDialog").showModal();
}

function readOrderItems() {
    return [...document.querySelectorAll(".order-item-row")].map(row => ({
        bookId: row.querySelector("select").value,
        quantity: row.querySelector(".order-quantity").value,
        unitCost: row.querySelector(".order-cost").value
    }));
}

function renderOrderItems(items = readOrderItems()) {
    const rows = items.length ? items : [{ bookId: "", quantity: "1", unitCost: "0" }];
    const container = document.getElementById("orderItems");
    container.innerHTML = rows.map(item => `<div class="order-item-row">
        <select aria-label="Pilih buku"><option value="">Pilih buku</option>${state.books.map(book => `<option value="${book.id}" ${String(book.id) === String(item.bookId) ? "selected" : ""}>${escapeHtml(book.title)} · stok ${book.stock}</option>`).join("")}</select>
        <input class="order-quantity" type="number" min="1" step="1" value="${escapeHtml(item.quantity || 1)}" aria-label="Jumlah diterima">
        <input class="order-cost" type="number" min="0" step="100" value="${escapeHtml(item.unitCost ?? 0)}" aria-label="Harga modal satuan">
        <button type="button" class="remove-item" aria-label="Hapus buku">×</button>
    </div>`).join("");
    container.querySelectorAll("input,select").forEach(control => control.addEventListener("input", updateOrderTotal));
    container.querySelectorAll(".remove-item").forEach(button => button.addEventListener("click", () => {
        const current = readOrderItems();
        current.splice([...container.querySelectorAll(".remove-item")].indexOf(button), 1);
        renderOrderItems(current);
    }));
    updateOrderTotal();
}

function updateOrderTotal() {
    const total = readOrderItems().reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitCost) || 0), 0);
    document.getElementById("orderTotal").textContent = money(total);
}

function openSupplierOrderDialog() {
    document.getElementById("supplierOrderForm").reset();
    document.getElementById("orderWarehouse").value = "Gudang Utama";
    renderOrderItems([{ bookId: "", quantity: "1", unitCost: "0" }]);
    document.getElementById("supplierOrderDialog").showModal();
}

document.querySelectorAll(".nav-link").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
document.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => setView(button.dataset.go)));
const today = new Date();
document.getElementById("todayLabel").textContent = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" }).format(today);
document.getElementById("welcomeDate").textContent = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(today).toLocaleUpperCase("id");
document.getElementById("refreshButton").addEventListener("click", () => loadData());
document.getElementById("bookSearch").addEventListener("input", renderBooks);
document.getElementById("categoryFilter").addEventListener("change", renderBooks);
document.getElementById("addBookButton").addEventListener("click", () => openBookDialog());
document.getElementById("addCustomerButton").addEventListener("click", () => openCustomerDialog());
document.getElementById("addSupplierOrderButton").addEventListener("click", () => openSupplierOrderDialog());
document.getElementById("addOrderItem").addEventListener("click", () => renderOrderItems([...readOrderItems(), { bookId: "", quantity: "1", unitCost: "0" }]));
document.querySelector(".close-dialog").addEventListener("click", () => document.getElementById("bookDialog").close());
document.getElementById("cancelBook").addEventListener("click", () => document.getElementById("bookDialog").close());
document.querySelectorAll(".close-entity-dialog, .cancel-entity-dialog").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
document.getElementById("booksTable").addEventListener("click", event => {
    const button = event.target.closest("[data-edit-book]");
    if (button) openBookDialog(state.books.find(book => String(book.id) === button.dataset.editBook));
});
document.getElementById("customersTable").addEventListener("click", event => {
    const button = event.target.closest("[data-edit-customer]");
    if (button) openCustomerDialog(state.customers.find(item => item.customer_id === button.dataset.editCustomer));
});
document.getElementById("salesHistory").addEventListener("click", event => {
    const button = event.target.closest("[data-print-sale]");
    if (button) printSaleReceipt(state.sales.find(sale => sale.receipt_number === button.dataset.printSale));
});
document.getElementById("paymentMethod").addEventListener("change", updateSaleTotal);
document.getElementById("amountReceived").addEventListener("input", updateSaleTotal);
document.getElementById("closeSaleSuccess").addEventListener("click", () => document.getElementById("saleSuccessDialog").close());
document.getElementById("finishSale").addEventListener("click", () => document.getElementById("saleSuccessDialog").close());
document.getElementById("printSuccessfulSale").addEventListener("click", () => {
    const sale = state.sales.find(item => item.receipt_number === document.getElementById("saleSuccessDetails").dataset.receiptNumber);
    if (!sale) return;
    document.getElementById("saleSuccessDialog").close();
    printSaleReceipt(sale);
});

document.getElementById("bookForm").addEventListener("submit", async event => {
    event.preventDefault();
    const id = document.getElementById("bookId").value;
    const payload = { title: document.getElementById("bookTitle").value.trim(), author: document.getElementById("bookAuthor").value.trim(), category_id: document.getElementById("bookCategory").value || null, publisher: document.getElementById("bookPublisher").value.trim(), warehouse_location: document.getElementById("bookWarehouseLocation").value.trim(), price: Number(document.getElementById("bookPrice").value), stock: Number(document.getElementById("bookStock").value), minimum_stock: Number(document.getElementById("bookMinimum").value) };
    try {
        await api(id ? `/books/${id}` : "/books", { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) });
        await loadData({ quiet: true });
        document.getElementById("bookDialog").close();
        renderAll();
        showToast(id ? "Data buku diperbarui." : "Buku baru ditambahkan.");
    } catch (error) { showToast(error.message); }
});

document.getElementById("customerForm").addEventListener("submit", async event => {
    event.preventDefault();
    const id = document.getElementById("customerId").value;
    const payload = { name: document.getElementById("customerName").value.trim(), phone: document.getElementById("customerPhone").value.trim() };
    try {
        await api(id ? `/customers/${id}` : "/customers", { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) });
        await loadData({ quiet: true });
        document.getElementById("customerDialog").close();
        showToast(id ? "Data pelanggan diperbarui." : "Pelanggan ditambahkan.");
    } catch (error) { showToast(error.message); }
});

document.getElementById("supplierOrderForm").addEventListener("submit", async event => {
    event.preventDefault();
    const items = readOrderItems().filter(item => item.bookId).map(item => ({ book_id: item.bookId, quantity: Number(item.quantity), unit_cost: Number(item.unitCost) }));
    if (!items.length) { showToast("Pilih minimal satu buku untuk penerimaan."); return; }
    if (items.some(item => !Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.unit_cost) || item.unit_cost < 0)) {
        showToast("Periksa jumlah buku dan harga modal pada pemesanan.");
        return;
    }
    const payload = {
        supplier_name: document.getElementById("orderSupplierName").value.trim(),
        supplier_contact: document.getElementById("orderSupplierContact").value.trim(),
        warehouse_location: document.getElementById("orderWarehouse").value.trim(),
        notes: document.getElementById("orderNotes").value.trim(),
        items
    };
    try {
        await api("/supplier-orders", { method: "POST", body: JSON.stringify(payload) });
        await loadData({ quiet: true });
        document.getElementById("supplierOrderDialog").close();
        showToast("Penerimaan tersimpan; stok buku sudah ditambahkan.");
    } catch (error) { showToast(error.message); }
});

document.getElementById("addSaleItem").addEventListener("click", () => {
    const row = document.createElement("div");
    row.className = "sale-item-row";
    row.innerHTML = `<select aria-label="Pilih buku"><option value="">Pilih judul buku</option>${state.books.filter(book => Number(book.stock) > 0).map(book => `<option value="${book.id}">${escapeHtml(book.title)} · ${book.stock} ada</option>`).join("")}</select><input type="number" min="1" step="1" value="1" aria-label="Jumlah buku"><button type="button" class="remove-item" aria-label="Hapus judul">×</button>`;
    document.getElementById("saleItems").append(row);
    renderSaleItems();
});

document.getElementById("saleForm").addEventListener("submit", async event => {
    event.preventDefault();
    const items = [...document.querySelectorAll(".sale-item-row")].filter(row => row.querySelector("select").value).map(row => ({ book_id: row.querySelector("select").value, quantity: Number(row.querySelector("input").value) }));
    if (!items.length) { showToast("Pilih minimal satu buku untuk penjualan."); return; }
    for (const item of items) {
        const book = state.books.find(entry => String(entry.id) === String(item.book_id));
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > book.stock) { showToast(`Jumlah ${book.title} melebihi stok tersedia.`); return; }
    }
    const total = items.reduce((sum, item) => sum + Number(state.books.find(book => String(book.id) === String(item.book_id)).price) * item.quantity, 0);
    const amountReceived = Number(document.getElementById("amountReceived").value);
    if (!Number.isFinite(amountReceived) || amountReceived < total) { showToast("Jumlah uang yang diterima harus sama atau lebih dari total transaksi."); return; }
    const customer = state.customers.find(item => item.customer_id === document.getElementById("saleCustomer").value);
    const payload = { customer_id: customer?.customer_id || null, customer_name: customer?.name || null, customer_phone: customer?.phone || null, payment_method: document.getElementById("paymentMethod").value, amount_received: amountReceived, items };
    try {
        const savedSale = await api("/sales", { method: "POST", body: JSON.stringify(payload) });
        await loadData({ quiet: true });
        document.getElementById("saleForm").reset();
        renderAll();
        const sale = state.sales.find(item => item.receipt_number === savedSale?.receipt_number);
        if (sale) {
            const details = document.getElementById("saleSuccessDetails");
            details.textContent = `${sale.receipt_number} · ${money(sale.total)} · ${sale.customer_name || "Pelanggan umum"}`;
            details.dataset.receiptNumber = sale.receipt_number;
            document.getElementById("saleSuccessDialog").showModal();
        } else showToast("Penjualan tersimpan dan stok telah diperbarui.");
    } catch (error) { showToast(error.message); }
});

renderAll();
loadData();
