const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { supabaseUrl, serviceRoleKey } = require("./config");

const frontendRoot = path.resolve(__dirname, "../frontend");
const port = Number(process.env.PORT) || 3000;
const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon"
};

class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function sendJson(response, status, data) {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify(data));
}

function readJson(request) {
    return new Promise((resolve, reject) => {
        let body = "";
        request.on("data", chunk => {
            body += chunk;
            if (body.length > 1024 * 1024) {
                reject(new ApiError(413, "Ukuran permintaan melebihi 1 MB."));
                request.destroy();
            }
        });
        request.on("end", () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch { reject(new ApiError(400, "Format JSON tidak valid.")); }
        });
        request.on("error", reject);
    });
}

async function supabaseRequest(endpoint, options = {}) {
    if (!supabaseUrl || !serviceRoleKey) {
        throw new ApiError(503, "PostgreSQL belum dikonfigurasi. Atur SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY pada environment backend.");
    }
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/${endpoint}`, {
        ...options,
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });
    const text = await response.text();
    let result;
    try { result = text ? JSON.parse(text) : null; }
    catch { result = text; }
    if (!response.ok) {
        const message = result?.message || result?.details || "Permintaan Supabase gagal.";
        throw new ApiError(response.status === 404 ? 404 : 400, message);
    }
    return result;
}

async function serveStatic(response, pathname) {
    let decodedPath;
    try { decodedPath = decodeURIComponent(pathname); }
    catch { throw new ApiError(400, "Alamat halaman tidak valid."); }
    const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
    const filePath = path.resolve(frontendRoot, relativePath);
    if (!filePath.startsWith(`${frontendRoot}${path.sep}`)) throw new ApiError(403, "Akses file ditolak.");
    let stats;
    try { stats = await fs.promises.stat(filePath); }
    catch { throw new ApiError(404, "Halaman tidak ditemukan."); }
    if (!stats.isFile()) throw new ApiError(404, "Halaman tidak ditemukan.");
    response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(filePath).pipe(response);
}

async function handleApi(request, response, url) {
    const route = url.pathname.replace(/^\/api/, "");
    if (route === "/health" && request.method === "GET") {
        return sendJson(response, 200, { status: "ok", supabaseConfigured: Boolean(supabaseUrl && serviceRoleKey) });
    }

    if (route === "/categories" && request.method === "GET") {
        const books = await supabaseRequest("books?select=category&order=category.asc");
        const categories = [...new Set(books.map(book => book.category).filter(Boolean))];
        return sendJson(response, 200, categories.map(name => ({ id: name, name })));
    }

    if (route === "/books" && request.method === "GET") {
        const books = await supabaseRequest("books?select=book_id,isbn,title,author,publisher,category,price,stock,min_stock,is_active&order=title.asc");
        return sendJson(response, 200, books.map(normalizeBook));
    }
    if (route === "/books" && request.method === "POST") {
        const body = await readJson(request);
        validateBook(body);
        const data = await supabaseRequest("books", {
            method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(bookPayload(body))
        });
        return sendJson(response, 201, normalizeBook(data[0]));
    }
    const bookMatch = route.match(/^\/books\/([^/]+)$/);
    if (bookMatch && request.method === "PATCH") {
        const body = await readJson(request);
        validateBook(body);
        const data = await supabaseRequest(`books?book_id=eq.${encodeURIComponent(bookMatch[1])}`, {
            method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(bookPayload(body))
        });
        if (!data.length) throw new ApiError(404, "Buku tidak ditemukan.");
        return sendJson(response, 200, normalizeBook(data[0]));
    }

    if (route === "/sales" && request.method === "GET") {
        const data = await supabaseRequest("sales?select=*,customers(name,phone),sale_items(sale_item_id,book_id,quantity,unit_price,books(title))&order=sold_at.desc&limit=100");
        return sendJson(response, 200, data.map(sale => ({
            ...sale,
            receipt_number: sale.receipt_number,
            customer_name: sale.customers?.name || "Pelanggan umum",
            sale_items: sale.sale_items || []
        })));
    }
    if (route === "/sales" && request.method === "POST") {
        const body = await readJson(request);
        validateSale(body);
        const data = await supabaseRequest("rpc/record_sale", {
            method: "POST",
            body: JSON.stringify({
                p_customer_id: body.customer_id || null,
                p_customer_name: body.customer_name || "Pelanggan umum",
                p_customer_phone: body.customer_phone || null,
                p_payment_method: body.payment_method,
                p_amount_received: body.amount_received,
                p_items: body.items
            })
        });
        return sendJson(response, 201, data);
    }

    throw new ApiError(404, "Endpoint tidak ditemukan.");
}

function validateBook(book) {
    if (!book.title?.trim() || !book.author?.trim()) throw new ApiError(400, "Judul dan penulis wajib diisi.");
    if (!Number.isFinite(Number(book.price)) || Number(book.price) < 0) throw new ApiError(400, "Harga harus berupa angka nol atau lebih.");
    if (!Number.isInteger(Number(book.stock)) || Number(book.stock) < 0) throw new ApiError(400, "Stok harus berupa bilangan bulat nol atau lebih.");
    if (!Number.isInteger(Number(book.minimum_stock)) || Number(book.minimum_stock) < 0) throw new ApiError(400, "Batas stok minimum tidak valid.");
}

function bookPayload(book) {
    return {
        ...(book.isbn?.trim() ? { isbn: book.isbn.trim() } : {}),
        title: book.title.trim(),
        author: book.author.trim(),
        publisher: book.publisher?.trim() || "Nala",
        category: book.category_id || null,
        price: Number(book.price),
        stock: Number(book.stock),
        min_stock: Number(book.minimum_stock),
        is_active: true
    };
}

function normalizeBook(book) {
    return {
        ...book,
        id: book.book_id,
        category_id: book.category,
        minimum_stock: book.min_stock
    };
}

function validateSale(sale) {
    if (!Array.isArray(sale.items) || sale.items.length === 0) throw new ApiError(400, "Pilih minimal satu buku untuk penjualan.");
    if (!["Tunai", "Debit", "Transfer", "QRIS"].includes(sale.payment_method)) throw new ApiError(400, "Metode pembayaran tidak valid.");
    if (!Number.isFinite(Number(sale.amount_received)) || Number(sale.amount_received) < 0) throw new ApiError(400, "Jumlah uang diterima tidak valid.");
    if (sale.items.some(item => !String(item.book_id || "").trim() || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0)) {
        throw new ApiError(400, "Buku atau jumlah pada transaksi tidak valid.");
    }
}

const server = http.createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
        response.writeHead(204, { Allow: "GET, POST, PATCH, OPTIONS" });
        return response.end();
    }
    try {
        const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
        if (url.pathname.startsWith("/api/")) return await handleApi(request, response, url);
        if (!["GET", "HEAD"].includes(request.method)) throw new ApiError(405, "Metode tidak diizinkan.");
        await serveStatic(response, url.pathname);
    } catch (error) {
        const status = error instanceof ApiError ? error.status : 500;
        if (status === 500) console.error(error);
        if (!response.headersSent) sendJson(response, status, { error: error.message || "Terjadi kesalahan pada server." });
        else response.destroy();
    }
});

server.listen(port, () => {
    console.log(`Toko Buku Nala berjalan di http://localhost:${port}`);
    if (!serviceRoleKey) console.warn("Database belum dikonfigurasi. Atur SUPABASE_SERVICE_ROLE_KEY sebelum memakai aplikasi.");
});
