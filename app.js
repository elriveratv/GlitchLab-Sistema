/**
 * GlitchLab - Sistema de Gestión de Órdenes de Servicio
 * Especialistas en Microelectrónica & Computadoras
 * Versión Integral:
 * - Enumeración secuencial GL-0001, GL-0002...
 * - Portal de Rastreo Público para Clientes (Tracking por Folio/Teléfono y QR)
 * - Etiquetas Adhesivas / Stickers Térmicos para Equipos y Cargadores
 * - Control Automático de Garantías con Semáforo
 * - Plantillas Rápidas de Mensajes WhatsApp
 * - Inventario de Refacciones y Componentes
 * - Corte de Caja, Métricas Financieras y Exportación a Excel (CSV)
 * - Autocompletado de Clientes Frecuentes
 */

// Estado global de la aplicación
const AppState = {
  orders: [],
  clients: [],
  inventory: [],
  currentOrder: null,
  activeBitacoraOrderId: null,
  filterStatus: 'all',
  searchQuery: '',
  viewMode: 'grid', // 'grid' o 'list'
  auth: {
    isAuthenticated: false,
    currentUser: null,
    users: []
  },
  supabase: {
    url: 'https://afknnllubatfpmzeryrn.supabase.co',
    anonKey: 'sb_publishable_I5zi2yxOUUKinRm2BjSiGA_PKH5W9hU',
    bucket: 'order-photos',
    client: null,
    isConnected: false,
    lastSync: null
  },
  shopConfig: {
    name: 'GlitchLab',
    slogan: 'Especialistas en Microelectrónica',
    phone: '+52 311 339 6969',
    whatsapp: '3113396969',
    email: 'contacto@glitchlab.mx',
    address: 'Calle Uruapan #2, Villas de la Paz, 63198 Tepic, Nay.',
    terms: '1. Diagnóstico tiene un lapso de 24 a 48 hrs hábiles.\n2. Equipos no recogidos después de 30 días generarán costo de almacenaje.\n3. La empresa no se hace responsable por pérdida de datos; el cliente debe respaldar su información.\n4. Garantía de 30 a 90 días exclusivamente en el componente o trabajo reparado.',
    warrantyDays: 30,
    currencySymbol: '$'
  }
};

// Canvas de Firma
let signatureCanvas = null;
let signatureCtx = null;
let isDrawing = false;
let hasSignature = false;

// Inicialización al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  loadUsers();
  loadConfig();
  loadSupabaseConfig();
  loadClients();
  loadOrders();
  loadInventory();
  setupSignaturePad();
  setupEventListeners();
  setupAuthListeners();
  setupTrackingListeners();
  setupAutocompleteListeners();
  checkInitialAuth();
  checkUrlTrackingParam();
  initSupabase(false);
});

// ==========================================
// 1. ENUMERACIÓN SECUENCIAL PURAMENTE NUMÉRICA (#1, #2, #3...)
// ==========================================

function generateNextFolio() {
  let maxNum = 0;
  
  AppState.orders.forEach(order => {
    if (order.id) {
      const digits = order.id.toString().replace(/\D/g, '');
      const num = parseInt(digits, 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  });

  // Secuencia puramente numérica iniciando desde 1
  return (maxNum + 1).toString();
}

// ==========================================
// 2. GESTIÓN DE ROLES Y MULTI-USUARIOS
// ==========================================

const RoleMeta = {
  admin: { label: 'Administrador', badge: 'bg-purple-950 text-purple-300 border-purple-800' },
  technician: { label: 'Técnico Especialista', badge: 'bg-sky-950 text-sky-300 border-sky-800' },
  reception: { label: 'Recepción / Mostrador', badge: 'bg-emerald-950 text-emerald-300 border-emerald-800' }
};

function loadUsers() {
  const saved = localStorage.getItem('glitchlab_users');
  if (saved) {
    try {
      AppState.auth.users = JSON.parse(saved);
    } catch (e) {
      console.error('Error cargando usuarios:', e);
      AppState.auth.users = [];
    }
  }

  if (!AppState.auth.users || AppState.auth.users.length === 0) {
    AppState.auth.users = [
      { id: 'u_1', name: 'Administrador General', username: 'admin', password: 'glitchlab2026', role: 'admin' },
      { id: 'u_2', name: 'Ing. Rivera', username: 'rivera', password: '1234', role: 'technician' },
      { id: 'u_3', name: 'Recepción Mostrador', username: 'recepcion', password: '1234', role: 'reception' }
    ];
    saveUsers();
  }
}

function saveUsers() {
  localStorage.setItem('glitchlab_users', JSON.stringify(AppState.auth.users));
}

function checkInitialAuth() {
  const sessionUser = sessionStorage.getItem('glitchlab_logged_user');
  const rememberUser = localStorage.getItem('glitchlab_remember_user');
  const usernameToFind = sessionUser || rememberUser;

  if (usernameToFind) {
    const user = AppState.auth.users.find(u => u.username === usernameToFind);
    if (user) {
      grantAccess(user);
      return;
    }
  }
  
  lockSystem();
}

function setupAuthListeners() {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
  }

  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', handleLogout);
  }

  const btnToggleLoginPass = document.getElementById('btnToggleLoginPass');
  const loginPassword = document.getElementById('loginPassword');
  if (btnToggleLoginPass && loginPassword) {
    btnToggleLoginPass.addEventListener('click', () => {
      if (loginPassword.type === 'password') {
        loginPassword.type = 'text';
        btnToggleLoginPass.innerHTML = '<i class="fas fa-eye-slash"></i>';
      } else {
        loginPassword.type = 'password';
        btnToggleLoginPass.innerHTML = '<i class="fas fa-eye"></i>';
      }
    });
  }

  const newUserForm = document.getElementById('newUserForm');
  if (newUserForm) {
    newUserForm.addEventListener('submit', handleCreateNewUser);
  }
}

function handleLoginSubmit(e) {
  e.preventDefault();

  const userField = document.getElementById('loginUsername');
  const passField = document.getElementById('loginPassword');
  const rememberCheckbox = document.getElementById('rememberMeCheckbox');
  const errorMsg = document.getElementById('loginErrorMessage');
  const loginCard = document.getElementById('loginCard');

  const usernameInput = userField.value.trim().toLowerCase();
  const passwordInput = passField.value.trim();

  const matchedUser = AppState.auth.users.find(u => 
    u.username.toLowerCase() === usernameInput && u.password === passwordInput
  );

  if (matchedUser) {
    errorMsg.classList.add('hidden');

    if (rememberCheckbox && rememberCheckbox.checked) {
      localStorage.setItem('glitchlab_remember_user', matchedUser.username);
    } else {
      localStorage.removeItem('glitchlab_remember_user');
    }

    sessionStorage.setItem('glitchlab_logged_user', matchedUser.username);
    grantAccess(matchedUser);

    userField.value = '';
    passField.value = '';
    showToast(`Bienvenido, ${matchedUser.name}.`);
  } else {
    errorMsg.classList.remove('hidden');
    loginCard.classList.remove('animate-shake');
    void loginCard.offsetWidth;
    loginCard.classList.add('animate-shake');
    passField.value = '';
    passField.focus();
  }
}

function grantAccess(user) {
  AppState.auth.isAuthenticated = true;
  AppState.auth.currentUser = user;

  const loginScreen = document.getElementById('loginScreen');
  const mainApp = document.getElementById('mainApp');
  const navUserBadge = document.getElementById('navUserBadge');
  const navUserRole = document.getElementById('navUserRole');

  if (loginScreen) loginScreen.classList.add('hidden');
  if (mainApp) mainApp.classList.remove('hidden');
  
  if (navUserBadge) navUserBadge.innerText = user.name || user.username;
  if (navUserRole) navUserRole.innerText = RoleMeta[user.role]?.label || user.role;

  const techInput = document.getElementById('technicianName');
  if (techInput) techInput.value = user.name || user.username;

  const bitacoraTech = document.getElementById('bitacoraTechnician');
  if (bitacoraTech) bitacoraTech.value = user.name || user.username;

  renderDashboard();
  renderOrders();
}

function lockSystem() {
  AppState.auth.isAuthenticated = false;
  AppState.auth.currentUser = null;

  const loginScreen = document.getElementById('loginScreen');
  const mainApp = document.getElementById('mainApp');

  if (mainApp) mainApp.classList.add('hidden');
  if (loginScreen) {
    loginScreen.classList.remove('hidden');
    const userField = document.getElementById('loginUsername');
    if (userField) userField.focus();
  }
}

function handleLogout() {
  if (confirm('¿Deseas cerrar tu sesión de trabajo en GlitchLab?')) {
    sessionStorage.removeItem('glitchlab_logged_user');
    localStorage.removeItem('glitchlab_remember_user');
    lockSystem();
    showToast('Sesión cerrada correctamente.');
  }
}

function handleCreateNewUser(e) {
  e.preventDefault();

  const name = document.getElementById('newUserName').value.trim();
  const username = document.getElementById('newUserUsername').value.trim().toLowerCase();
  const password = document.getElementById('newUserPassword').value.trim();
  const role = document.getElementById('newUserRole').value;

  if (username.length < 3) {
    alert('El usuario debe tener al menos 3 caracteres.');
    return;
  }

  if (password.length < 4) {
    alert('La contraseña debe tener al menos 4 caracteres.');
    return;
  }

  if (AppState.auth.users.some(u => u.username.toLowerCase() === username)) {
    alert(`El usuario "${username}" ya está registrado. Elige otro.`);
    return;
  }

  const newUser = { id: 'u_' + Date.now(), name, username, password, role };
  AppState.auth.users.push(newUser);
  saveUsers();
  renderUsersList();

  document.getElementById('newUserName').value = '';
  document.getElementById('newUserUsername').value = '';
  document.getElementById('newUserPassword').value = '';

  showToast(`Usuario "${name}" creado exitosamente.`);
}

function renderUsersList() {
  const container = document.getElementById('usersListTableBody');
  if (!container) return;

  const currentLoggedIn = AppState.auth.currentUser?.username;

  container.innerHTML = AppState.auth.users.map(u => {
    const roleInfo = RoleMeta[u.role] || RoleMeta.technician;
    const isMe = u.username === currentLoggedIn;

    return `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
        <td class="py-2.5 px-3">
          <div class="font-bold text-white flex items-center gap-1.5">
            ${escapeHtml(u.name)}
            ${isMe ? '<span class="text-[10px] text-sky-400 font-normal">(Tú)</span>' : ''}
          </div>
          <div class="text-[11px] text-slate-400 font-mono">@${escapeHtml(u.username)}</div>
        </td>
        <td class="py-2.5 px-3">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${roleInfo.badge}">
            ${roleInfo.label}
          </span>
        </td>
        <td class="py-2.5 px-3 text-slate-400 font-mono text-[11px]">••••••••</td>
        <td class="py-2.5 px-3 text-right">
          ${isMe ? `
            <span class="text-slate-600 text-[11px] italic">Activo</span>
          ` : `
            <button onclick="deleteUser('${u.id}')" class="p-1.5 text-slate-500 hover:text-red-400 transition" title="Eliminar usuario">
              <i class="fas fa-trash-can"></i>
            </button>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

function deleteUser(userId) {
  const user = AppState.auth.users.find(u => u.id === userId);
  if (!user) return;

  if (AppState.auth.currentUser?.id === userId) {
    alert('No puedes eliminar tu propio usuario activo.');
    return;
  }

  const remainingAdmins = AppState.auth.users.filter(u => u.id !== userId && u.role === 'admin');
  if (user.role === 'admin' && remainingAdmins.length === 0) {
    alert('No puedes eliminar el único administrador del sistema.');
    return;
  }

  if (confirm(`¿Eliminar al usuario "${user.name}" (@${user.username})?`)) {
    AppState.auth.users = AppState.auth.users.filter(u => u.id !== userId);
    saveUsers();
    renderUsersList();
    showToast(`Usuario "${user.name}" eliminado.`);
  }
}

// ==========================================
// 3. PORTAL DE RASTREO PÚBLICO PARA CLIENTES
// ==========================================

function setupTrackingListeners() {
  const btnOpenTracking = document.getElementById('btnOpenTracking');
  if (btnOpenTracking) {
    btnOpenTracking.addEventListener('click', () => {
      document.getElementById('clientTrackingModal').classList.remove('hidden');
    });
  }

  const trackingForm = document.getElementById('clientTrackingForm');
  if (trackingForm) {
    trackingForm.addEventListener('submit', handleClientTrackingSearch);
  }
}

function checkUrlTrackingParam() {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#track=')) {
    const folio = decodeURIComponent(hash.replace('#track=', '')).trim();
    if (folio) {
      document.getElementById('clientTrackingModal').classList.remove('hidden');
      document.getElementById('trackFolioInput').value = folio;
      searchTrackingOrder(folio, '');
    }
  }
}

function handleClientTrackingSearch(e) {
  e.preventDefault();
  const folio = document.getElementById('trackFolioInput').value.trim();
  const phone = document.getElementById('trackPhoneInput').value.trim();
  searchTrackingOrder(folio, phone);
}

async function searchTrackingOrder(folio, phone) {
  const resultContainer = document.getElementById('trackingResultContainer');
  const errorContainer = document.getElementById('trackingError');

  const cleanFolio = folio.toUpperCase().replace(/^#/, '').trim();
  const cleanPhone = phone.replace(/\D/g, '');

  let order = AppState.orders.find(o => {
    const orderIdClean = (o.id || '').toString().toUpperCase().replace(/^#/, '').trim();
    const matchFolio = orderIdClean === cleanFolio || (o.id || '').toUpperCase() === cleanFolio;
    if (!matchFolio) return false;
    if (!cleanPhone) return true; // Si escanea QR directo
    const orderPhone = (o.client?.phone || '').replace(/\D/g, '');
    return orderPhone.endsWith(cleanPhone) || cleanPhone.endsWith(orderPhone);
  });

  // Si no se encuentra en el almacenamiento local pero Supabase está conectado, consultar en Supabase
  if (!order && AppState.supabase.client) {
    try {
      const { data: dbOrder, error } = await AppState.supabase.client
        .from('orders')
        .select('*')
        .eq('id', cleanFolio)
        .maybeSingle();

      if (dbOrder && !error) {
        const mappedOrder = mapSupabaseOrderToLocal(dbOrder);
        const orderPhone = (mappedOrder.client?.phone || '').replace(/\D/g, '');
        if (!cleanPhone || orderPhone.endsWith(cleanPhone) || cleanPhone.endsWith(orderPhone)) {
          order = mappedOrder;
        }
      }
    } catch (err) {
      console.warn('Error buscando orden en Supabase:', err);
    }
  }

  if (!order) {
    resultContainer.classList.add('hidden');
    errorContainer.classList.remove('hidden');
    return;
  }

  errorContainer.classList.add('hidden');
  resultContainer.classList.remove('hidden');

  renderTrackingOrderView(order);
}

function renderTrackingOrderView(order) {
  // Llenar datos de la orden en vista de cliente
  document.getElementById('trackResultFolio').innerText = order.id;
  document.getElementById('trackResultClient').innerText = order.client.name;
  document.getElementById('trackResultEquipment').innerText = `${order.equipment.type} ${order.equipment.brand} ${order.equipment.model}`;
  document.getElementById('trackResultDate').innerText = new Date(order.date).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // Barra de progreso y pasos
  const steps = ['received', 'diagnostic', 'in_progress', 'ready', 'delivered'];
  const stepIndex = steps.indexOf(order.status);
  
  steps.forEach((step, idx) => {
    const el = document.getElementById(`step-${step}`);
    if (el) {
      if (idx <= (stepIndex >= 0 ? stepIndex : 0)) {
        el.className = 'w-7 h-7 rounded-full bg-sky-500 text-white flex items-center justify-center text-xs font-bold ring-4 ring-sky-950';
      } else {
        el.className = 'w-7 h-7 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center text-xs font-bold';
      }
    }
  });

  const meta = StatusMeta[order.status] || StatusMeta.received;
  document.getElementById('trackStatusBadge').innerHTML = `
    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${meta.color}">
      <i class="fas ${meta.icon}"></i> ${meta.label}
    </span>
  `;

  document.getElementById('trackIssue').innerText = order.issue || 'No especificada';
  document.getElementById('trackDiagnosis').innerText = order.initialDiagnosis || 'En proceso de revisión por los ingenieros de laboratorio.';

  // Finanzas públicas
  const est = (order.costs?.estimated || 0).toLocaleString('es-MX');
  const adv = (order.costs?.advance || 0).toLocaleString('es-MX');
  const bal = (order.costs?.balance || 0).toLocaleString('es-MX');

  document.getElementById('trackEstCost').innerText = `$${est} MXN`;
  document.getElementById('trackAdvCost').innerText = `-$${adv} MXN`;
  document.getElementById('trackBalCost').innerText = `$${bal} MXN`;

  // Fotos de evidencia técnica para el cliente
  const photoContainer = document.getElementById('trackPhotosContainer');
  if (order.photos && order.photos.length > 0) {
    photoContainer.innerHTML = order.photos.map(p => `
      <div class="aspect-video rounded-xl overflow-hidden bg-black border border-slate-800 cursor-pointer" onclick="openLightbox('${p.url}', '${escapeHtml(p.caption || '')}')">
        <img src="${p.url}" class="w-full h-full object-cover hover:scale-105 transition" />
      </div>
    `).join('');
    document.getElementById('trackPhotosSection').classList.remove('hidden');
  } else {
    document.getElementById('trackPhotosSection').classList.add('hidden');
  }

  // Bitácora pública de avances
  const logContainer = document.getElementById('trackLogsContainer');
  if (order.bitacora && order.bitacora.length > 0) {
    logContainer.innerHTML = order.bitacora.map(b => `
      <div class="p-3 bg-slate-900/60 rounded-xl border border-slate-800 text-xs">
        <div class="flex items-center justify-between text-slate-400 mb-1">
          <span class="font-bold text-white">${escapeHtml(b.title)}</span>
          <span class="font-mono text-[10px]">${new Date(b.date).toLocaleDateString('es-MX')}</span>
        </div>
        <p class="text-slate-300">${escapeHtml(b.notes)}</p>
      </div>
    `).join('');
    document.getElementById('trackLogsSection').classList.remove('hidden');
  } else {
    document.getElementById('trackLogsSection').classList.add('hidden');
  }

  // Botón directo de WhatsApp
  const btnWA = document.getElementById('trackBtnWhatsApp');
  if (btnWA) {
    const text = encodeURIComponent(`Hola GlitchLab, consulto sobre mi orden ${order.id} (${order.equipment.type} ${order.equipment.brand})`);
    btnWA.href = `https://wa.me/523113396969?text=${text}`;
  }
}

function closeClientTrackingModal() {
  document.getElementById('clientTrackingModal').classList.add('hidden');
  document.getElementById('trackingResultContainer').classList.add('hidden');
  document.getElementById('trackingError').classList.add('hidden');
}

// ==========================================
// 4. CONTROL AUTOMÁTICO DE GARANTÍAS
// ==========================================

function getWarrantyStatus(order) {
  if (order.status !== 'delivered') {
    return { hasWarranty: false, label: 'En proceso', color: 'text-slate-500' };
  }

  // Fecha de entrega (si no está registrada explícitamente, tomar última fecha de bitácora o creación)
  const deliveryDate = order.deliveredDate ? new Date(order.deliveredDate) : new Date(order.date);
  const warrantyDays = order.warrantyDays || AppState.shopConfig.warrantyDays || 30;
  
  const expirationDate = new Date(deliveryDate.getTime() + warrantyDays * 86400000);
  const today = new Date();
  
  const diffTime = expirationDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return {
      hasWarranty: true,
      isValid: true,
      daysLeft: diffDays,
      expirationFormatted: expirationDate.toLocaleDateString('es-MX'),
      badge: `🟢 Garantía Vigente (${diffDays}d)`,
      class: 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
    };
  } else {
    return {
      hasWarranty: true,
      isValid: false,
      daysLeft: 0,
      expirationFormatted: expirationDate.toLocaleDateString('es-MX'),
      badge: `🔴 Garantía Vencida`,
      class: 'bg-red-950/60 text-red-400 border-red-800'
    };
  }
}

// ==========================================
// 5. INVENTARIO DE REFACCIONES
// ==========================================

function loadInventory() {
  const saved = localStorage.getItem('glitchlab_inventory');
  if (saved) {
    try {
      AppState.inventory = JSON.parse(saved);
    } catch (e) {
      console.error('Error cargando inventario:', e);
      AppState.inventory = [];
    }
  }

  if (!AppState.inventory || AppState.inventory.length === 0) {
    AppState.inventory = [
      { id: 'inv_1', name: 'MOSFET N-Channel 30V AON6414A', sku: 'IC-MOS-6414', category: 'Microelectrónica', stock: 15, minStock: 5, cost: 25, price: 180 },
      { id: 'inv_2', name: 'IC de Carga BQ24780S (SOP-28)', sku: 'IC-CHG-BQ780', category: 'Microelectrónica', stock: 6, minStock: 3, cost: 85, price: 350 },
      { id: 'inv_3', name: 'Pasta Térmica Arctic MX-4 4g', sku: 'CON-MX4-4G', category: 'Insumos', stock: 12, minStock: 4, cost: 140, price: 280 },
      { id: 'inv_4', name: 'SSD NVMe 512GB Kingston NV2', sku: 'STR-SSD-512', category: 'Almacenamiento', stock: 4, minStock: 2, cost: 580, price: 950 },
      { id: 'inv_5', name: 'Display 15.6 LED 30 Pines 60Hz', sku: 'DSP-156-30P', category: 'Pantallas', stock: 2, minStock: 1, cost: 1100, price: 1800 }
    ];
    saveInventory();
  }
}

function saveInventory() {
  localStorage.setItem('glitchlab_inventory', JSON.stringify(AppState.inventory));
}

function openInventoryModal() {
  renderInventoryTable();
  document.getElementById('inventoryModal').classList.remove('hidden');
}

function closeInventoryModal() {
  document.getElementById('inventoryModal').classList.add('hidden');
}

function renderInventoryTable() {
  const container = document.getElementById('inventoryTableBody');
  if (!container) return;

  container.innerHTML = AppState.inventory.map(item => {
    const isLow = item.stock <= item.minStock;
    return `
      <tr class="border-b border-slate-800 hover:bg-slate-800/40 text-xs">
        <td class="py-2.5 px-3">
          <div class="font-bold text-white">${escapeHtml(item.name)}</div>
          <div class="text-[11px] text-slate-400 font-mono">${escapeHtml(item.sku)}</div>
        </td>
        <td class="py-2.5 px-3 text-slate-300">${escapeHtml(item.category)}</td>
        <td class="py-2.5 px-3">
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${isLow ? 'bg-red-950 text-red-400 border border-red-800' : 'bg-slate-800 text-emerald-400'}">
            ${item.stock} pzas ${isLow ? '⚠️' : ''}
          </span>
        </td>
        <td class="py-2.5 px-3 text-slate-400">$${item.cost.toLocaleString('es-MX')}</td>
        <td class="py-2.5 px-3 text-white font-bold text-sky-400">$${item.price.toLocaleString('es-MX')}</td>
        <td class="py-2.5 px-3 text-right">
          <button onclick="editInventoryStock('${item.id}', 1)" class="p-1 text-slate-400 hover:text-white" title="+1 stock"><i class="fas fa-plus"></i></button>
          <button onclick="editInventoryStock('${item.id}', -1)" class="p-1 text-slate-400 hover:text-white" title="-1 stock"><i class="fas fa-minus"></i></button>
          <button onclick="deleteInventoryItem('${item.id}')" class="p-1 text-slate-500 hover:text-red-400 ml-1" title="Eliminar"><i class="fas fa-trash-can"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

function handleAddInventoryItem(e) {
  e.preventDefault();
  const name = document.getElementById('invName').value.trim();
  const sku = document.getElementById('invSku').value.trim();
  const category = document.getElementById('invCategory').value;
  const stock = parseInt(document.getElementById('invStock').value, 10) || 0;
  const minStock = parseInt(document.getElementById('invMinStock').value, 10) || 2;
  const cost = parseFloat(document.getElementById('invCost').value) || 0;
  const price = parseFloat(document.getElementById('invPrice').value) || 0;

  AppState.inventory.unshift({
    id: 'inv_' + Date.now(),
    name, sku, category, stock, minStock, cost, price
  });

  saveInventory();
  renderInventoryTable();
  document.getElementById('newInventoryForm').reset();
  showToast(`Refacción "${name}" agregada.`);
}

function editInventoryStock(id, delta) {
  const item = AppState.inventory.find(i => i.id === id);
  if (!item) return;
  item.stock = Math.max(0, item.stock + delta);
  saveInventory();
  renderInventoryTable();
}

function deleteInventoryItem(id) {
  if (confirm('¿Eliminar este repuesto del catálogo?')) {
    AppState.inventory = AppState.inventory.filter(i => i.id !== id);
    saveInventory();
    renderInventoryTable();
    showToast('Repuesto eliminado.');
  }
}

// ==========================================
// 6. PLANTILLAS RÁPIDAS DE WHATSAPP
// ==========================================

let activeWhatsAppOrder = null;

function openWhatsAppTemplatesModal(orderId) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  activeWhatsAppOrder = order;

  document.getElementById('waClientName').innerText = order.client.name;
  document.getElementById('waOrderFolio').innerText = order.id;

  selectWhatsAppTemplate('ready');
  document.getElementById('whatsappModal').classList.remove('hidden');
}

function closeWhatsAppTemplatesModal() {
  document.getElementById('whatsappModal').classList.add('hidden');
  activeWhatsAppOrder = null;
}

function selectWhatsAppTemplate(type) {
  const order = activeWhatsAppOrder;
  if (!order) return;

  const statusLabel = StatusMeta[order.status]?.label || order.status;
  const balance = (order.costs?.balance || 0).toLocaleString('es-MX');
  const estimated = (order.costs?.estimated || 0).toLocaleString('es-MX');
  const advance = (order.costs?.advance || 0).toLocaleString('es-MX');

  let message = '';

  switch (type) {
    case 'received':
      message = `¡Hola *${order.client.name}*! Te saludamos de *GlitchLab* (Especialistas en Microelectrónica).\n\n` +
        `Confirmamos el ingreso de tu equipo a nuestro laboratorio:\n` +
        `📌 *Folio de Orden:* ${order.id}\n` +
        `💻 *Equipo:* ${order.equipment.type} ${order.equipment.brand} ${order.equipment.model}\n` +
        `⚠️ *Falla Reportada:* ${order.issue}\n` +
        (order.costs?.advance > 0 ? `💵 *Anticipo:* $${advance} MXN\n` : '') +
        `\nComenzaremos con el diagnóstico técnico a nivel componente. Te notificaremos en cuanto tengamos los resultados. ¡Gracias por tu confianza!`;
      break;

    case 'budget':
      message = `Hola *${order.client.name}*, te informamos de *GlitchLab* que ya tenemos el diagnóstico de tu equipo:\n\n` +
        `📌 *Folio:* ${order.id}\n` +
        `💻 *Equipo:* ${order.equipment.type} ${order.equipment.brand} ${order.equipment.model}\n` +
        `🔍 *Diagnóstico:* ${order.initialDiagnosis || 'Falla localizada en circuito de alimentación.'}\n` +
        `💰 *Presupuesto Estimado:* $${estimated} MXN\n` +
        (order.costs?.advance > 0 ? `💰 *Anticipo ya cubierto:* $${advance} MXN\n💰 *Saldo a liquidar al entregar:* $${balance} MXN\n` : '') +
        `\n¿Nos autorizas comenzar con la reparación a nivel componente?`;
      break;

    case 'progress':
      const lastBitacora = order.bitacora && order.bitacora.length > 0 ? order.bitacora[0] : null;
      message = `Hola *${order.client.name}*, te compartimos una actualización de tu equipo en *GlitchLab*:\n\n` +
        `📌 *Folio:* ${order.id}\n` +
        `💻 *Equipo:* ${order.equipment.type} ${order.equipment.brand} ${order.equipment.model}\n` +
        `⚙️ *Estado:* ${statusLabel}\n` +
        (lastBitacora ? `🔧 *Avance Realizado:* ${lastBitacora.title}\n📝 *Detalle:* ${lastBitacora.notes}\n` : '') +
        `\nSeguimos trabajando en tu dispositivo para entregarlo 100% operativo.`;
      break;

    case 'ready':
      message = `¡Excelentes noticias *${order.client.name}*! 🎉\n` +
        `Tu equipo en *GlitchLab* ha superado con éxito todas las pruebas de laboratorio y está *LISTO PARA ENTREGA*:\n\n` +
        `📌 *Folio de Orden:* ${order.id}\n` +
        `💻 *Equipo:* ${order.equipment.type} ${order.equipment.brand} ${order.equipment.model}\n` +
        (order.costs?.balance > 0 ? `💰 *Saldo Pendiente a Liquidar:* $${balance} MXN\n` : `💰 *Estado de Cuenta:* Liquidado / Sin saldo pendiente\n`) +
        `\n📍 *Ubicación:* ${AppState.shopConfig.address}\n` +
        `🕒 *Horario:* Lunes a Viernes 9:00 AM - 7:00 PM | Sábados 9:00 AM - 2:00 PM\n\n` +
        `¡Ya puedes pasar a recogerlo! Te esperamos.`;
      break;

    case 'warranty':
      message = `Hola *${order.client.name}*, esperamos que tu *${order.equipment.brand} ${order.equipment.model}* esté funcionando a la perfección.\n\n` +
        `Te recordamos que tu servicio cuenta con garantía de GlitchLab. ¿Nos apoyarías con una reseña en Google sobre tu experiencia? Nos ayuda muchísimo a seguir creciendo. ¡Gracias por confiar en nosotros!`;
      break;
  }

  document.getElementById('waMessagePreview').value = message;
}

function sendSelectedWhatsAppMessage() {
  if (!activeWhatsAppOrder) return;
  const phone = (activeWhatsAppOrder.client?.phone || '').replace(/\D/g, '');
  if (!phone) {
    alert('Esta orden no cuenta con número telefónico registrado.');
    return;
  }

  const text = encodeURIComponent(document.getElementById('waMessagePreview').value);
  const url = `https://wa.me/52${phone.length === 10 ? phone : phone}?text=${text}`;
  window.open(url, '_blank');
  closeWhatsAppTemplatesModal();
}

// ==========================================
// 7. CORTE DE CAJA, REPORTES Y EXPORTAR A EXCEL
// ==========================================

function openFinancialReportModal() {
  const today = new Date().toISOString().slice(0, 10);
  
  let totalCash = 0;
  let totalTransfer = 0;
  let totalCard = 0;
  let totalCollectedToday = 0;
  let totalMonthCollected = 0;
  let totalPendingReceivable = 0;

  AppState.orders.forEach(order => {
    const isToday = order.date && order.date.startsWith(today);
    const adv = order.costs?.advance || 0;
    const bal = order.costs?.balance || 0;
    const method = order.costs?.paymentMethod || 'Efectivo';

    if (isToday) {
      totalCollectedToday += adv;
      if (order.status === 'delivered') totalCollectedToday += bal;
    }

    // Por método
    const paidAmount = adv + (order.status === 'delivered' ? bal : 0);
    if (method === 'Efectivo') totalCash += paidAmount;
    else if (method === 'Transferencia') totalTransfer += paidAmount;
    else if (method === 'Tarjeta') totalCard += paidAmount;

    totalMonthCollected += paidAmount;

    if (order.status !== 'delivered' && order.status !== 'cancelled') {
      totalPendingReceivable += bal;
    }
  });

  document.getElementById('reportTodayCash').innerText = `$${totalCollectedToday.toLocaleString('es-MX')}`;
  document.getElementById('reportMonthCash').innerText = `$${totalMonthCollected.toLocaleString('es-MX')}`;
  document.getElementById('reportPendingReceivable').innerText = `$${totalPendingReceivable.toLocaleString('es-MX')}`;

  document.getElementById('reportMethodCash').innerText = `$${totalCash.toLocaleString('es-MX')}`;
  document.getElementById('reportMethodTransfer').innerText = `$${totalTransfer.toLocaleString('es-MX')}`;
  document.getElementById('reportMethodCard').innerText = `$${totalCard.toLocaleString('es-MX')}`;

  document.getElementById('financialModal').classList.remove('hidden');
}

function closeFinancialReportModal() {
  document.getElementById('financialModal').classList.add('hidden');
}

// Exportar base completa a archivo Excel / CSV
function exportOrdersToCSV() {
  if (!AppState.orders || AppState.orders.length === 0) {
    alert('No hay órdenes registradas para exportar.');
    return;
  }

  const headers = [
    'Folio', 'Fecha', 'Estatus', 'Cliente', 'Telefono', 'Email', 'Direccion',
    'Tipo Equipo', 'Marca', 'Modelo', 'No Serie', 'Accesorios', 'Contraseña / PIN',
    'Falla Reportada', 'Diagnostico Tecnico', 'Tecnico Asignado', 'Costo Estimado', 'Anticipo',
    'Saldo Restante', 'Metodo Pago'
  ];

  const rows = AppState.orders.map(o => [
    `"#${o.id || ''}"`,
    `"${new Date(o.date).toLocaleDateString('es-MX')}"`,
    `"${StatusMeta[o.status]?.label || o.status}"`,
    `"${(o.client?.name || '').replace(/"/g, '""')}"`,
    `"${o.client?.phone || ''}"`,
    `"${o.client?.email || ''}"`,
    `"${(o.client?.address || '').replace(/"/g, '""')}"`,
    `"${o.equipment?.type || ''}"`,
    `"${(o.equipment?.brand || '').replace(/"/g, '""')}"`,
    `"${(o.equipment?.model || '').replace(/"/g, '""')}"`,
    `"${o.equipment?.serial || ''}"`,
    `"${(o.equipment?.accessories?.join(', ') || '').replace(/"/g, '""')}"`,
    `"${o.equipment?.password || ''}"`,
    `"${(o.issue || '').replace(/"/g, '""')}"`,
    `"${(o.initialDiagnosis || '').replace(/"/g, '""')}"`,
    `"${o.technician || ''}"`,
    o.costs?.estimated || 0,
    o.costs?.advance || 0,
    o.costs?.balance || 0,
    `"${o.costs?.paymentMethod || ''}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GlitchLab_Reporte_Ordenes_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Reporte con ${AppState.orders.length} órdenes exportado a Excel (CSV).`);
}

// ==========================================
// 8. GESTIÓN Y DIRECTORIO DE CLIENTES (SUPABASE & LOCAL)
// ==========================================

function loadClients() {
  const saved = localStorage.getItem('glitchlab_clients');
  if (saved) {
    try {
      AppState.clients = JSON.parse(saved);
    } catch (e) {
      console.error('Error cargando clientes:', e);
      AppState.clients = [];
    }
  }

  // Si aún no hay clientes guardados, extraer los clientes de las órdenes existentes
  if (!AppState.clients || AppState.clients.length === 0) {
    extractClientsFromOrders();
  }
}

function saveClients() {
  localStorage.setItem('glitchlab_clients', JSON.stringify(AppState.clients));
}

function extractClientsFromOrders() {
  const clientMap = new Map();
  AppState.orders.forEach(o => {
    if (o.client?.name && o.client?.phone) {
      const cleanPhone = o.client.phone.replace(/\D/g, '');
      const key = cleanPhone || o.client.name.toLowerCase().trim();
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          id: 'cli_' + (cleanPhone || Date.now()),
          name: o.client.name.trim(),
          phone: o.client.phone.trim(),
          email: o.client.email ? o.client.email.trim() : '',
          address: o.client.address ? o.client.address.trim() : '',
          totalOrders: 1,
          notes: '',
          updatedAt: o.date || new Date().toISOString()
        });
      } else {
        const existing = clientMap.get(key);
        existing.totalOrders = (existing.totalOrders || 1) + 1;
      }
    }
  });

  AppState.clients = Array.from(clientMap.values());
  saveClients();
}

async function syncClientToSupabase(client) {
  if (!AppState.supabase.client || !client || !client.name) return;
  const cleanPhone = (client.phone || '').replace(/\D/g, '');
  const clientId = client.id || ('cli_' + (cleanPhone || Date.now()));

  // Contar órdenes asociadas
  const orderCount = AppState.orders.filter(o => {
    const oPhone = (o.client?.phone || '').replace(/\D/g, '');
    return (cleanPhone && oPhone === cleanPhone) || (o.client?.name?.toLowerCase() === client.name?.toLowerCase());
  }).length;

  const payload = {
    id: clientId,
    name: client.name.trim(),
    phone: client.phone.trim(),
    email: client.email ? client.email.trim() : null,
    address: client.address ? client.address.trim() : null,
    total_orders: Math.max(1, orderCount),
    notes: client.notes || null,
    updated_at: new Date().toISOString()
  };

  try {
    const { error } = await AppState.supabase.client
      .from('clients')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.warn('Error sincronizando cliente en Supabase:', error);
    }
  } catch (err) {
    console.warn('Excepción sincronizando cliente en Supabase:', err);
  }
}

async function fetchClientsFromSupabase(isAuto = false) {
  if (!AppState.supabase.client) return;
  try {
    const { data, error } = await AppState.supabase.client
      .from('clients')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      if (!isAuto) console.warn('Error consultando clientes de Supabase:', error);
      return;
    }

    if (Array.isArray(data)) {
      const dbClients = data.map(row => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email || '',
        address: row.address || '',
        totalOrders: row.total_orders || 1,
        notes: row.notes || '',
        updatedAt: row.updated_at || row.created_at || new Date().toISOString()
      }));

      // Fusionar clientes de la nube con los clientes locales
      const clientMap = new Map();
      AppState.clients.forEach(c => clientMap.set(c.id || c.phone, c));
      dbClients.forEach(c => clientMap.set(c.id || c.phone, c));

      AppState.clients = Array.from(clientMap.values());
      saveClients();
      renderClientsTable();
      if (!isAuto) showToast(`${dbClients.length} clientes sincronizados con la nube.`);
    }
  } catch (err) {
    console.warn('Error al obtener clientes en Supabase:', err);
  }
}

function openClientsModal() {
  const modal = document.getElementById('clientsModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  renderClientsTable();
}

function closeClientsModal() {
  const modal = document.getElementById('clientsModal');
  if (modal) modal.classList.add('hidden');
}

function renderClientsTable(filteredList = null) {
  const tbody = document.getElementById('clientsTableBody');
  const countBadge = document.getElementById('clientsCountBadge');
  if (!tbody) return;

  const list = filteredList || AppState.clients || [];
  if (countBadge) countBadge.innerText = (AppState.clients || []).length;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-10 text-center text-slate-500">
          <i class="fas fa-users-slash text-3xl mb-2 block text-slate-600"></i>
          No hay clientes registrados o que coincidan con la búsqueda.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map(c => {
    const cleanPhone = (c.phone || '').replace(/\D/g, '');
    const waUrl = cleanPhone ? `https://wa.me/52${cleanPhone}` : '#';

    // Calcular órdenes del cliente
    const orderCount = c.totalOrders || AppState.orders.filter(o => {
      const oPhone = (o.client?.phone || '').replace(/\D/g, '');
      return (cleanPhone && oPhone === cleanPhone) || (o.client?.name?.toLowerCase() === c.name.toLowerCase());
    }).length || 1;

    return `
      <tr class="hover:bg-slate-900/80 transition">
        <td class="py-3 px-4">
          <div class="font-bold text-white flex items-center gap-2">
            <div class="w-7 h-7 rounded-full bg-purple-500/20 text-purple-300 font-bold flex items-center justify-center text-xs">
              ${escapeHtml(c.name.substring(0, 2).toUpperCase())}
            </div>
            <span>${escapeHtml(c.name)}</span>
          </div>
          ${c.notes ? `<div class="text-[11px] text-slate-400 mt-0.5 truncate max-w-xs"><i class="fas fa-note-sticky text-amber-400/80 mr-1"></i>${escapeHtml(c.notes)}</div>` : ''}
        </td>
        <td class="py-3 px-4">
          <div class="flex items-center gap-2">
            <span class="font-mono text-slate-200">${escapeHtml(c.phone)}</span>
            ${cleanPhone ? `
              <a href="${waUrl}" target="_blank" class="p-1.5 rounded-lg bg-emerald-950 text-emerald-400 hover:bg-emerald-900 transition text-xs" title="Enviar WhatsApp">
                <i class="fab fa-whatsapp"></i>
              </a>
            ` : ''}
          </div>
        </td>
        <td class="py-3 px-4 text-slate-300">
          ${c.email ? `<span class="truncate block max-w-xs">${escapeHtml(c.email)}</span>` : '<span class="text-slate-600">Sin correo</span>'}
        </td>
        <td class="py-3 px-4 text-slate-300">
          ${c.address ? `<span class="truncate block max-w-xs">${escapeHtml(c.address)}</span>` : '<span class="text-slate-600">Sin dirección</span>'}
        </td>
        <td class="py-3 px-4 text-center">
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-sky-300 border border-slate-700">
            ${orderCount} ${orderCount === 1 ? 'orden' : 'órdenes'}
          </span>
        </td>
        <td class="py-3 px-4 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <button onclick="startOrderForClient('${c.id}')" class="px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 hover:bg-sky-500 hover:text-white text-xs font-semibold transition" title="Crear nueva orden para este cliente">
              <i class="fas fa-plus-circle mr-1"></i> Orden
            </button>
            <button onclick="openEditClientModal('${c.id}')" class="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition" title="Editar datos">
              <i class="fas fa-pencil"></i>
            </button>
            <button onclick="deleteClient('${c.id}')" class="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition" title="Eliminar cliente">
              <i class="fas fa-trash-can"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function handleClientSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  if (!query) {
    renderClientsTable();
    return;
  }

  const filtered = AppState.clients.filter(c => 
    c.name.toLowerCase().includes(query) ||
    (c.phone && c.phone.includes(query)) ||
    (c.email && c.email.toLowerCase().includes(query)) ||
    (c.address && c.address.toLowerCase().includes(query))
  );

  renderClientsTable(filtered);
}

function openNewClientModal() {
  document.getElementById('clientEditModalTitle').innerHTML = '<i class="fas fa-user-plus text-purple-400"></i> Registrar Nuevo Cliente';
  document.getElementById('editClientId').value = '';
  document.getElementById('editClientName').value = '';
  document.getElementById('editClientPhone').value = '';
  document.getElementById('editClientEmail').value = '';
  document.getElementById('editClientAddress').value = '';
  document.getElementById('editClientNotes').value = '';

  const modal = document.getElementById('clientEditModal');
  if (modal) modal.classList.remove('hidden');
}

function openEditClientModal(clientId) {
  const client = AppState.clients.find(c => c.id === clientId);
  if (!client) return;

  document.getElementById('clientEditModalTitle').innerHTML = '<i class="fas fa-user-pen text-purple-400"></i> Editar Datos de Cliente';
  document.getElementById('editClientId').value = client.id;
  document.getElementById('editClientName').value = client.name || '';
  document.getElementById('editClientPhone').value = client.phone || '';
  document.getElementById('editClientEmail').value = client.email || '';
  document.getElementById('editClientAddress').value = client.address || '';
  document.getElementById('editClientNotes').value = client.notes || '';

  const modal = document.getElementById('clientEditModal');
  if (modal) modal.classList.remove('hidden');
}

function closeClientEditModal() {
  const modal = document.getElementById('clientEditModal');
  if (modal) modal.classList.add('hidden');
}

function handleSaveClientForm(e) {
  e.preventDefault();
  const id = document.getElementById('editClientId').value;
  const name = document.getElementById('editClientName').value.trim();
  const phone = document.getElementById('editClientPhone').value.trim();
  const email = document.getElementById('editClientEmail').value.trim();
  const address = document.getElementById('editClientAddress').value.trim();
  const notes = document.getElementById('editClientNotes').value.trim();

  if (!name || !phone) {
    alert('Nombre y Teléfono son requeridos.');
    return;
  }

  let clientObj;
  if (id) {
    const idx = AppState.clients.findIndex(c => c.id === id);
    if (idx >= 0) {
      AppState.clients[idx] = {
        ...AppState.clients[idx],
        name, phone, email, address, notes,
        updatedAt: new Date().toISOString()
      };
      clientObj = AppState.clients[idx];
    }
  } else {
    const cleanPhone = phone.replace(/\D/g, '');
    const newId = 'cli_' + (cleanPhone || Date.now());
    clientObj = {
      id: newId,
      name, phone, email, address, notes,
      totalOrders: 0,
      updatedAt: new Date().toISOString()
    };
    AppState.clients.unshift(clientObj);
  }

  saveClients();
  renderClientsTable();
  closeClientEditModal();
  showToast(`Cliente ${name} guardado.`);

  // Sincronizar con Supabase
  if (clientObj) {
    syncClientToSupabase(clientObj);
  }
}

function deleteClient(clientId) {
  const client = AppState.clients.find(c => c.id === clientId);
  if (!client) return;

  if (confirm(`¿Deseas eliminar al cliente ${client.name}?`)) {
    AppState.clients = AppState.clients.filter(c => c.id !== clientId);
    saveClients();
    renderClientsTable();

    // Eliminar de Supabase
    if (AppState.supabase.client) {
      AppState.supabase.client
        .from('clients')
        .delete()
        .eq('id', clientId)
        .then(({ error }) => {
          if (error) console.warn('Error eliminando de Supabase:', error);
        });
    }

    showToast('Cliente eliminado.');
  }
}

function startOrderForClient(clientId) {
  const client = AppState.clients.find(c => c.id === clientId);
  if (!client) return;

  closeClientsModal();
  openOrderModal();

  // Pre-llenar datos del cliente
  document.getElementById('clientName').value = client.name || '';
  document.getElementById('clientPhone').value = client.phone || '';
  document.getElementById('clientEmail').value = client.email || '';
  document.getElementById('clientAddress').value = client.address || '';
  showToast(`Creando nueva orden para ${client.name}.`);
}

function syncClientsWithSupabase() {
  if (!AppState.supabase.client) {
    alert('Configura primero tu conexión a Supabase en el menú superior.');
    openSupabaseSettingsModal();
    return;
  }
  fetchClientsFromSupabase(false);
}

function setupAutocompleteListeners() {
  const clientNameInput = document.getElementById('clientName');
  const clientPhoneInput = document.getElementById('clientPhone');

  if (clientNameInput) {
    clientNameInput.addEventListener('input', handleClientAutocomplete);
  }
  if (clientPhoneInput) {
    clientPhoneInput.addEventListener('input', handleClientAutocomplete);
  }
}

function handleClientAutocomplete(e) {
  const val = e.target.value.toLowerCase().trim();
  const dropdown = document.getElementById('clientAutocompleteDropdown');
  if (!dropdown) return;

  if (val.length < 2) {
    dropdown.classList.add('hidden');
    return;
  }

  // Buscar en AppState.clients y órdenes anteriores
  const clientMap = new Map();
  (AppState.clients || []).forEach(c => {
    if (c.name && c.phone) {
      const key = c.phone.replace(/\D/g, '') || c.name.toLowerCase();
      clientMap.set(key, c);
    }
  });

  AppState.orders.forEach(o => {
    if (o.client?.name && o.client?.phone) {
      const key = o.client.phone.replace(/\D/g, '') || o.client.name.toLowerCase();
      if (!clientMap.has(key)) {
        clientMap.set(key, o.client);
      }
    }
  });

  const matches = Array.from(clientMap.values()).filter(c => 
    c.name.toLowerCase().includes(val) || (c.phone && c.phone.includes(val))
  ).slice(0, 5);

  if (matches.length === 0) {
    dropdown.classList.add('hidden');
    return;
  }

  dropdown.innerHTML = matches.map(c => `
    <div onclick="selectAutocompleteClient('${escapeHtml(c.name)}', '${escapeHtml(c.phone)}', '${escapeHtml(c.email || '')}', '${escapeHtml(c.address || '')}')" class="px-3 py-2 hover:bg-slate-800 cursor-pointer border-b border-slate-800/60 text-xs">
      <div class="font-bold text-white">${escapeHtml(c.name)}</div>
      <div class="text-[11px] text-sky-400">Tel: ${escapeHtml(c.phone)} ${c.email ? '• ' + escapeHtml(c.email) : ''}</div>
    </div>
  `).join('');

  dropdown.classList.remove('hidden');
}

function selectAutocompleteClient(name, phone, email, address) {
  document.getElementById('clientName').value = name;
  document.getElementById('clientPhone').value = phone;
  document.getElementById('clientEmail').value = email;
  document.getElementById('clientAddress').value = address;

  const dropdown = document.getElementById('clientAutocompleteDropdown');
  if (dropdown) dropdown.classList.add('hidden');
  showToast(`Datos de ${name} cargados.`);
}

// ==========================================
// 9. CONFIGURACIÓN Y PERSISTENCIA
// ==========================================

function loadConfig() {
  const saved = localStorage.getItem('glitchlab_config');
  if (saved) {
    try {
      AppState.shopConfig = { ...AppState.shopConfig, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Error cargando configuración:', e);
    }
  }
}

function saveConfig() {
  localStorage.setItem('glitchlab_config', JSON.stringify(AppState.shopConfig));
}

function loadOrders() {
  const saved = localStorage.getItem('glitchlab_orders');
  if (saved) {
    try {
      AppState.orders = JSON.parse(saved);
      // Migración automática a secuencia iniciando desde 1 (ej. 1001 -> 1, GL-0001 -> 1)
      let needsSave = false;
      const hasLegacyOrHighIds = AppState.orders.some(o => !o.id || o.id.toString().startsWith('GL-') || parseInt(o.id.toString().replace(/\D/g, ''), 10) >= 1000);
      if (hasLegacyOrHighIds) {
        // Ordenar cronológicamente para asignar secuencia 1, 2, 3...
        const sorted = [...AppState.orders].sort((a, b) => new Date(a.date) - new Date(b.date));
        sorted.forEach((o, idx) => {
          o.id = (idx + 1).toString();
        });
        needsSave = true;
      }
      if (needsSave) saveOrders();
    } catch (e) {
      console.error('Error cargando órdenes:', e);
      AppState.orders = [];
    }
  } else {
    seedDemoOrders();
  }
}

function saveOrders() {
  localStorage.setItem('glitchlab_orders', JSON.stringify(AppState.orders));
  // Sincronización automática con Supabase Cloud
  if (AppState.supabase.isConnected && AppState.supabase.client) {
    scheduleOrdersSync();
  }
}

// ==========================================
// 9.B INTEGRACIÓN SUPABASE (DATABASE, STORAGE & CLOUD SYNC)
// ==========================================

function loadSupabaseConfig() {
  const defaultUrl = 'https://afknnllubatfpmzeryrn.supabase.co';
  const defaultKey = 'sb_publishable_I5zi2yxOUUKinRm2BjSiGA_PKH5W9hU';
  const defaultBucket = 'order-photos';

  const saved = localStorage.getItem('glitchlab_supabase_config');
  if (saved) {
    try {
      const cfg = JSON.parse(saved);
      AppState.supabase.url = cfg.url || defaultUrl;
      AppState.supabase.anonKey = cfg.anonKey || defaultKey;
      AppState.supabase.bucket = cfg.bucket || defaultBucket;
    } catch (e) {
      console.error('Error cargando configuración Supabase:', e);
      AppState.supabase.url = defaultUrl;
      AppState.supabase.anonKey = defaultKey;
      AppState.supabase.bucket = defaultBucket;
    }
  } else {
    AppState.supabase.url = defaultUrl;
    AppState.supabase.anonKey = defaultKey;
    AppState.supabase.bucket = defaultBucket;
    saveSupabaseConfig();
  }
}

function saveSupabaseConfig() {
  localStorage.setItem('glitchlab_supabase_config', JSON.stringify({
    url: AppState.supabase.url,
    anonKey: AppState.supabase.anonKey,
    bucket: AppState.supabase.bucket || 'order-photos'
  }));
}

async function initSupabase(showNotification = false) {
  if (!window.supabase) {
    console.warn('SDK de Supabase aún no está cargado en window.supabase');
    updateSupabaseUI();
    return;
  }

  if (!AppState.supabase.url || !AppState.supabase.anonKey) {
    AppState.supabase.client = null;
    AppState.supabase.isConnected = false;
    updateSupabaseUI();
    return;
  }

  try {
    AppState.supabase.client = window.supabase.createClient(
      AppState.supabase.url, 
      AppState.supabase.anonKey, 
      {
        auth: { persistSession: false }
      }
    );

    // Probar conexión rápida realizando una consulta HEAD a la tabla orders
    const { error } = await AppState.supabase.client
      .from('orders')
      .select('id', { count: 'exact', head: true });

    if (error) {
      const isMissingTable = error.code === 'PGRST205' || (error.message && error.message.includes('Could not find the table'));
      if (isMissingTable) {
        // La API Key y la URL son 100% válidas en Supabase, sólo falta ejecutar el script SQL
        AppState.supabase.isConnected = true;
        AppState.supabase.needsSqlSetup = true;
        updateSupabaseUI();
        if (showNotification) {
          alert('¡Conexión con Supabase verificada con éxito!\n\nLas credenciales son correctas. Para que las órdenes y clientes se guarden en la base de datos, ejecuta el Script SQL (botón "Copiar SQL" en el modal) en el SQL Editor de tu consola de Supabase.');
        }
      } else {
        console.warn('Prueba de conexión a Supabase falló:', error.message);
        AppState.supabase.isConnected = false;
        AppState.supabase.needsSqlSetup = false;
        updateSupabaseUI(error.message);
        if (showNotification) {
          alert(`Error al conectar a Supabase:\n${error.message}`);
        }
      }
    } else {
      AppState.supabase.isConnected = true;
      AppState.supabase.needsSqlSetup = false;
      AppState.supabase.lastSync = new Date().toLocaleTimeString();
      updateSupabaseUI();
      if (showNotification) {
        showToast('¡Conectado a Supabase Cloud exitosamente!');
      }

      // Sincronizar automáticamente en segundo plano órdenes y clientes
      fetchOrdersFromSupabase(true);
      fetchClientsFromSupabase(true);
    }
  } catch (err) {
    console.error('Error inicializando Supabase:', err);
    AppState.supabase.isConnected = false;
    AppState.supabase.needsSqlSetup = false;
    updateSupabaseUI(err.message);
    if (showNotification) {
      alert(`Error al inicializar Supabase: ${err.message}`);
    }
  }
}

function updateSupabaseUI(errorMessage = null) {
  const dot = document.getElementById('supabaseStatusDot');
  const btnCloud = document.getElementById('btnSupabaseCloud');
  const sbCard = document.getElementById('sbStatusCard');
  const sbIcon = document.getElementById('sbStatusIcon');
  const sbTitle = document.getElementById('sbStatusTitle');
  const sbSubtitle = document.getElementById('sbStatusSubtitle');
  const sbBadge = document.getElementById('sbStatusBadge');
  const btnDisconnect = document.getElementById('btnDisconnectSb');
  const lastSyncLabel = document.getElementById('sbLastSyncLabel');

  if (lastSyncLabel && AppState.supabase.lastSync) {
    lastSyncLabel.innerText = `Última sinc: ${AppState.supabase.lastSync}`;
  }

  if (AppState.supabase.isConnected) {
    if (AppState.supabase.needsSqlSetup) {
      if (dot) {
        dot.className = 'absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse';
      }
      if (btnCloud) {
        btnCloud.className = 'p-2.5 text-amber-400 hover:text-white hover:bg-slate-800/80 rounded-full transition relative text-base';
        btnCloud.title = 'Supabase Conectado (Falta ejecutar Script SQL en consola Supabase)';
      }
      if (sbCard) {
        sbCard.className = 'p-4 rounded-2xl border transition flex items-center justify-between bg-amber-950/20 border-amber-800/60';
      }
      if (sbIcon) {
        sbIcon.className = 'w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg';
        sbIcon.innerHTML = '<i class="fas fa-database"></i>';
      }
      if (sbTitle) sbTitle.innerText = 'Conectado a Supabase (Pendiente crear tablas)';
      if (sbSubtitle) sbSubtitle.innerText = 'Credenciales verificadas con éxito. Ejecuta el Script SQL de abajo en tu consola de Supabase para activar las tablas orders y clients.';
      if (sbBadge) {
        sbBadge.className = 'px-3 py-1 rounded-full text-[11px] font-bold bg-amber-950 text-amber-300 border border-amber-700 flex items-center gap-1.5';
        sbBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span> Ejecutar SQL';
      }
      if (btnDisconnect) btnDisconnect.classList.remove('hidden');
    } else {
      if (dot) {
        dot.className = 'absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-emerald-400 sb-pulse-active';
      }
      if (btnCloud) {
        btnCloud.className = 'p-2.5 text-emerald-400 hover:text-white hover:bg-slate-800/80 rounded-full transition relative text-base';
        btnCloud.title = 'Supabase Cloud Conectado (Sincronización Activa)';
      }
      if (sbCard) {
        sbCard.className = 'p-4 rounded-2xl border transition flex items-center justify-between bg-emerald-950/20 border-emerald-800/60';
      }
      if (sbIcon) {
        sbIcon.className = 'w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg';
        sbIcon.innerHTML = '<i class="fas fa-cloud-check"></i>';
      }
      if (sbTitle) sbTitle.innerText = 'Conectado a Supabase Cloud';
      if (sbSubtitle) sbSubtitle.innerText = `Proyecto: ${AppState.supabase.url} • Órdenes, clientes y fotos sincronizados.`;
      if (sbBadge) {
        sbBadge.className = 'px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1.5';
        sbBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Activo';
      }
      if (btnDisconnect) btnDisconnect.classList.remove('hidden');
    }
  } else if (errorMessage) {
    if (dot) {
      dot.className = 'absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500';
    }
    if (btnCloud) {
      btnCloud.className = 'p-2.5 text-red-400 hover:text-white hover:bg-slate-800/80 rounded-full transition relative text-base';
      btnCloud.title = 'Error de Conexión a Supabase Cloud';
    }
    if (sbCard) {
      sbCard.className = 'p-4 rounded-2xl border transition flex items-center justify-between bg-red-950/20 border-red-800/60';
    }
    if (sbIcon) {
      sbIcon.className = 'w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center text-lg';
      sbIcon.innerHTML = '<i class="fas fa-triangle-exclamation"></i>';
    }
    if (sbTitle) sbTitle.innerText = 'Error de Conexión';
    if (sbSubtitle) sbSubtitle.innerText = errorMessage;
    if (sbBadge) {
      sbBadge.className = 'px-3 py-1 rounded-full text-[11px] font-bold bg-red-950 text-red-300 border border-red-800';
      sbBadge.innerText = 'Fallo';
    }
    if (btnDisconnect) btnDisconnect.classList.remove('hidden');
  } else {
    // Modo Local
    if (dot) {
      dot.className = 'absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-slate-500';
    }
    if (btnCloud) {
      btnCloud.className = 'p-2.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-full transition relative text-base';
      btnCloud.title = 'Modo Local (Configurar Supabase Cloud)';
    }
    if (sbCard) {
      sbCard.className = 'p-4 rounded-2xl border transition flex items-center justify-between bg-slate-950/60 border-slate-800';
    }
    if (sbIcon) {
      sbIcon.className = 'w-10 h-10 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center text-lg';
      sbIcon.innerHTML = '<i class="fas fa-database"></i>';
    }
    if (sbTitle) sbTitle.innerText = 'Modo Almacenamiento Local';
    if (sbSubtitle) sbSubtitle.innerText = 'Tus datos y fotos están guardados en este navegador. Configura Supabase para sincronizar con la nube.';
    if (sbBadge) {
      sbBadge.className = 'px-3 py-1 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700';
      sbBadge.innerText = 'Local';
    }
    if (btnDisconnect) btnDisconnect.classList.add('hidden');
  }
}

function openSupabaseSettingsModal() {
  const modal = document.getElementById('supabaseModal');
  if (!modal) return;

  document.getElementById('sbProjectUrl').value = AppState.supabase.url || '';
  document.getElementById('sbAnonKey').value = AppState.supabase.anonKey || '';
  document.getElementById('sbBucketName').value = AppState.supabase.bucket || 'order-photos';
  
  const sqlBlock = document.getElementById('supabaseSqlCodeBlock');
  if (sqlBlock) {
    sqlBlock.innerText = getSupabaseSqlScript();
  }

  updateSupabaseUI();
  modal.classList.remove('hidden');
}

function closeSupabaseSettingsModal() {
  const modal = document.getElementById('supabaseModal');
  if (modal) modal.classList.add('hidden');
}

function handleSaveSupabaseConfig(e) {
  e.preventDefault();
  const url = document.getElementById('sbProjectUrl').value.trim().replace(/\/$/, '');
  const anonKey = document.getElementById('sbAnonKey').value.trim();
  const bucket = document.getElementById('sbBucketName').value.trim() || 'order-photos';

  if (!url || !anonKey) {
    alert('Ingresa la URL del proyecto y la Anon Key de Supabase.');
    return;
  }

  AppState.supabase.url = url;
  AppState.supabase.anonKey = anonKey;
  AppState.supabase.bucket = bucket;

  saveSupabaseConfig();
  showToast('Guardando credenciales y conectando...');
  initSupabase(true);
}

function testSupabaseConnectionUI() {
  const url = document.getElementById('sbProjectUrl').value.trim().replace(/\/$/, '');
  const anonKey = document.getElementById('sbAnonKey').value.trim();
  const bucket = document.getElementById('sbBucketName').value.trim() || 'order-photos';

  if (!url || !anonKey) {
    alert('Ingresa la URL y la Anon Key para probar.');
    return;
  }

  AppState.supabase.url = url;
  AppState.supabase.anonKey = anonKey;
  AppState.supabase.bucket = bucket;
  saveSupabaseConfig();
  initSupabase(true);
}

function disconnectSupabase() {
  if (confirm('¿Desconectar Supabase? El sistema volverá a guardar los datos en almacenamiento local sin borrar nada.')) {
    AppState.supabase.url = '';
    AppState.supabase.anonKey = '';
    AppState.supabase.client = null;
    AppState.supabase.isConnected = false;
    saveSupabaseConfig();
    updateSupabaseUI();
    document.getElementById('sbProjectUrl').value = '';
    document.getElementById('sbAnonKey').value = '';
    showToast('Desconectado de Supabase.');
  }
}

function toggleSbKeyVisibility() {
  const input = document.getElementById('sbAnonKey');
  const icon = document.getElementById('sbKeyEyeIcon');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) icon.className = 'fas fa-eye-slash';
  } else {
    input.type = 'password';
    if (icon) icon.className = 'fas fa-eye';
  }
}

function toggleSqlScriptAccordion() {
  const container = document.getElementById('sqlScriptContainer');
  const icon = document.getElementById('sqlAccordionIcon');
  if (!container) return;
  if (container.classList.contains('hidden')) {
    container.classList.remove('hidden');
    if (icon) icon.className = 'fas fa-chevron-up text-slate-400 text-xs transition duration-200';
  } else {
    container.classList.add('hidden');
    if (icon) icon.className = 'fas fa-chevron-down text-slate-400 text-xs transition duration-200';
  }
}

function copySupabaseSqlScript() {
  const script = getSupabaseSqlScript();
  navigator.clipboard.writeText(script).then(() => {
    showToast('¡Script SQL copiado al portapapeles!');
  }).catch(() => {
    prompt('Copia este script SQL y pégalo en Supabase > SQL Editor:', script);
  });
}

function getSupabaseSqlScript() {
  return `-- ========================================================
-- GLITCHLAB - SCRIPT DE INICIALIZACIÓN PARA SUPABASE
-- Pega este código en Supabase: SQL Editor -> New Query -> Run
-- ========================================================

-- 1. TABLA DE CLIENTES
CREATE TABLE IF NOT EXISTS public.clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  total_orders INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA DE ÓRDENES DE SERVICIO
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  date TIMESTAMPTZ DEFAULT NOW(),
  delivered_date TIMESTAMPTZ,
  warranty_days INTEGER DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'received',
  client JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_id TEXT,
  equipment JSONB NOT NULL DEFAULT '{}'::jsonb,
  issue TEXT,
  initial_diagnosis TEXT,
  technician TEXT,
  costs JSONB NOT NULL DEFAULT '{}'::jsonb,
  signature TEXT,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  bitacora JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. HABILITAR SEGURIDAD (RLS) CON PERMISO TOTAL A CLAVE ANON
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir todo anon en clients" ON public.clients;
CREATE POLICY "Permitir todo anon en clients" ON public.clients FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo anon en orders" ON public.orders;
CREATE POLICY "Permitir todo anon en orders" ON public.orders FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. BUCKET DE STORAGE PARA FOTOS DE ÓRDENES
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-photos', 'order-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas de lectura y subida para el bucket de fotos
DROP POLICY IF EXISTS "Fotos lectura publica" ON storage.objects;
CREATE POLICY "Fotos lectura publica" ON storage.objects FOR SELECT TO public USING (bucket_id = 'order-photos');

DROP POLICY IF EXISTS "Fotos subida anon" ON storage.objects;
CREATE POLICY "Fotos subida anon" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'order-photos');

DROP POLICY IF EXISTS "Fotos borrado anon" ON storage.objects;
CREATE POLICY "Fotos borrado anon" ON storage.objects FOR DELETE TO public USING (bucket_id = 'order-photos');
`;
}

let syncOrdersDebounceTimer = null;
function scheduleOrdersSync() {
  if (syncOrdersDebounceTimer) clearTimeout(syncOrdersDebounceTimer);
  syncOrdersDebounceTimer = setTimeout(() => {
    pushAllToSupabase(true);
  }, 1000);
}

function mapLocalOrderToSupabase(order) {
  return {
    id: (order.id || '').toString(),
    date: order.date || new Date().toISOString(),
    delivered_date: order.deliveredDate || null,
    warranty_days: parseInt(order.warrantyDays || 30, 10),
    status: order.status || 'received',
    client: order.client || {},
    client_id: 'cli_' + (order.client?.phone || '').replace(/\D/g, ''),
    equipment: order.equipment || {},
    issue: order.issue || '',
    initial_diagnosis: order.initialDiagnosis || '',
    technician: order.technician || '',
    costs: order.costs || {},
    signature: order.signature || null,
    photos: order.photos || [],
    bitacora: order.bitacora || [],
    updated_at: new Date().toISOString()
  };
}

function mapSupabaseOrderToLocal(row) {
  return {
    id: row.id,
    date: row.date || row.created_at || new Date().toISOString(),
    deliveredDate: row.delivered_date || null,
    warrantyDays: row.warranty_days || 30,
    status: row.status || 'received',
    client: row.client || { name: 'Cliente', phone: '' },
    equipment: row.equipment || { type: 'Equipo', brand: '', model: '' },
    issue: row.issue || '',
    initialDiagnosis: row.initial_diagnosis || '',
    technician: row.technician || '',
    costs: row.costs || { estimated: 0, advance: 0, balance: 0 },
    signature: row.signature || null,
    photos: row.photos || [],
    bitacora: row.bitacora || []
  };
}

async function syncSingleOrderToSupabase(order) {
  if (!AppState.supabase.client || !AppState.supabase.isConnected) return;
  const payload = mapLocalOrderToSupabase(order);
  try {
    const { error } = await AppState.supabase.client
      .from('orders')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.warn('Error sincronizando orden a Supabase:', error);
    } else {
      AppState.supabase.lastSync = new Date().toLocaleTimeString();
      updateSupabaseUI();
    }
  } catch (err) {
    console.warn('Excepción sincronizando orden a Supabase:', err);
  }

  // Sincronizar también cliente si existe
  if (order.client?.name && order.client?.phone) {
    syncClientToSupabase(order.client);
  }
}

async function deleteOrderFromSupabase(orderId) {
  if (!AppState.supabase.client) return;
  try {
    await AppState.supabase.client
      .from('orders')
      .delete()
      .eq('id', orderId.toString());
  } catch (err) {
    console.warn('Error eliminando orden de Supabase:', err);
  }
}

async function fetchOrdersFromSupabase(isAuto = false) {
  if (!AppState.supabase.client) return;
  try {
    const { data, error } = await AppState.supabase.client
      .from('orders')
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      if (!isAuto) alert('Error al consultar órdenes de Supabase: ' + error.message);
      return;
    }

    if (Array.isArray(data)) {
      const dbOrders = data.map(mapSupabaseOrderToLocal);

      // Si la base de datos de Supabase tiene órdenes, fusionar o adoptar
      if (dbOrders.length > 0) {
        const orderMap = new Map();
        // Cargar las órdenes de la nube
        dbOrders.forEach(o => orderMap.set(o.id.toString(), o));
        // Agregar órdenes locales que no estén en la nube
        AppState.orders.forEach(o => {
          if (!orderMap.has(o.id.toString())) {
            orderMap.set(o.id.toString(), o);
          }
        });

        // Ordenar numéricamente descendente
        AppState.orders = Array.from(orderMap.values()).sort((a, b) => {
          const numA = parseInt(a.id.toString().replace(/\D/g, '') || 0, 10);
          const numB = parseInt(b.id.toString().replace(/\D/g, '') || 0, 10);
          return numB - numA;
        });

        localStorage.setItem('glitchlab_orders', JSON.stringify(AppState.orders));
        renderDashboard();
        renderOrders();
        AppState.supabase.lastSync = new Date().toLocaleTimeString();
        updateSupabaseUI();
        if (!isAuto) showToast(`${dbOrders.length} órdenes descargadas de Supabase.`);
      }
    }
  } catch (err) {
    console.warn('Error cargando órdenes de Supabase:', err);
  }
}

async function pushAllToSupabase(isSilent = false) {
  if (!AppState.supabase.client) {
    if (!isSilent) alert('Conecta primero tu proyecto Supabase.');
    return;
  }

  try {
    if (!isSilent) showToast('Subiendo órdenes y clientes a Supabase...');
    
    // 1. Subir Clientes
    const clientsPayload = (AppState.clients || []).map(c => ({
      id: c.id || ('cli_' + (c.phone || '').replace(/\D/g, '')),
      name: c.name,
      phone: c.phone,
      email: c.email || null,
      address: c.address || null,
      total_orders: c.totalOrders || 1,
      notes: c.notes || null,
      updated_at: new Date().toISOString()
    }));

    if (clientsPayload.length > 0) {
      await AppState.supabase.client
        .from('clients')
        .upsert(clientsPayload, { onConflict: 'id' });
    }

    // 2. Subir Órdenes
    const ordersPayload = AppState.orders.map(mapLocalOrderToSupabase);
    if (ordersPayload.length > 0) {
      const { error } = await AppState.supabase.client
        .from('orders')
        .upsert(ordersPayload, { onConflict: 'id' });

      if (error) throw error;
    }

    AppState.supabase.lastSync = new Date().toLocaleTimeString();
    updateSupabaseUI();
    if (!isSilent) showToast(`¡${ordersPayload.length} órdenes y ${clientsPayload.length} clientes subidos a Supabase Cloud!`);
  } catch (err) {
    console.error('Error al subir a Supabase:', err);
    if (!isSilent) alert('Error al subir a Supabase: ' + err.message);
  }
}

async function pullAllFromSupabase() {
  if (!AppState.supabase.client) {
    alert('Conecta primero tu proyecto Supabase.');
    return;
  }
  showToast('Descargando datos de la nube...');
  await fetchClientsFromSupabase(false);
  await fetchOrdersFromSupabase(false);
}

// Demo data con identificadores iniciando desde 1
function seedDemoOrders() {
  AppState.orders = [
    {
      id: '1',
      date: new Date(Date.now() - 86400000 * 3).toISOString(),
      status: 'in_progress',
      client: {
        name: 'Carlos Mendoza',
        phone: '3119876543',
        email: 'carlos.mendoza@email.com',
        address: 'Col. San Juan #45, Tepic'
      },
      equipment: {
        type: 'Laptop',
        brand: 'ASUS',
        model: 'ROG Strix G15',
        serial: 'SN-G15-998822',
        lockType: 'password',
        password: 'User2026*',
        accessories: ['Cargador original', 'Funda'],
        condition: ['Rayones leves en tapa'],
        conditionNotes: 'Buen estado general, se apaga súbitamente'
      },
      issue: 'El equipo se apaga a los 10 minutos de encender. Cortocircuito aparente al conectar GPU.',
      initialDiagnosis: 'Sobrecalentamiento y línea principal de 19V inestable con caída de voltaje en etapa secundaria.',
      technician: 'Ing. Rivera',
      costs: {
        estimated: 2200,
        advance: 800,
        balance: 1400,
        paymentMethod: 'Transferencia'
      },
      signature: null,
      photos: [
        {
          id: 'photo_demo_1',
          url: 'https://images.unsplash.com/photo-1597872200969-2b65d56bd16b?auto=format&fit=crop&w=600&q=80',
          caption: 'Inspección de tarjeta madre en microscopio trinocular',
          date: new Date(Date.now() - 86400000 * 2.8).toISOString()
        },
        {
          id: 'photo_demo_2',
          url: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=600&q=80',
          caption: 'Detección de MOSFET en corto con cámara térmica',
          date: new Date(Date.now() - 86400000 * 1.5).toISOString()
        }
      ],
      bitacora: [
        {
          id: 'bit_1',
          date: new Date(Date.now() - 86400000 * 3).toISOString(),
          title: 'Recepción y apertura de orden',
          notes: 'Se recibe laptop ASUS ROG con cargador original para diagnóstico a nivel componente.',
          technician: 'Recepción Mostrador',
          status: 'received'
        },
        {
          id: 'bit_2',
          date: new Date(Date.now() - 86400000 * 2).toISOString(),
          title: 'Desarme y análisis microscópico',
          notes: 'Se desarmó el chasis. Medición con multímetro en bobinas secundarias. Resistencia a tierra en riel de 19V mide apenas 0.8 ohms.',
          technician: 'Ing. Rivera',
          status: 'diagnostic'
        },
        {
          id: 'bit_3',
          date: new Date(Date.now() - 86400000 * 1).toISOString(),
          title: 'Inyección de voltaje y reemplazo de MOSFET',
          notes: 'Con fuente de laboratorio se inyectó 1V y se detectó calentamiento en MOSFET PQ201. Se procedió a retirar con tobera de aire caliente y colocar componente original.',
          technician: 'Ing. Rivera',
          status: 'in_progress'
        }
      ]
    },
    {
      id: '2',
      date: new Date(Date.now() - 86400000 * 6).toISOString(),
      deliveredDate: new Date(Date.now() - 86400000 * 1).toISOString(),
      status: 'delivered',
      warrantyDays: 30,
      client: {
        name: 'Mariana López',
        phone: '3114433221',
        email: 'mariana.lpz@gmail.com',
        address: 'Av. Jacarandas #120, Tepic'
      },
      equipment: {
        type: 'PC de Escritorio',
        brand: 'Custom Gaming',
        model: 'Ryzen 7 + RTX 4070',
        serial: 'N/A',
        lockType: 'pin',
        password: '1234',
        accessories: ['Cable de poder'],
        condition: ['Gabinete de cristal intacto'],
        conditionNotes: 'Sin detalles estéticos'
      },
      issue: 'Pantallazos azules continuos al encender. No entra al sistema operativo.',
      initialDiagnosis: 'Corrupción de BIOS y falla en capacitor de filtrado.',
      technician: 'Ing. Rivera',
      costs: {
        estimated: 1600,
        advance: 600,
        balance: 0,
        paymentMethod: 'Efectivo'
      },
      signature: null,
      photos: [],
      bitacora: [
        {
          id: 'bit_2_1',
          date: new Date(Date.now() - 86400000 * 6).toISOString(),
          title: 'Equipo recibido en laboratorio',
          notes: 'Ingreso al taller para pruebas de estabilidad y microelectrónica.',
          technician: 'Recepción Mostrador',
          status: 'received'
        },
        {
          id: 'bit_2_2',
          date: new Date(Date.now() - 86400000 * 3).toISOString(),
          title: 'Reprogramación SPI Flash (BIOS)',
          notes: 'Se desoldó la memoria SPI Flash y se reprogramó el firmware limpio con programador RT809H.',
          technician: 'Ing. Rivera',
          status: 'in_progress'
        },
        {
          id: 'bit_2_3',
          date: new Date(Date.now() - 86400000 * 1).toISOString(),
          title: 'Equipo entregado con éxito',
          notes: 'Pruebas concluidas y entregado al cliente a satisfacción.',
          technician: 'Recepción Mostrador',
          status: 'delivered'
        }
      ]
    }
  ];
  saveOrders();
}

// Configuración del Canvas de Firma
function setupSignaturePad() {
  signatureCanvas = document.getElementById('signatureCanvas');
  if (!signatureCanvas) return;
  
  signatureCtx = signatureCanvas.getContext('2d');
  resizeSignatureCanvas();

  signatureCanvas.addEventListener('mousedown', startDrawing);
  signatureCanvas.addEventListener('mousemove', draw);
  signatureCanvas.addEventListener('mouseup', stopDrawing);
  signatureCanvas.addEventListener('mouseleave', stopDrawing);

  signatureCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    signatureCanvas.dispatchEvent(mouseEvent);
  });

  signatureCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    signatureCanvas.dispatchEvent(mouseEvent);
  });

  signatureCanvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const mouseEvent = new MouseEvent('mouseup', {});
    signatureCanvas.dispatchEvent(mouseEvent);
  });
}

function resizeSignatureCanvas() {
  if (!signatureCanvas) return;
  const rect = signatureCanvas.getBoundingClientRect();
  signatureCanvas.width = rect.width || 450;
  signatureCanvas.height = 150;
  
  if (signatureCtx) {
    signatureCtx.lineWidth = 2.5;
    signatureCtx.lineCap = 'round';
    signatureCtx.lineJoin = 'round';
    signatureCtx.strokeStyle = '#0284c7';
  }
}

function getCanvasCoords(e) {
  const rect = signatureCanvas.getBoundingClientRect();
  const scaleX = signatureCanvas.width / rect.width;
  const scaleY = signatureCanvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function startDrawing(e) {
  isDrawing = true;
  hasSignature = true;
  const coords = getCanvasCoords(e);
  signatureCtx.beginPath();
  signatureCtx.moveTo(coords.x, coords.y);
}

function draw(e) {
  if (!isDrawing) return;
  const coords = getCanvasCoords(e);
  signatureCtx.lineTo(coords.x, coords.y);
  signatureCtx.stroke();
}

function stopDrawing() {
  if (isDrawing) {
    signatureCtx.closePath();
    isDrawing = false;
  }
}

function clearSignature() {
  if (!signatureCtx || !signatureCanvas) return;
  signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
  hasSignature = false;
}

// Configurar Event Listeners Principales
function setupEventListeners() {
  const btnNewOrder = document.getElementById('btnNewOrder');
  if (btnNewOrder) {
    btnNewOrder.addEventListener('click', openNewOrderModal);
  }

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      AppState.searchQuery = e.target.value.toLowerCase().trim();
      renderOrders();
    });
  }

  const filterButtons = document.querySelectorAll('.filter-pill');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active', 'bg-sky-500', 'text-white'));
      filterButtons.forEach(b => b.classList.add('bg-slate-800', 'text-slate-300'));
      btn.classList.add('active', 'bg-sky-500', 'text-white');
      btn.classList.remove('bg-slate-800', 'text-slate-300');
      
      AppState.filterStatus = btn.dataset.status;
      renderOrders();
    });
  });

  const costEstimateInput = document.getElementById('costEstimated');
  const costAdvanceInput = document.getElementById('costAdvance');
  const costBalanceDisplay = document.getElementById('costBalanceDisplay');

  function updateBalance() {
    const est = parseFloat(costEstimateInput.value) || 0;
    const adv = parseFloat(costAdvanceInput.value) || 0;
    const bal = Math.max(0, est - adv);
    if (costBalanceDisplay) {
      costBalanceDisplay.innerText = `$${bal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
    }
  }

  if (costEstimateInput && costAdvanceInput) {
    costEstimateInput.addEventListener('input', updateBalance);
    costAdvanceInput.addEventListener('input', updateBalance);
  }

  const lockTypeSelect = document.getElementById('lockType');
  const passwordFieldContainer = document.getElementById('passwordFieldContainer');
  const passwordInput = document.getElementById('devicePassword');
  
  if (lockTypeSelect) {
    lockTypeSelect.addEventListener('change', () => {
      const val = lockTypeSelect.value;
      if (val === 'none') {
        passwordFieldContainer.classList.add('hidden');
        passwordInput.value = '';
      } else {
        passwordFieldContainer.classList.remove('hidden');
        if (val === 'pin') {
          passwordInput.placeholder = 'Ej: 1234 o 0000 (Solo números)';
        } else if (val === 'pattern') {
          passwordInput.placeholder = 'Ej: Patrón L, Z, o secuencia de 9 puntos';
        } else {
          passwordInput.placeholder = 'Contraseña alfanumérica del sistema';
        }
      }
    });
  }

  const btnTogglePassword = document.getElementById('btnTogglePassword');
  if (btnTogglePassword && passwordInput) {
    btnTogglePassword.addEventListener('click', () => {
      if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        btnTogglePassword.innerHTML = '<i class="fas fa-eye-slash"></i>';
      } else {
        passwordInput.type = 'password';
        btnTogglePassword.innerHTML = '<i class="fas fa-eye"></i>';
      }
    });
  }

  const orderForm = document.getElementById('orderForm');
  if (orderForm) {
    orderForm.addEventListener('submit', handleSaveOrder);
  }

  const btnClearSig = document.getElementById('btnClearSignature');
  if (btnClearSig) {
    btnClearSig.addEventListener('click', clearSignature);
  }

  const photoFileInput = document.getElementById('photoFileInput');
  if (photoFileInput) {
    photoFileInput.addEventListener('change', handlePhotoUpload);
  }

  const bitacoraForm = document.getElementById('bitacoraForm');
  if (bitacoraForm) {
    bitacoraForm.addEventListener('submit', handleAddBitacoraEntry);
  }

  const newInventoryForm = document.getElementById('newInventoryForm');
  if (newInventoryForm) {
    newInventoryForm.addEventListener('submit', handleAddInventoryItem);
  }
}

// Renderizar Métricas
function renderDashboard() {
  const total = AppState.orders.length;
  const inShop = AppState.orders.filter(o => ['received', 'diagnostic', 'in_progress', 'waiting_parts'].includes(o.status)).length;
  const ready = AppState.orders.filter(o => o.status === 'ready').length;
  
  let totalPendingBalance = 0;
  AppState.orders.forEach(o => {
    if (o.costs && o.status !== 'delivered' && o.status !== 'cancelled') {
      totalPendingBalance += (o.costs.balance || 0);
    }
  });

  const elTotal = document.getElementById('metricTotalOrders');
  const elInShop = document.getElementById('metricInShop');
  const elReady = document.getElementById('metricReady');
  const elPendingBalance = document.getElementById('metricPendingBalance');

  if (elTotal) elTotal.innerText = total;
  if (elInShop) elInShop.innerText = inShop;
  if (elReady) elReady.innerText = ready;
  if (elPendingBalance) elPendingBalance.innerText = `$${totalPendingBalance.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`;

  updateFilterBadges();
}

function updateFilterBadges() {
  const counts = {
    all: AppState.orders.length,
    received: AppState.orders.filter(o => o.status === 'received').length,
    diagnostic: AppState.orders.filter(o => o.status === 'diagnostic').length,
    in_progress: AppState.orders.filter(o => o.status === 'in_progress').length,
    waiting_parts: AppState.orders.filter(o => o.status === 'waiting_parts').length,
    ready: AppState.orders.filter(o => o.status === 'ready').length,
    delivered: AppState.orders.filter(o => o.status === 'delivered').length,
    cancelled: AppState.orders.filter(o => o.status === 'cancelled').length
  };

  for (const [key, count] of Object.entries(counts)) {
    const badge = document.getElementById(`count-${key}`);
    if (badge) badge.innerText = count;
  }
}

const StatusMeta = {
  received: { label: 'Recibido', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40', dotColor: 'bg-blue-400', timingLabel: 'Ingresado', icon: 'fa-inbox' },
  diagnostic: { label: 'En Diagnóstico', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40', dotColor: 'bg-amber-400', timingLabel: 'En Revisión', icon: 'fa-microchip' },
  in_progress: { label: 'En Reparación', color: 'bg-sky-500/20 text-sky-400 border-sky-500/40', dotColor: 'bg-sky-400', timingLabel: 'A tiempo', icon: 'fa-screwdriver-wrench' },
  waiting_parts: { label: 'Espera de Repuesto', color: 'bg-orange-500/20 text-orange-400 border-orange-500/40', dotColor: 'bg-orange-400', timingLabel: 'Pieza pedida', icon: 'fa-clock' },
  ready: { label: 'Listo para Entrega', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', dotColor: 'bg-emerald-400', timingLabel: 'Listo', icon: 'fa-circle-check' },
  delivered: { label: 'Entregado', color: 'bg-slate-500/20 text-slate-400 border-slate-500/40', dotColor: 'bg-slate-400', timingLabel: 'Entregado', icon: 'fa-handshake' },
  cancelled: { label: 'Cancelado', color: 'bg-red-500/20 text-red-400 border-red-500/40', dotColor: 'bg-red-400', timingLabel: 'Cancelado', icon: 'fa-ban' }
};

// Cambio de modo de vista: Cuadrícula (Cards) vs Lista (Tabla)
function setViewMode(mode) {
  AppState.viewMode = mode;
  const btnGrid = document.getElementById('btnViewGrid');
  const btnList = document.getElementById('btnViewList');
  const gridContainer = document.getElementById('ordersContainer');
  const listContainer = document.getElementById('ordersListContainer');

  if (mode === 'list') {
    if (btnGrid) btnGrid.className = 'p-2 rounded-full text-slate-400 hover:text-white transition';
    if (btnList) btnList.className = 'p-2 rounded-full text-white bg-slate-800 transition shadow';
    if (gridContainer) gridContainer.classList.add('hidden');
    if (listContainer) listContainer.classList.remove('hidden');
  } else {
    if (btnGrid) btnGrid.className = 'p-2 rounded-full text-white bg-slate-800 transition shadow';
    if (btnList) btnList.className = 'p-2 rounded-full text-slate-400 hover:text-white transition';
    if (gridContainer) gridContainer.classList.remove('hidden');
    if (listContainer) listContainer.classList.add('hidden');
  }
}

function switchNavSection(section) {
  const tabServices = document.getElementById('navTabServices');
  if (tabServices) {
    tabServices.className = 'nav-pill active px-5 py-2 rounded-full bg-white text-slate-900 font-bold text-sm shadow transition flex items-center gap-2';
  }
  AppState.filterStatus = 'all';
  document.querySelectorAll('.filter-pill').forEach(b => {
    b.classList.remove('active', 'bg-white', 'text-slate-950');
    b.classList.add('bg-slate-900', 'text-slate-400');
  });
  const firstPill = document.querySelector('.filter-pill[data-status="all"]');
  if (firstPill) {
    firstPill.classList.add('active', 'bg-white', 'text-slate-950');
    firstPill.classList.remove('bg-slate-900', 'text-slate-400');
  }
  renderOrders();
}

function filterByWarranty() {
  AppState.filterStatus = 'delivered';
  document.querySelectorAll('.filter-pill').forEach(b => {
    b.classList.remove('active', 'bg-white', 'text-slate-950');
    b.classList.add('bg-slate-900', 'text-slate-400');
  });
  const delPill = document.querySelector('.filter-pill[data-status="delivered"]');
  if (delPill) {
    delPill.classList.add('active', 'bg-white', 'text-slate-950');
    delPill.classList.remove('bg-slate-900', 'text-slate-400');
  }
  renderOrders();
  showToast('Mostrando equipos entregados para verificación de garantía.');
}

function showQuickNotifications() {
  const inShopCount = AppState.orders.filter(o => ['received', 'diagnostic', 'in_progress'].includes(o.status)).length;
  const readyCount = AppState.orders.filter(o => o.status === 'ready').length;
  alert(`Notificaciones del Laboratorio:\n• ${inShopCount} equipos actualmente en proceso técnico.\n• ${readyCount} equipos listos para ser entregados al cliente.`);
}

// Renderizar Tarjetas de Órdenes (Estilo Minimalista Inspirado en la Referencia)
function renderOrders() {
  const container = document.getElementById('ordersContainer');
  const listContainer = document.getElementById('ordersListTableBody');
  if (!container) return;

  let filtered = AppState.orders;

  if (AppState.filterStatus !== 'all') {
    filtered = filtered.filter(o => o.status === AppState.filterStatus);
  }

  if (AppState.searchQuery) {
    const q = AppState.searchQuery.toLowerCase().trim().replace(/^#/, '');
    filtered = filtered.filter(o => {
      const folio = (o.id || '').toString().toLowerCase();
      const clientName = (o.client?.name || '').toLowerCase();
      const phone = (o.client?.phone || '').toLowerCase();
      const brand = (o.equipment?.brand || '').toLowerCase();
      const model = (o.equipment?.model || '').toLowerCase();
      const type = (o.equipment?.type || '').toLowerCase();
      const serial = (o.equipment?.serial || '').toLowerCase();
      const issue = (o.issue || '').toLowerCase();
      return folio.includes(q) || clientName.includes(q) || phone.includes(q) ||
             brand.includes(q) || model.includes(q) || type.includes(q) ||
             serial.includes(q) || issue.includes(q);
    });
  }

  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Actualizar contador en la cabecera
  const badgeTotal = document.getElementById('badgeTotalCounter');
  if (badgeTotal) badgeTotal.innerText = filtered.length;

  if (filtered.length === 0) {
    const emptyHtml = `
      <div class="col-span-full flex flex-col items-center justify-center p-12 text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800">
        <i class="fas fa-microchip text-4xl mb-3 text-slate-600"></i>
        <p class="text-base font-bold text-slate-300">No hay órdenes para mostrar</p>
        <p class="text-xs text-slate-500 mt-1">Crea una nueva orden o cambia los filtros de búsqueda.</p>
        <button onclick="openNewOrderModal()" class="mt-4 px-4 py-2 bg-white hover:bg-slate-100 text-slate-950 rounded-full text-xs font-bold transition flex items-center gap-2 shadow">
          <i class="fas fa-plus"></i> Crear Orden
        </button>
      </div>
    `;
    container.innerHTML = emptyHtml;
    if (listContainer) {
      listContainer.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-500">No se encontraron órdenes de servicio.</td></tr>`;
    }
    return;
  }

  // 1. RENDERIZAR VISTA EN CUADRÍCULA (Estilo Minimalista y Limpio - Clic abre Detalle Completo)
  container.innerHTML = filtered.map(order => {
    const meta = StatusMeta[order.status] || StatusMeta.received;
    const dateFormatted = new Date(order.date).toLocaleDateString('es-MX', {
      day: '2-digit', month: '2-digit', year: '2-digit'
    });

    // Departamento según tipo de equipo
    let dept = '⚙ Microelectrónica';
    const typeLower = (order.equipment?.type || '').toLowerCase();
    if (typeLower.includes('impresora') || typeLower.includes('otro')) dept = '⚙ Servicios Generales';
    else if (typeLower.includes('consola')) dept = '⚙ Gaming Lab';
    else if (typeLower.includes('tarjeta')) dept = '⚙ Microelectrónica';
    else if (typeLower.includes('escritorio') || typeLower.includes('pc')) dept = '⚙ Hardware PC';
    else if (typeLower.includes('laptop')) dept = '⚙ Laptops & BGA';

    const warranty = getWarrantyStatus(order);

    return `
      <div 
        onclick="openOrderDetailModal('${order.id}')" 
        class="bg-[#0b101d] hover:bg-[#0f172a] border border-slate-800/90 hover:border-sky-500/50 rounded-2xl p-5 transition-all duration-200 shadow-xl hover:shadow-sky-500/5 flex flex-col justify-between group cursor-pointer relative overflow-hidden select-none"
        title="Haz clic para ver el detalle completo de la orden #${order.id}"
      >
        <div>
          <!-- Cabecera Superior: Folio Numérico #1, Fecha y Estatus con Dot -->
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-mono text-base font-black text-white tracking-tight group-hover:text-sky-400 transition-colors">#${order.id}</span>
                ${warranty.hasWarranty ? `
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${warranty.class}">
                    ${warranty.badge}
                  </span>
                ` : ''}
              </div>
              <div class="flex items-center gap-1.5 text-slate-400 text-xs mt-0.5">
                <i class="far fa-calendar text-[11px]"></i>
                <span>${dateFormatted}</span>
              </div>
            </div>

            <!-- Estatus con Punto Indicador a la Derecha (estilo "• A tiempo") -->
            <div class="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
              <span class="w-2 h-2 rounded-full ${meta.dotColor}"></span>
              <span>${meta.timingLabel}</span>
            </div>
          </div>

          <!-- Nombre del Cliente (Grande, Negrita y Mayúsculas) -->
          <div class="mt-4">
            <h3 class="font-extrabold text-sm sm:text-base text-white tracking-wide uppercase leading-tight group-hover:text-sky-300 transition-colors">
              ${escapeHtml(order.client?.name || 'CLIENTE')}
            </h3>
            <p class="text-xs text-slate-400 mt-0.5 font-medium">
              ${escapeHtml(order.equipment?.type || 'Equipo')} • ${escapeHtml(order.equipment?.brand || '')} ${escapeHtml(order.equipment?.model || '')}
            </p>
          </div>

          <!-- Caja de Falla Reportada (Limpia y minimalista) -->
          <div class="mt-3.5 p-3.5 bg-[#060913] rounded-xl border border-slate-800/80 text-xs text-slate-200 font-medium">
            <span class="italic font-semibold block leading-relaxed line-clamp-2">
              "${escapeHtml((order.issue || 'SIN FALLA ESPECIFICADA').toUpperCase())}"
            </span>
          </div>
        </div>

        <!-- Footer Tarjeta: Estado a la izquierda, Departamento a la derecha con indicación de clic -->
        <div class="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300">
              <span class="w-2 h-2 rounded-full ${meta.dotColor}"></span>
              ${meta.label}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-[11px] text-slate-400 font-medium">${dept}</span>
            <i class="fas fa-chevron-right text-[10px] text-slate-600 group-hover:text-sky-400 group-hover:translate-x-0.5 transition-all"></i>
          </div>
        </div>

      </div>
    `;
  }).join('');

  // 2. RENDERIZAR VISTA EN LISTA (TABLA)
  if (listContainer) {
    listContainer.innerHTML = filtered.map(order => {
      const meta = StatusMeta[order.status] || StatusMeta.received;
      const dateFormatted = new Date(order.date).toLocaleDateString('es-MX', {
        day: '2-digit', month: '2-digit', year: '2-digit'
      });
      const balance = order.costs?.balance ?? 0;
      const est = order.costs?.estimated ?? 0;

      return `
        <tr onclick="openOrderDetailModal('${order.id}')" class="border-b border-slate-800/80 hover:bg-slate-800/30 cursor-pointer transition">
          <td class="py-3 px-4 font-mono font-black text-white">#${order.id}</td>
          <td class="py-3 px-4 text-slate-400 whitespace-nowrap">${dateFormatted}</td>
          <td class="py-3 px-4">
            <div class="font-bold text-white uppercase">${escapeHtml(order.client?.name || '')}</div>
            <div class="text-[10px] text-slate-400">${escapeHtml(order.client?.phone || '')}</div>
          </td>
          <td class="py-3 px-4">
            <div class="text-slate-200 font-semibold">${escapeHtml(order.equipment?.brand || '')} ${escapeHtml(order.equipment?.model || '')}</div>
            <div class="text-[10px] text-slate-400">${escapeHtml(order.equipment?.type || '')}</div>
          </td>
          <td class="py-3 px-4 max-w-xs truncate text-slate-300 italic">
            "${escapeHtml(order.issue || '')}"
          </td>
          <td class="py-3 px-4">
            <span class="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-200">
              <span class="w-2 h-2 rounded-full ${meta.dotColor}"></span> ${meta.label}
            </span>
          </td>
          <td class="py-3 px-4">
            <div class="font-semibold text-white">$${est.toLocaleString('es-MX')}</div>
            ${balance > 0 ? `<div class="text-[10px] text-amber-400 font-bold">Resta: $${balance.toLocaleString('es-MX')}</div>` : `<div class="text-[10px] text-emerald-400 font-bold">Liquidado</div>`}
          </td>
          <td class="py-3 px-4 text-right whitespace-nowrap" onclick="event.stopPropagation()">
            <div class="flex items-center justify-end gap-1">
              <button onclick="openOrderDetailModal('${order.id}')" title="Ver Detalle Completo" class="p-1.5 text-sky-400 hover:bg-slate-800 rounded">
                <i class="fas fa-expand"></i>
              </button>
              <button onclick="openQuickLabelPrint('${order.id}')" title="Imprimir Etiqueta" class="p-1.5 text-amber-300 hover:bg-slate-800 rounded">
                <i class="fas fa-tag"></i>
              </button>
              <button onclick="downloadCustomerPDF('${order.id}')" title="Descargar PDF" class="p-1.5 text-red-400 hover:bg-slate-800 rounded">
                <i class="fas fa-file-pdf"></i>
              </button>
              <button onclick="openWhatsAppTemplatesModal('${order.id}')" title="WhatsApp" class="p-1.5 text-emerald-400 hover:bg-slate-800 rounded">
                <i class="fab fa-whatsapp"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
}

// ==========================================
// 9.5 MODAL DE DETALLE COMPLETO DE ORDEN
// ==========================================

let currentDetailOrderId = null;

function openOrderDetailModal(orderId) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  currentDetailOrderId = orderId;
  const meta = StatusMeta[order.status] || StatusMeta.received;
  const warranty = getWarrantyStatus(order);

  const dateFormatted = new Date(order.date).toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  // Cabecera del Detalle
  const dtlFolioNum = document.getElementById('dtlFolioNum');
  const dtlFolio = document.getElementById('dtlFolio');
  const dtlDate = document.getElementById('dtlDate');
  const dtlTechnician = document.getElementById('dtlTechnician');

  if (dtlFolioNum) dtlFolioNum.innerText = order.id;
  if (dtlFolio) dtlFolio.innerText = order.id;
  if (dtlDate) dtlDate.innerText = dateFormatted;
  if (dtlTechnician) dtlTechnician.innerText = order.technician || 'Equipo GlitchLab';

  // Badges de Estatus y Garantía
  const dtlStatusBadge = document.getElementById('dtlStatusBadge');
  if (dtlStatusBadge) {
    dtlStatusBadge.innerHTML = `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${meta.color}">
        <i class="fas ${meta.icon} text-[10px]"></i> ${meta.label}
      </span>
    `;
  }

  const dtlWarrantyBadge = document.getElementById('dtlWarrantyBadge');
  if (dtlWarrantyBadge) {
    if (warranty.hasWarranty) {
      dtlWarrantyBadge.innerHTML = `
        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${warranty.class}">
          ${warranty.badge}
        </span>
      `;
      dtlWarrantyBadge.classList.remove('hidden');
    } else {
      dtlWarrantyBadge.innerHTML = '';
      dtlWarrantyBadge.classList.add('hidden');
    }
  }

  // Información del Cliente
  const clientPhone = order.client?.phone || '';
  const dtlClientName = document.getElementById('dtlClientName');
  const dtlClientPhone = document.getElementById('dtlClientPhone');
  const dtlClientEmail = document.getElementById('dtlClientEmail');
  const dtlClientAddress = document.getElementById('dtlClientAddress');

  if (dtlClientName) dtlClientName.innerText = order.client?.name || 'Cliente';
  if (dtlClientPhone) dtlClientPhone.innerText = clientPhone || 'No registrado';
  if (dtlClientEmail) dtlClientEmail.innerText = order.client?.email || 'No registrado';
  if (dtlClientAddress) dtlClientAddress.innerText = order.client?.address || 'No registrada';

  const btnCall = document.getElementById('dtlBtnCall');
  if (btnCall) {
    if (clientPhone) {
      btnCall.href = `tel:${clientPhone.replace(/\D/g, '')}`;
      btnCall.classList.remove('opacity-50', 'pointer-events-none');
    } else {
      btnCall.href = '#';
      btnCall.classList.add('opacity-50', 'pointer-events-none');
    }
  }

  // Información del Dispositivo
  const dtlEquipmentName = document.getElementById('dtlEquipmentName');
  const dtlEquipmentSerial = document.getElementById('dtlEquipmentSerial');
  const dtlEquipmentPassword = document.getElementById('dtlEquipmentPassword');
  const btnToggleDtlPass = document.getElementById('btnToggleDtlPass');
  const dtlEquipmentAccessories = document.getElementById('dtlEquipmentAccessories');
  const dtlEquipmentCondition = document.getElementById('dtlEquipmentCondition');

  if (dtlEquipmentName) {
    dtlEquipmentName.innerText = `${order.equipment?.type || 'Equipo'} • ${order.equipment?.brand || ''} ${order.equipment?.model || ''}`;
  }
  if (dtlEquipmentSerial) {
    dtlEquipmentSerial.innerText = order.equipment?.serial || 'Sin número de serie';
  }

  const passVal = order.equipment?.password || '';
  if (dtlEquipmentPassword) {
    if (passVal) {
      dtlEquipmentPassword.dataset.password = passVal;
      dtlEquipmentPassword.dataset.masked = 'true';
      dtlEquipmentPassword.innerText = '••••••••';
      if (btnToggleDtlPass) {
        btnToggleDtlPass.classList.remove('hidden');
        btnToggleDtlPass.innerHTML = '<i class="fas fa-eye"></i>';
        btnToggleDtlPass.onclick = () => {
          const isMasked = dtlEquipmentPassword.dataset.masked === 'true';
          if (isMasked) {
            dtlEquipmentPassword.innerText = dtlEquipmentPassword.dataset.password;
            dtlEquipmentPassword.dataset.masked = 'false';
            btnToggleDtlPass.innerHTML = '<i class="fas fa-eye-slash"></i>';
          } else {
            dtlEquipmentPassword.innerText = '••••••••';
            dtlEquipmentPassword.dataset.masked = 'true';
            btnToggleDtlPass.innerHTML = '<i class="fas fa-eye"></i>';
          }
        };
      }
    } else {
      dtlEquipmentPassword.innerText = 'Sin clave / PIN';
      if (btnToggleDtlPass) btnToggleDtlPass.classList.add('hidden');
    }
  }

  const acc = order.equipment?.accessories;
  if (dtlEquipmentAccessories) {
    dtlEquipmentAccessories.innerText = (acc && acc.length > 0) ? acc.join(', ') : 'Ninguno (Solo equipo)';
  }

  const conditions = [...(order.equipment?.condition || [])];
  if (order.equipment?.conditionNotes) conditions.push(order.equipment.conditionNotes);
  if (dtlEquipmentCondition) {
    dtlEquipmentCondition.innerText = conditions.length > 0 ? conditions.join(' • ') : 'Buen estado aparente';
  }

  // Motivo de Ingreso & Diagnóstico
  const dtlIssue = document.getElementById('dtlIssue');
  const dtlDiagnosis = document.getElementById('dtlDiagnosis');
  if (dtlIssue) dtlIssue.innerText = `"${(order.issue || 'No especificada').toUpperCase()}"`;
  if (dtlDiagnosis) dtlDiagnosis.innerText = order.initialDiagnosis || 'En proceso de revisión por los ingenieros de laboratorio.';

  // Finanzas
  const est = (order.costs?.estimated || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const adv = (order.costs?.advance || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const bal = (order.costs?.balance || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });

  const dtlCostEst = document.getElementById('dtlCostEst');
  const dtlCostAdv = document.getElementById('dtlCostAdv');
  const dtlCostMethod = document.getElementById('dtlCostMethod');
  const dtlCostBal = document.getElementById('dtlCostBal');

  if (dtlCostEst) dtlCostEst.innerText = `$${est} MXN`;
  if (dtlCostAdv) dtlCostAdv.innerText = `$${adv} MXN`;
  if (dtlCostMethod) dtlCostMethod.innerText = order.costs?.paymentMethod || 'Efectivo';
  if (dtlCostBal) dtlCostBal.innerText = `$${bal} MXN`;

  // Select de Estado Rápido
  const quickStatusSelect = document.getElementById('dtlQuickStatusSelect');
  if (quickStatusSelect) quickStatusSelect.value = order.status;

  // Acciones Rápidas del Footer
  const dtlBtnSticker = document.getElementById('dtlBtnSticker');
  if (dtlBtnSticker) {
    dtlBtnSticker.onclick = () => {
      closeOrderDetailModal();
      openQuickLabelPrint(order.id);
    };
  }

  const dtlBtnPdf = document.getElementById('dtlBtnPdf');
  if (dtlBtnPdf) {
    dtlBtnPdf.onclick = () => {
      downloadCustomerPDF(order.id);
    };
  }

  const dtlBtnPrint = document.getElementById('dtlBtnPrint');
  if (dtlBtnPrint) {
    dtlBtnPrint.onclick = () => {
      closeOrderDetailModal();
      openPrintModal(order.id);
    };
  }

  const dtlBtnBitacora = document.getElementById('dtlBtnBitacora');
  if (dtlBtnBitacora) {
    dtlBtnBitacora.onclick = () => {
      closeOrderDetailModal();
      openBitacoraModal(order.id);
    };
  }

  const dtlBtnEdit = document.getElementById('dtlBtnEdit');
  if (dtlBtnEdit) {
    dtlBtnEdit.onclick = () => {
      closeOrderDetailModal();
      editOrder(order.id);
    };
  }

  const dtlBtnDelete = document.getElementById('dtlBtnDelete');
  if (dtlBtnDelete) {
    dtlBtnDelete.onclick = () => {
      closeOrderDetailModal();
      deleteOrder(order.id);
    };
  }

  // Mostrar el Modal
  const modal = document.getElementById('orderDetailModal');
  if (modal) modal.classList.remove('hidden');
}

function closeOrderDetailModal() {
  const modal = document.getElementById('orderDetailModal');
  if (modal) modal.classList.add('hidden');
  currentDetailOrderId = null;
}

function handleDtlQuickStatusChange(newStatus) {
  if (!currentDetailOrderId) return;
  updateOrderStatusQuick(currentDetailOrderId, newStatus);
  openOrderDetailModal(currentDetailOrderId);
}

function openWhatsAppForCurrentOrder() {
  if (!currentDetailOrderId) return;
  const orderId = currentDetailOrderId;
  closeOrderDetailModal();
  openWhatsAppTemplatesModal(orderId);
}

// ==========================================
// 10. BITÁCORA Y FOTOS
// ==========================================

function openBitacoraModal(orderId) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  AppState.activeBitacoraOrderId = orderId;

  document.getElementById('bitacoraFolioBadge').innerText = order.id;
  document.getElementById('bitacoraEquipmentHeader').innerText = `${order.equipment.type} ${order.equipment.brand} ${order.equipment.model}`;
  document.getElementById('bitacoraClientHeader').innerText = order.client.name;
  document.getElementById('bitacoraNewStatus').value = order.status;

  if (AppState.auth.currentUser) {
    document.getElementById('bitacoraTechnician').value = AppState.auth.currentUser.name || AppState.auth.currentUser.username;
  }

  renderBitacoraTimeline(order);
  renderPhotoGallery(order);

  const modal = document.getElementById('bitacoraModal');
  modal.classList.remove('hidden');
}

function closeBitacoraModal() {
  const modal = document.getElementById('bitacoraModal');
  if (modal) modal.classList.add('hidden');
  AppState.activeBitacoraOrderId = null;
}

function renderBitacoraTimeline(order) {
  const container = document.getElementById('bitacoraTimeline');
  if (!container) return;

  const logs = order.bitacora || [];

  if (logs.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-500 text-sm">
        <i class="fas fa-clipboard-list text-3xl mb-2 text-slate-600 block"></i>
        No hay registros aún en la bitácora técnica de este equipo.
      </div>
    `;
    return;
  }

  const sorted = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));

  container.innerHTML = sorted.map(log => {
    const dateFormatted = new Date(log.date).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const statusMeta = StatusMeta[log.status] || StatusMeta.received;

    return `
      <div class="relative pl-6 pb-6 border-l-2 border-slate-800 timeline-item last:border-transparent">
        <div class="bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow-md hover:border-slate-700/80 transition">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
            <span class="font-bold text-sm text-white">${escapeHtml(log.title)}</span>
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${statusMeta.color}">
                <i class="fas ${statusMeta.icon}"></i> ${statusMeta.label}
              </span>
              <span class="text-xs text-slate-500 font-mono">${dateFormatted}</span>
            </div>
          </div>
          <p class="text-xs text-slate-300 leading-relaxed mb-2">${escapeHtml(log.notes)}</p>
          <div class="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
            <span><i class="fas fa-user-gear text-sky-400"></i> Por: ${escapeHtml(log.technician || 'Técnico GlitchLab')}</span>
            <div class="flex items-center gap-2">
              <button onclick="shareBitacoraEntryWhatsApp('${order.id}', '${log.id}')" class="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 transition" title="Compartir avance por WhatsApp">
                <i class="fab fa-whatsapp"></i> Compartir
              </button>
              <button onclick="deleteBitacoraEntry('${order.id}', '${log.id}')" class="p-1 px-2 text-slate-400 hover:text-red-400 hover:bg-red-950/40 border border-slate-800 hover:border-red-800/50 rounded-lg transition flex items-center gap-1 text-[10px] font-medium" title="Borrar este avance si hubo un error para volver a agregarlo">
                <i class="fas fa-trash-can text-[10px]"></i> Borrar
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Eliminar un avance erróneo de la bitácora y recargar en formulario para corregir
function deleteBitacoraEntry(orderId, bitacoraId) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order || !order.bitacora) return;

  const entry = order.bitacora.find(b => b.id === bitacoraId);
  if (!entry) return;

  if (confirm(`¿Deseas borrar este registro de avance ("${entry.title}")?\n\nLos datos se cargarán en el formulario para que puedas corregirlos y volver a guardar.`)) {
    // Cargar datos en el formulario de avance para facilitar la corrección
    const titleField = document.getElementById('bitacoraTitle');
    const notesField = document.getElementById('bitacoraNotes');
    const statusField = document.getElementById('bitacoraNewStatus');
    const techField = document.getElementById('bitacoraTechnician');

    if (titleField) titleField.value = entry.title || '';
    if (notesField) notesField.value = entry.notes || '';
    if (statusField) statusField.value = entry.status || order.status;
    if (techField && entry.technician) techField.value = entry.technician;

    // Eliminar la entrada de la lista
    order.bitacora = order.bitacora.filter(b => b.id !== bitacoraId);

    // Si aún quedan entradas en la bitácora, sincronizar el estado de la orden con el registro más reciente
    if (order.bitacora.length > 0) {
      const sorted = [...order.bitacora].sort((a, b) => new Date(b.date) - new Date(a.date));
      order.status = sorted[0].status;
    }

    saveOrders();
    syncSingleOrderToSupabase(order);
    renderBitacoraTimeline(order);
    document.getElementById('bitacoraNewStatus').value = order.status;
    renderDashboard();
    renderOrders();
    showToast('Registro eliminado y cargado en el formulario para corregir.');
    if (titleField) titleField.focus();
  }
}

function renderPhotoGallery(order) {
  const container = document.getElementById('photoGalleryContainer');
  const countBadge = document.getElementById('photoCountBadge');
  if (!container) return;

  const photos = order.photos || [];
  if (countBadge) countBadge.innerText = photos.length;

  if (photos.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-8 text-slate-500 text-xs">
        <i class="fas fa-camera text-3xl mb-2 text-slate-600 block"></i>
        No hay fotos cargadas. Sube evidencia fotográfica del desarme, medición o reparación.
      </div>
    `;
    return;
  }

  container.innerHTML = photos.map(photo => {
    const dateFormatted = new Date(photo.date).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    return `
      <div class="relative group bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
        <div class="aspect-video w-full bg-black cursor-pointer overflow-hidden" onclick="openLightbox('${photo.url}', '${escapeHtml(photo.caption || '')}')">
          <img src="${photo.url}" alt="${escapeHtml(photo.caption)}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
        </div>
        <div class="p-2.5">
          <p class="text-xs text-slate-200 font-medium truncate" title="${escapeHtml(photo.caption)}">
            ${escapeHtml(photo.caption || 'Foto de evidencia')}
          </p>
          <div class="flex items-center justify-between text-[10px] text-slate-400 mt-1">
            <span>${dateFormatted}</span>
            <button onclick="deletePhoto('${order.id}', '${photo.id}')" class="text-slate-500 hover:text-red-400 transition" title="Eliminar foto">
              <i class="fas fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function handleAddBitacoraEntry(e) {
  e.preventDefault();
  const orderId = AppState.activeBitacoraOrderId;
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  const title = document.getElementById('bitacoraTitle').value.trim();
  const notes = document.getElementById('bitacoraNotes').value.trim();
  const technician = document.getElementById('bitacoraTechnician').value.trim() || AppState.auth.currentUser?.name || 'Ing. Especialista';
  const newStatus = document.getElementById('bitacoraNewStatus').value;

  if (!order.bitacora) order.bitacora = [];

  const newEntry = {
    id: 'bit_' + Date.now(),
    date: new Date().toISOString(),
    title,
    notes,
    technician,
    status: newStatus
  };

  order.bitacora.unshift(newEntry);

  if (order.status !== newStatus) {
    order.status = newStatus;
    if (newStatus === 'delivered' && !order.deliveredDate) {
      order.deliveredDate = new Date().toISOString();
    }
  }

  saveOrders();
  syncSingleOrderToSupabase(order);
  renderBitacoraTimeline(order);
  renderDashboard();
  renderOrders();

  document.getElementById('bitacoraTitle').value = '';
  document.getElementById('bitacoraNotes').value = '';
  showToast('Avance registrado en bitácora.');
}

async function handlePhotoUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  const orderId = AppState.activeBitacoraOrderId;
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  if (!order.photos) order.photos = [];

  const captionPrompt = prompt('Descripción para estas fotos (ej: "Inspección microscopio", "Medición de voltajes", "Reparación concluida"):', 'Evidencia técnica');
  const caption = captionPrompt || 'Evidencia de reparación';

  const filesArray = Array.from(files);
  let processedCount = 0;
  let supabaseUploadedCount = 0;

  showToast(`Procesando ${filesArray.length} foto(s)...`);

  for (const file of filesArray) {
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => resolve(ev.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = dataUrl;
      });

      // Redimensionar para optimizar peso y nitidez (máx 1200px)
      const maxDim = 1200;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      let finalPhotoUrl = canvas.toDataURL('image/jpeg', 0.82);
      let storagePath = null;

      // Si Supabase está conectado, subir directamente al bucket de Storage
      if (AppState.supabase.isConnected && AppState.supabase.client) {
        try {
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
          if (blob) {
            const ext = 'jpg';
            const cleanOrderId = (orderId || 'general').toString().replace(/\D/g, '') || orderId;
            storagePath = `orders/${cleanOrderId}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;

            const bucketName = AppState.supabase.bucket || 'order-photos';
            const { data: upData, error: upError } = await AppState.supabase.client.storage
              .from(bucketName)
              .upload(storagePath, blob, {
                contentType: 'image/jpeg',
                cacheControl: '3600',
                upsert: true
              });

            if (upError) {
              console.warn('Error subiendo foto a Supabase Storage:', upError.message);
            } else {
              const { data: publicData } = AppState.supabase.client.storage
                .from(bucketName)
                .getPublicUrl(storagePath);

              if (publicData?.publicUrl) {
                finalPhotoUrl = publicData.publicUrl;
                supabaseUploadedCount++;
              }
            }
          }
        } catch (sbErr) {
          console.warn('Excepción subiendo foto a Supabase Storage:', sbErr);
        }
      }

      order.photos.unshift({
        id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        url: finalPhotoUrl,
        storage_path: storagePath,
        caption: caption,
        date: new Date().toISOString()
      });

      processedCount++;
    } catch (err) {
      console.error('Error procesando imagen:', err);
    }
  }

  saveOrders();
  syncSingleOrderToSupabase(order);
  renderPhotoGallery(order);
  renderOrders();

  if (supabaseUploadedCount > 0) {
    showToast(`✅ ${supabaseUploadedCount} foto(s) guardadas en Supabase Storage.`);
  } else {
    showToast(`✅ ${processedCount} foto(s) guardadas.`);
  }

  e.target.value = '';
}

async function deletePhoto(orderId, photoId) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order || !order.photos) return;

  const photo = order.photos.find(p => p.id === photoId);
  if (!photo) return;

  if (confirm('¿Eliminar esta foto de evidencia?')) {
    // Si la foto está en Supabase Storage, eliminarla también de la nube
    if (photo.storage_path && AppState.supabase.isConnected && AppState.supabase.client) {
      try {
        const bucketName = AppState.supabase.bucket || 'order-photos';
        await AppState.supabase.client.storage
          .from(bucketName)
          .remove([photo.storage_path]);
      } catch (err) {
        console.warn('Error eliminando de Supabase Storage:', err);
      }
    }

    order.photos = order.photos.filter(p => p.id !== photoId);
    saveOrders();
    syncSingleOrderToSupabase(order);
    renderPhotoGallery(order);
    renderOrders();
    showToast('Foto eliminada.');
  }
}

function openLightbox(url, caption) {
  const lightbox = document.getElementById('imageLightbox');
  const img = document.getElementById('lightboxImg');
  const cap = document.getElementById('lightboxCaption');

  if (lightbox && img) {
    img.src = url;
    if (cap) cap.innerText = caption;
    lightbox.classList.remove('hidden');
  }
}

function closeLightbox() {
  const lightbox = document.getElementById('imageLightbox');
  if (lightbox) lightbox.classList.add('hidden');
}

function shareBitacoraEntryWhatsApp(orderId, bitacoraId) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  const entry = (order.bitacora || []).find(b => b.id === bitacoraId);
  if (!entry) return;

  const phone = (order.client?.phone || '').replace(/\D/g, '');
  if (!phone) {
    alert('No hay teléfono registrado para este cliente.');
    return;
  }

  const text = `Hola *${order.client.name}*, te informamos de un nuevo avance técnico en tu equipo en *GlitchLab*:\n\n` +
    `📌 *Folio:* ${order.id}\n` +
    `💻 *Equipo:* ${order.equipment.type} ${order.equipment.brand} ${order.equipment.model}\n` +
    `🔧 *Avance Realizado:* ${entry.title}\n` +
    `📝 *Detalle:* ${entry.notes}\n` +
    `⚙️ *Estado:* ${StatusMeta[entry.status]?.label || entry.status}\n\n` +
    `¡Seguimos trabajando en tu equipo! Ante cualquier duda estamos a tus órdenes.`;

  const url = `https://wa.me/52${phone.length === 10 ? phone : phone}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

// Modal de Nueva Orden
function openNewOrderModal() {
  AppState.currentOrder = null;
  const form = document.getElementById('orderForm');
  if (form) form.reset();

  document.getElementById('modalTitle').innerText = 'Nueva Orden de Servicio';
  document.getElementById('orderId').value = generateNextFolio();
  document.getElementById('orderDate').value = new Date().toISOString().slice(0, 16);
  document.getElementById('orderStatusSelect').value = 'received';
  
  if (AppState.auth.currentUser) {
    document.getElementById('technicianName').value = AppState.auth.currentUser.name || AppState.auth.currentUser.username;
  }

  document.querySelectorAll('input[name="accessories"]').forEach(cb => cb.checked = false);
  document.querySelectorAll('input[name="condition"]').forEach(cb => cb.checked = false);

  clearSignature();

  document.getElementById('costBalanceDisplay').innerText = '$0.00';
  document.getElementById('passwordFieldContainer').classList.remove('hidden');

  const modal = document.getElementById('orderModal');
  modal.classList.remove('hidden');
  setTimeout(() => resizeSignatureCanvas(), 100);
}

// Editar Orden existente
function editOrder(orderId) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  AppState.currentOrder = order;
  document.getElementById('modalTitle').innerText = `Editar Orden ${order.id}`;
  document.getElementById('orderId').value = order.id;
  document.getElementById('orderDate').value = new Date(order.date).toISOString().slice(0, 16);
  document.getElementById('orderStatusSelect').value = order.status || 'received';

  document.getElementById('clientName').value = order.client?.name || '';
  document.getElementById('clientPhone').value = order.client?.phone || '';
  document.getElementById('clientEmail').value = order.client?.email || '';
  document.getElementById('clientAddress').value = order.client?.address || '';

  document.getElementById('equipmentType').value = order.equipment?.type || 'Laptop';
  document.getElementById('equipmentBrand').value = order.equipment?.brand || '';
  document.getElementById('equipmentModel').value = order.equipment?.model || '';
  document.getElementById('equipmentSerial').value = order.equipment?.serial || '';
  
  const lockType = order.equipment?.lockType || 'password';
  document.getElementById('lockType').value = lockType;
  const passContainer = document.getElementById('passwordFieldContainer');
  if (lockType === 'none') {
    passContainer.classList.add('hidden');
    document.getElementById('devicePassword').value = '';
  } else {
    passContainer.classList.remove('hidden');
    document.getElementById('devicePassword').value = order.equipment?.password || '';
  }

  const accessories = order.equipment?.accessories || [];
  document.querySelectorAll('input[name="accessories"]').forEach(cb => {
    cb.checked = accessories.includes(cb.value);
  });

  const conditions = order.equipment?.condition || [];
  document.querySelectorAll('input[name="condition"]').forEach(cb => {
    cb.checked = conditions.includes(cb.value);
  });

  document.getElementById('conditionNotes').value = order.equipment?.conditionNotes || '';

  document.getElementById('issueDescription').value = order.issue || '';
  document.getElementById('initialDiagnosis').value = order.initialDiagnosis || '';
  document.getElementById('technicianName').value = order.technician || 'Ing. Rivera';

  document.getElementById('costEstimated').value = order.costs?.estimated || 0;
  document.getElementById('costAdvance').value = order.costs?.advance || 0;
  document.getElementById('costPaymentMethod').value = order.costs?.paymentMethod || 'Efectivo';
  
  const est = order.costs?.estimated || 0;
  const adv = order.costs?.advance || 0;
  document.getElementById('costBalanceDisplay').innerText = `$${Math.max(0, est - adv).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

  clearSignature();
  if (order.signature) {
    const img = new Image();
    img.onload = () => {
      if (signatureCtx) signatureCtx.drawImage(img, 0, 0);
      hasSignature = true;
    };
    img.src = order.signature;
  }

  const modal = document.getElementById('orderModal');
  modal.classList.remove('hidden');
  setTimeout(() => resizeSignatureCanvas(), 100);
}

// Guardar Orden
function handleSaveOrder(e) {
  e.preventDefault();

  const id = document.getElementById('orderId').value.trim();
  const dateVal = document.getElementById('orderDate').value;
  const status = document.getElementById('orderStatusSelect').value;

  const client = {
    name: document.getElementById('clientName').value.trim(),
    phone: document.getElementById('clientPhone').value.trim(),
    email: document.getElementById('clientEmail').value.trim(),
    address: document.getElementById('clientAddress').value.trim()
  };

  const accessories = [];
  document.querySelectorAll('input[name="accessories"]:checked').forEach(cb => accessories.push(cb.value));

  const condition = [];
  document.querySelectorAll('input[name="condition"]:checked').forEach(cb => condition.push(cb.value));

  const equipment = {
    type: document.getElementById('equipmentType').value,
    brand: document.getElementById('equipmentBrand').value.trim(),
    model: document.getElementById('equipmentModel').value.trim(),
    serial: document.getElementById('equipmentSerial').value.trim(),
    lockType: document.getElementById('lockType').value,
    password: document.getElementById('devicePassword').value.trim(),
    accessories,
    condition,
    conditionNotes: document.getElementById('conditionNotes').value.trim()
  };

  const estimated = parseFloat(document.getElementById('costEstimated').value) || 0;
  const advance = parseFloat(document.getElementById('costAdvance').value) || 0;
  const balance = Math.max(0, estimated - advance);

  const costs = {
    estimated,
    advance,
    balance,
    paymentMethod: document.getElementById('costPaymentMethod').value
  };

  let signatureData = null;
  if (hasSignature && signatureCanvas) {
    signatureData = signatureCanvas.toDataURL('image/png');
  } else if (AppState.currentOrder?.signature) {
    signatureData = AppState.currentOrder.signature;
  }

  const existingIndex = AppState.orders.findIndex(o => o.id === id);
  const existingOrder = existingIndex >= 0 ? AppState.orders[existingIndex] : null;

  const currentUserName = AppState.auth.currentUser?.name || AppState.auth.currentUser?.username || 'Recepción';

  const orderData = {
    id,
    date: dateVal ? new Date(dateVal).toISOString() : new Date().toISOString(),
    deliveredDate: status === 'delivered' ? (existingOrder?.deliveredDate || new Date().toISOString()) : null,
    warrantyDays: existingOrder?.warrantyDays || AppState.shopConfig.warrantyDays || 30,
    status,
    client,
    equipment,
    issue: document.getElementById('issueDescription').value.trim(),
    initialDiagnosis: document.getElementById('initialDiagnosis').value.trim(),
    technician: document.getElementById('technicianName').value.trim() || currentUserName,
    costs,
    signature: signatureData,
    photos: existingOrder?.photos || [],
    bitacora: existingOrder?.bitacora || [
      {
        id: 'bit_' + Date.now(),
        date: new Date().toISOString(),
        title: 'Equipo recibido en taller',
        notes: 'Ingreso inicial a GlitchLab para revisión a nivel componente.',
        technician: currentUserName,
        status: status
      }
    ]
  };

  if (existingIndex >= 0) {
    AppState.orders[existingIndex] = orderData;
  } else {
    AppState.orders.unshift(orderData);
  }

  saveOrders();
  syncSingleOrderToSupabase(orderData);

  // Registrar / actualizar cliente en la lista local y en Supabase
  if (client.name && client.phone) {
    const cleanPhone = client.phone.replace(/\D/g, '');
    let existingCli = AppState.clients.find(c => c.phone.replace(/\D/g, '') === cleanPhone);
    if (!existingCli) {
      existingCli = {
        id: 'cli_' + (cleanPhone || Date.now()),
        name: client.name,
        phone: client.phone,
        email: client.email || '',
        address: client.address || '',
        totalOrders: 1,
        notes: '',
        updatedAt: new Date().toISOString()
      };
      AppState.clients.unshift(existingCli);
    } else {
      existingCli.totalOrders = (existingCli.totalOrders || 1) + 1;
      existingCli.updatedAt = new Date().toISOString();
    }
    saveClients();
    syncClientToSupabase(existingCli);
  }

  closeOrderModal();
  renderDashboard();
  renderOrders();
  showToast(`Orden ${id} guardada.`);
}

function closeOrderModal() {
  const modal = document.getElementById('orderModal');
  if (modal) modal.classList.add('hidden');
  AppState.currentOrder = null;
}

function updateOrderStatusQuick(orderId, newStatus) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  const oldStatus = order.status;
  order.status = newStatus;

  if (newStatus === 'delivered' && !order.deliveredDate) {
    order.deliveredDate = new Date().toISOString();
  }
  
  const currentUserName = AppState.auth.currentUser?.name || AppState.auth.currentUser?.username || 'Taller';

  if (!order.bitacora) order.bitacora = [];
  order.bitacora.unshift({
    id: 'bit_' + Date.now(),
    date: new Date().toISOString(),
    title: `Estado cambiado a ${StatusMeta[newStatus]?.label || newStatus}`,
    notes: `Cambio rápido de estatus de ${StatusMeta[oldStatus]?.label} a ${StatusMeta[newStatus]?.label}`,
    technician: currentUserName,
    status: newStatus
  });

  saveOrders();
  syncSingleOrderToSupabase(order);
  renderDashboard();
  renderOrders();
  showToast(`Estado de orden ${orderId} actualizado.`);
}

function deleteOrder(orderId) {
  if (confirm(`¿Estás seguro de que deseas eliminar permanentemente la orden ${orderId}?`)) {
    AppState.orders = AppState.orders.filter(o => o.id !== orderId);
    saveOrders();
    deleteOrderFromSupabase(orderId);
    renderDashboard();
    renderOrders();
    showToast(`Orden ${orderId} eliminada.`);
  }
}

// ==========================================
// 11. IMPRESIÓN & PDF: CLIENTE, ETIQUETA, TICKET & CARTA
// ==========================================

let currentPrintOrderId = null;
let currentPrintFormat = 'client_pdf'; // 'client_pdf', 'sticker', 'thermal', 'letter'

function openPrintModal(orderId) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  currentPrintOrderId = orderId;
  setPrintFormat('client_pdf');

  const modal = document.getElementById('printModal');
  modal.classList.remove('hidden');
}

function openQuickLabelPrint(orderId) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  currentPrintOrderId = orderId;
  const modal = document.getElementById('printModal');
  modal.classList.remove('hidden');
  setPrintFormat('sticker');
}

let currentStickerSize = '60x40'; // '50x30', '60x40', '76x50'

function setPrintFormat(format) {
  currentPrintFormat = format;
  const order = AppState.orders.find(o => o.id === currentPrintOrderId);
  if (!order) return;

  document.body.classList.remove('ticket-thermal-mode', 'ticket-sticker-mode', 'sticker-size-50x30', 'sticker-size-60x40', 'sticker-size-76x50');

  const btnClientPdf = document.getElementById('btnFormatClientPdf');
  const btnSticker = document.getElementById('btnFormatSticker');
  const btnThermal = document.getElementById('btnFormatThermal');
  const btnLetter = document.getElementById('btnFormatLetter');
  const aiyinToolbar = document.getElementById('aiyinStickerToolbar');

  [btnClientPdf, btnSticker, btnThermal, btnLetter].forEach(b => {
    if (b) {
      b.classList.remove('bg-sky-500', 'text-white');
      b.classList.add('bg-slate-800', 'text-slate-400');
    }
  });

  if (format === 'sticker') {
    document.body.classList.add('ticket-sticker-mode', `sticker-size-${currentStickerSize}`);
    if (aiyinToolbar) aiyinToolbar.classList.remove('hidden');
    if (btnSticker) {
      btnSticker.classList.add('bg-sky-500', 'text-white');
      btnSticker.classList.remove('bg-slate-800', 'text-slate-400');
    }
    updateStickerSizeButtons();
  } else {
    if (aiyinToolbar) aiyinToolbar.classList.add('hidden');
    if (format === 'thermal') {
      document.body.classList.add('ticket-thermal-mode');
      if (btnThermal) {
        btnThermal.classList.add('bg-sky-500', 'text-white');
        btnThermal.classList.remove('bg-slate-800', 'text-slate-400');
      }
    } else if (format === 'letter') {
      if (btnLetter) {
        btnLetter.classList.add('bg-sky-500', 'text-white');
        btnLetter.classList.remove('bg-slate-800', 'text-slate-400');
      }
    } else {
      // client_pdf por defecto
      if (btnClientPdf) {
        btnClientPdf.classList.add('bg-sky-500', 'text-white');
        btnClientPdf.classList.remove('bg-slate-800', 'text-slate-400');
      }
    }
  }

  generatePrintTemplate(order, format);
}

function applyStickerPageStyle(size) {
  let styleEl = document.getElementById('dynamicStickerPageStyle');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'dynamicStickerPageStyle';
    document.head.appendChild(styleEl);
  }
  const pageSizes = {
    '50x30': '50mm 30mm',
    '60x40': '60mm 40mm',
    '76x50': '76mm 50mm',
    '100x150': '100mm 150mm'
  };
  const dim = pageSizes[size] || '60mm 40mm';
  styleEl.innerHTML = `@media print { @page { size: ${dim}; margin: 0mm !important; } }`;
}

function setStickerSize(size) {
  currentStickerSize = size;
  document.body.classList.remove('sticker-size-50x30', 'sticker-size-60x40', 'sticker-size-76x50', 'sticker-size-100x150');
  document.body.classList.add(`sticker-size-${size}`);
  applyStickerPageStyle(size);
  updateStickerSizeButtons();

  const order = AppState.orders.find(o => o.id === currentPrintOrderId);
  if (order) generatePrintTemplate(order, 'sticker');
}

function updateStickerSizeButtons() {
  const btn50 = document.getElementById('btnStickerSize50x30');
  const btn60 = document.getElementById('btnStickerSize60x40');
  const btn76 = document.getElementById('btnStickerSize76x50');
  const btn100 = document.getElementById('btnStickerSize100x150');

  [btn50, btn60, btn76, btn100].forEach(b => {
    if (b) {
      b.classList.remove('bg-sky-500', 'text-white');
      b.classList.add('bg-slate-800', 'text-slate-300');
    }
  });

  if (currentStickerSize === '50x30' && btn50) {
    btn50.classList.add('bg-sky-500', 'text-white');
    btn50.classList.remove('bg-slate-800', 'text-slate-300');
  } else if (currentStickerSize === '76x50' && btn76) {
    btn76.classList.add('bg-sky-500', 'text-white');
    btn76.classList.remove('bg-slate-800', 'text-slate-300');
  } else if (currentStickerSize === '100x150' && btn100) {
    btn100.classList.add('bg-sky-500', 'text-white');
    btn100.classList.remove('bg-slate-800', 'text-slate-300');
  } else if (btn60) {
    btn60.classList.add('bg-sky-500', 'text-white');
    btn60.classList.remove('bg-slate-800', 'text-slate-300');
  }
}

// Generador de Contenido Imprimible
function generatePrintTemplate(order, format) {
  const container = document.getElementById('print-area');
  if (!container) return;

  const dateFormatted = new Date(order.date).toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const est = (order.costs?.estimated || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const adv = (order.costs?.advance || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const bal = (order.costs?.balance || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });

  const trackingUrl = `${window.location.origin}${window.location.pathname}#track=${order.id}`;

  if (format === 'sticker') {
    // ETIQUETA ADHESIVA PARA IMPRESORA TÉRMICA AIYIN AE-240BT (203 DPI)
    // REQUISITOS OBLIGATORIOS ADAPTADOS A CADA ROLLO:
    // 1. Número de orden
    // 2. Modelo del equipo
    // 3. Falla
    // 4. Si incluye accesorios
    const includesAccessories = order.equipment?.accessories && order.equipment.accessories.length > 0
      ? `SÍ (${order.equipment.accessories.join(', ')})`
      : `NO (Solo equipo)`;

    const phoneStr = order.client?.phone ? order.client.phone.replace(/\D/g, '') : '';
    const dateFormattedShort = new Date(order.date).toLocaleDateString('es-MX', {
      day: '2-digit', month: '2-digit', year: '2-digit'
    });

    if (currentStickerSize === '50x30') {
      // 1. MEDIDA 50x30mm (MINI - Formato 2 Columnas para caber en 30mm de alto)
      container.innerHTML = `
        <div class="aiyin-sticker-box" style="font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; width: 48mm; max-width: 48mm; height: 28.5mm; max-height: 28.5mm; margin: 0 auto; padding: 1.2mm; border: 2px solid #000; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between;">
          
          <!-- Encabezado compacto -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #000; padding-bottom: 1px;">
            <div style="font-size: 8.5px; font-weight: 900; letter-spacing: 0.3px;">GLITCHLAB</div>
            <div style="background: #000; color: #fff; font-size: 13px; font-weight: 900; padding: 0.5px 5px; border-radius: 2px; font-family: monospace;">
              #${order.id}
            </div>
          </div>

          <!-- Contenido en 2 Columnas -->
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 2px; flex: 1; padding: 1px 0;">
            <!-- Columna Izquierda con los 4 campos -->
            <div style="width: 32mm; line-height: 1.15;">
              <div style="font-size: 8.5px; font-weight: 900; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                💻 ${escapeHtml(order.equipment?.brand || '')} ${escapeHtml(order.equipment?.model || '')}
              </div>
              <div style="font-size: 7.5px; font-weight: 700; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                <strong>FALLA:</strong> ${escapeHtml(order.issue || 'No especificada')}
              </div>
              <div style="font-size: 7.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                <strong>ACCESORIOS:</strong> ${escapeHtml(includesAccessories)}
              </div>
              <div style="font-size: 6.8px; color: #222; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                CLI: <strong>${escapeHtml((order.client?.name || '').slice(0, 14))}</strong> • Tel: ${escapeHtml(phoneStr)}
              </div>
            </div>

            <!-- Columna Derecha con QR -->
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 14mm;">
              <div id="printQrContainerSticker"></div>
              <span style="font-size: 6px; font-weight: bold; text-align: center; margin-top: 1px;">RASTREO</span>
            </div>
          </div>
        </div>
      `;

      setTimeout(() => {
        const qrEl = document.getElementById('printQrContainerSticker');
        if (qrEl && window.QRCode) {
          qrEl.innerHTML = '';
          new QRCode(qrEl, { text: trackingUrl, width: 28, height: 28 });
        }
      }, 50);

    } else if (currentStickerSize === '76x50') {
      // 2. MEDIDA 76x50mm (GRANDE / 3" x 2" - Espaciosa y legible para estantería)
      container.innerHTML = `
        <div class="aiyin-sticker-box" style="font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; width: 73mm; max-width: 73mm; height: 47mm; max-height: 47mm; margin: 0 auto; padding: 2.5mm; border: 2.5px solid #000; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between;">
          
          <!-- Encabezado -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 3px;">
            <div>
              <div style="font-size: 14px; font-weight: 900; letter-spacing: 0.5px;">GLITCHLAB</div>
              <div style="font-size: 8px; font-weight: 800; text-transform: uppercase;">SERVICIO TÉCNICO ESPECIALIZADO EN MICROELECTRÓNICA</div>
            </div>
            <div style="background: #000; color: #fff; font-size: 19px; font-weight: 900; padding: 2px 10px; border-radius: 4px; font-family: monospace;">
              #${order.id}
            </div>
          </div>

          <!-- 1. MODELO DEL EQUIPO -->
          <div>
            <div style="font-size: 8.5px; font-weight: bold; text-transform: uppercase;">1. MODELO DEL EQUIPO:</div>
            <div style="font-size: 13px; font-weight: 900; color: #000; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${escapeHtml(order.equipment?.brand || '')} ${escapeHtml(order.equipment?.model || '')} (${escapeHtml(order.equipment?.type || 'Equipo')})
            </div>
          </div>

          <!-- 2. FALLA REPORTADA -->
          <div style="border: 1.5px solid #000; padding: 3px 6px; border-radius: 4px;">
            <div style="font-size: 8.5px; font-weight: 900; text-transform: uppercase;">2. FALLA REPORTADA:</div>
            <div style="font-size: 10.5px; font-weight: 700; color: #000; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
              ${escapeHtml(order.issue || 'No especificada')}
            </div>
          </div>

          <!-- 3. ACCESORIOS INCLUIDOS -->
          <div>
            <div style="font-size: 8.5px; font-weight: bold; text-transform: uppercase;">3. ACCESORIOS INCLUIDOS:</div>
            <div style="font-size: 11px; font-weight: 800; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.15;">
              ${escapeHtml(includesAccessories)}
            </div>
          </div>

          <!-- Datos Cliente & QR -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1.5px solid #000; padding-top: 3px; font-size: 9px;">
            <div style="line-height: 1.25; max-width: 48mm;">
              <div>CLIENTE: <strong>${escapeHtml(order.client?.name || '')}</strong></div>
              <div>TEL: ${escapeHtml(order.client?.phone || '')} ${order.equipment?.password ? `| PIN: <strong>${escapeHtml(order.equipment.password)}</strong>` : ''}</div>
              <div style="font-size: 7.5px; color: #333;">FECHA: ${dateFormattedShort} • ESCANEA PARA SEGUIMIENTO</div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: center;">
              <div id="printQrContainerSticker"></div>
            </div>
          </div>
        </div>
      `;

      setTimeout(() => {
        const qrEl = document.getElementById('printQrContainerSticker');
        if (qrEl && window.QRCode) {
          qrEl.innerHTML = '';
          new QRCode(qrEl, { text: trackingUrl, width: 48, height: 48 });
        }
      }, 50);

    } else if (currentStickerSize === '100x150') {
      // 3. MEDIDA 100x150mm (4" x 6" - Formato Caja / Empaque / Almacén Industrial)
      container.innerHTML = `
        <div class="aiyin-sticker-box" style="font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; width: 95mm; max-width: 95mm; min-height: 142mm; margin: 0 auto; padding: 4mm; border: 3px solid #000; box-sizing: border-box; line-height: 1.35; display: flex; flex-direction: column; justify-content: space-between;">
          <!-- Encabezado Industrial -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #000; padding-bottom: 6px; margin-bottom: 8px;">
              <div>
                <div style="font-size: 20px; font-weight: 900; letter-spacing: 0.5px;">GLITCHLAB</div>
                <div style="font-size: 9px; font-weight: 800; text-transform: uppercase;">MICROELECTRÓNICA & TALLER ESPECIALIZADO</div>
                <div style="font-size: 8.5px; color: #333; margin-top: 2px;">Tel: ${AppState.shopConfig.phone} • Tepic, Nay.</div>
              </div>
              <div style="text-align: right;">
                <div style="background: #000; color: #fff; font-size: 24px; font-weight: 900; padding: 3px 12px; border-radius: 4px; font-family: monospace;">
                  #${order.id}
                </div>
                <div style="font-size: 8.5px; font-weight: bold; margin-top: 3px;">FECHA: ${dateFormattedShort}</div>
              </div>
            </div>

            <!-- Sección 1: Cliente -->
            <div style="background: #f4f4f5; border: 1px solid #000; border-radius: 4px; padding: 6px; margin-bottom: 8px; font-size: 10px;">
              <div style="font-size: 8.5px; font-weight: 900; text-transform: uppercase; border-bottom: 1px solid #ccc; padding-bottom: 2px; margin-bottom: 3px;">1. DATOS DEL CLIENTE</div>
              <div><strong>NOMBRE:</strong> ${escapeHtml(order.client?.name || '')}</div>
              <div><strong>TELÉFONO:</strong> ${escapeHtml(order.client?.phone || '')}</div>
              ${order.client?.address ? `<div><strong>DOMICILIO:</strong> ${escapeHtml(order.client.address)}</div>` : ''}
            </div>

            <!-- Sección 2: Dispositivo -->
            <div style="border: 1.5px solid #000; border-radius: 4px; padding: 6px; margin-bottom: 8px; font-size: 11px;">
              <div style="font-size: 8.5px; font-weight: 900; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 3px;">2. DATOS DEL EQUIPO & SEGURIDAD</div>
              <div style="font-size: 14px; font-weight: 900;">${escapeHtml(order.equipment?.brand || '')} ${escapeHtml(order.equipment?.model || '')} (${escapeHtml(order.equipment?.type || 'Equipo')})</div>
              <div style="font-size: 10px;">SERIE: ${escapeHtml(order.equipment?.serial || 'Sin número')}</div>
              ${order.equipment?.password ? `<div style="font-size: 11px; font-weight: bold; margin-top: 2px;">🔑 CONTRASEÑA/PIN: <span style="background: #000; color: #fff; padding: 1px 5px; border-radius: 3px;">${escapeHtml(order.equipment.password)}</span></div>` : ''}
            </div>

            <!-- Sección 3: Falla y Accesorios -->
            <div style="border: 1.5px solid #000; border-radius: 4px; padding: 6px; margin-bottom: 8px; font-size: 10.5px;">
              <div style="font-size: 8.5px; font-weight: 900; text-transform: uppercase; margin-bottom: 2px;">3. FALLA REPORTADA:</div>
              <div style="font-weight: 700; margin-bottom: 5px; line-height: 1.25;">"${escapeHtml(order.issue || 'No especificada')}"</div>
              <div style="font-size: 8.5px; font-weight: 900; text-transform: uppercase; margin-bottom: 2px;">4. ACCESORIOS DEJADOS:</div>
              <div style="font-weight: 800;">${escapeHtml(includesAccessories)}</div>
            </div>

            <!-- Sección 4: Finanzas -->
            <div style="display: flex; justify-content: space-between; background: #000; color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-bottom: 8px;">
              <div>PRESUPUESTO: $${est}</div>
              <div>ANTICIPO: $${adv}</div>
              <div style="font-size: 13px; font-weight: 900; color: #fff;">SALDO: $${bal}</div>
            </div>
          </div>

          <!-- Pie: QR y Firma -->
          <div style="border-top: 2px solid #000; padding-top: 6px; display: flex; justify-content: space-between; align-items: flex-end;">
            <div style="width: 55mm; font-size: 8px; line-height: 1.3;">
              <div>ESCANEA ESTE CÓDIGO CON TU CELULAR PARA RASTREO Y BITÁCORA EN VIVO</div>
              <div style="border-top: 1px solid #000; margin-top: 20px; padding-top: 2px; text-align: center; font-size: 8px;">FIRMA DE CONFORMIDAD DEL CLIENTE</div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: center;">
              <div id="printQrContainerSticker"></div>
            </div>
          </div>
        </div>
      `;

      setTimeout(() => {
        const qrEl = document.getElementById('printQrContainerSticker');
        if (qrEl && window.QRCode) {
          qrEl.innerHTML = '';
          new QRCode(qrEl, { text: trackingUrl, width: 68, height: 68 });
        }
      }, 50);

    } else {
      // 4. MEDIDA ESTÁNDAR 60x40mm (Recomendada para Aiyin AE-240BT)
      container.innerHTML = `
        <div class="aiyin-sticker-box" style="font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; width: 57mm; max-width: 57mm; height: 37mm; max-height: 37mm; margin: 0 auto; padding: 1.8mm; border: 2px solid #000; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between;">
          
          <!-- Encabezado con Número de Orden Destacado -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 2px;">
            <div>
              <div style="font-size: 12px; font-weight: 900; letter-spacing: 0.5px;">GLITCHLAB</div>
              <div style="font-size: 7px; font-weight: 800; text-transform: uppercase;">MICROELECTRÓNICA & TALLER</div>
            </div>
            <!-- 1. NÚMERO DE ORDEN -->
            <div style="background: #000; color: #fff; font-size: 16px; font-weight: 900; padding: 1.5px 8px; border-radius: 3px; font-family: monospace;">
              #${order.id}
            </div>
          </div>

          <!-- 2. MODELO DEL EQUIPO -->
          <div style="padding-top: 1px;">
            <div style="font-size: 7.5px; font-weight: bold; text-transform: uppercase;">1. MODELO DEL EQUIPO:</div>
            <div style="font-size: 11px; font-weight: 900; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.1;">
              ${escapeHtml(order.equipment?.brand || '')} ${escapeHtml(order.equipment?.model || '')} (${escapeHtml(order.equipment?.type || 'Equipo')})
            </div>
          </div>

          <!-- 3. FALLA REPORTADA -->
          <div style="border: 1px solid #000; padding: 2px 4px; border-radius: 3px;">
            <div style="font-size: 7.5px; font-weight: 900; text-transform: uppercase;">2. FALLA REPORTADA:</div>
            <div style="font-size: 9px; font-weight: 700; color: #000; line-height: 1.15; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
              ${escapeHtml(order.issue || 'No especificada')}
            </div>
          </div>

          <!-- 4. SI INCLUYE ACCESORIOS -->
          <div>
            <div style="font-size: 7.5px; font-weight: bold; text-transform: uppercase;">3. ACCESORIOS:</div>
            <div style="font-size: 9.5px; font-weight: 800; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.1;">
              ${escapeHtml(includesAccessories)}
            </div>
          </div>

          <!-- Pie: Cliente, Teléfono, PIN y QR de Rastreo -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1.5px solid #000; padding-top: 2px; font-size: 8px;">
            <div style="line-height: 1.15; max-width: 37mm;">
              <div>CLIENTE: <strong>${escapeHtml((order.client?.name || '').slice(0, 18))}</strong></div>
              <div>TEL: ${escapeHtml(phoneStr)} ${order.equipment?.password ? `| PIN: ${escapeHtml(order.equipment.password)}` : ''}</div>
              <div style="font-size: 7px; color: #333;">FECHA: ${dateFormattedShort}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 2px;">
              <div id="printQrContainerSticker"></div>
            </div>
          </div>

        </div>
      `;

      setTimeout(() => {
        const qrEl = document.getElementById('printQrContainerSticker');
        if (qrEl && window.QRCode) {
          qrEl.innerHTML = '';
          new QRCode(qrEl, { text: trackingUrl, width: 36, height: 36 });
        }
      }, 50);
    }

  } else if (format === 'thermal') {
    // TICKET TÉRMICO 80mm POS
    container.innerHTML = `
      <div style="font-family: 'Courier New', Courier, monospace; color: #000; padding: 4px; max-width: 300px; margin: 0 auto;">
        <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
          <h2 style="font-size: 16px; font-weight: bold; margin: 0;">${AppState.shopConfig.name}</h2>
          <div style="font-size: 11px;">${AppState.shopConfig.slogan}</div>
          <div style="font-size: 10px;">${AppState.shopConfig.address}</div>
          <div style="font-size: 10px;">Tel / WA: ${AppState.shopConfig.phone}</div>
        </div>

        <div style="text-align: center; margin-bottom: 8px;">
          <div style="font-size: 12px; font-weight: bold;">ORDEN DE SERVICIO</div>
          <div style="font-size: 20px; font-weight: 900; font-family: monospace;">#${order.id}</div>
          <div style="font-size: 10px;">Fecha: ${dateFormatted}</div>
        </div>

        <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin-bottom: 8px; font-size: 11px;">
          <div><strong>CLIENTE:</strong> ${escapeHtml(order.client?.name)}</div>
          <div><strong>TELÉFONO:</strong> ${escapeHtml(order.client?.phone)}</div>
          <div><strong>EQUIPO:</strong> ${escapeHtml(order.equipment?.type)} ${escapeHtml(order.equipment?.brand)} ${escapeHtml(order.equipment?.model)}</div>
          <div><strong>SERIE:</strong> ${escapeHtml(order.equipment?.serial || 'S/N')}</div>
          ${order.equipment?.password ? `<div><strong>CLAVE/PIN:</strong> ${escapeHtml(order.equipment.password)}</div>` : ''}
        </div>

        <div style="font-size: 11px; margin-bottom: 8px;">
          <div><strong>FALLA REPORTADA:</strong></div>
          <div style="padding-left: 4px;">${escapeHtml(order.issue || 'No especificada')}</div>
          <div style="margin-top: 4px;"><strong>ACCESORIOS:</strong> ${order.equipment?.accessories?.length ? order.equipment.accessories.join(', ') : 'Ninguno (Solo equipo)'}</div>
        </div>

        <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin-bottom: 8px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between;">
            <span>COTIZACIÓN EST.:</span> <strong>$${est}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>ANTICIPO:</span> <strong>$${adv}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; margin-top: 4px;">
            <span>RESTA POR PAGAR:</span> <span>$${bal}</span>
          </div>
        </div>

        <div style="text-align: center; margin: 10px 0;">
          <div id="printQrContainerThermal" style="display: flex; justify-content: center; margin-bottom: 4px;"></div>
          <div style="font-size: 9px;">Escanea este QR para ver el estado de tu equipo en vivo</div>
        </div>

        <div style="text-align: center; margin-top: 15px; margin-bottom: 8px;">
          ${order.signature ? `
            <img src="${order.signature}" style="max-height: 45px; margin: 0 auto; display: block;" />
          ` : '<div style="height: 35px;"></div>'}
          <div style="border-top: 1px solid #000; width: 80%; margin: 2px auto 0; font-size: 10px;">
            FIRMA DE CONFORMIDAD
          </div>
        </div>

        <div style="font-size: 8.5px; text-align: justify; margin-top: 8px; line-height: 1.2;">
          ${AppState.shopConfig.terms.replace(/\n/g, '<br>')}
        </div>

        <div style="text-align: center; margin-top: 10px; font-size: 10px; font-weight: bold;">
          ¡Gracias por confiar en GlitchLab!
        </div>
      </div>
    `;

    setTimeout(() => {
      const qrEl = document.getElementById('printQrContainerThermal');
      if (qrEl && window.QRCode) {
        qrEl.innerHTML = '';
        new QRCode(qrEl, { text: trackingUrl, width: 85, height: 85 });
      }
    }, 50);

  } else {
    // COMPROBANTE OFICIAL PARA CLIENTE (FORMATO CARTA / PDF)
    container.innerHTML = getCustomerPdfHtml(order);

    setTimeout(() => {
      const qrEl = document.getElementById('printQrContainerCustomer');
      if (qrEl && window.QRCode) {
        qrEl.innerHTML = '';
        new QRCode(qrEl, { text: trackingUrl, width: 85, height: 85 });
      }
    }, 50);
  }
}

// Plantilla HTML del Comprobante PDF para Cliente
function getCustomerPdfHtml(order) {
  const dateFormatted = new Date(order.date).toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const est = (order.costs?.estimated || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const adv = (order.costs?.advance || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const bal = (order.costs?.balance || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; max-width: 800px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
      
      <!-- Cabecera Principal con Logo y Folio -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0ea5e9; padding-bottom: 16px; margin-bottom: 20px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 26px; font-weight: 900; letter-spacing: 0.05em; color: #0f172a;">Glitch<span style="color: #0ea5e9;">Lab</span></span>
          </div>
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #0284c7; margin-top: 2px;">
            ${AppState.shopConfig.slogan}
          </div>
          <div style="font-size: 11px; color: #475569; margin-top: 5px; line-height: 1.4;">
            ${AppState.shopConfig.address}<br>
            Tel / WhatsApp: <strong>${AppState.shopConfig.phone}</strong> | Correo: ${AppState.shopConfig.email}
          </div>
        </div>

        <div style="text-align: right;">
          <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; padding: 8px 16px; border-radius: 8px; display: inline-block;">
            <div style="font-size: 10px; text-transform: uppercase; font-weight: 700; color: #0284c7;">COMPROBANTE DE SERVICIO</div>
            <div style="font-size: 24px; font-weight: 900; color: #0c4a6e; font-family: monospace;">#${order.id}</div>
          </div>
          <div style="font-size: 11px; color: #64748b; margin-top: 6px;">
            <strong>Fecha de Recepción:</strong> ${dateFormatted}
          </div>
          <div style="font-size: 11px; color: #64748b;">
            <strong>Especialista a Cargo:</strong> ${escapeHtml(order.technician || 'Equipo GlitchLab')}
          </div>
        </div>
      </div>

      <!-- Bloques de Información: Cliente y Dispositivo -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 11px; font-weight: 800; color: #0284c7; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
            1. Datos del Cliente
          </div>
          <div style="font-size: 12px; line-height: 1.6;">
            <div><strong>Nombre:</strong> ${escapeHtml(order.client?.name || '')}</div>
            <div><strong>Teléfono:</strong> ${escapeHtml(order.client?.phone || '')}</div>
            <div><strong>Correo:</strong> ${escapeHtml(order.client?.email || 'N/A')}</div>
            <div><strong>Dirección:</strong> ${escapeHtml(order.client?.address || 'N/A')}</div>
          </div>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 11px; font-weight: 800; color: #0284c7; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
            2. Datos del Dispositivo & Acceso
          </div>
          <div style="font-size: 12px; line-height: 1.6;">
            <div><strong>Tipo:</strong> ${escapeHtml(order.equipment?.type || '')}</div>
            <div><strong>Marca / Modelo:</strong> ${escapeHtml(order.equipment?.brand || '')} ${escapeHtml(order.equipment?.model || '')}</div>
            <div><strong>No. Serie / IMEI:</strong> ${escapeHtml(order.equipment?.serial || 'Sin número')}</div>
            <div style="margin-top: 4px; padding: 3px 8px; background: #e0f2fe; border-radius: 4px; font-weight: bold; color: #0369a1; display: inline-block;">
              🔑 Clave/PIN: ${escapeHtml(order.equipment?.password || 'Sin contraseña')}
            </div>
          </div>
        </div>
      </div>

      <!-- Falla Reportada y Diagnóstico Inicial -->
      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
        <div style="font-size: 11px; font-weight: 800; color: #0284c7; text-transform: uppercase; margin-bottom: 6px;">
          3. Motivo de Ingreso & Diagnóstico Técnico
        </div>
        <div style="font-size: 12px; line-height: 1.5; margin-bottom: 8px;">
          <strong>Falla Reportada por el Cliente:</strong><br>
          <span style="color: #334155;">${escapeHtml(order.issue || 'No especificada')}</span>
        </div>
        ${order.initialDiagnosis ? `
          <div style="font-size: 12px; line-height: 1.5; margin-bottom: 8px; background: #f8fafc; padding: 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <strong>Diagnóstico Técnico Inicial:</strong><br>
            <span style="color: #334155;">${escapeHtml(order.initialDiagnosis)}</span>
          </div>
        ` : ''}
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 11px; color: #475569; padding-top: 6px; border-top: 1px dashed #cbd5e1;">
          <div>
            <strong>Accesorios Recibidos:</strong> ${order.equipment?.accessories?.length ? order.equipment.accessories.join(', ') : 'Ninguno (Solo equipo)'}
          </div>
          <div>
            <strong>Condición Física:</strong> ${order.equipment?.condition?.length ? order.equipment.condition.join(', ') : 'Buen estado aparente'}
            ${order.equipment?.conditionNotes ? ` (${escapeHtml(order.equipment.conditionNotes)})` : ''}
          </div>
        </div>
      </div>

      <!-- Desglose Financiero y Código QR -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: center; margin-bottom: 20px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 8px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div id="printQrContainerCustomer" class="pdf-qr-placeholder"></div>
          <div style="font-size: 11px; line-height: 1.4; color: #475569;">
            <strong style="color: #0284c7;">Rastreo en Tiempo Real:</strong><br>
            Escanea este código con tu celular para consultar el estado de tu equipo, fotos del avance y bitácora en vivo.
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end;">
          <table style="width: 250px; border-collapse: collapse; font-size: 12px;">
            <tr>
              <td style="padding: 4px; color: #64748b;">Costo Estimado:</td>
              <td style="padding: 4px; text-align: right; font-weight: 600;">$${est} MXN</td>
            </tr>
            <tr>
              <td style="padding: 4px; color: #64748b;">Anticipo Recibido:</td>
              <td style="padding: 4px; text-align: right; font-weight: 600; color: #0284c7;">-$${adv} MXN</td>
            </tr>
            <tr style="border-top: 2px solid #0ea5e9; background-color: #f0f9ff;">
              <td style="padding: 6px; font-weight: 700; color: #0c4a6e;">Saldo Restante:</td>
              <td style="padding: 6px; text-align: right; font-weight: 900; font-size: 15px; color: #0c4a6e;">$${bal} MXN</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Firmas -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 25px; margin-bottom: 20px; text-align: center;">
        <div>
          <div style="height: 50px; display: flex; align-items: flex-end; justify-content: center;">
            <span style="font-family: cursive; font-size: 16px; color: #0369a1;">GlitchLab Laboratorio</span>
          </div>
          <div style="border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 11px; font-weight: 600; color: #475569;">
            Recibido por GlitchLab
          </div>
        </div>

        <div>
          <div style="height: 50px; display: flex; align-items: flex-end; justify-content: center;">
            ${order.signature ? `<img src="${order.signature}" style="max-height: 48px; max-width: 160px;" />` : '<div style="font-size: 11px; color: #94a3b8; font-style: italic;">Sin firma digital</div>'}
          </div>
          <div style="border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 11px; font-weight: 600; color: #475569;">
            Firma del Cliente de Conformidad
          </div>
        </div>
      </div>

      <!-- Términos Legales -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 9.5px; color: #64748b; line-height: 1.35; text-align: justify;">
        <strong>Términos del Servicio:</strong><br>
        ${AppState.shopConfig.terms.replace(/\n/g, '<br>')}
      </div>

    </div>
  `;
}

// Descarga Directa del Comprobante en PDF
function downloadCustomerPDF(orderId) {
  const targetId = orderId || currentPrintOrderId;
  const order = AppState.orders.find(o => o.id === targetId);
  if (!order) {
    alert('No se encontró la orden especificada.');
    return;
  }

  if (typeof html2pdf === 'undefined') {
    alert('Generador de PDF cargando. Puedes hacer clic en Imprimir y elegir "Guardar como PDF".');
    return;
  }

  showToast(`Generando PDF para el cliente (Orden #${order.id})...`);

  // Crear elemento temporal para compilar el PDF
  const tempDiv = document.createElement('div');
  tempDiv.style.position = 'absolute';
  tempDiv.style.left = '-9999px';
  tempDiv.style.top = '0';
  tempDiv.style.width = '750px';
  tempDiv.style.background = '#ffffff';
  tempDiv.style.padding = '10px';
  tempDiv.innerHTML = getCustomerPdfHtml(order);

  document.body.appendChild(tempDiv);

  // Renderizar QR en el elemento temporal
  const qrPlaceholder = tempDiv.querySelector('.pdf-qr-placeholder');
  const trackingUrl = `${window.location.origin}${window.location.pathname}#track=${order.id}`;
  if (qrPlaceholder && window.QRCode) {
    qrPlaceholder.innerHTML = '';
    new QRCode(qrPlaceholder, { text: trackingUrl, width: 85, height: 85 });
  }

  const opt = {
    margin: [6, 6, 6, 6],
    filename: `GlitchLab_Comprobante_${order.id}_Cliente.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  setTimeout(() => {
    html2pdf().set(opt).from(tempDiv).save().then(() => {
      if (tempDiv.parentNode) document.body.removeChild(tempDiv);
      showToast(`Comprobante PDF #${order.id} descargado.`);
    }).catch(err => {
      console.error('Error generando PDF:', err);
      if (tempDiv.parentNode) document.body.removeChild(tempDiv);
      alert('Se abrirá la ventana de impresión para guardar como PDF.');
      window.print();
    });
  }, 300);
}

function triggerPrint() {
  window.print();
}

function closePrintModal() {
  const modal = document.getElementById('printModal');
  if (modal) modal.classList.add('hidden');
  document.body.classList.remove('ticket-thermal-mode', 'ticket-sticker-mode');
}

// Configuración del Taller Modal
function openShopSettingsModal() {
  document.getElementById('cfgShopName').value = AppState.shopConfig.name;
  document.getElementById('cfgShopSlogan').value = AppState.shopConfig.slogan;
  document.getElementById('cfgShopPhone').value = AppState.shopConfig.phone;
  document.getElementById('cfgShopEmail').value = AppState.shopConfig.email;
  document.getElementById('cfgShopAddress').value = AppState.shopConfig.address;
  document.getElementById('cfgShopTerms').value = AppState.shopConfig.terms;
  document.getElementById('cfgShopWarrantyDays').value = AppState.shopConfig.warrantyDays || 30;

  renderUsersList();
  document.getElementById('settingsModal').classList.remove('hidden');
}

function closeShopSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
}

function handleSaveShopSettings(e) {
  e.preventDefault();
  AppState.shopConfig.name = document.getElementById('cfgShopName').value.trim();
  AppState.shopConfig.slogan = document.getElementById('cfgShopSlogan').value.trim();
  AppState.shopConfig.phone = document.getElementById('cfgShopPhone').value.trim();
  AppState.shopConfig.email = document.getElementById('cfgShopEmail').value.trim();
  AppState.shopConfig.address = document.getElementById('cfgShopAddress').value.trim();
  AppState.shopConfig.terms = document.getElementById('cfgShopTerms').value.trim();
  AppState.shopConfig.warrantyDays = parseInt(document.getElementById('cfgShopWarrantyDays').value, 10) || 30;

  saveConfig();
  closeShopSettingsModal();
  showToast('Configuración del taller guardada.');
}

// Exportar Respaldo JSON Completo
function exportDataBackup() {
  const data = {
    version: '4.0',
    exportDate: new Date().toISOString(),
    config: AppState.shopConfig,
    users: AppState.auth.users,
    inventory: AppState.inventory,
    clients: AppState.clients,
    orders: AppState.orders
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GlitchLab_Respaldo_Completo_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Copia de seguridad completa descargada.');
}

function importDataBackup() {
  const fileInput = document.getElementById('importFileInput');
  if (!fileInput) return;

  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (Array.isArray(data.orders)) {
          AppState.orders = data.orders;
          saveOrders();
        }
        if (Array.isArray(data.clients)) {
          AppState.clients = data.clients;
          saveClients();
          renderClientsTable();
        }
        if (data.config) {
          AppState.shopConfig = { ...AppState.shopConfig, ...data.config };
          saveConfig();
        }
        if (Array.isArray(data.users)) {
          AppState.auth.users = data.users;
          saveUsers();
        }
        if (Array.isArray(data.inventory)) {
          AppState.inventory = data.inventory;
          saveInventory();
        }
        renderDashboard();
        renderOrders();
        showToast('Respaldo restaurado correctamente.');
      } catch (err) {
        alert('Archivo de respaldo no válido.');
      }
    };
    reader.readAsText(file);
  };

  fileInput.click();
}

function escapeHtml(string) {
  if (!string) return '';
  return String(string)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'fixed bottom-5 right-5 bg-sky-500 text-white font-medium px-4 py-2.5 rounded-xl shadow-2xl z-50 flex items-center gap-2 transform transition-all duration-300';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<i class="fas fa-check-circle"></i> ${escapeHtml(message)}`;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
  }, 3000);
}
