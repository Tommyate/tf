// ============================================================
// Adminseite: liest und schreibt data/products.json direkt über
// die GitHub Contents API. Der eigentliche Zugriffsschutz ist
// der GitHub Personal Access Token (fein-granular, nur Contents
// read/write auf DIESES Repo) — ohne gültigen Token mit
// Schreibrecht kann niemand etwas verändern, egal was im
// Browser sichtbar ist. Siehe README.md für Details.
// ============================================================

const DATA_PATH = "data/products.json";
const STORAGE_KEY = "funde_admin_config";

let config = null;   // { owner, repo, branch, token }
let products = [];
let currentSha = null;
let editingId = null;

const $ = (id) => document.getElementById(id);

// ---------- Start: gespeicherte Konfiguration prüfen ----------

(function init() {
  const saved = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      config = JSON.parse(saved);
      unlock(config, false);
    } catch { /* ignore, zeigt Login-Screen */ }
  }
})();

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const cfg = {
    owner: $("owner").value.trim(),
    repo: $("repo").value.trim(),
    branch: $("branch").value.trim() || "main",
    token: $("token").value.trim(),
  };
  await unlock(cfg, true, $("remember").checked);
});

async function unlock(cfg, isNewLogin, remember) {
  $("unlockBtn").disabled = true;
  $("lockError").innerHTML = "";
  try {
    await loadProductsFromGitHub(cfg);
    config = cfg;
    if (isNewLogin) {
      const store = remember ? localStorage : sessionStorage;
      store.setItem(STORAGE_KEY, JSON.stringify(cfg));
    }
    $("lockScreen").style.display = "none";
    $("adminShell").style.display = "block";
    renderList();
  } catch (err) {
    console.error(err);
    $("lockError").innerHTML = `<div class="notice warn">Zugriff fehlgeschlagen: ${escapeHtml(err.message)}</div>`;
    clearStoredConfig();
  } finally {
    $("unlockBtn").disabled = false;
  }
}

$("logoutBtn").addEventListener("click", () => {
  clearStoredConfig();
  location.reload();
});

function clearStoredConfig() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

// ---------- GitHub API ----------

function apiUrl(path) {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`;
}

async function ghFetch(path, options = {}) {
  const res = await fetch(apiUrl(path) + (options.query || ""), {
    ...options,
    headers: {
      "Authorization": `Bearer ${config.token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `GitHub-API-Fehler (${res.status})`);
  }
  return res.json();
}

async function loadProductsFromGitHub(cfg) {
  const prevConfig = config;
  config = cfg; // temporär setzen, damit apiUrl() funktioniert
  try {
    const data = await ghFetch(DATA_PATH, { query: `?ref=${encodeURIComponent(cfg.branch)}` });
    currentSha = data.sha;
    const decoded = b64DecodeUnicode(data.content.replace(/\n/g, ""));
    products = JSON.parse(decoded);
  } catch (err) {
    config = prevConfig;
    throw err;
  }
}

async function saveProductsToGitHub(commitMessage) {
  const body = {
    message: commitMessage,
    content: b64EncodeUnicode(JSON.stringify(products, null, 2)),
    sha: currentSha,
    branch: config.branch,
  };
  const res = await ghFetch(DATA_PATH, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  currentSha = res.content.sha;
}

// ---------- Formular: Hinzufügen / Bearbeiten ----------

$("productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const entry = {
    id: editingId || String(Date.now()),
    title: $("title").value.trim(),
    description: $("description").value.trim(),
    price: $("price").value.trim(),
    category: $("category").value.trim(),
    image: $("image").value.trim(),
    link: $("link").value.trim(),
    featured: $("featured").checked,
  };

  const saveBtn = $("saveBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Speichere …";

  try {
    if (editingId) {
      const idx = products.findIndex(p => p.id === editingId);
      if (idx > -1) products[idx] = entry;
      await saveProductsToGitHub(`Fund aktualisiert: ${entry.title}`);
    } else {
      products.push(entry);
      await saveProductsToGitHub(`Fund hinzugefügt: ${entry.title}`);
    }
    showNotice("formNotice", "Gespeichert und veröffentlicht.", false);
    resetForm();
    renderList();
  } catch (err) {
    showNotice("formNotice", "Fehler beim Speichern: " + err.message, true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Speichern & veröffentlichen";
  }
});

$("cancelEdit").addEventListener("click", resetForm);

function resetForm() {
  editingId = null;
  $("productForm").reset();
  $("formTitle").textContent = "Neuen Fund hinzufügen";
  $("cancelEdit").style.display = "none";
}

function startEdit(id) {
  const p = products.find(p => p.id === id);
  if (!p) return;
  editingId = id;
  $("title").value = p.title || "";
  $("description").value = p.description || "";
  $("price").value = p.price || "";
  $("category").value = p.category || "";
  $("image").value = p.image || "";
  $("link").value = p.link || "";
  $("featured").checked = !!p.featured;
  $("formTitle").textContent = "Fund bearbeiten";
  $("cancelEdit").style.display = "inline-flex";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function removeProduct(id) {
  const p = products.find(p => p.id === id);
  if (!p) return;
  if (!confirm(`„${p.title}“ wirklich löschen und den Commit veröffentlichen?`)) return;
  products = products.filter(p => p.id !== id);
  try {
    await saveProductsToGitHub(`Fund gelöscht: ${p.title}`);
    renderList();
  } catch (err) {
    alert("Fehler beim Löschen: " + err.message);
  }
}

// ---------- Liste rendern ----------

function renderList() {
  $("countBadge").textContent = products.length;
  const list = $("adminList");
  if (products.length === 0) {
    list.innerHTML = `<div class="notice">Noch keine Funde hinterlegt.</div>`;
    return;
  }
  list.innerHTML = products.map(p => `
    <div class="admin-row">
      <img src="${escapeAttr(p.image || "")}" alt="" onerror="this.style.visibility='hidden'">
      <div>
        <div class="title">${escapeHtml(p.title || "Ohne Titel")}</div>
        <div class="sub">${escapeHtml(p.price || "")}${p.category ? " · " + escapeHtml(p.category) : ""}</div>
      </div>
      <div class="actions">
        <button class="btn secondary small" data-edit="${escapeAttr(p.id)}">Bearbeiten</button>
        <button class="btn danger small" data-del="${escapeAttr(p.id)}">Löschen</button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll("[data-edit]").forEach(btn =>
    btn.addEventListener("click", () => startEdit(btn.dataset.edit)));
  list.querySelectorAll("[data-del]").forEach(btn =>
    btn.addEventListener("click", () => removeProduct(btn.dataset.del)));
}

// ---------- Hilfsfunktionen ----------

function showNotice(elId, msg, isError) {
  const el = $(elId);
  el.innerHTML = `<div class="notice ${isError ? "warn" : ""}">${escapeHtml(msg)}</div>`;
  setTimeout(() => { el.innerHTML = ""; }, 5000);
}

function b64EncodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
    (_, p1) => String.fromCharCode("0x" + p1)));
}
function b64DecodeUnicode(str) {
  return decodeURIComponent(atob(str).split("").map(c =>
    "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
}
function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[s]));
}
function escapeAttr(str = "") { return escapeHtml(str); }
