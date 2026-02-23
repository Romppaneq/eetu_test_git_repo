/* ===== State ===== */
let allProducts = [];
let activeCategory = 'All';
let searchQuery = '';

/* ===== DOM refs ===== */
const productGrid = document.getElementById('productGrid');
const searchInput = document.getElementById('searchInput');
const categoryFilters = document.getElementById('categoryFilters');
const addModalOverlay = document.getElementById('addModalOverlay');
const editModalOverlay = document.getElementById('editModalOverlay');
const toast = document.getElementById('toast');

/* ===== API helpers ===== */
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ===== Toast ===== */
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

/* ===== Load & render ===== */
async function loadProducts() {
  try {
    allProducts = await apiFetch('/api/products');
    renderStats();
    renderCategoryFilters();
    renderProducts();
  } catch (e) {
    productGrid.innerHTML = `<div class="empty">⚠️ Could not load products: ${e.message}</div>`;
  }
}

function renderStats() {
  document.getElementById('statTotal').textContent = allProducts.length;
  document.getElementById('statItems').textContent = allProducts.reduce((s, p) => s + p.quantity, 0).toLocaleString();
  document.getElementById('statLow').textContent = allProducts.filter(p => p.quantity < 10).length;
  const cats = new Set(allProducts.map(p => p.category));
  document.getElementById('statCategories').textContent = cats.size;
}

function renderCategoryFilters() {
  const cats = ['All', ...[...new Set(allProducts.map(p => p.category))].sort()];

  // Fill datalist for add/edit forms
  const catList = document.getElementById('categoryList');
  catList.innerHTML = '';
  cats.filter(c => c !== 'All').forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    catList.appendChild(opt);
  });

  // Only rebuild buttons if set changed
  const existing = [...categoryFilters.querySelectorAll('.cat-btn')].map(b => b.dataset.cat);
  if (JSON.stringify(existing) === JSON.stringify(cats)) return;

  categoryFilters.innerHTML = '';
  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn' + (cat === activeCategory ? ' active' : '');
    btn.dataset.cat = cat;
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      activeCategory = cat;
      categoryFilters.querySelectorAll('.cat-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.cat === cat)
      );
      renderProducts();
    });
    categoryFilters.appendChild(btn);
  });
}

function filteredProducts() {
  return allProducts.filter(p => {
    const matchCat = activeCategory === 'All' || p.category === activeCategory;
    const matchSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery) ||
      p.description.toLowerCase().includes(searchQuery);
    return matchCat && matchSearch;
  });
}

function renderProducts() {
  const products = filteredProducts();
  if (products.length === 0) {
    productGrid.innerHTML = '<div class="empty">🌿 No products found.</div>';
    return;
  }
  productGrid.innerHTML = '';
  products.forEach(p => productGrid.appendChild(createCard(p)));
}

function createCard(p) {
  const card = document.createElement('div');
  card.className = 'product-card';
  card.dataset.id = p.id;

  let qtyBadge = '';
  if (p.quantity === 0) qtyBadge = '<span class="qty-badge out">Out of stock</span>';
  else if (p.quantity < 10) qtyBadge = '<span class="qty-badge low">Low stock</span>';

  card.innerHTML = `
    <div class="card-top">
      <span class="card-category">${escHtml(p.category)}</span>
      <div class="card-actions">
        <button class="btn-icon edit-btn" title="Edit product">✏️</button>
        <button class="btn-icon danger delete-btn" title="Delete product">🗑️</button>
      </div>
    </div>
    <div class="card-name">${escHtml(p.name)}</div>
    <div class="card-desc">${escHtml(p.description || '—')}</div>
    <div class="card-footer">
      <span class="card-price">€${p.price.toFixed(2)}</span>
      <div class="qty-control">
        ${qtyBadge}
        <button class="qty-btn qty-dec" title="Decrease quantity">−</button>
        <span class="qty-value">${p.quantity}</span>
        <button class="qty-btn qty-inc" title="Increase quantity">+</button>
      </div>
    </div>
  `;

  card.querySelector('.edit-btn').addEventListener('click', e => { e.stopPropagation(); openEditModal(p.id); });
  card.querySelector('.delete-btn').addEventListener('click', e => { e.stopPropagation(); deleteProduct(p.id, p.name); });
  card.querySelector('.qty-dec').addEventListener('click', e => { e.stopPropagation(); changeQty(p.id, -1); });
  card.querySelector('.qty-inc').addEventListener('click', e => { e.stopPropagation(); changeQty(p.id, 1); });
  card.addEventListener('click', () => openEditModal(p.id));

  return card;
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ===== Quantity change (optimistic) ===== */
async function changeQty(id, delta) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  const newQty = Math.max(0, p.quantity + delta);
  if (newQty === p.quantity) return;
  try {
    const updated = await apiFetch(`/api/products/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: newQty }),
    });
    const idx = allProducts.findIndex(x => x.id === id);
    allProducts[idx] = updated;
    renderStats();
    renderProducts();
  } catch (e) {
    showToast('⚠️ ' + e.message);
  }
}

/* ===== Delete ===== */
async function deleteProduct(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  try {
    await apiFetch(`/api/products/${id}`, { method: 'DELETE' });
    allProducts = allProducts.filter(p => p.id !== id);
    renderStats();
    renderCategoryFilters();
    renderProducts();
    showToast(`🗑️ "${name}" deleted`);
  } catch (e) {
    showToast('⚠️ ' + e.message);
  }
}

/* ===== Add Modal ===== */
document.getElementById('openAddModal').addEventListener('click', () => {
  document.getElementById('addProductForm').reset();
  addModalOverlay.classList.add('open');
  document.getElementById('addName').focus();
});
document.getElementById('closeAddModal').addEventListener('click', () => addModalOverlay.classList.remove('open'));
document.getElementById('cancelAdd').addEventListener('click', () => addModalOverlay.classList.remove('open'));
addModalOverlay.addEventListener('click', e => { if (e.target === addModalOverlay) addModalOverlay.classList.remove('open'); });

document.getElementById('addProductForm').addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    name: document.getElementById('addName').value,
    category: document.getElementById('addCategory').value,
    price: document.getElementById('addPrice').value,
    quantity: document.getElementById('addQuantity').value,
    description: document.getElementById('addDescription').value,
  };
  try {
    const created = await apiFetch('/api/products', { method: 'POST', body: JSON.stringify(body) });
    allProducts.push(created);
    renderStats();
    renderCategoryFilters();
    renderProducts();
    addModalOverlay.classList.remove('open');
    showToast(`✅ "${created.name}" added`);
  } catch (e) {
    showToast('⚠️ ' + e.message);
  }
});

/* ===== Edit Modal ===== */
function openEditModal(id) {
  const p = allProducts.find(x => x.id === id);
  if (!p) return;
  document.getElementById('editId').value = p.id;
  document.getElementById('editName').value = p.name;
  document.getElementById('editCategory').value = p.category;
  document.getElementById('editPrice').value = p.price;
  document.getElementById('editQuantity').value = p.quantity;
  document.getElementById('editDescription').value = p.description || '';
  editModalOverlay.classList.add('open');
  document.getElementById('editName').focus();
}
document.getElementById('closeEditModal').addEventListener('click', () => editModalOverlay.classList.remove('open'));
document.getElementById('cancelEdit').addEventListener('click', () => editModalOverlay.classList.remove('open'));
editModalOverlay.addEventListener('click', e => { if (e.target === editModalOverlay) editModalOverlay.classList.remove('open'); });

document.getElementById('editProductForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id = parseInt(document.getElementById('editId').value);
  const body = {
    name: document.getElementById('editName').value,
    category: document.getElementById('editCategory').value,
    price: document.getElementById('editPrice').value,
    quantity: document.getElementById('editQuantity').value,
    description: document.getElementById('editDescription').value,
  };
  try {
    const updated = await apiFetch(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    const idx = allProducts.findIndex(x => x.id === id);
    allProducts[idx] = updated;
    renderStats();
    renderCategoryFilters();
    renderProducts();
    editModalOverlay.classList.remove('open');
    showToast(`✅ "${updated.name}" updated`);
  } catch (e) {
    showToast('⚠️ ' + e.message);
  }
});

document.getElementById('deleteProductBtn').addEventListener('click', () => {
  const id = parseInt(document.getElementById('editId').value);
  const name = document.getElementById('editName').value;
  editModalOverlay.classList.remove('open');
  deleteProduct(id, name);
});

/* ===== Search ===== */
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.toLowerCase().trim();
  renderProducts();
});

/* ===== Keyboard shortcuts ===== */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    addModalOverlay.classList.remove('open');
    editModalOverlay.classList.remove('open');
  }
});

/* ===== Init ===== */
loadProducts();
