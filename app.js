// ============================================================
// Öffentliche Seite: lädt data/products.json und rendert die
// Fund-Karten. Reine Anzeige – keine Schreibrechte, keine Keys.
// ============================================================

const DATA_URL = "data/products.json";

let allProducts = [];
let activeCategory = "Alle";

document.getElementById("year").textContent = new Date().getFullYear();

async function loadProducts() {
  const grid = document.getElementById("grid");
  try {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("products.json nicht erreichbar (" + res.status + ")");
    allProducts = await res.json();
  } catch (err) {
    grid.innerHTML = `<div class="empty">Funde konnten nicht geladen werden.<br>` +
      `Prüfe, ob <code>data/products.json</code> existiert und die Seite über GitHub Pages (nicht als lokale Datei) geöffnet wird.</div>`;
    console.error(err);
    return;
  }
  renderFilters();
  renderGrid();
}

function renderFilters() {
  const filters = document.getElementById("filters");
  const categories = ["Alle", ...new Set(allProducts.map(p => p.category).filter(Boolean))];

  filters.innerHTML = categories.map(cat => `
    <button class="chip ${cat === activeCategory ? "active" : ""}" data-cat="${escapeAttr(cat)}">
      ${escapeHtml(cat)}
    </button>
  `).join("");

  filters.querySelectorAll(".chip").forEach(btn => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.cat;
      renderFilters();
      renderGrid();
    });
  });
}

function renderGrid() {
  const grid = document.getElementById("grid");
  const list = allProducts
    .filter(p => activeCategory === "Alle" || p.category === activeCategory)
    // Featured-Funde zuerst, sonst neueste zuerst (Reihenfolge im JSON = Reihenfolge der Aufnahme)
    .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));

  if (list.length === 0) {
    grid.innerHTML = `<div class="empty">Für diese Kategorie ist noch nichts hinterlegt.</div>`;
    return;
  }

  grid.innerHTML = list.map((p, i) => `
    <a class="find-card ${p.featured ? "featured" : ""}" href="${escapeAttr(p.link || "#")}" target="_blank" rel="noopener sponsored">
      <img class="thumb" src="${escapeAttr(p.image || "")}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <div class="body">
        <div class="tagno">FUND № ${String(i + 1).padStart(3, "0")}</div>
        <h3>${escapeHtml(p.title || "Ohne Titel")}</h3>
        <p>${escapeHtml(p.description || "")}</p>
        <div class="meta">
          ${p.price ? `<span class="price">${escapeHtml(p.price)}</span>` : ""}
          ${p.category ? `<span class="cat">${escapeHtml(p.category)}</span>` : ""}
        </div>
      </div>
      <span class="arrow">↗</span>
    </a>
  `).join("");
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[s]));
}
function escapeAttr(str = "") { return escapeHtml(str); }

loadProducts();
