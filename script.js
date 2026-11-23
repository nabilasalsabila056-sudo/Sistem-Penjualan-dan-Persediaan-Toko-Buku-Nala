const state = {
    categories: [],
    books: [],
    sales: [],
    customers: [],
    journalEntries: [],
    conditionEvents: [],
    connected: false
};
const defaultCategories = [
    "Fiksi", "Nonfiksi", "Anak", "Pendidikan", "Komik",
    "Agama", "Sejarah", "Bisnis", "Sains", "Teknologi"
];

const money = value => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value) || 0);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
let toastTimer;
let pendingDelete = null;

function openDeleteConfirmation({ title, copy, onConfirm }) {
    pendingDelete = onConfirm;
    document.getElementById("confirmDialogTitle").textContent = title;
    document.getElementById("confirmDialogCopy").textContent = copy;
    document.getElementById("confirmDialog").showModal();
}

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

    let method = options.method || "GET";
    let endpoint = path.replace(/^\//, "");
    let body = options.body ? JSON.parse(options.body) : undefined;

    if (path === "/books" && method === "GET") {
        endpoint = "books?select=book_id,isbn,title,author,publisher,category,price,stock,min_stock,is_active,warehouse_location&is_active=eq.true&order=title.asc";
    } else if (path === "/customers" && method === "GET") {
        endpoint = "customers?select=*&order=name.asc";
    } else if (path === "/journal-entries" && method === "GET") {
        endpoint = "journal_entries?select=*&order=entry_date.desc";
    } else if (path === "/journal-revisions" && method === "POST") {
        endpoint = "rpc/revise_journal_amount";
        body = {
            p_journal_entry_id: body.journal_entry_id,
            p_new_amount: body.new_amount,
            p_revision_note: body.revision_note || null
        };
    } else if (path === "/book-condition-events" && method === "GET") {
        endpoint = "book_condition_events?select=*,books(title)&order=occurred_at.desc";
    } else if (path === "/stock-adjustments" && method === "POST") {
        endpoint = "rpc/record_stock_adjustment";
        body = {
            p_adjustment_type: body.adjustment_type,
            p_supplier_name: body.supplier_name || null,
            p_warehouse_location: body.warehouse_location || null,
            p_credit_account: body.credit_account || null,
            p_notes: body.notes || null,
            p_items: body.items
        };
    } else if (path === "/journal-entries" && method === "POST") {
        endpoint = "rpc/record_financial_activity";
        body = {
            p_activity_type: body.activity_type,
            p_description: body.description,
            p_amount: body.amount,
            p_entry_date: body.entry_date
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
    } else if (method === "DELETE" && /^\/customers\/[^/]+$/.test(path)) {
        const customerId = path.split("/").pop();
        endpoint = `customers?customer_id=eq.${encodeURIComponent(customerId)}`;
        body = undefined;
    } else if (method === "DELETE" && /^\/journal-entries\/[^/]+$/.test(path)) {
        const journalId = path.split("/").pop();
        method = "POST";
        endpoint = "rpc/delete_journal_entry";
        body = { p_journal_entry_id: Number(journalId) };
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
        ...(book.stock === undefined ? {} : { stock: Number(book.stock) }),
        min_stock: Number(book.minimum_stock),
        warehouse_location: book.warehouse_location?.trim() || null,
        is_active: true
    };
}

async function loadData({ quiet = false } = {}) {
    try {
        const [books, sales, customers, journalEntries] = await Promise.all([
            api("/books"), fetchSalesHistory(), api("/customers"), api("/journal-entries")
        ]);
        state.customers = customers;
        state.journalEntries = journalEntries;
        state.books = books.map(book => ({
            ...book,
            id: book.book_id,
            category_id: book.category,
            minimum_stock: book.min_stock
        }));
        state.categories = [...new Set(state.books.map(book => book.category).filter(Boolean))]
            .map(name => ({ id: name, name }));

        let conditionEvents = [];
        try {
            conditionEvents = await api("/book-condition-events");
        } catch (error) {
            conditionEvents = [];
        }

        if (!conditionEvents.length) {
            conditionEvents = state.journalEntries
                .filter(entry => entry.entry_type === "damaged" || entry.entry_type === "lost")
                .flatMap(entry => (Array.isArray(entry.items) ? entry.items : []).map(item => ({
                    condition_event_id: `journal-${entry.journal_entry_id}-${item.book_id}`,
                    book_id: item.book_id,
                    condition_type: entry.entry_type,
                    quantity: Number(item.quantity) || 0,
                    notes: entry.description.includes(": ") ? entry.description.split(": ").slice(1).join(": ").trim() : null,
                    occurred_at: entry.entry_date,
                    book_title: item.title || state.books.find(book => String(book.id) === String(item.book_id))?.title || "Buku"
                })));
        }

        state.conditionEvents = conditionEvents.map(event => {
            const linkedEntry = state.journalEntries.find(entry => String(entry.journal_entry_id) === String(event.journal_entry_id));
            let updateNote = event.notes;
            if (linkedEntry?.description) {
                updateNote = linkedEntry.description.includes(": ")
                    ? linkedEntry.description.split(": ").slice(1).join(": ").trim()
                    : null;
            }
            return {
                ...event,
                notes: updateNote,
                book_title: event.books?.title || event.book_title || state.books.find(book => String(book.id) === String(event.book_id))?.title || "Buku"
            };
        });

        state.sales = sales.map(sale => ({
            ...sale,
            customer_name: sale.customer_name || sale.customers?.name || "Pelanggan umum",
            sale_items: (Array.isArray(sale.items) ? sale.items : []).map(item => ({ ...item, books: { title: item.title } }))
        }));
        state.connected = true;
        document.getElementById("connectionLabel").textContent = "PostgreSQL aktif";
    } catch (error) {
        state.categories = [];
        state.books = [];
        state.sales = [];
        state.customers = [];
        state.journalEntries = [];
        state.conditionEvents = [];
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

function renderAll() {
    renderDashboard();
    renderBooks();
    renderSales();
    renderCustomers();
    renderJournalEntries();
    renderConditionEvents();
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

function renderConditionEvents() {
    const events = state.conditionEvents.filter(event => event.condition_type === "damaged" || event.condition_type === "lost");
    document.getElementById("conditionCount").textContent = events.length;
    document.getElementById("conditionBookList").innerHTML = events.length
        ? events.map((event, index) => {
            const label = event.condition_type === "damaged" ? "Rusak" : "Hilang";
            const title = event.book_title || event.books?.title || state.books.find(book => String(book.id) === String(event.book_id))?.title || "Buku";
            return `<article class="condition-row"><span class="condition-index">${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(title)}</strong><small>${formatDate(event.occurred_at, true)}${event.notes ? ` · ${escapeHtml(event.notes)}` : ""}</small></div><span class="condition-badge ${event.condition_type}">${label}</span><strong>${Number(event.quantity)} buku</strong></article>`;
        }).join("")
        : `<div class="empty-state">Belum ada buku rusak atau hilang yang tercatat.</div>`;
}

function renderSales() {
    const sales = [...state.sales].sort((a, b) => new Date(b.sold_at) - new Date(a.sold_at));
    document.getElementById("salesCount").textContent = sales.length;
    document.getElementById("salesHistory").innerHTML = sales.length ? sales.map(sale => `
        <article class="history-row">
            <div class="history-date"><strong>${new Intl.DateTimeFormat("id-ID", { day: "2-digit" }).format(new Date(sale.sold_at))}</strong><span>${new Intl.DateTimeFormat("id-ID", { month: "short" }).format(new Date(sale.sold_at))}</span></div>
            <div class="history-main"><span class="history-receipt">${escapeHtml(sale.receipt_number)}</span><span class="history-customer">${escapeHtml(sale.customer_name || "Pelanggan umum")}</span><small class="history-meta">${escapeHtml(sale.payment_method)} · ${formatDate(sale.sold_at, true)}</small><p class="history-items">${escapeHtml(saleBookTitles(sale))}</p></div>
            <div class="history-side"><strong>${money(sale.total)}</strong><button class="table-action print-sale" type="button" data-print-sale="${sale.sale_id}" aria-label="Cetak struk ${escapeHtml(sale.receipt_number)}">Cetak struk</button></div>
        </article>`).join("") : `<div class="empty-state">Transaksi yang disimpan akan muncul di sini.</div>`;
}

function printSale(sale) {
    const paperWidth = [58, 80].includes(Number(document.getElementById("receiptPaperWidth").value))
        ? Number(document.getElementById("receiptPaperWidth").value)
        : 80;
    const lines = (sale.sale_items || []).map(item => {
        const title = item.books?.title || item.title || "Buku";
        const quantity = Number(item.quantity) || 0;
        const unitPrice = Number(item.unit_price) || 0;
        return `<tr><td class="item-name">${escapeHtml(title)}<small>${quantity} × ${money(unitPrice)}</small></td><td class="item-total">${money(quantity * unitPrice)}</td></tr>`;
    }).join("");
    const receiptWindow = window.open("", "_blank", "width=420,height=700");
    if (!receiptWindow) {
        showToast("Jendela cetak diblokir browser. Izinkan pop-up lalu coba lagi.");
        return;
    }
    receiptWindow.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Struk ${escapeHtml(sale.receipt_number)}</title><style>
        :root{color-scheme:light;--paper:#ffee9d;--ink:#606c38;--line:#adc178;--coral:#d81159;--pink:#ffa3a5}
        *{box-sizing:border-box}
        @page{size:${paperWidth}mm auto;margin:4mm}
        body{width:${paperWidth - 8}mm;max-width:100%;margin:12px auto;padding:16px 12px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font:11px/1.5 "Segoe UI",Arial,sans-serif}
        .receipt-brand{display:flex;align-items:center;justify-content:center;gap:10px;padding:4px 0 12px}
        .logo-stamp{display:grid;width:44px;height:44px;flex:0 0 44px;place-items:center;border:3px double var(--coral);border-radius:50%;background:var(--paper);color:var(--coral);font:700 22px Georgia,serif;outline:1px dashed var(--coral);outline-offset:3px}
        .brand-copy strong{display:block;color:var(--forest,var(--ink));font:700 15px Georgia,serif;letter-spacing:1px}
        .brand-copy small{display:block;margin-top:2px;color:var(--ink);font-size:9px;letter-spacing:.8px}
        .rule{height:0;margin:8px 0;border:0;border-top:1px dashed var(--line)}
        .receipt-meta{display:grid;grid-template-columns:1fr auto;gap:3px 8px;font-size:10px}
        .receipt-meta strong{text-align:right;font-weight:600}
        table{width:100%;border-collapse:collapse}
        td{padding:5px 0;vertical-align:top}
        .item-name{padding-right:7px}
        .item-name small{display:block;margin-top:2px;color:var(--ink);font-size:9px}
        .item-total{text-align:right;white-space:nowrap}
        .summary td{padding:3px 0}
        .summary td:last-child{text-align:right;white-space:nowrap}
        .grand-total td{padding-top:7px;border-top:1px solid var(--line);color:var(--coral);font-weight:700;font-size:13px}
        .thanks{margin:12px 0 2px;color:var(--ink);font:italic 12px Georgia,serif;text-align:center}
        @media screen{body{min-height:180px;border-radius:8px;box-shadow:0 8px 28px #606c3826}}
        @media print{body{margin:0 auto;padding:8px 5px;border:0;background:var(--paper);print-color-adjust:exact;-webkit-print-color-adjust:exact}.logo-stamp{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style></head><body>
        <header class="receipt-brand"><span class="logo-stamp" aria-label="Stempel logo Nala">n.</span><span class="brand-copy"><strong>TOKO BUKU NALA</strong><small>BUKU YANG BAIK MENEMUKAN PEMBACANYA</small></span></header>
        <hr class="rule">
        <div class="receipt-meta"><span>No. transaksi</span><strong>${escapeHtml(sale.receipt_number)}</strong><span>Tanggal</span><strong>${escapeHtml(formatDate(sale.sold_at, true))}</strong><span>Pelanggan</span><strong>${escapeHtml(sale.customer_name || "Pelanggan umum")}</strong></div>
        <hr class="rule"><table>${lines}</table><hr class="rule">
        <table class="summary"><tr class="grand-total"><td>Total</td><td>${money(sale.total)}</td></tr><tr><td>Pembayaran (${escapeHtml(sale.payment_method)})</td><td>${money(sale.amount_received ?? sale.total)}</td></tr><tr><td>Kembalian</td><td>${money(Math.max(0, Number(sale.amount_received ?? sale.total) - Number(sale.total)))}</td></tr></table>
        <hr class="rule"><p class="thanks">Terima kasih telah berbelanja</p>
        <script>window.onload=()=>window.print();window.onafterprint=()=>window.close();</script></body></html>`);
    receiptWindow.document.close();
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
        ? state.customers.map(customer => `<tr><td><strong>${escapeHtml(customer.name)}</strong></td><td>${escapeHtml(customer.phone || "-")}</td><td>${formatDate(customer.created_at)}</td><td><div class="row-actions"><button class="table-action" type="button" data-edit-customer="${customer.customer_id}">Ubah</button><button class="table-action table-action-danger" type="button" data-delete-customer="${customer.customer_id}" data-customer-name="${escapeHtml(customer.name)}">Hapus</button></div></td></tr>`).join("")
        : `<tr><td colspan="4"><div class="empty-state">Belum ada data pelanggan.</div></td></tr>`;
}

function renderJournalEntries() {
    const body = document.getElementById("journalEntriesTable");
    const filter = document.getElementById("journalTypeFilter")?.value || "all";
    const typeLabels = { sale: "Penjualan", purchase: "Pembelian Persediaan", restock: "Pembelian Persediaan", damaged: "Buku rusak", lost: "Buku hilang", income: "Pemasukan lain", expense: "Pengeluaran" };
    const entriesByMonth = new Map();
    const filteredEntries = filter === "all"
        ? state.journalEntries
        : state.journalEntries.filter(entry => entry.entry_type === filter || (filter === "purchase" && entry.entry_type === "restock"));
    document.getElementById("journalFilterCount").textContent = `${filteredEntries.length} entri`;
    [...filteredEntries]
        .sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date))
        .forEach(entry => {
            const date = new Date(entry.entry_date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
            if (!entriesByMonth.has(monthKey)) entriesByMonth.set(monthKey, { date, entries: [] });
            entriesByMonth.get(monthKey).entries.push(entry);
        });
    body.innerHTML = filteredEntries.length
        ? [...entriesByMonth.values()].map(({ date, entries }) => {
            const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(date);
            const heading = monthLabel.charAt(0).toLocaleUpperCase("id") + monthLabel.slice(1);
            return `<tr class="journal-month-divider"><th colspan="6" scope="rowgroup">${escapeHtml(heading)}</th></tr>${entries.map(entry => {
                const items = (Array.isArray(entry.items) ? entry.items : [])
                    .map(item => `${item.title || "Buku"} × ${item.quantity}`)
                    .join(", ");
                const revision = Number(entry.revision_count) > 0
                    ? `<small class="revision-meta">Direvisi ${entry.revision_count}×${entry.revision_note ? ` · ${escapeHtml(entry.revision_note)}` : ""}${entry.original_amount != null ? ` · Asal ${money(entry.original_amount)}` : ""}</small>`
                    : "";
                return `<tr><td>${formatDate(entry.entry_date)}</td><td><strong>${escapeHtml(entry.entry_number)}</strong></td><td><strong>${escapeHtml(typeLabels[entry.entry_type] || entry.entry_type)}</strong><small class="table-subline">${escapeHtml(entry.description)}${items ? ` · ${escapeHtml(items)}` : ""}</small>${revision}</td><td>${escapeHtml(entry.debit_account)}</td><td>${escapeHtml(entry.credit_account)}</td><td><strong>${money(entry.amount)}</strong><div class="journal-row-actions"><button type="button" class="table-action revise-journal" data-revise-journal="${entry.journal_entry_id}">Revisi nominal</button><button type="button" class="table-action table-action-danger" data-delete-journal="${entry.journal_entry_id}" data-journal-number="${escapeHtml(entry.entry_number)}">Hapus</button></div></td></tr>`;
            }).join("")}`;
        }).join("")
        : `<tr><td colspan="6"><div class="empty-state">Tidak ada jurnal untuk jenis aktivitas yang dipilih.</div></td></tr>`;
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
    const amountReceived = Math.max(0, Number(document.getElementById("amountReceived").value) || 0);
    document.getElementById("saleChange").textContent = money(Math.max(0, amountReceived - total));
}

function setView(name) {
    document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === `${name}View`));
    document.querySelectorAll(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.view === name));
    document.getElementById("pageLabel").textContent = { dashboard: "Dashboard", customers: "Pelanggan", books: "Katalog buku", sales: "Penjualan", journal: "Jurnal Umum" }[name];
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
    document.getElementById("bookStock").disabled = Boolean(book);
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

function readAdjustmentItems() {
    return [...document.querySelectorAll(".adjustment-item-row")].map(row => ({
        bookId: row.querySelector("select").value,
        quantity: row.querySelector(".order-quantity").value,
        unitCost: row.querySelector(".order-cost").value
    }));
}

function renderAdjustmentItems(items = readAdjustmentItems()) {
    const rows = items.length ? items : [{ bookId: "", quantity: "1", unitCost: "" }];
    const container = document.getElementById("adjustmentItems");
    container.innerHTML = rows.map(item => `<div class="order-item-row adjustment-item-row">
        <select aria-label="Pilih buku"><option value="">Pilih buku</option>${state.books.map(book => `<option value="${book.id}" ${String(book.id) === String(item.bookId) ? "selected" : ""}>${escapeHtml(book.title)} · stok ${book.stock}</option>`).join("")}</select>
        <input class="order-quantity" type="number" min="1" step="1" value="${escapeHtml(item.quantity || 1)}" aria-label="Jumlah diterima">
        <input class="order-cost" type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(item.unitCost ?? "")}" placeholder="Nilai/unit" aria-label="Nilai per buku">
        <button type="button" class="remove-item" aria-label="Hapus buku">×</button>
    </div>`).join("");
    container.querySelectorAll("input,select").forEach(control => control.addEventListener("input", updateOrderTotal));
    container.querySelectorAll("select").forEach(select => select.addEventListener("change", event => {
        const row = event.target.closest(".adjustment-item-row");
        const adjustmentType = document.getElementById("adjustmentType").value;
        if (adjustmentType === "damaged" || adjustmentType === "lost") {
            const book = state.books.find(item => String(item.id) === event.target.value);
            if (book) row.querySelector(".order-cost").value = Number(book.price) || 0;
        }
        updateOrderTotal();
    }));
    container.querySelectorAll(".remove-item").forEach(button => button.addEventListener("click", () => {
        const current = readAdjustmentItems();
        current.splice([...container.querySelectorAll(".remove-item")].indexOf(button), 1);
        renderAdjustmentItems(current);
    }));
    updateOrderTotal();
}

function updateOrderTotal() {
    const total = readAdjustmentItems().reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitCost) || 0), 0);
    document.getElementById("adjustmentTotal").textContent = money(total);
}

function updateAdjustmentTypeFields() {
    const isRestock = document.getElementById("adjustmentType").value === "restock";
    document.getElementById("restockFields").hidden = !isRestock;
    document.getElementById("adjustmentSupplierName").required = isRestock;
    document.getElementById("adjustmentWarehouse").required = isRestock;
    document.getElementById("adjustmentItemsLabel").textContent = isRestock
        ? "JUMLAH DAN HARGA MODAL SATUAN"
        : "JUMLAH DAN NILAI PEROLEHAN SATUAN";

    document.querySelectorAll(".adjustment-item-row").forEach(row => {
        const select = row.querySelector("select");
        const costInput = row.querySelector(".order-cost");
        const book = state.books.find(item => String(item.id) === select.value);
        if (!isRestock && book) {
            costInput.value = Number(book.price) || 0;
        } else if (isRestock && costInput.value && !costInput.dataset.manualValue) {
            costInput.value = "";
        }
    });
    updateOrderTotal();
}

function openStockAdjustmentDialog() {
    document.getElementById("stockAdjustmentForm").reset();
    document.getElementById("adjustmentWarehouse").value = "Gudang Utama";
    updateAdjustmentTypeFields();
    renderAdjustmentItems([{ bookId: "", quantity: "1", unitCost: "" }]);
    document.getElementById("stockAdjustmentDialog").showModal();
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
document.getElementById("updateStockButton").addEventListener("click", openStockAdjustmentDialog);
document.getElementById("addCustomerButton").addEventListener("click", () => openCustomerDialog());
document.getElementById("addAdjustmentItem").addEventListener("click", () => renderAdjustmentItems([...readAdjustmentItems(), { bookId: "", quantity: "1", unitCost: "" }]));
document.getElementById("adjustmentType").addEventListener("change", updateAdjustmentTypeFields);
document.getElementById("journalTypeFilter").addEventListener("change", renderJournalEntries);

document.getElementById("addFinancialActivityButton").addEventListener("click", () => {
    const form = document.getElementById("financialActivityForm");
    form.reset();
    const now = new Date();
    document.getElementById("financialActivityDate").value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    document.getElementById("financialActivityDialog").showModal();
});
document.querySelector(".close-dialog").addEventListener("click", () => document.getElementById("bookDialog").close());
document.getElementById("cancelBook").addEventListener("click", () => document.getElementById("bookDialog").close());
document.querySelectorAll(".close-entity-dialog, .cancel-entity-dialog").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
document.querySelectorAll(".close-confirm-dialog").forEach(button => button.addEventListener("click", () => {
    pendingDelete = null;
    document.getElementById("confirmDialog").close();
}));
document.getElementById("confirmDeleteButton").addEventListener("click", async () => {
    const action = pendingDelete;
    pendingDelete = null;
    document.getElementById("confirmDialog").close();
    if (!action) return;
    try { await action(); } catch (error) { showToast(error.message); }
});
document.getElementById("booksTable").addEventListener("click", event => {
    const button = event.target.closest("[data-edit-book]");
    if (button) openBookDialog(state.books.find(book => String(book.id) === button.dataset.editBook));
});
document.getElementById("customersTable").addEventListener("click", event => {
    const editButton = event.target.closest("[data-edit-customer]");
    if (editButton) {
        openCustomerDialog(state.customers.find(item => item.customer_id === editButton.dataset.editCustomer));
        return;
    }
    const deleteButton = event.target.closest("[data-delete-customer]");
    if (deleteButton) {
        const customer = state.customers.find(item => item.customer_id === deleteButton.dataset.deleteCustomer);
        openDeleteConfirmation({
            title: `Hapus pelanggan ${customer?.name || "ini"}?`,
            copy: "Pelanggan akan dihapus. Riwayat penjualan lama tetap tersimpan beserta nama pelanggan pada struk.",
            onConfirm: async () => {
                await api(`/customers/${deleteButton.dataset.deleteCustomer}`, { method: "DELETE" });
                await loadData({ quiet: true });
                showToast("Pelanggan berhasil dihapus; riwayat transaksi tetap aman.");
            }
        });
    }
});
document.getElementById("salesHistory").addEventListener("click", event => {
    const button = event.target.closest("[data-print-sale]");
    if (button) {
        const sale = state.sales.find(item => String(item.sale_id) === button.dataset.printSale);
        if (sale) printSale(sale);
    }
});
document.getElementById("amountReceived").addEventListener("input", updateSaleTotal);

document.getElementById("journalEntriesTable").addEventListener("click", event => {
    const reviseButton = event.target.closest("[data-revise-journal]");
    if (reviseButton) {
        const entry = state.journalEntries.find(item => String(item.journal_entry_id) === reviseButton.dataset.reviseJournal);
        if (!entry) return;
        document.getElementById("journalRevisionForm").reset();
        document.getElementById("revisionJournalId").value = entry.journal_entry_id;
        document.getElementById("revisionCurrentAmount").value = money(entry.amount);
        document.getElementById("revisionAmount").value = entry.amount;
        document.getElementById("revisionNote").value = entry.revision_note || "";
        document.getElementById("journalRevisionDialog").showModal();
        return;
    }

    const deleteButton = event.target.closest("[data-delete-journal]");
    if (deleteButton) {
        const entry = state.journalEntries.find(item => String(item.journal_entry_id) === deleteButton.dataset.deleteJournal);
        const copy = entry?.entry_type === "sale"
            ? "Entri penjualan akan dihapus permanen. Stok akan dikembalikan dan transaksi penjualan terkait juga akan dihapus."
            : entry?.entry_type === "purchase" || entry?.entry_type === "restock"
                ? "Entri pembelian akan dihapus permanen. Jumlah pembelian akan dikurangi dari stok katalog."
                : entry?.entry_type === "damaged" || entry?.entry_type === "lost"
                    ? "Entri kerusakan atau kehilangan akan dihapus. Jumlah stok yang berkurang akan dikembalikan."
                    : "Entri jurnal keuangan akan dihapus permanen. Stok dan transaksi penjualan tidak akan berubah.";
        openDeleteConfirmation({
            title: `Hapus jurnal ${deleteButton.dataset.journalNumber}?`,
            copy,
            onConfirm: async () => {
                await api(`/journal-entries/${deleteButton.dataset.deleteJournal}`, { method: "DELETE" });
                await loadData({ quiet: true });
                showToast("Entri jurnal berhasil dihapus.");
            }
        });
    }
});

document.getElementById("journalRevisionForm").addEventListener("submit", async event => {
    event.preventDefault();
    const payload = {
        journal_entry_id: Number(document.getElementById("revisionJournalId").value),
        new_amount: Number(document.getElementById("revisionAmount").value),
        revision_note: document.getElementById("revisionNote").value.trim()
    };
    if (!Number.isFinite(payload.new_amount) || payload.new_amount <= 0) {
        showToast("Nominal revisi harus lebih dari nol.");
        return;
    }
    if (!payload.revision_note) {
        showToast("Alasan revisi wajib diisi.");
        return;
    }
    try {
        await api("/journal-revisions", { method: "POST", body: JSON.stringify(payload) });
        await loadData({ quiet: true });
        document.getElementById("journalRevisionDialog").close();
        showToast("Nominal jurnal berhasil direvisi.");
    } catch (error) { showToast(error.message); }
});

document.getElementById("bookForm").addEventListener("submit", async event => {
    event.preventDefault();
    const id = document.getElementById("bookId").value;
    const payload = { title: document.getElementById("bookTitle").value.trim(), author: document.getElementById("bookAuthor").value.trim(), category_id: document.getElementById("bookCategory").value || null, publisher: document.getElementById("bookPublisher").value.trim(), warehouse_location: document.getElementById("bookWarehouseLocation").value.trim(), price: Number(document.getElementById("bookPrice").value), ...(id ? {} : { stock: Number(document.getElementById("bookStock").value) }), minimum_stock: Number(document.getElementById("bookMinimum").value) };
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

document.getElementById("stockAdjustmentForm").addEventListener("submit", async event => {
    event.preventDefault();
    const items = readAdjustmentItems().filter(item => item.bookId).map(item => ({ book_id: item.bookId, quantity: Number(item.quantity), unit_cost: Number(item.unitCost) }));
    if (!items.length) { showToast("Pilih minimal satu buku untuk penyesuaian."); return; }
    if (items.some(item => !Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.unit_cost) || item.unit_cost <= 0)) {
        showToast("Jumlah dan nilai perolehan setiap buku harus lebih dari nol.");
        return;
    }
    const adjustmentType = document.getElementById("adjustmentType").value;
    for (const item of items) {
        const book = state.books.find(entry => String(entry.id) === String(item.book_id));
        if (adjustmentType !== "restock" && item.quantity > Number(book.stock)) {
            showToast(`Jumlah ${book.title} melebihi stok tersedia.`);
            return;
        }
    }
    const payload = {
        adjustment_type: adjustmentType,
        supplier_name: document.getElementById("adjustmentSupplierName").value.trim(),
        warehouse_location: document.getElementById("adjustmentWarehouse").value.trim(),
        credit_account: document.getElementById("adjustmentCreditAccount").value,
        notes: document.getElementById("adjustmentNotes").value.trim(),
        items
    };
    try {
        await api("/stock-adjustments", { method: "POST", body: JSON.stringify(payload) });
        if (adjustmentType !== "restock") {
        }
        await loadData({ quiet: true });
        document.getElementById("stockAdjustmentDialog").close();
        showToast("Mutasi stok tersimpan dan jurnal telah diperbarui.");
    } catch (error) { showToast(error.message); }
});

document.getElementById("financialActivityForm").addEventListener("submit", async event => {
    event.preventDefault();
    const date = document.getElementById("financialActivityDate").value;
    const payload = {
        activity_type: document.getElementById("financialActivityType").value,
        description: document.getElementById("financialActivityDescription").value.trim(),
        amount: Number(document.getElementById("financialActivityAmount").value),
        entry_date: date ? new Date(`${date}T00:00:00`).toISOString() : null
    };
    if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
        showToast("Nilai aktivitas harus lebih dari nol.");
        return;
    }
    try {
        await api("/journal-entries", { method: "POST", body: JSON.stringify(payload) });
        await loadData({ quiet: true });
        document.getElementById("financialActivityDialog").close();
        showToast("Aktivitas keuangan tersimpan di jurnal.");
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
    const customer = state.customers.find(item => item.customer_id === document.getElementById("saleCustomer").value);
    const total = items.reduce((sum, item) => {
        const book = state.books.find(entry => String(entry.id) === String(item.book_id));
        return sum + Number(book.price) * item.quantity;
    }, 0);
    const amountReceived = Number(document.getElementById("amountReceived").value);
    if (!Number.isFinite(amountReceived) || amountReceived < total) {
        showToast("Jumlah uang diterima tidak boleh kurang dari total transaksi.");
        return;
    }
    const payload = { customer_id: customer?.customer_id || null, customer_name: customer?.name || null, customer_phone: customer?.phone || null, payment_method: document.getElementById("paymentMethod").value, amount_received: amountReceived, items };
    try {
        await api("/sales", { method: "POST", body: JSON.stringify(payload) });
        await loadData({ quiet: true });
        document.getElementById("saleForm").reset();
        document.getElementById("saleItems").innerHTML = "";
        renderAll();
        showToast("Penjualan tersimpan dan stok telah diperbarui.");
    } catch (error) { showToast(error.message); }
});

renderAll();
loadData();
