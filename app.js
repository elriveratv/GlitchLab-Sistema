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
  quickDocs: [],
  currentOrder: null,
  activeBitacoraOrderId: null,
  filterStatus: 'all',
  searchQuery: '',
  orderSort: 'folio_desc',
  viewMode: 'grid', // 'grid' o 'list'
  currentPage: 1,
  pageSize: 9,
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
    slogan: 'Laboratorio de Microelectrónica & Reparación Especializada',
    phone: '+52 311 339 6969',
    whatsapp: '3113396969',
    email: 'contacto@glitchlab.mx',
    address: 'Calle Uruapan #2, Villas de la Paz, 63198 Tepic, Nay.',
    schedule: 'Lunes a Viernes 9:00 AM - 7:00 PM | Sábados 10:00 AM - 2:00 PM',
    website: 'https://glitchlab.mx',
    trackingDomain: 'https://rastreo.glitchlab.mx',
    terms: '1. Diagnóstico tiene un lapso de 24 a 48 hrs hábiles.\n2. Equipos no recogidos después de 30 días generarán costo de almacenaje.\n3. La empresa no se hace responsable por pérdida de datos; el cliente debe respaldar su información.\n4. Garantía de 45 días exclusivamente en el componente o trabajo reparado.',
    warrantyDays: 45,
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
  loadQuickDocs();
  setupSignaturePad();
  setupPatternCanvas();
  setupEventListeners();
  setupAuthListeners();
  setupAutocompleteListeners();
  checkInitialAuth();
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
// 3. GENERADOR DE ENLACES AL PORTAL DE RASTREO (rastreo.html)
// ==========================================

function getTrackingUrl(orderId) {
  if (AppState.shopConfig.trackingDomain && AppState.shopConfig.trackingDomain.trim()) {
    let custom = AppState.shopConfig.trackingDomain.trim();
    if (!custom.startsWith('http://') && !custom.startsWith('https://')) {
      custom = 'https://' + custom;
    }
    if (custom.endsWith('.html')) {
      return `${custom}?folio=${orderId}`;
    }
    custom = custom.replace(/\/$/, '');
    return `${custom}/?folio=${orderId}`;
  }

  const path = window.location.pathname;
  const dir = path.substring(0, path.lastIndexOf('/') + 1);
  return `${window.location.origin}${dir}glitchlab-rastreo/index.html?folio=${orderId}`;
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
  // Garantía oficial oficial estandarizada en 45 días (migrando cualquier valor legado de 30)
  const warrantyDays = (order.warrantyDays && order.warrantyDays !== 30) ? order.warrantyDays : (AppState.shopConfig.warrantyDays || 45);
  
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

// Cálculo preciso de días que ha estado el equipo en el taller
function calculateWorkshopDays(order) {
  if (!order || !order.date) return { days: 0, label: 'Hoy' };
  
  const startDate = new Date(order.date);
  if (isNaN(startDate.getTime())) return { days: 0, label: 'Hoy' };
  
  // Si ya fue entregado, el tiempo en taller concluyó en la fecha de entrega
  const isDelivered = order.status === 'delivered';
  const endDate = (isDelivered && order.deliveredDate && !isNaN(new Date(order.deliveredDate).getTime()))
    ? new Date(order.deliveredDate)
    : new Date();
  
  const diffMs = Math.max(0, endDate.getTime() - startDate.getTime());
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    return {
      days: 0,
      hours: hours,
      label: hours <= 1 ? 'Hoy (< 1h)' : `Hoy (${hours}h)`,
      shortLabel: isDelivered ? 'Mismo día' : 'Hoy',
      isDelivered: isDelivered
    };
  } else if (diffDays === 1) {
    return {
      days: 1,
      label: '1 día en taller',
      shortLabel: '1 día',
      isDelivered: isDelivered
    };
  } else {
    return {
      days: diffDays,
      label: `${diffDays} días en taller`,
      shortLabel: `${diffDays} días`,
      isDelivered: isDelivered
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
  const m = document.getElementById('inventoryModal');
  if (m) m.classList.remove('hidden');
  if (typeof updateMobileNavState === 'function') updateMobileNavState('inventory');
}

function closeInventoryModal() {
  const m = document.getElementById('inventoryModal');
  if (m) m.classList.add('hidden');
  if (typeof updateMobileNavState === 'function') updateMobileNavState('services');
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

  const formattedPhone = formatPhoneNumber(order.client?.phone);
  document.getElementById('waClientName').innerText = order.client.name + (formattedPhone ? ` • ${formattedPhone}` : '');
  document.getElementById('waOrderFolio').innerText = order.id;

  selectWhatsAppTemplate('ready');
  document.getElementById('whatsappModal').classList.remove('hidden');
}

function closeWhatsAppTemplatesModal(returnToOrder = true) {
  const lastOrderId = activeWhatsAppOrder ? activeWhatsAppOrder.id : null;
  document.getElementById('whatsappModal').classList.add('hidden');
  activeWhatsAppOrder = null;

  if (returnToOrder && lastOrderId && typeof openOrderDetailModal === 'function') {
    openOrderDetailModal(lastOrderId);
  }
}

function returnToOrderDetailFromWhatsApp() {
  closeWhatsAppTemplatesModal(true);
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
        `📌 *Folio de Orden:* #${order.id}\n` +
        `💻 *Equipo:* ${order.equipment.type} ${order.equipment.brand} ${order.equipment.model}\n` +
        `⚠️ *Falla Reportada:* ${order.issue}\n` +
        (order.costs?.advance > 0 ? `💵 *Anticipo:* $${advance} MXN\n` : '') +
        `🌐 *Rastreo en tiempo real:* ${getTrackingUrl(order.id)}\n\n` +
        `Comenzaremos con el diagnóstico técnico a nivel componente. Te notificaremos en cuanto tengamos los resultados. ¡Gracias por tu confianza!`;
      break;

    case 'budget':
      message = `Hola *${order.client.name}*, te informamos de *GlitchLab* que ya tenemos el diagnóstico de tu equipo:\n\n` +
        `📌 *Orden de Servicio:* #${order.id}\n` +
        `💻 *Equipo:* ${order.equipment.type} ${order.equipment.brand} ${order.equipment.model}\n` +
        `🔍 *Diagnóstico:* ${order.initialDiagnosis || 'Falla localizada en circuito de alimentación.'}\n` +
        `💰 *Presupuesto Estimado:* $${estimated} MXN\n` +
        (order.costs?.advance > 0 ? `💰 *Anticipo ya cubierto:* $${advance} MXN\n💰 *Saldo a liquidar al entregar:* $${balance} MXN\n` : '') +
        `🌐 *Ver diagnóstico y fotos:* ${getTrackingUrl(order.id)}\n\n` +
        `¿Nos autorizas comenzar con la reparación a nivel componente?`;
      break;

    case 'progress':
      const lastBitacora = order.bitacora && order.bitacora.length > 0 ? order.bitacora[0] : null;
      message = `Hola *${order.client.name}*, te compartimos una actualización de tu equipo en *GlitchLab*:\n\n` +
        `📌 *Folio:* #${order.id}\n` +
        `💻 *Equipo:* ${order.equipment.type} ${order.equipment.brand} ${order.equipment.model}\n` +
        `⚙️ *Estado:* ${statusLabel}\n` +
        (lastBitacora ? `🔧 *Avance Realizado:* ${lastBitacora.title}\n📝 *Detalle:* ${lastBitacora.notes}\n` : '') +
        `🌐 *Rastreo en vivo:* ${getTrackingUrl(order.id)}\n\n` +
        `Seguimos trabajando en tu dispositivo para entregarlo 100% operativo.`;
      break;

    case 'ready':
      message = `¡Excelentes noticias *${order.client.name}*! 🎉\n` +
        `Tu equipo en *GlitchLab* ha superado con éxito todas las pruebas de laboratorio y está *LISTO PARA ENTREGA*:\n\n` +
        `📌 *Folio de Orden:* #${order.id}\n` +
        `💻 *Equipo:* ${order.equipment.type} ${order.equipment.brand} ${order.equipment.model}\n` +
        (order.costs?.balance > 0 ? `💰 *Saldo Pendiente a Liquidar:* $${balance} MXN\n` : `💰 *Estado de Cuenta:* Liquidado / Sin saldo pendiente\n`) +
        `📍 *Ubicación:* ${AppState.shopConfig.address}\n` +
        `🕒 *Horario:* ${AppState.shopConfig.schedule || 'Lunes a Viernes 9:00 AM - 7:00 PM | Sábados 10:00 AM - 2:00 PM'}\n` +
        `🌐 *Detalle del Servicio:* ${getTrackingUrl(order.id)}\n\n` +
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

  // Métricas específicas de Corte Diario (Hoy) considerando pagos desglosados
  let corteCashToday = 0;
  let corteTransferToday = 0;
  let corteCardToday = 0;
  let corteOrdersCount = 0;
  const ordersInvolvedToday = new Set();

  AppState.orders.forEach(order => {
    const isOrderCreatedToday = order.date && order.date.startsWith(today);
    const adv = Number(order.costs?.advance) || 0;
    const bal = Number(order.costs?.balance) || 0;
    const method = order.costs?.paymentMethod || 'Efectivo';
    const payments = Array.isArray(order.costs?.payments) ? order.costs.payments : [];

    // Si tiene historial detallado de pagos
    if (payments.length > 0) {
      payments.forEach(p => {
        const pDate = (p.date || '').slice(0, 10);
        const pAmount = Number(p.amount) || 0;
        const pMethod = p.method || 'Efectivo';

        if (pDate === today) {
          totalCollectedToday += pAmount;
          ordersInvolvedToday.add(order.id);
          if (pMethod === 'Efectivo') corteCashToday += pAmount;
          else if (pMethod === 'Transferencia') corteTransferToday += pAmount;
          else if (pMethod === 'Tarjeta') corteCardToday += pAmount;
          else corteCashToday += pAmount;
        }

        if (pMethod === 'Efectivo') totalCash += pAmount;
        else if (pMethod === 'Transferencia') totalTransfer += pAmount;
        else if (pMethod === 'Tarjeta') totalCard += pAmount;
        else totalCash += pAmount;
        totalMonthCollected += pAmount;
      });
    } else {
      // Compatibilidad con órdenes anteriores sin array payments
      const paidAmount = adv + (order.status === 'delivered' ? bal : 0);
      if (isOrderCreatedToday && paidAmount > 0) {
        totalCollectedToday += paidAmount;
        ordersInvolvedToday.add(order.id);
        if (method === 'Efectivo') corteCashToday += paidAmount;
        else if (method === 'Transferencia') corteTransferToday += paidAmount;
        else if (method === 'Tarjeta') corteCardToday += paidAmount;
        else corteCashToday += paidAmount;
      }

      if (method === 'Efectivo') totalCash += paidAmount;
      else if (method === 'Transferencia') totalTransfer += paidAmount;
      else if (method === 'Tarjeta') totalCard += paidAmount;
      else totalCash += paidAmount;

      totalMonthCollected += paidAmount;
    }

    if (order.status !== 'delivered' && order.status !== 'cancelled') {
      totalPendingReceivable += bal;
    }
  });

  corteOrdersCount = ordersInvolvedToday.size;

  // Actualizar UI del Resumen General
  const elReportToday = document.getElementById('reportTodayCash');
  const elReportMonth = document.getElementById('reportMonthCash');
  const elReportPending = document.getElementById('reportPendingReceivable');
  const elMethodCash = document.getElementById('reportMethodCash');
  const elMethodTransfer = document.getElementById('reportMethodTransfer');
  const elMethodCard = document.getElementById('reportMethodCard');

  if (elReportToday) elReportToday.innerText = `$${totalCollectedToday.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elReportMonth) elReportMonth.innerText = `$${totalMonthCollected.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elReportPending) elReportPending.innerText = `$${totalPendingReceivable.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elMethodCash) elMethodCash.innerText = `$${totalCash.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elMethodTransfer) elMethodTransfer.innerText = `$${totalTransfer.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elMethodCard) elMethodCard.innerText = `$${totalCard.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

  // Actualizar Panel de Corte de Caja Diario
  const elCorteDate = document.getElementById('corteCajaDate');
  const elCorteCash = document.getElementById('corteTodayCash');
  const elCorteTransfer = document.getElementById('corteTodayTransfer');
  const elCorteCard = document.getElementById('corteTodayCard');
  const elCorteCount = document.getElementById('corteTodayOrdersCount');

  if (elCorteDate) {
    elCorteDate.innerText = new Date().toLocaleDateString('es-MX', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    }).toUpperCase();
  }
  if (elCorteCash) elCorteCash.innerText = `$${corteCashToday.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elCorteTransfer) elCorteTransfer.innerText = `$${corteTransferToday.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elCorteCard) elCorteCard.innerText = `$${corteCardToday.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elCorteCount) elCorteCount.innerText = `${corteOrdersCount} órdenes`;

  document.getElementById('financialModal').classList.remove('hidden');
  if (typeof updateMobileNavState === 'function') updateMobileNavState('finances');
}

function closeFinancialReportModal() {
  document.getElementById('financialModal').classList.add('hidden');
  if (typeof updateMobileNavState === 'function') updateMobileNavState('services');
}

// Impresión de Ticket de Corte de Caja Diario Térmico (80mm)
function printDailyCashCut() {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('es-MX', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  }).toUpperCase();
  const timeFormatted = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  let totalCash = 0;
  let totalTransfer = 0;
  let totalCard = 0;
  let movesList = [];

  AppState.orders.forEach(order => {
    const isToday = order.date && order.date.startsWith(today);
    const payments = Array.isArray(order.costs?.payments) ? order.costs.payments : [];

    if (payments.length > 0) {
      payments.forEach(p => {
        if ((p.date || '').startsWith(today)) {
          const amt = Number(p.amount) || 0;
          const meth = p.method || 'Efectivo';
          if (meth === 'Efectivo') totalCash += amt;
          else if (meth === 'Transferencia') totalTransfer += amt;
          else if (meth === 'Tarjeta') totalCard += amt;
          else totalCash += amt;

          movesList.push({
            orderId: order.id,
            client: order.client?.name || 'Cliente',
            concept: p.note || 'Abono / Liquidación',
            amount: amt,
            method: meth
          });
        }
      });
    } else if (isToday) {
      const adv = Number(order.costs?.advance) || 0;
      const bal = Number(order.costs?.balance) || 0;
      const meth = order.costs?.paymentMethod || 'Efectivo';
      const paid = adv + (order.status === 'delivered' ? bal : 0);

      if (paid > 0) {
        if (meth === 'Efectivo') totalCash += paid;
        else if (meth === 'Transferencia') totalTransfer += paid;
        else if (meth === 'Tarjeta') totalCard += paid;
        else totalCash += paid;

        movesList.push({
          orderId: order.id,
          client: order.client?.name || 'Cliente',
          concept: 'Ingreso inicial de orden',
          amount: paid,
          method: meth
        });
      }
    }
  });

  const totalCollected = totalCash + totalTransfer + totalCard;
  const currentUser = AppState.auth.currentUser?.name || 'Cajero GlitchLab';

  const printWindow = window.open('', '_blank', 'width=380,height=650');
  if (!printWindow) {
    alert('Por favor permite las ventanas emergentes (pop-ups) para imprimir el ticket de corte.');
    return;
  }

  const movesHtml = movesList.length > 0 
    ? movesList.map(m => `
        <div style="display:flex; justify-content:space-between; margin-bottom:3px; font-size:10px;">
          <div style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            <strong>#${m.orderId}</strong> ${escapeHtml(m.client.slice(0, 15))}
            <div style="font-size:8.5px; color:#555;">${escapeHtml(m.concept)} (${m.method})</div>
          </div>
          <div style="font-weight:bold; font-family:monospace; text-align:right;">
            $${m.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </div>
        </div>
      `).join('')
    : '<div style="text-align:center; color:#666; font-size:10px; padding:6px 0;">Sin movimientos hoy</div>';

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Corte de Caja Diario - GlitchLab</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        body {
          font-family: 'Courier New', Courier, monospace, sans-serif;
          width: 74mm;
          margin: 0 auto;
          padding: 6mm 2mm;
          color: #000;
          background: #fff;
          font-size: 11px;
          line-height: 1.25;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .bold { font-weight: bold; }
        .line { border-bottom: 1px dashed #000; margin: 5px 0; }
        .double-line { border-bottom: 2px solid #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; }
        @media print {
          body { width: 74mm; padding: 2mm 1mm; }
        }
      </style>
    </head>
    <body>
      <div class="text-center">
        <h2 style="margin:0; font-size:16px; font-weight:900; letter-spacing:0.5px;">GLITCHLAB</h2>
        <div style="font-size:8.5px; margin-top:2px;">MICROELECTRÓNICA & TECNOLOGÍA</div>
        <div style="font-size:8.5px;">Tepic, Nayarit • Tel: ${AppState.shopConfig.phone}</div>
        <div class="double-line"></div>
        <div style="font-weight:900; font-size:13px; margin:2px 0;">CORTE DE CAJA DIARIO</div>
        <div style="font-size:9.5px; font-weight:bold;">${dateFormatted}</div>
        <div style="font-size:9px; color:#333;">Hora de Cierre: ${timeFormatted} • Resp: ${escapeHtml(currentUser)}</div>
      </div>

      <div class="line"></div>

      <div style="font-size:10px; font-weight:bold; margin-bottom:4px;">DESGLOSE POR FORMA DE PAGO:</div>
      <div class="row" style="margin-bottom:3px;">
        <span>💵 EFECTIVO EN CAJA:</span>
        <strong style="font-family:monospace;">$${totalCash.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
      </div>
      <div class="row" style="margin-bottom:3px;">
        <span>📲 TRANSFERENCIAS:</span>
        <strong style="font-family:monospace;">$${totalTransfer.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
      </div>
      <div class="row" style="margin-bottom:3px;">
        <span>💳 TARJETAS / TERMINAL:</span>
        <strong style="font-family:monospace;">$${totalCard.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
      </div>

      <div class="double-line"></div>

      <div class="row" style="font-size:13px; font-weight:900;">
        <span>TOTAL COBRADO HOY:</span>
        <span style="font-family:monospace;">$${totalCollected.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
      </div>

      <div class="line"></div>

      <div style="font-size:9.5px; font-weight:bold; margin-bottom:4px;">MOVIMIENTOS DE HOY (${movesList.length}):</div>
      ${movesHtml}

      <div class="double-line"></div>

      <div class="text-center" style="margin-top:12px; font-size:8.5px;">
        <div style="border-top:1px solid #000; width:130px; margin:25px auto 4px auto;"></div>
        <div>FIRMA DEL RESPONSABLE DE CAJA</div>
        <div style="margin-top:8px; font-style:italic;">*** CIERRE DE REGISTRO GLITCHLAB ***</div>
      </div>

      <script>
        window.onload = function() {
          window.print();
          setTimeout(function() { window.close(); }, 800);
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
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
  if (typeof updateMobileNavState === 'function') updateMobileNavState('clients');
}

function closeClientsModal() {
  const modal = document.getElementById('clientsModal');
  if (modal) modal.classList.add('hidden');
  if (typeof updateMobileNavState === 'function') updateMobileNavState('services');
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
            <span class="font-mono text-slate-200 tracking-wider font-medium">${escapeHtml(formatPhoneNumber(c.phone))}</span>
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
  document.getElementById('editClientPhone').value = formatPhoneNumber(client.phone) || '';
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
  const phone = formatPhoneNumber(document.getElementById('editClientPhone').value.trim());
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
  document.getElementById('clientPhone').value = formatPhoneNumber(client.phone) || '';
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

function formatPhoneInputLive(e) {
  let digits = e.target.value.replace(/\D/g, '');
  if (digits.length > 10) digits = digits.slice(0, 10);
  if (digits.length > 6) {
    e.target.value = `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  } else if (digits.length > 3) {
    e.target.value = `${digits.slice(0, 3)} ${digits.slice(3)}`;
  } else {
    e.target.value = digits;
  }
}

function setupAutocompleteListeners() {
  const clientNameInput = document.getElementById('clientName');
  const clientPhoneInput = document.getElementById('clientPhone');
  const editClientPhoneInput = document.getElementById('editClientPhone');

  if (clientNameInput) {
    clientNameInput.addEventListener('input', handleClientAutocomplete);
  }
  if (clientPhoneInput) {
    clientPhoneInput.addEventListener('input', (e) => {
      formatPhoneInputLive(e);
      handleClientAutocomplete(e);
    });
  }
  if (editClientPhoneInput) {
    editClientPhoneInput.addEventListener('input', formatPhoneInputLive);
  }
}

function handleClientAutocomplete(e) {
  const val = e.target.value.toLowerCase().trim();
  const valDigits = val.replace(/\D/g, '');
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

  const matches = Array.from(clientMap.values()).filter(c => {
    const cPhoneDigits = (c.phone || '').replace(/\D/g, '');
    return c.name.toLowerCase().includes(val) || 
           (c.phone && c.phone.includes(val)) ||
           (valDigits.length >= 3 && cPhoneDigits.includes(valDigits));
  }).slice(0, 5);

  if (matches.length === 0) {
    dropdown.classList.add('hidden');
    return;
  }

  dropdown.innerHTML = matches.map(c => `
    <div onclick="selectAutocompleteClient('${escapeHtml(c.name)}', '${escapeHtml(c.phone)}', '${escapeHtml(c.email || '')}', '${escapeHtml(c.address || '')}')" class="px-3 py-2 hover:bg-slate-800 cursor-pointer border-b border-slate-800/60 text-xs">
      <div class="font-bold text-white">${escapeHtml(c.name)}</div>
      <div class="text-[11px] text-sky-400 font-mono tracking-wide">Tel: ${escapeHtml(formatPhoneNumber(c.phone))} ${c.email ? '• ' + escapeHtml(c.email) : ''}</div>
    </div>
  `).join('');

  dropdown.classList.remove('hidden');
}

function selectAutocompleteClient(name, phone, email, address) {
  document.getElementById('clientName').value = name;
  document.getElementById('clientPhone').value = formatPhoneNumber(phone);
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
  const saved = localStorage.getItem('glitchlab_config') || localStorage.getItem('glitchlab_shop_config');
  if (saved) {
    try {
      AppState.shopConfig = { ...AppState.shopConfig, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Error cargando configuración:', e);
    }
  }
  if (!AppState.shopConfig.trackingDomain || AppState.shopConfig.trackingDomain.includes('tecycom')) {
    AppState.shopConfig.trackingDomain = 'https://rastreo.glitchlab.mx';
  }
  updateShopUI();
}

function saveConfig() {
  localStorage.setItem('glitchlab_config', JSON.stringify(AppState.shopConfig));
  localStorage.setItem('glitchlab_shop_config', JSON.stringify(AppState.shopConfig));
  updateShopUI();
}

function updateShopUI() {
  const cfg = AppState.shopConfig;
  const fName = document.getElementById('footerShopName');
  const fAddr = document.getElementById('footerShopAddress');
  const fPhone = document.getElementById('footerShopPhone');

  if (fName && cfg.name) fName.innerText = cfg.name;
  if (fAddr && cfg.address) fAddr.innerHTML = `<i class="fas fa-location-dot text-sky-400 mr-1"></i>${escapeHtml(cfg.address)}`;
  if (fPhone && cfg.phone) fPhone.innerHTML = `<i class="fab fa-whatsapp text-emerald-400 mr-1"></i>${escapeHtml(cfg.phone)}`;
}

function loadOrders() {
  const saved = localStorage.getItem('glitchlab_orders');
  if (saved) {
    try {
      AppState.orders = JSON.parse(saved);
      // Migración automática a 45 días de garantía estándar GlitchLab
      AppState.orders.forEach(o => {
        if (!o.warrantyDays || o.warrantyDays === 30) {
          o.warrantyDays = 45;
          needsSave = true;
        }
      });
      // Migración automática a secuencia iniciando desde 1 (ej. 1001 -> 1, GL-0001 -> 1)
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
  try {
    localStorage.setItem('glitchlab_orders', JSON.stringify(AppState.orders));
  } catch (e) {
    console.warn('LocalStorage excedido al guardar órdenes (posiblemente por imágenes base64). Guardando versión sanitizada:', e);
    try {
      const sanitized = AppState.orders.map(o => ({
        ...o,
        photos: (o.photos || []).map(p => ({
          ...p,
          url: (p.url && p.url.startsWith('data:')) ? '' : p.url
        }))
      }));
      localStorage.setItem('glitchlab_orders', JSON.stringify(sanitized));
    } catch (e2) {
      console.error('No se pudo guardar en localStorage:', e2);
    }
  }
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

    // Probar conexión rápida realizando una consulta a la tabla orders
    const { data: testData, error } = await AppState.supabase.client
      .from('orders')
      .select('id')
      .limit(1);

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

      // Sincronización automática completa de inicio
      autoSyncAll(true);

      // Registrar sincronización automática periódica en segundo plano (cada 30 segundos)
      if (!window._supabaseSyncTimer) {
        window._supabaseSyncTimer = setInterval(() => {
          if (AppState.supabase.isConnected && !AppState.supabase.needsSqlSetup) {
            autoSyncAll(true);
          }
        }, 30000);

        window.addEventListener('focus', () => {
          if (AppState.supabase.isConnected && !AppState.supabase.needsSqlSetup) {
            autoSyncAll(true);
          }
        });

        window.addEventListener('online', () => {
          if (AppState.supabase.isConnected && !AppState.supabase.needsSqlSetup) {
            autoSyncAll(true);
          }
        });
      }
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
    warranty_days: parseInt((order.warrantyDays && order.warrantyDays !== 30) ? order.warrantyDays : (AppState.shopConfig.warrantyDays || 45), 10),
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
    warrantyDays: (row.warranty_days && row.warranty_days !== 30) ? row.warranty_days : 45,
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

async function autoSyncAll(isSilent = true) {
  if (!AppState.supabase.client || !AppState.supabase.isConnected || AppState.supabase.needsSqlSetup) return;

  try {
    // 1. Subir Clientes Locales a Supabase
    if (AppState.clients && AppState.clients.length > 0) {
      const clientsPayload = AppState.clients.map(c => ({
        id: c.id || ('cli_' + (c.phone || '').replace(/\D/g, '')),
        name: c.name,
        phone: c.phone,
        email: c.email || null,
        address: c.address || null,
        total_orders: c.totalOrders || 1,
        notes: c.notes || null,
        updated_at: new Date().toISOString()
      }));
      await AppState.supabase.client.from('clients').upsert(clientsPayload, { onConflict: 'id' });
    }

    // 2. Traer Clientes de Supabase y fusionar
    const { data: remoteClients, error: cliErr } = await AppState.supabase.client.from('clients').select('*');
    if (!cliErr && Array.isArray(remoteClients) && remoteClients.length > 0) {
      const clientMap = new Map();
      AppState.clients.forEach(c => clientMap.set(c.id || c.phone, c));
      remoteClients.forEach(r => clientMap.set(r.id || r.phone, {
        id: r.id,
        name: r.name,
        phone: r.phone,
        email: r.email || '',
        address: r.address || '',
        totalOrders: r.total_orders || 1,
        notes: r.notes || '',
        updatedAt: r.updated_at || new Date().toISOString()
      }));
      AppState.clients = Array.from(clientMap.values());
      saveClients();
      renderClientsTable();
    }

    // 3. Traer Órdenes de Supabase y fusionar (priorizando fotos y bitácoras de la nube)
    const { data: remoteOrders, error: ordErr } = await AppState.supabase.client
      .from('orders')
      .select('*')
      .order('id', { ascending: false });

    if (!ordErr && Array.isArray(remoteOrders)) {
      const dbOrders = remoteOrders.map(mapSupabaseOrderToLocal);
      const orderMap = new Map();
      dbOrders.forEach(o => orderMap.set(o.id.toString(), o));

      AppState.orders.forEach(localOrd => {
        const remote = orderMap.get(localOrd.id.toString());
        if (!remote) {
          orderMap.set(localOrd.id.toString(), localOrd);
        } else {
          // Fusionar fotos para que nunca se borren ni se pierdan
          const remotePhotos = remote.photos || [];
          const localPhotos = localOrd.photos || [];
          const mergedPhotos = [...remotePhotos];
          localPhotos.forEach(lp => {
            if (!mergedPhotos.some(rp => rp.id === lp.id || (rp.storage_path && rp.storage_path === lp.storage_path))) {
              mergedPhotos.push(lp);
            }
          });
          remote.photos = mergedPhotos;
          orderMap.set(localOrd.id.toString(), remote);
        }
      });

      AppState.orders = Array.from(orderMap.values()).sort((a, b) => {
        const numA = parseInt(a.id.toString().replace(/\D/g, '') || 0, 10);
        const numB = parseInt(b.id.toString().replace(/\D/g, '') || 0, 10);
        return numB - numA;
      });

      saveOrders();
      renderDashboard();
      renderOrders();

      // Si el modal de detalle de orden está abierto, refrescar sus fotos
      if (typeof currentDetailOrderId !== 'undefined' && currentDetailOrderId) {
        const currentOrd = AppState.orders.find(o => o.id === currentDetailOrderId);
        if (currentOrd && typeof renderDtlPhotos === 'function') renderDtlPhotos(currentOrd);
      }
    }

    AppState.supabase.lastSync = new Date().toLocaleTimeString();
    updateSupabaseUI();
    if (!isSilent) showToast('¡Todo sincronizado con Supabase Cloud!');
  } catch (err) {
    console.warn('Error en autoSyncAll:', err);
    if (!isSilent) alert('Error sincronizando con Supabase: ' + err.message);
  }
}

async function pushAllToSupabase(isSilent = false) {
  if (!AppState.supabase.client) {
    if (!isSilent) alert('Conecta primero tu proyecto Supabase.');
    return;
  }
  await autoSyncAll(isSilent);
}

async function pullAllFromSupabase() {
  if (!AppState.supabase.client) {
    alert('Conecta primero tu proyecto Supabase.');
    return;
  }
  showToast('Sincronizando con la nube...');
  await autoSyncAll(false);
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
      warrantyDays: 45,
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

// ==========================================
// 8.5 CANVAS INTERACTIVO: PATRÓN ANDROID DE 9 PUNTOS
// ==========================================

let patternCanvas = null;
let patternCtx = null;
let patternPoints = []; // [{x, y, index: 1..9}]
let currentPatternSequence = []; // e.g. [1, 2, 5, 8]
let isDrawingPattern = false;
let patternCurrentTouch = null;

function setupPatternCanvas() {
  patternCanvas = document.getElementById('patternCanvas');
  if (!patternCanvas) return;
  patternCtx = patternCanvas.getContext('2d');

  // Inicializar coordenadas fijas de los 9 puntos (matriz 3x3 para 220x220)
  initPatternPoints();
  drawPattern();

  // Eventos de Mouse
  patternCanvas.addEventListener('mousedown', (e) => {
    isDrawingPattern = true;
    currentPatternSequence = [];
    const pt = getPatternCanvasCoords(e);
    patternCurrentTouch = pt;
    checkPointCollision(pt);
    drawPattern();
  });

  patternCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawingPattern) return;
    const pt = getPatternCanvasCoords(e);
    patternCurrentTouch = pt;
    checkPointCollision(pt);
    drawPattern();
  });

  window.addEventListener('mouseup', () => {
    if (isDrawingPattern) {
      isDrawingPattern = false;
      patternCurrentTouch = null;
      drawPattern();
      syncPatternToInput();
    }
  });

  // Eventos Táctiles (Touchscreen / Móviles / Tablets)
  patternCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isDrawingPattern = true;
    currentPatternSequence = [];
    const touch = e.touches[0];
    const pt = getTouchPatternCoords(touch);
    patternCurrentTouch = pt;
    checkPointCollision(pt);
    drawPattern();
  }, { passive: false });

  patternCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isDrawingPattern) return;
    const touch = e.touches[0];
    const pt = getTouchPatternCoords(touch);
    patternCurrentTouch = pt;
    checkPointCollision(pt);
    drawPattern();
  }, { passive: false });

  patternCanvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (isDrawingPattern) {
      isDrawingPattern = false;
      patternCurrentTouch = null;
      drawPattern();
      syncPatternToInput();
    }
  }, { passive: false });
}

function initPatternPoints() {
  if (!patternCanvas) return;
  patternPoints = [];
  const w = patternCanvas.width || 220;
  const h = patternCanvas.height || 220;
  const colStep = w / 4;
  const rowStep = h / 4;

  let idx = 1;
  for (let row = 1; row <= 3; row++) {
    for (let col = 1; col <= 3; col++) {
      patternPoints.push({
        index: idx,
        x: col * colStep,
        y: row * rowStep,
        radius: 12
      });
      idx++;
    }
  }
}

function getPatternCanvasCoords(e) {
  const rect = patternCanvas.getBoundingClientRect();
  const scaleX = patternCanvas.width / rect.width;
  const scaleY = patternCanvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function getTouchPatternCoords(touch) {
  const rect = patternCanvas.getBoundingClientRect();
  const scaleX = patternCanvas.width / rect.width;
  const scaleY = patternCanvas.height / rect.height;
  return {
    x: (touch.clientX - rect.left) * scaleX,
    y: (touch.clientY - rect.top) * scaleY
  };
}

function checkPointCollision(pt) {
  const hitRadius = 24; // Margen de toque cómodo
  for (const p of patternPoints) {
    const dist = Math.hypot(p.x - pt.x, p.y - pt.y);
    if (dist <= hitRadius) {
      if (!currentPatternSequence.includes(p.index)) {
        currentPatternSequence.push(p.index);
        // Pequeño feedback sonoro o vibración si el navegador lo permite
        if (navigator.vibrate) {
          try { navigator.vibrate(10); } catch (_) {}
        }
      }
      break;
    }
  }
}

function drawPattern() {
  if (!patternCtx || !patternCanvas) return;
  const w = patternCanvas.width;
  const h = patternCanvas.height;
  patternCtx.clearRect(0, 0, w, h);

  // 1. Trazar líneas que unen los puntos seleccionados
  if (currentPatternSequence.length > 0) {
    patternCtx.beginPath();
    const firstPt = patternPoints.find(p => p.index === currentPatternSequence[0]);
    if (firstPt) patternCtx.moveTo(firstPt.x, firstPt.y);

    for (let i = 1; i < currentPatternSequence.length; i++) {
      const pt = patternPoints.find(p => p.index === currentPatternSequence[i]);
      if (pt) patternCtx.lineTo(pt.x, pt.y);
    }

    // Línea elástica hacia el dedo actual mientras arrastra
    if (isDrawingPattern && patternCurrentTouch && currentPatternSequence.length > 0) {
      patternCtx.lineTo(patternCurrentTouch.x, patternCurrentTouch.y);
    }

    patternCtx.strokeStyle = '#f59e0b'; // Amber 500
    patternCtx.lineWidth = 4;
    patternCtx.lineCap = 'round';
    patternCtx.lineJoin = 'round';
    patternCtx.shadowColor = '#f59e0b';
    patternCtx.shadowBlur = 10;
    patternCtx.stroke();
    patternCtx.shadowBlur = 0; // Reset sombra
  }

  // 2. Dibujar los 9 puntos
  patternPoints.forEach(p => {
    const isSelected = currentPatternSequence.includes(p.index);

    patternCtx.beginPath();
    patternCtx.arc(p.x, p.y, isSelected ? 10 : 8, 0, Math.PI * 2);
    patternCtx.fillStyle = isSelected ? '#fbbf24' : '#334155';
    patternCtx.fill();

    if (isSelected) {
      patternCtx.lineWidth = 3;
      patternCtx.strokeStyle = '#f59e0b';
      patternCtx.stroke();

      // Halo exterior
      patternCtx.beginPath();
      patternCtx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      patternCtx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
      patternCtx.lineWidth = 2;
      patternCtx.stroke();
    } else {
      patternCtx.lineWidth = 1.5;
      patternCtx.strokeStyle = '#475569';
      patternCtx.stroke();
    }
  });

  // Actualizar texto informativo de secuencia
  const seqEl = document.getElementById('patternDotsSequence');
  if (seqEl) {
    seqEl.innerText = currentPatternSequence.length > 0 
      ? `Secuencia: [${currentPatternSequence.join(' ➔ ')}]` 
      : 'Secuencia: Ninguna';
  }
}

function syncPatternToInput() {
  const passInput = document.getElementById('devicePassword');
  if (passInput) {
    if (currentPatternSequence.length > 0) {
      passInput.value = `Patrón: ${currentPatternSequence.join('-')}`;
    } else {
      passInput.value = '';
    }
  }
}

function clearPatternCanvas() {
  currentPatternSequence = [];
  patternCurrentTouch = null;
  isDrawingPattern = false;
  drawPattern();
  syncPatternToInput();
}

// Cargar un patrón existente (ej: '1-2-5-8' o 'Patrón: 1-2-5-8')
function loadPatternSequence(seqStr) {
  if (!seqStr) {
    currentPatternSequence = [];
  } else {
    const clean = seqStr.replace(/[^0-9-]/g, '');
    const parts = clean.split('-').map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 9);
    currentPatternSequence = parts;
  }
  drawPattern();
}

// Renderizar vista previa estática del patrón en canvas de 130x130 (para Modal de Detalle)
function renderStaticPatternPreview(canvasId, seqStr) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width || 130;
  const h = canvas.height || 130;
  ctx.clearRect(0, 0, w, h);

  const clean = (seqStr || '').replace(/[^0-9-]/g, '');
  const seq = clean.split('-').map(n => parseInt(n, 10)).filter(n => n >= 1 && n <= 9);

  const points = [];
  const colStep = w / 4;
  const rowStep = h / 4;
  let idx = 1;
  for (let r = 1; r <= 3; r++) {
    for (let c = 1; c <= 3; c++) {
      points.push({ index: idx, x: c * colStep, y: r * rowStep });
      idx++;
    }
  }

  // Trazar línea
  if (seq.length > 0) {
    ctx.beginPath();
    const first = points.find(p => p.index === seq[0]);
    if (first) ctx.moveTo(first.x, first.y);
    for (let i = 1; i < seq.length; i++) {
      const pt = points.find(p => p.index === seq[i]);
      if (pt) ctx.lineTo(pt.x, pt.y);
    }
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Puntos
  points.forEach(p => {
    const active = seq.includes(p.index);
    ctx.beginPath();
    ctx.arc(p.x, p.y, active ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#fbbf24' : '#334155';
    ctx.fill();
    ctx.strokeStyle = active ? '#f59e0b' : '#475569';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
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
      AppState.currentPage = 1;
      renderOrders();
    });
  }

  // Inicializar orden de órdenes guardado
  const orderSortSelect = document.getElementById('orderSortSelect');
  if (orderSortSelect) {
    const savedSort = localStorage.getItem('glitchlab_order_sort') || 'folio_desc';
    AppState.orderSort = savedSort;
    orderSortSelect.value = savedSort;
  }

  const filterButtons = document.querySelectorAll('.filter-pill');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active', 'bg-sky-500', 'text-white'));
      filterButtons.forEach(b => b.classList.add('bg-slate-800', 'text-slate-300'));
      btn.classList.add('active', 'bg-sky-500', 'text-white');
      btn.classList.remove('bg-slate-800', 'text-slate-300');
      
      AppState.filterStatus = btn.dataset.status;
      AppState.currentPage = 1;
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
      const patternContainer = document.getElementById('patternCanvasContainer');
      const passLabel = document.getElementById('passFieldLabel');

      if (val === 'none') {
        passwordFieldContainer.classList.add('hidden');
        if (patternContainer) patternContainer.classList.add('hidden');
        passwordInput.value = '';
        clearPatternCanvas();
      } else if (val === 'pattern') {
        passwordFieldContainer.classList.remove('hidden');
        if (patternContainer) patternContainer.classList.remove('hidden');
        if (passLabel) passLabel.innerText = 'Patrón Gráfico Android';
        passwordInput.placeholder = 'Traza en el lienzo inferior o escribe aquí...';
        drawPattern();
      } else {
        passwordFieldContainer.classList.remove('hidden');
        if (patternContainer) patternContainer.classList.add('hidden');
        if (val === 'pin') {
          if (passLabel) passLabel.innerText = 'PIN Numérico de Desbloqueo';
          passwordInput.placeholder = 'Ej: 1234 o 0000 (Solo números)';
        } else {
          if (passLabel) passLabel.innerText = 'Contraseña Alfanumérica de Sistema';
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

  // Cerrar menú de ajustes al hacer clic fuera
  document.addEventListener('click', (e) => {
    const container = document.getElementById('settingsMenuContainer');
    const menu = document.getElementById('settingsDropdownMenu');
    if (menu && !menu.classList.contains('hidden')) {
      if (container && !container.contains(e.target)) {
        closeSettingsMenu();
      }
    }
  });
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
  const now = Date.now();
  const abandonedCount = AppState.orders.filter(o => {
    if (o.status === 'delivered' || o.status === 'cancelled') return false;
    const orderTime = new Date(o.date).getTime();
    return !isNaN(orderTime) && (now - orderTime) / (1000 * 60 * 60 * 24) > 30;
  }).length;

  const counts = {
    all: AppState.orders.length,
    received: AppState.orders.filter(o => o.status === 'received').length,
    diagnostic: AppState.orders.filter(o => o.status === 'diagnostic').length,
    in_progress: AppState.orders.filter(o => o.status === 'in_progress').length,
    waiting_parts: AppState.orders.filter(o => o.status === 'waiting_parts').length,
    ready: AppState.orders.filter(o => o.status === 'ready').length,
    delivered: AppState.orders.filter(o => o.status === 'delivered').length,
    cancelled: AppState.orders.filter(o => o.status === 'cancelled').length,
    abandoned: abandonedCount
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

// Cambiar ordenamiento de órdenes
function handleOrderSortChange(val) {
  AppState.orderSort = val;
  try {
    localStorage.setItem('glitchlab_order_sort', val);
  } catch (e) {}
  AppState.currentPage = 1;
  renderOrders();
}

function updateMobileNavState(section) {
  const items = {
    services: document.getElementById('mobNavServices'),
    clients: document.getElementById('mobNavClients'),
    inventory: document.getElementById('mobNavInventory'),
    finances: document.getElementById('mobNavFinances')
  };

  Object.entries(items).forEach(([key, btn]) => {
    if (!btn) return;
    const span = btn.querySelector('span');
    if (key === section) {
      btn.className = 'flex flex-col items-center justify-center flex-1 py-1 text-sky-400 group focus:outline-none';
      if (span) span.className = 'text-[10px] font-bold text-sky-400';
    } else {
      btn.className = 'flex flex-col items-center justify-center flex-1 py-1 text-slate-400 hover:text-white group focus:outline-none';
      if (span) span.className = 'text-[10px] font-medium text-slate-400';
    }
  });
}

function switchNavSection(section) {
  const tabServices = document.getElementById('navTabServices');
  if (tabServices) {
    tabServices.className = 'nav-pill active px-3.5 py-2 rounded-full bg-white text-slate-900 font-bold text-xs sm:text-sm shadow transition flex items-center gap-1.5';
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
  updateMobileNavState(section || 'services');
  AppState.currentPage = 1;
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
  AppState.currentPage = 1;
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

  if (AppState.filterStatus === 'abandoned') {
    const now = Date.now();
    filtered = filtered.filter(o => {
      if (o.status === 'delivered' || o.status === 'cancelled') return false;
      const orderTime = new Date(o.date).getTime();
      return !isNaN(orderTime) && (now - orderTime) / (1000 * 60 * 60 * 24) > 30;
    });
  } else if (AppState.filterStatus !== 'all') {
    filtered = filtered.filter(o => o.status === AppState.filterStatus);
  }

  if (AppState.searchQuery) {
    const q = AppState.searchQuery.toLowerCase().trim().replace(/^#/, '');
    const qDigits = q.replace(/\D/g, '');
    filtered = filtered.filter(o => {
      const folio = (o.id || '').toString().toLowerCase();
      const clientName = (o.client?.name || '').toLowerCase();
      const phone = (o.client?.phone || '').toLowerCase();
      const phoneDigits = phone.replace(/\D/g, '');
      const brand = (o.equipment?.brand || '').toLowerCase();
      const model = (o.equipment?.model || '').toLowerCase();
      const type = (o.equipment?.type || '').toLowerCase();
      const serial = (o.equipment?.serial || '').toLowerCase();
      const issue = (o.issue || '').toLowerCase();
      return folio.includes(q) || clientName.includes(q) || phone.includes(q) ||
             (qDigits.length >= 3 && phoneDigits.includes(qDigits)) ||
             brand.includes(q) || model.includes(q) || type.includes(q) ||
             serial.includes(q) || issue.includes(q);
    });
  }

  // Ordenamiento configurable de órdenes
  const sortMode = AppState.orderSort || 'folio_desc';
  filtered.sort((a, b) => {
    const numA = parseInt((a.id || '').toString().replace(/\D/g, '') || 0, 10);
    const numB = parseInt((b.id || '').toString().replace(/\D/g, '') || 0, 10);
    const dateA = new Date(a.date).getTime() || 0;
    const dateB = new Date(b.date).getTime() || 0;

    if (sortMode === 'folio_desc') {
      if (numB !== numA) return numB - numA;
      return dateB - dateA;
    } else if (sortMode === 'folio_asc') {
      if (numA !== numB) return numA - numB;
      return dateA - dateB;
    } else if (sortMode === 'date_desc') {
      if (dateB !== dateA) return dateB - dateA;
      return numB - numA;
    } else if (sortMode === 'date_asc') {
      if (dateA !== dateB) return dateA - dateB;
      return numA - numB;
    } else if (sortMode === 'client_asc') {
      const nameA = (a.client?.name || '').toLowerCase();
      const nameB = (b.client?.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    }
    return numB - numA;
  });

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
    const paginContainer = document.getElementById('ordersPaginationContainer');
    if (paginContainer) paginContainer.innerHTML = '';
    return;
  }

  // --- PAGINACIÓN DE 9 ÓRDENES POR PÁGINA ---
  const pageSize = AppState.pageSize || 9;
  const totalPages = Math.ceil(filtered.length / pageSize);
  if (AppState.currentPage > totalPages) AppState.currentPage = totalPages;
  if (AppState.currentPage < 1) AppState.currentPage = 1;

  const startIndex = (AppState.currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedOrders = filtered.slice(startIndex, endIndex);

  // 1. RENDERIZAR VISTA EN CUADRÍCULA (Estilo Minimalista y Limpio - Clic abre Detalle Completo)
  container.innerHTML = paginatedOrders.map(order => {
    const meta = StatusMeta[order.status] || StatusMeta.received;
    const dateFormatted = new Date(order.date).toLocaleDateString('es-MX', {
      day: '2-digit', month: '2-digit', year: '2-digit'
    });

    // Tiempo transcurrido en el taller
    const workshopTime = calculateWorkshopDays(order);

    // Fecha y hora de entrega si ya fue entregado
    let deliveredFormatted = '';
    if (order.status === 'delivered' && order.deliveredDate) {
      const dObj = new Date(order.deliveredDate);
      if (!isNaN(dObj.getTime())) {
        deliveredFormatted = dObj.toLocaleDateString('es-MX', {
          day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
        });
      }
    }

    // Departamento según tipo de equipo
    let dept = '⚙ Microelectrónica';
    const typeLower = (order.equipment?.type || '').toLowerCase();
    if (typeLower.includes('impresora') || typeLower.includes('otro')) dept = '⚙ Servicios Generales';
    else if (typeLower.includes('consola')) dept = '⚙ Gaming Lab';
    else if (typeLower.includes('tarjeta')) dept = '⚙ Microelectrónica';
    else if (typeLower.includes('escritorio') || typeLower.includes('pc')) dept = '⚙ Hardware PC';
    else if (typeLower.includes('laptop')) dept = '⚙ Laptops & BGA';

    const warranty = getWarrantyStatus(order);

    const isDelivered = order.status === 'delivered';
    const isAbandoned = (!isDelivered && order.status !== 'cancelled') &&
      (!isNaN(new Date(order.date).getTime()) && (Date.now() - new Date(order.date).getTime()) / (1000 * 60 * 60 * 24) > 30);

    return `
      <div 
        onclick="openOrderDetailModal('${order.id}')" 
        class="order-card ${isDelivered ? 'order-card-delivered' : ''} ${isAbandoned ? 'border-rose-500/60 shadow-rose-950/20' : ''} rounded-2xl p-5 shadow-xl flex flex-col justify-between cursor-pointer relative select-none"
      >
        <div>
          <!-- Cabecera Superior: Folio Numérico #1, Fecha y Estatus con Dot -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span class="font-mono text-base font-black ${isDelivered ? 'text-slate-400' : 'text-white'} tracking-tight group-hover:text-sky-400 transition-colors shrink-0">#${order.id}</span>
                <button 
                  type="button" 
                  onclick="event.stopPropagation(); showOrderQRModal('${order.id}')" 
                  class="p-1 text-sky-400 hover:text-white bg-slate-900/90 hover:bg-sky-600 rounded-md border border-slate-800 transition shrink-0" 
                  title="Ver Código QR de Rastreo en Pantalla"
                >
                  <i class="fas fa-qrcode text-[11px]"></i>
                </button>
                ${isDelivered ? `
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/70 text-emerald-400 border border-emerald-800/60 inline-flex items-center gap-1 shrink-0">
                    <i class="fas fa-handshake text-[9px]"></i> Entregado
                  </span>
                  ${warranty.hasWarranty ? `
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${warranty.class} inline-flex items-center shrink-0">
                      ${warranty.badge}
                    </span>
                  ` : ''}
                ` : (warranty.hasWarranty ? `
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${warranty.class} inline-flex items-center shrink-0">
                    ${warranty.badge}
                  </span>
                ` : '')}
                ${isAbandoned ? `
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse inline-flex items-center gap-1 shrink-0">
                    <i class="fas fa-triangle-exclamation"></i> >30d Abandonado
                  </span>
                ` : ''}
              </div>
              <div class="flex items-center gap-2 text-slate-400 text-xs mt-1.5 flex-wrap">
                <span class="inline-flex items-center gap-1">
                  <i class="far fa-calendar text-[11px]"></i>
                  <span>${dateFormatted}</span>
                </span>
                <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${isDelivered ? 'bg-slate-900 text-slate-400 border border-slate-800' : (workshopTime.days >= 7 ? 'bg-amber-950/70 text-amber-300 border border-amber-800/60' : 'bg-slate-900/90 text-sky-400 border border-slate-800')}" title="${isDelivered ? 'Duración total en taller hasta la entrega' : 'Tiempo transcurrido en taller'}">
                  <i class="fas fa-stopwatch text-[9px]"></i>
                  <span>${isDelivered ? `Estuvo: ${workshopTime.shortLabel}` : workshopTime.label}</span>
                </span>
                ${deliveredFormatted ? `
                  <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/50" title="Fecha y hora exacta de entrega">
                    <i class="fas fa-calendar-check text-[9px]"></i>
                    <span>Entregado: ${deliveredFormatted}</span>
                  </span>
                ` : ''}
              </div>
            </div>

            ${!isDelivered ? `
              <!-- Estatus con Punto Indicador a la Derecha (estilo "• A tiempo") sólo en órdenes activas -->
              <div class="flex items-center gap-1.5 text-xs font-semibold text-slate-300 shrink-0">
                <span class="w-2 h-2 rounded-full ${meta.dotColor}"></span>
                <span>${meta.timingLabel}</span>
              </div>
            ` : ''}
          </div>

          <!-- Nombre del Cliente y Teléfono formateado -->
          <div class="mt-4">
            <div class="flex items-center justify-between gap-2">
              <h3 class="font-extrabold text-sm sm:text-base ${isDelivered ? 'text-slate-300' : 'text-white'} tracking-wide uppercase leading-tight group-hover:text-sky-300 transition-colors truncate">
                ${escapeHtml(order.client?.name || 'CLIENTE')}
              </h3>
              ${order.client?.phone ? `
                <span class="text-[11px] font-mono font-bold ${isDelivered ? 'text-slate-400 bg-slate-900 border-slate-800' : 'text-sky-400 bg-sky-950/70 border-sky-800/50'} border px-2 py-0.5 rounded-lg shrink-0 tracking-wider">
                  <i class="fas fa-phone-alt text-[9px] mr-1 ${isDelivered ? 'text-slate-400' : 'text-sky-400'}"></i>${escapeHtml(formatPhoneNumber(order.client.phone))}
                </span>
              ` : ''}
            </div>
            <p class="text-xs text-slate-400 mt-0.5 font-medium">
              ${escapeHtml(order.equipment?.type || 'Equipo')} • ${escapeHtml(order.equipment?.brand || '')} ${escapeHtml(order.equipment?.model || '')}
            </p>
          </div>

          <!-- Caja de Falla Reportada (Limpia y minimalista) -->
          <div class="mt-3.5 p-3.5 ${isDelivered ? 'bg-[#020409] border-slate-900 text-slate-400' : 'bg-[#060913] border-slate-800/80 text-slate-200'} rounded-xl border text-xs font-medium">
            <span class="italic font-semibold block leading-relaxed line-clamp-2">
              "${escapeHtml((order.issue || 'SIN FALLA ESPECIFICADA').toUpperCase())}"
            </span>
          </div>
        </div>

        <!-- Footer Tarjeta: Estado a la izquierda, Departamento a la derecha con indicación de clic -->
        <div class="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${isDelivered ? 'text-slate-400' : 'text-slate-300'}">
              <span class="w-2 h-2 rounded-full ${meta.dotColor}"></span>
              ${meta.label}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <span class="text-[11px] text-slate-400 font-medium">${dept}</span>
            <i class="fas fa-chevron-right text-[10px] text-slate-500"></i>
          </div>
        </div>

      </div>
    `;
  }).join('');

  // 2. RENDERIZAR VISTA EN LISTA (TABLA)
  if (listContainer) {
    listContainer.innerHTML = paginatedOrders.map(order => {
      const isDeliveredRow = order.status === 'delivered';
      const meta = StatusMeta[order.status] || StatusMeta.received;
      const dateFormatted = new Date(order.date).toLocaleDateString('es-MX', {
        day: '2-digit', month: '2-digit', year: '2-digit'
      });
      const workshopTime = calculateWorkshopDays(order);
      let deliveredFormatted = '';
      if (order.status === 'delivered' && order.deliveredDate) {
        const dObj = new Date(order.deliveredDate);
        if (!isNaN(dObj.getTime())) {
          deliveredFormatted = dObj.toLocaleDateString('es-MX', {
            day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
          });
        }
      }
      const balance = order.costs?.balance ?? 0;
      const est = order.costs?.estimated ?? 0;

      return `
        <tr onclick="openOrderDetailModal('${order.id}')" class="border-b border-slate-800/80 ${isDeliveredRow ? 'bg-[#030611] opacity-75 hover:opacity-100 hover:bg-slate-900/80 text-slate-400' : 'hover:bg-slate-800/30'} cursor-pointer transition">
          <td class="py-3 px-4 font-mono font-black text-white">#${order.id}</td>
          <td class="py-3 px-4 text-slate-400 whitespace-nowrap">
            <div>${dateFormatted}</div>
            <div class="text-[10px] ${isDeliveredRow ? 'text-slate-500' : 'text-sky-400'} font-medium flex items-center gap-1 mt-0.5">
              <i class="fas fa-stopwatch text-[9px]"></i> ${isDeliveredRow ? `Estuvo: ${workshopTime.shortLabel}` : workshopTime.label}
            </div>
            ${deliveredFormatted ? `
              <div class="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                <i class="fas fa-calendar-check text-[9px]"></i> Ent: ${deliveredFormatted}
              </div>
            ` : ''}
          </td>
          <td class="py-3 px-4">
            <div class="font-bold text-white uppercase">${escapeHtml(order.client?.name || '')}</div>
            <div class="text-[11px] text-sky-400 font-mono tracking-wider font-semibold">${escapeHtml(formatPhoneNumber(order.client?.phone) || '')}</div>
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
              <button onclick="showOrderQRModal('${order.id}')" title="Código QR de Rastreo en Pantalla" class="p-1.5 text-sky-400 hover:bg-slate-800 rounded">
                <i class="fas fa-qrcode"></i>
              </button>
              <button onclick="openOrderDetailModal('${order.id}')" title="Ver Detalle Completo" class="p-1.5 text-slate-300 hover:text-sky-400 hover:bg-slate-800 rounded">
                <i class="fas fa-expand"></i>
              </button>
              <button onclick="openQuickLabelPrint('${order.id}')" title="Imprimir Etiqueta" class="p-1.5 text-amber-300 hover:bg-slate-800 rounded">
                <i class="fas fa-tag"></i>
              </button>
              <button onclick="openDeliveryModal('${order.id}')" title="Entregar Equipo al Cliente" class="p-1.5 ${order.status === 'delivered' ? 'text-slate-600' : 'text-emerald-400 hover:bg-emerald-950/60'} rounded">
                <i class="fas fa-handshake"></i>
              </button>
              <button onclick="downloadCustomerPDF('${order.id}')" title="Descargar Comprobante PDF" class="p-1.5 text-red-400 hover:bg-slate-800 rounded">
                <i class="fas fa-file-invoice"></i>
              </button>
              <button onclick="downloadWorkSummaryPDF('${order.id}')" title="Descargar Resumen de Trabajo Técnico (PDF)" class="p-1.5 text-sky-400 hover:bg-slate-800 rounded">
                <i class="fas fa-file-medical"></i>
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

  // 3. RENDERIZAR CONTROLES DE PAGINACIÓN
  renderOrdersPagination(filtered.length, totalPages, startIndex, endIndex);
}

// Renderizar Barra de Navegación de Páginas
function renderOrdersPagination(totalItems, totalPages, startIndex, endIndex) {
  const paginContainer = document.getElementById('ordersPaginationContainer');
  if (!paginContainer) return;

  if (totalItems <= AppState.pageSize) {
    paginContainer.innerHTML = '';
    paginContainer.classList.add('hidden');
    return;
  }
  paginContainer.classList.remove('hidden');

  const currentPage = AppState.currentPage;
  const showingFrom = startIndex + 1;
  const showingTo = Math.min(endIndex, totalItems);

  // Generar botones numéricos
  let pageButtonsHtml = '';
  for (let i = 1; i <= totalPages; i++) {
    // Si hay muchas páginas, mostrar primera, última y alrededor de la actual
    if (totalPages > 7) {
      if (i !== 1 && i !== totalPages && Math.abs(i - currentPage) > 1) {
        if (i === 2 || i === totalPages - 1) {
          pageButtonsHtml += `<span class="px-2 text-slate-500 font-bold">...</span>`;
        }
        continue;
      }
    }

    const isActive = i === currentPage;
    pageButtonsHtml += `
      <button 
        onclick="goToOrdersPage(${i})" 
        class="w-8 h-8 rounded-lg text-xs font-bold transition flex items-center justify-center ${
          isActive 
            ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30' 
            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60'
        }"
      >
        ${i}
      </button>
    `;
  }

  paginContainer.innerHTML = `
    <div class="text-xs text-slate-400 font-medium flex items-center gap-1">
      Mostrando <span class="text-white font-bold">${showingFrom}-${showingTo}</span> de <span class="text-sky-400 font-bold">${totalItems}</span> órdenes
    </div>

    <div class="flex items-center gap-1.5 flex-wrap justify-center">
      <button 
        onclick="goToOrdersPage(${currentPage - 1})" 
        ${currentPage <= 1 ? 'disabled class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed"' : 'class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"'}
      >
        <i class="fas fa-chevron-left mr-1"></i> Anterior
      </button>

      <div class="flex items-center gap-1 mx-1">
        ${pageButtonsHtml}
      </div>

      <button 
        onclick="goToOrdersPage(${currentPage + 1})" 
        ${currentPage >= totalPages ? 'disabled class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed"' : 'class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"'}
      >
        Siguiente <i class="fas fa-chevron-right ml-1"></i>
      </button>
    </div>
  `;
}

function goToOrdersPage(pageNumber) {
  AppState.currentPage = pageNumber;
  renderOrders();
  const mainOrdersSection = document.getElementById('ordersContainer');
  if (mainOrdersSection) {
    mainOrdersSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  // Días en Taller & Fecha/Hora de Entrega
  const workshopTime = calculateWorkshopDays(order);
  const dtlWorkshopTimeBadge = document.getElementById('dtlWorkshopTimeBadge');
  if (dtlWorkshopTimeBadge) {
    const isDelivered = order.status === 'delivered';
    dtlWorkshopTimeBadge.className = `inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${isDelivered ? 'bg-slate-900 text-slate-400 border border-slate-800' : (workshopTime.days >= 7 ? 'bg-amber-950/70 text-amber-300 border border-amber-800/60' : 'bg-slate-900/90 text-sky-400 border border-slate-800')}`;
    dtlWorkshopTimeBadge.innerHTML = `<i class="fas fa-stopwatch text-[10px]"></i><span>${isDelivered ? `Estuvo en taller: ${workshopTime.shortLabel}` : workshopTime.label}</span>`;
  }

  const dtlDeliveredTimeBadge = document.getElementById('dtlDeliveredTimeBadge');
  if (dtlDeliveredTimeBadge) {
    if (order.status === 'delivered' && order.deliveredDate) {
      const dObj = new Date(order.deliveredDate);
      const delDateStr = !isNaN(dObj.getTime())
        ? dObj.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '';
      if (delDateStr) {
        dtlDeliveredTimeBadge.classList.remove('hidden');
        dtlDeliveredTimeBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-950/70 text-emerald-400 border border-emerald-800/60';
        dtlDeliveredTimeBadge.innerHTML = `<i class="fas fa-calendar-check text-[10px]"></i><span>Entregado el: ${delDateStr}</span>`;
      } else {
        dtlDeliveredTimeBadge.classList.add('hidden');
      }
    } else {
      dtlDeliveredTimeBadge.classList.add('hidden');
    }
  }

  // Información del Cliente
  const clientPhone = order.client?.phone || '';
  const dtlClientName = document.getElementById('dtlClientName');
  const dtlClientPhone = document.getElementById('dtlClientPhone');
  const dtlClientEmail = document.getElementById('dtlClientEmail');
  const dtlClientAddress = document.getElementById('dtlClientAddress');

  if (dtlClientName) dtlClientName.innerText = order.client?.name || 'Cliente';
  if (dtlClientPhone) dtlClientPhone.innerText = formatPhoneNumber(clientPhone) || 'No registrado';
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

  // Checklist Funcional Rápido en Detalle
  const dtlChecklistContainer = document.getElementById('dtlFunctionalCheckContainer');
  const dtlChecklistBadges = document.getElementById('dtlFunctionalCheckBadges');
  const functionalChecks = order.equipment?.functionalCheck || [];
  if (dtlChecklistContainer && dtlChecklistBadges) {
    if (functionalChecks.length > 0) {
      dtlChecklistContainer.classList.remove('hidden');
      dtlChecklistBadges.innerHTML = functionalChecks.map(item => `
        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-950/70 text-sky-300 border border-sky-800">
          <i class="fas fa-check text-[9px] text-emerald-400"></i> ${escapeHtml(item)}
        </span>
      `).join('');
    } else {
      dtlChecklistContainer.classList.add('hidden');
      dtlChecklistBadges.innerHTML = '';
    }
  }

  // Visualización del Patrón Android de 9 Puntos en Detalle
  const dtlPatternContainer = document.getElementById('dtlPatternPreviewContainer');
  const dtlPatternText = document.getElementById('dtlPatternSequenceText');
  const isPatternLock = order.equipment?.lockType === 'pattern' || (order.equipment?.password && order.equipment.password.toLowerCase().includes('patrón'));
  if (dtlPatternContainer) {
    if (isPatternLock && order.equipment?.password) {
      dtlPatternContainer.classList.remove('hidden');
      if (dtlPatternText) dtlPatternText.innerText = order.equipment.password;
      renderStaticPatternPreview('dtlPatternCanvas', order.equipment.password);
    } else {
      dtlPatternContainer.classList.add('hidden');
    }
  }

  // Motivo de Ingreso & Diagnóstico
  const dtlIssue = document.getElementById('dtlIssue');
  const dtlDiagnosis = document.getElementById('dtlDiagnosis');
  if (dtlIssue) dtlIssue.innerText = `"${(order.issue || 'No especificada').toUpperCase()}"`;
  if (dtlDiagnosis) dtlDiagnosis.innerText = order.initialDiagnosis || 'En proceso de revisión por los ingenieros de laboratorio.';

  // Notificación de Decisión de Presupuesto del Cliente
  const dtlBudgetCard = document.getElementById('dtlBudgetDecisionCard');
  const dtlBudgetTitle = document.getElementById('dtlBudgetDecisionTitle');
  const dtlBudgetText = document.getElementById('dtlBudgetDecisionText');
  const dtlBudgetDate = document.getElementById('dtlBudgetDecisionDate');
  const dtlBudgetIcon = document.getElementById('dtlBudgetDecisionIcon');
  if (dtlBudgetCard) {
    if (order.budgetDecision) {
      dtlBudgetCard.classList.remove('hidden');
      const bDate = order.budgetDecision.date ? new Date(order.budgetDecision.date).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      if (dtlBudgetDate) dtlBudgetDate.innerText = bDate;

      if (order.budgetDecision.status === 'approved') {
        dtlBudgetCard.className = 'p-3.5 bg-emerald-950/40 border border-emerald-500/50 rounded-2xl flex items-center justify-between gap-3';
        if (dtlBudgetIcon) dtlBudgetIcon.className = 'fas fa-check-circle text-emerald-400 text-lg';
        if (dtlBudgetTitle) dtlBudgetTitle.innerText = 'Presupuesto Aprobado por el Cliente';
        if (dtlBudgetText) dtlBudgetText.innerText = `El cliente autorizó el presupuesto de $${(order.budgetDecision.amount || order.costs?.estimated || 0).toLocaleString('es-MX')} MXN vía portal de rastreo.`;
      } else {
        dtlBudgetCard.className = 'p-3.5 bg-red-950/40 border border-red-500/50 rounded-2xl flex items-center justify-between gap-3';
        if (dtlBudgetIcon) dtlBudgetIcon.className = 'fas fa-times-circle text-rose-400 text-lg';
        if (dtlBudgetTitle) dtlBudgetTitle.innerText = 'Presupuesto Rechazado por el Cliente';
        if (dtlBudgetText) dtlBudgetText.innerText = `El cliente declinó la reparación desde el portal de rastreo. Equipo disponible para entrega.`;
      }
    } else {
      dtlBudgetCard.classList.add('hidden');
    }
  }

  // Finanzas & Pagos Múltiples
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

  // Desglose de Abonos Registrados
  const dtlPaymentsList = document.getElementById('dtlPaymentsSummaryList');
  if (dtlPaymentsList) {
    const payments = Array.isArray(order.costs?.payments) ? order.costs.payments : [];
    if (payments.length > 0) {
      dtlPaymentsList.innerHTML = `<span class="font-semibold text-slate-300">Historial (${payments.length}):</span> ` +
        payments.map(p => `<span class="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-[10px] text-emerald-400">$${p.amount} (${p.method})</span>`).join(' ');
    } else {
      dtlPaymentsList.innerHTML = '<span class="text-slate-500 italic">Anticipo inicial registrado</span>';
    }
  }

  // 5. CÓDIGO QR DE RASTREO DINÁMICO EN PANTALLA (https://rastreo.glitchlab.mx/?folio=X)
  const trackingUrl = getTrackingUrl(order.id);
  const dtlTrackingUrlText = document.getElementById('dtlTrackingUrlText');
  if (dtlTrackingUrlText) dtlTrackingUrlText.innerText = trackingUrl;

  const dtlQrContainer = document.getElementById('dtlQrContainer');
  if (dtlQrContainer && window.QRCode) {
    dtlQrContainer.innerHTML = '';
    new QRCode(dtlQrContainer, {
      text: trackingUrl,
      width: 105,
      height: 105,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  // 6. RENDERIZAR FOTOS DE LA ORDEN
  renderDtlPhotos(order);

  // Select de Estado Rápido
  const quickStatusSelect = document.getElementById('dtlQuickStatusSelect');
  if (quickStatusSelect) quickStatusSelect.value = order.status;

  // Acciones Rápidas del Footer
  const dtlBtnDeliver = document.getElementById('dtlBtnDeliver');
  if (dtlBtnDeliver) {
    if (order.status === 'delivered') {
      dtlBtnDeliver.classList.remove('from-emerald-600', 'to-emerald-500');
      dtlBtnDeliver.classList.add('bg-slate-800', 'text-slate-400', 'border', 'border-slate-700');
      dtlBtnDeliver.innerHTML = '<i class="fas fa-check-double text-emerald-400"></i><span>Ya Entregado</span>';
      dtlBtnDeliver.onclick = () => {
        openDeliveryModal(order.id);
      };
    } else {
      dtlBtnDeliver.className = 'px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap shadow-md shadow-emerald-600/20 active:scale-95';
      dtlBtnDeliver.innerHTML = '<i class="fas fa-handshake text-xs"></i><span>Entregar Equipo</span>';
      dtlBtnDeliver.onclick = () => {
        openDeliveryModal(order.id);
      };
    }
  }

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

  const dtlBtnWorkSummary = document.getElementById('dtlBtnWorkSummary');
  if (dtlBtnWorkSummary) {
    dtlBtnWorkSummary.onclick = () => {
      downloadWorkSummaryPDF(order.id);
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

// ==========================================
// 9.6 REGISTRO RÁPIDO DE ABONOS Y LIQUIDACIÓN MULTI-PAGO
// ==========================================
// 9.6 MODAL DE REGISTRO DE ABONOS Y LIQUIDACIÓN MULTI-PAGO
// ==========================================

let currentPaymentOrderId = null;

function promptQuickPayment(orderId) {
  openPaymentModal(orderId);
}

function openPaymentModal(orderId) {
  const targetId = orderId || currentDetailOrderId;
  const order = AppState.orders.find(o => o.id === targetId);
  if (!order) return;

  currentPaymentOrderId = targetId;
  const modal = document.getElementById('paymentModal');
  if (!modal) return;

  // Poblar Encabezado y Datos de la Orden
  const folioBadge = document.getElementById('payModalFolioBadge');
  const clientText = document.getElementById('payModalClientText');
  const totalCost = document.getElementById('payModalTotalCost');
  const totalPaid = document.getElementById('payModalTotalPaid');
  const currentBalance = document.getElementById('payModalCurrentBalance');
  const amountInput = document.getElementById('payModalAmountInput');
  const dateInput = document.getElementById('payModalDateInput');
  const techInput = document.getElementById('payModalTechInput');
  const noteInput = document.getElementById('payModalNoteInput');

  const est = Number(order.costs?.estimated) || 0;
  const adv = Number(order.costs?.advance) || 0;
  const bal = Number(order.costs?.balance) ?? Math.max(0, est - adv);

  if (folioBadge) folioBadge.innerText = `#${order.id}`;
  if (clientText) {
    const clientName = order.client?.name || 'Cliente';
    const equip = order.equipment?.brand ? ` • ${order.equipment.brand} ${order.equipment.model || ''}` : '';
    clientText.innerText = `${clientName}${equip}`;
  }

  if (totalCost) totalCost.innerText = `$${est.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (totalPaid) totalPaid.innerText = `$${adv.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (currentBalance) currentBalance.innerText = `$${bal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Inicializar valor de abono: por defecto el saldo total si hay saldo pendiente
  if (amountInput) {
    amountInput.value = bal > 0 ? bal : '';
  }

  if (dateInput) {
    dateInput.value = new Date().toISOString().slice(0, 16);
  }

  if (techInput) {
    techInput.value = (AppState.auth.currentUser?.name || AppState.auth.currentUser?.username || order.technician || 'GlitchLab Caja');
  }

  if (noteInput) {
    noteInput.value = bal > 0 ? (amountInput && Number(amountInput.value) >= bal ? 'Liquidación total del servicio' : 'Abono parcial a cuenta') : 'Pago adicional';
  }

  // Restablecer método a Efectivo por defecto
  const radios = document.querySelectorAll('input[name="payMethodOption"]');
  radios.forEach(r => {
    r.checked = r.value === 'Efectivo';
  });

  // Mostrar lista de pagos previos si existen
  renderPaymentModalPreviousHistory(order);

  modal.classList.remove('hidden');

  setTimeout(() => {
    if (amountInput) {
      amountInput.focus();
      amountInput.select();
    }
  }, 100);
}

function closePaymentModal() {
  const modal = document.getElementById('paymentModal');
  if (modal) modal.classList.add('hidden');
}

function setPaymentAmount(type) {
  const order = AppState.orders.find(o => o.id === currentPaymentOrderId);
  if (!order) return;

  const est = Number(order.costs?.estimated) || 0;
  const adv = Number(order.costs?.advance) || 0;
  const bal = Number(order.costs?.balance) ?? Math.max(0, est - adv);
  const input = document.getElementById('payModalAmountInput');
  const noteInput = document.getElementById('payModalNoteInput');
  if (!input) return;

  if (type === 'full') {
    input.value = bal > 0 ? bal : 0;
    if (noteInput) noteInput.value = 'Liquidación total del servicio';
  } else if (type === 'half') {
    input.value = bal > 0 ? (bal / 2).toFixed(2) : 0;
    if (noteInput) noteInput.value = 'Abono 50% de anticipo';
  }
}

function addPaymentQuickAmount(val) {
  const input = document.getElementById('payModalAmountInput');
  if (!input) return;
  const current = Number(input.value) || 0;
  input.value = (current + Number(val)).toFixed(2);
}

function updatePayMethodVisual(val) {
  // Selector reactivo
}

function renderPaymentModalPreviousHistory(order) {
  const container = document.getElementById('payModalPreviousPaymentsContainer');
  const list = document.getElementById('payModalPreviousPaymentsList');
  if (!container || !list) return;

  const payments = Array.isArray(order.costs?.payments) ? order.costs.payments : [];

  if (payments.length === 0) {
    container.classList.add('hidden');
    list.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  list.innerHTML = payments.map((p, idx) => {
    const d = new Date(p.date || order.date).toLocaleDateString('es-MX', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    return `
      <div class="p-2 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <span class="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold flex items-center justify-center">#${idx + 1}</span>
          <div>
            <span class="text-white font-semibold">${escapeHtml(p.method || 'Efectivo')}</span>
            <span class="text-slate-500 text-[10px] block">${d} • ${escapeHtml(p.note || 'Abono')}</span>
          </div>
        </div>
        <span class="font-mono font-bold text-emerald-400">+$${(Number(p.amount) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>
    `;
  }).join('');
}

function handlePaymentSubmit(e) {
  e.preventDefault();
  const order = AppState.orders.find(o => o.id === currentPaymentOrderId);
  if (!order) return;

  const amountInput = document.getElementById('payModalAmountInput');
  const amt = parseFloat(amountInput?.value || 0);

  if (isNaN(amt) || amt <= 0) {
    alert('Por favor ingresa un monto válido mayor a $0.00 MXN.');
    return;
  }

  // Obtener método de pago seleccionado
  const selectedRadio = document.querySelector('input[name="payMethodOption"]:checked');
  const chosenMethod = selectedRadio ? selectedRadio.value : 'Efectivo';

  const dateInput = document.getElementById('payModalDateInput');
  const payDate = dateInput?.value ? new Date(dateInput.value).toISOString() : new Date().toISOString();

  const techInput = document.getElementById('payModalTechInput');
  const techName = techInput?.value.trim() || AppState.auth.currentUser?.name || 'GlitchLab Caja';

  const noteInput = document.getElementById('payModalNoteInput');
  const currentBal = Number(order.costs?.balance) || 0;
  const payNote = noteInput?.value.trim() || (amt >= currentBal ? 'Liquidación total' : 'Abono a cuenta');

  if (!order.costs) order.costs = { estimated: 0, advance: 0, balance: 0, paymentMethod: 'Efectivo' };
  if (!Array.isArray(order.costs.payments)) {
    order.costs.payments = [];
    if (order.costs.advance > 0) {
      order.costs.payments.push({
        id: 'pay_' + (Date.now() - 1000),
        date: order.date || new Date().toISOString(),
        amount: Number(order.costs.advance),
        method: order.costs.paymentMethod || 'Efectivo',
        note: 'Anticipo inicial'
      });
    }
  }

  const newPayment = {
    id: 'pay_' + Date.now(),
    date: payDate,
    amount: amt,
    method: chosenMethod,
    note: payNote,
    technician: techName
  };

  order.costs.payments.push(newPayment);

  // Recalcular Total Pagado y Saldo Restante
  const totalPaid = order.costs.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  order.costs.advance = totalPaid;
  const estimated = Number(order.costs.estimated) || 0;
  order.costs.balance = Math.max(0, estimated - totalPaid);
  order.costs.paymentMethod = chosenMethod;

  // Registrar en la Bitácora de la orden
  if (!order.bitacora) order.bitacora = [];
  order.bitacora.unshift({
    id: 'bit_' + Date.now(),
    date: payDate,
    title: `Pago Recibido: $${amt.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${chosenMethod})`,
    notes: `${payNote}. Saldo pendiente restante: $${order.costs.balance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
    technician: techName,
    status: order.status
  });

  saveOrders();
  syncSingleOrderToSupabase(order);
  renderDashboard();
  renderOrders();

  closePaymentModal();

  // Refrescar el modal de detalle abierto para ver los números actualizados
  openOrderDetailModal(order.id);

  if (order.costs.balance <= 0) {
    showToast(`¡Excelente! Orden #${order.id} totalmente liquidada.`);
  } else {
    showToast(`Abono de $${amt.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} registrado con éxito.`);
  }
}

function copyDtlTrackingUrl() {
  if (!currentDetailOrderId) return;
  const url = getTrackingUrl(currentDetailOrderId);
  navigator.clipboard.writeText(url).then(() => {
    showToast('Enlace de rastreo copiado al portapapeles');
  }).catch(() => {
    prompt('Copia el enlace de rastreo:', url);
  });
}

function openDtlTrackingUrl() {
  if (!currentDetailOrderId) return;
  const url = getTrackingUrl(currentDetailOrderId);
  window.open(url, '_blank');
}

function downloadDtlQrCode() {
  if (!currentDetailOrderId) return;
  const container = document.getElementById('dtlQrContainer');
  const img = container ? container.querySelector('img') : null;
  const canvas = container ? container.querySelector('canvas') : null;
  const link = document.createElement('a');
  link.download = `qr_orden_${currentDetailOrderId}.png`;
  if (img && img.src) {
    link.href = img.src;
    link.click();
    showToast(`QR de Orden #${currentDetailOrderId} descargado`);
  } else if (canvas) {
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast(`QR de Orden #${currentDetailOrderId} descargado`);
  }
}

// ----------------------------------------------------
// GESTIÓN DE FOTOS DENTRO DEL DETALLE DE LA ORDEN
// ----------------------------------------------------
function renderDtlPhotos(order) {
  const container = document.getElementById('dtlPhotoGrid');
  const countBadge = document.getElementById('dtlPhotoCountBadge');
  const emptyNotice = document.getElementById('dtlPhotoEmptyNotice');
  if (!container) return;

  const photos = order.photos || [];
  if (countBadge) countBadge.innerText = `${photos.length} foto(s)`;

  if (photos.length === 0) {
    container.innerHTML = '';
    if (emptyNotice) emptyNotice.classList.remove('hidden');
    return;
  }

  if (emptyNotice) emptyNotice.classList.add('hidden');

  container.innerHTML = photos.map((photo, index) => {
    const dateFormatted = new Date(photo.date).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    return `
      <div class="relative group bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
        <div class="aspect-video w-full bg-black cursor-pointer overflow-hidden relative" onclick="openOrderPhotoLightbox('${order.id}', ${index})">
          <img src="${photo.url}" alt="${escapeHtml(photo.caption || '')}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
          <div class="absolute inset-0 bg-sky-950/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
            <span class="w-8 h-8 rounded-full bg-black/70 text-sky-400 flex items-center justify-center text-xs shadow-lg"><i class="fas fa-expand"></i></span>
          </div>
        </div>
        <div class="p-2">
          <p class="text-[11px] text-slate-200 font-medium truncate" title="${escapeHtml(photo.caption || '')}">
            ${escapeHtml(photo.caption || 'Evidencia técnica')}
          </p>
          <div class="flex items-center justify-between text-[10px] text-slate-400 mt-1">
            <span>${dateFormatted}</span>
            <button onclick="deletePhotoFromDtl('${order.id}', '${photo.id}')" class="text-slate-500 hover:text-red-400 transition p-1" title="Eliminar foto">
              <i class="fas fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function handleDtlPhotoUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  const orderId = currentDetailOrderId;
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  if (!order.photos) order.photos = [];

  showToast(`Procesando y guardando ${files.length} foto(s)...`);

  for (const file of Array.from(files)) {
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

      const maxDim = 1280;
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

      // Subir directamente al bucket de Supabase Storage
      if (AppState.supabase.client) {
        try {
          const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
          if (blob) {
            const cleanOrderId = (orderId || 'general').toString().replace(/\D/g, '') || orderId;
            storagePath = `orders/${cleanOrderId}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.jpg`;
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
              }
            }
          }
        } catch (sbErr) {
          console.warn('Excepción en subida de foto a Supabase:', sbErr);
        }
      }

      order.photos.unshift({
        id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        url: finalPhotoUrl,
        storage_path: storagePath,
        caption: 'Evidencia técnica',
        date: new Date().toISOString()
      });
    } catch (err) {
      console.error('Error al procesar foto:', err);
    }
  }

  saveOrders();
  syncSingleOrderToSupabase(order);
  renderDtlPhotos(order);
  renderOrders();
  showToast('✅ Foto(s) guardadas en la orden y sincronizadas con la nube.');
  e.target.value = '';
}

async function deletePhotoFromDtl(orderId, photoId) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order || !order.photos) return;

  if (confirm('¿Deseas eliminar esta foto de evidencia?')) {
    const photo = order.photos.find(p => p.id === photoId);
    if (photo && photo.storage_path && AppState.supabase.client) {
      try {
        await AppState.supabase.client.storage
          .from(AppState.supabase.bucket || 'order-photos')
          .remove([photo.storage_path]);
      } catch (e) {
        console.warn('Error borrando de Storage:', e);
      }
    }
    order.photos = order.photos.filter(p => p.id !== photoId);
    saveOrders();
    syncSingleOrderToSupabase(order);
    renderDtlPhotos(order);
    renderOrders();
    showToast('Foto eliminada.');
  }
}

// ==========================================
// MODAL RÁPIDO DE CÓDIGO QR PARA MOSTRADOR
// ==========================================
let currentQrOrderId = null;

function showOrderQRModal(orderId) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  currentQrOrderId = orderId;
  const modal = document.getElementById('orderQrModal');
  if (!modal) return;

  const meta = StatusMeta[order.status] || StatusMeta.received;
  const trackingUrl = getTrackingUrl(order.id);

  document.getElementById('qrModalFolio').innerText = order.id;
  document.getElementById('qrModalClientName').innerText = order.client?.name || 'Cliente';
  document.getElementById('qrModalEquipment').innerText = `${order.equipment?.brand || ''} ${order.equipment?.model || ''} (${order.equipment?.type || 'Equipo'})`.trim();
  
  const badgeEl = document.getElementById('qrModalStatusBadge');
  if (badgeEl) {
    badgeEl.innerHTML = `
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${meta.color}">
        <i class="fas ${meta.icon} text-[8px]"></i> ${meta.label}
      </span>
    `;
  }

  const urlText = document.getElementById('qrModalUrlText');
  if (urlText) urlText.innerText = trackingUrl;

  const codeContainer = document.getElementById('qrModalCodeContainer');
  if (codeContainer && window.QRCode) {
    codeContainer.innerHTML = '';
    new QRCode(codeContainer, {
      text: trackingUrl,
      width: 195,
      height: 195,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  modal.classList.remove('hidden');
}

function closeOrderQRModal(returnToOrder = true) {
  const lastOrderId = currentQrOrderId;
  const modal = document.getElementById('orderQrModal');
  if (modal) modal.classList.add('hidden');
  currentQrOrderId = null;

  if (returnToOrder && lastOrderId && typeof openOrderDetailModal === 'function') {
    openOrderDetailModal(lastOrderId);
  }
}

function returnToOrderDetailFromQR() {
  closeOrderQRModal(true);
}

function copyModalTrackingUrl() {
  if (!currentQrOrderId) return;
  const url = getTrackingUrl(currentQrOrderId);
  navigator.clipboard.writeText(url).then(() => {
    showToast('Enlace de rastreo copiado al portapapeles');
  }).catch(() => {
    prompt('Copia el enlace de rastreo:', url);
  });
}

function openModalTrackingUrl() {
  if (!currentQrOrderId) return;
  const url = getTrackingUrl(currentQrOrderId);
  window.open(url, '_blank');
}

function sendModalWhatsApp() {
  if (!currentQrOrderId) return;
  const targetId = currentQrOrderId;
  closeOrderQRModal();
  openWhatsAppTemplatesModal(targetId);
}

function handleDtlQuickStatusChange(newStatus) {
  if (!currentDetailOrderId) return;
  if (newStatus === 'delivered') {
    // Abrir modal interactivo con cálculo de saldo pendiente y métodos de pago
    openDeliveryModal(currentDetailOrderId);
    return;
  }
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

function closeBitacoraModal(returnToOrder = true) {
  const currentOrderId = AppState.activeBitacoraOrderId;
  const modal = document.getElementById('bitacoraModal');
  if (modal) modal.classList.add('hidden');
  AppState.activeBitacoraOrderId = null;

  if (returnToOrder && currentOrderId && typeof openOrderDetailModal === 'function') {
    openOrderDetailModal(currentOrderId);
  }
}

function returnToOrderDetailFromBitacora() {
  closeBitacoraModal(true);
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

    const telemetryHtml = (log.telemetry && (log.telemetry.amperage || log.telemetry.voltageRail || log.telemetry.components)) ? `
      <div class="my-2 p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
        ${log.telemetry.amperage ? `<div><span class="text-slate-500 block text-[9px] uppercase">⚡ Consumo / Amperaje:</span><strong class="text-sky-300 font-bold">${escapeHtml(log.telemetry.amperage)}</strong></div>` : ''}
        ${log.telemetry.voltageRail ? `<div><span class="text-slate-500 block text-[9px] uppercase">⚡ Línea / Riel Voltaje:</span><strong class="text-amber-300 font-bold">${escapeHtml(log.telemetry.voltageRail)}</strong></div>` : ''}
        ${log.telemetry.components ? `<div><span class="text-slate-500 block text-[9px] uppercase">🔬 Componente / IC Reemplazado:</span><strong class="text-emerald-300 font-bold">${escapeHtml(log.telemetry.components)}</strong></div>` : ''}
      </div>
    ` : '';

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
          <p class="text-xs text-slate-300 leading-relaxed mb-1">${escapeHtml(log.notes)}</p>
          ${telemetryHtml}
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
    const ampField = document.getElementById('bitacoraAmperage');
    const voltField = document.getElementById('bitacoraVoltageRail');
    const compField = document.getElementById('bitacoraComponents');

    if (titleField) titleField.value = entry.title || '';
    if (notesField) notesField.value = entry.notes || '';
    if (statusField) statusField.value = entry.status || order.status;
    if (techField && entry.technician) techField.value = entry.technician;
    if (ampField) ampField.value = entry.telemetry?.amperage || '';
    if (voltField) voltField.value = entry.telemetry?.voltageRail || '';
    if (compField) compField.value = entry.telemetry?.components || '';

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

  container.innerHTML = photos.map((photo, index) => {
    const dateFormatted = new Date(photo.date).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    return `
      <div class="relative group bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
        <div class="aspect-video w-full bg-black cursor-pointer overflow-hidden relative" onclick="openOrderPhotoLightbox('${order.id}', ${index})">
          <img src="${photo.url}" alt="${escapeHtml(photo.caption)}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
          <div class="absolute inset-0 bg-sky-950/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
            <span class="w-8 h-8 rounded-full bg-black/70 text-sky-400 flex items-center justify-center text-xs shadow-lg"><i class="fas fa-expand"></i></span>
          </div>
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

  const amperage = document.getElementById('bitacoraAmperage')?.value.trim() || '';
  const voltageRail = document.getElementById('bitacoraVoltageRail')?.value.trim() || '';
  const components = document.getElementById('bitacoraComponents')?.value.trim() || '';

  if (!order.bitacora) order.bitacora = [];

  const newEntry = {
    id: 'bit_' + Date.now(),
    date: new Date().toISOString(),
    title,
    notes,
    technician,
    status: newStatus,
    telemetry: {
      amperage,
      voltageRail,
      components
    }
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
  if (document.getElementById('bitacoraAmperage')) document.getElementById('bitacoraAmperage').value = '';
  if (document.getElementById('bitacoraVoltageRail')) document.getElementById('bitacoraVoltageRail').value = '';
  if (document.getElementById('bitacoraComponents')) document.getElementById('bitacoraComponents').value = '';

  showToast('Avance y telemetría registrados en bitácora.');
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

// ==========================================
// CARRUSEL Y VISOR DE FOTOS DE EVIDENCIA
// ==========================================
let currentLightboxPhotos = [];
let currentLightboxIndex = 0;

function openOrderPhotoLightbox(orderId, photoIndex = 0) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order || !order.photos || order.photos.length === 0) return;

  currentLightboxPhotos = order.photos;
  currentLightboxIndex = Math.max(0, Math.min(photoIndex, currentLightboxPhotos.length - 1));
  updateLightboxView();

  const lightbox = document.getElementById('imageLightbox');
  if (lightbox) {
    lightbox.classList.remove('hidden');
    document.addEventListener('keydown', handleLightboxKeydown);
  }
}

function openLightbox(url, caption) {
  currentLightboxPhotos = [{ url: url, caption: caption || 'Evidencia técnica', date: new Date().toISOString() }];
  currentLightboxIndex = 0;
  updateLightboxView();

  const lightbox = document.getElementById('imageLightbox');
  if (lightbox) {
    lightbox.classList.remove('hidden');
    document.addEventListener('keydown', handleLightboxKeydown);
  }
}

function updateLightboxView() {
  if (currentLightboxPhotos.length === 0) return;

  const photo = currentLightboxPhotos[currentLightboxIndex];
  const img = document.getElementById('lightboxImg');
  const cap = document.getElementById('lightboxCaption');
  const dateEl = document.getElementById('lightboxDate');
  const counterEl = document.getElementById('lightboxCounter');
  const btnPrev = document.getElementById('lightboxBtnPrev');
  const btnNext = document.getElementById('lightboxBtnNext');

  if (img && photo) {
    img.src = photo.url;
  }

  if (cap) {
    cap.innerText = photo.caption || 'Foto de evidencia técnica';
  }

  if (dateEl && photo.date) {
    const formatted = new Date(photo.date).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    dateEl.innerText = `Capturada: ${formatted}`;
  } else if (dateEl) {
    dateEl.innerText = '';
  }

  if (counterEl) {
    counterEl.innerText = `${currentLightboxIndex + 1} / ${currentLightboxPhotos.length}`;
  }

  // Ocultar o mostrar flechas si solo hay 1 foto
  if (btnPrev && btnNext) {
    if (currentLightboxPhotos.length <= 1) {
      btnPrev.classList.add('hidden');
      btnNext.classList.add('hidden');
    } else {
      btnPrev.classList.remove('hidden');
      btnNext.classList.remove('hidden');
    }
  }
}

function nextLightboxPhoto() {
  if (currentLightboxPhotos.length <= 1) return;
  currentLightboxIndex = (currentLightboxIndex + 1) % currentLightboxPhotos.length;
  updateLightboxView();
}

function prevLightboxPhoto() {
  if (currentLightboxPhotos.length <= 1) return;
  currentLightboxIndex = (currentLightboxIndex - 1 + currentLightboxPhotos.length) % currentLightboxPhotos.length;
  updateLightboxView();
}

function handleLightboxKeydown(e) {
  const lightbox = document.getElementById('imageLightbox');
  if (!lightbox || lightbox.classList.contains('hidden')) return;

  if (e.key === 'ArrowRight') {
    nextLightboxPhoto();
  } else if (e.key === 'ArrowLeft') {
    prevLightboxPhoto();
  } else if (e.key === 'Escape') {
    closeLightbox();
  }
}

function closeLightbox() {
  const lightbox = document.getElementById('imageLightbox');
  if (lightbox) {
    lightbox.classList.add('hidden');
    document.removeEventListener('keydown', handleLightboxKeydown);
  }
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
  document.querySelectorAll('input[name="functionalCheck"]').forEach(cb => cb.checked = false);

  clearSignature();
  clearPatternCanvas();

  const patternContainer = document.getElementById('patternCanvasContainer');
  if (patternContainer) patternContainer.classList.add('hidden');
  const passContainer = document.getElementById('passwordFieldContainer');
  if (passContainer) passContainer.classList.remove('hidden');
  const passLabel = document.getElementById('passFieldLabel');
  if (passLabel) passLabel.innerText = 'Contraseña / PIN de Desbloqueo';
  document.getElementById('lockType').value = 'password';

  document.getElementById('costBalanceDisplay').innerText = '$0.00';

  const paymentsContainer = document.getElementById('paymentsListContainer');
  if (paymentsContainer) paymentsContainer.classList.add('hidden');

  const modal = document.getElementById('orderModal');
  const btnReturn = document.getElementById('btnOrderModalReturnToDetail');
  if (btnReturn) btnReturn.classList.add('hidden');
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
  document.getElementById('clientPhone').value = formatPhoneNumber(order.client?.phone) || '';
  document.getElementById('clientEmail').value = order.client?.email || '';
  document.getElementById('clientAddress').value = order.client?.address || '';

  document.getElementById('equipmentType').value = order.equipment?.type || 'Laptop';
  document.getElementById('equipmentBrand').value = order.equipment?.brand || '';
  document.getElementById('equipmentModel').value = order.equipment?.model || '';
  document.getElementById('equipmentSerial').value = order.equipment?.serial || '';
  
  const lockType = order.equipment?.lockType || 'password';
  document.getElementById('lockType').value = lockType;
  const passContainer = document.getElementById('passwordFieldContainer');
  const patternContainer = document.getElementById('patternCanvasContainer');
  const passLabel = document.getElementById('passFieldLabel');

  if (lockType === 'none') {
    if (passContainer) passContainer.classList.add('hidden');
    if (patternContainer) patternContainer.classList.add('hidden');
    document.getElementById('devicePassword').value = '';
    clearPatternCanvas();
  } else if (lockType === 'pattern') {
    if (passContainer) passContainer.classList.remove('hidden');
    if (patternContainer) patternContainer.classList.remove('hidden');
    if (passLabel) passLabel.innerText = 'Patrón Gráfico Android';
    document.getElementById('devicePassword').value = order.equipment?.password || '';
    loadPatternSequence(order.equipment?.password || '');
  } else {
    if (passContainer) passContainer.classList.remove('hidden');
    if (patternContainer) patternContainer.classList.add('hidden');
    if (passLabel) passLabel.innerText = lockType === 'pin' ? 'PIN Numérico de Desbloqueo' : 'Contraseña / PIN de Desbloqueo';
    document.getElementById('devicePassword').value = order.equipment?.password || '';
    clearPatternCanvas();
  }

  // Accesorios
  const accessories = order.equipment?.accessories || [];
  document.querySelectorAll('input[name="accessories"]').forEach(cb => {
    cb.checked = accessories.includes(cb.value);
  });

  // Estado Físico
  const conditions = order.equipment?.condition || [];
  document.querySelectorAll('input[name="condition"]').forEach(cb => {
    cb.checked = conditions.includes(cb.value);
  });

  // Checklist Funcional Rápido
  const functionalCheck = order.equipment?.functionalCheck || [];
  document.querySelectorAll('input[name="functionalCheck"]').forEach(cb => {
    cb.checked = functionalCheck.includes(cb.value);
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

  // Renderizar historial de abonos en el modal de edición
  const paymentsListContainer = document.getElementById('paymentsListContainer');
  const paymentsHistoryTable = document.getElementById('paymentsHistoryTable');
  const totalPaymentsRegistered = document.getElementById('totalPaymentsRegistered');
  const payments = Array.isArray(order.costs?.payments) ? order.costs.payments : [];

  if (paymentsListContainer && paymentsHistoryTable) {
    if (payments.length > 0) {
      paymentsListContainer.classList.remove('hidden');
      const totalCovered = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      if (totalPaymentsRegistered) totalPaymentsRegistered.innerText = `$${totalCovered.toLocaleString('es-MX', { minimumFractionDigits: 2 })} cubiertos`;

      paymentsHistoryTable.innerHTML = payments.map(p => {
        const pDate = new Date(p.date).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `
          <div class="flex items-center justify-between p-1.5 bg-slate-900 rounded-lg border border-slate-800 text-xs">
            <div>
              <span class="font-bold text-white">$${Number(p.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
              <span class="text-[10px] text-slate-400 ml-1.5">(${escapeHtml(p.method || 'Efectivo')})</span>
              <span class="text-[10px] text-slate-500 block">${escapeHtml(p.note || 'Abono')} • ${pDate}</span>
            </div>
            <span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">Registrado</span>
          </div>
        `;
      }).join('');
    } else {
      paymentsListContainer.classList.add('hidden');
      paymentsHistoryTable.innerHTML = '';
    }
  }

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
  const btnReturn = document.getElementById('btnOrderModalReturnToDetail');
  if (btnReturn) btnReturn.classList.remove('hidden');
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
    phone: formatPhoneNumber(document.getElementById('clientPhone').value.trim()),
    email: document.getElementById('clientEmail').value.trim(),
    address: document.getElementById('clientAddress').value.trim()
  };

  const accessories = [];
  document.querySelectorAll('input[name="accessories"]:checked').forEach(cb => accessories.push(cb.value));

  const condition = [];
  document.querySelectorAll('input[name="condition"]:checked').forEach(cb => condition.push(cb.value));

  const functionalCheck = [];
  document.querySelectorAll('input[name="functionalCheck"]:checked').forEach(cb => functionalCheck.push(cb.value));

  const equipment = {
    type: document.getElementById('equipmentType').value,
    brand: document.getElementById('equipmentBrand').value.trim(),
    model: document.getElementById('equipmentModel').value.trim(),
    serial: document.getElementById('equipmentSerial').value.trim(),
    lockType: document.getElementById('lockType').value,
    password: document.getElementById('devicePassword').value.trim(),
    accessories,
    condition,
    conditionNotes: document.getElementById('conditionNotes').value.trim(),
    functionalCheck
  };

  const estimated = parseFloat(document.getElementById('costEstimated').value) || 0;
  const advance = parseFloat(document.getElementById('costAdvance').value) || 0;
  const balance = Math.max(0, estimated - advance);

  const existingIndex = AppState.orders.findIndex(o => o.id === id);
  const existingOrder = existingIndex >= 0 ? AppState.orders[existingIndex] : null;

  // Preservar o inicializar array de pagos
  let existingPayments = existingOrder?.costs?.payments ? [...existingOrder.costs.payments] : [];
  if (existingPayments.length === 0 && advance > 0) {
    existingPayments.push({
      id: 'pay_' + Date.now(),
      date: dateVal ? new Date(dateVal).toISOString() : new Date().toISOString(),
      amount: advance,
      method: document.getElementById('costPaymentMethod').value,
      note: 'Anticipo inicial en recepción'
    });
  }

  const costs = {
    estimated,
    advance,
    balance,
    paymentMethod: document.getElementById('costPaymentMethod').value,
    payments: existingPayments
  };

  let signatureData = null;
  if (hasSignature && signatureCanvas) {
    signatureData = signatureCanvas.toDataURL('image/png');
  } else if (AppState.currentOrder?.signature) {
    signatureData = AppState.currentOrder.signature;
  }

  const currentUserName = AppState.auth.currentUser?.name || AppState.auth.currentUser?.username || 'Recepción';

  const orderData = {
    id,
    date: dateVal ? new Date(dateVal).toISOString() : new Date().toISOString(),
    deliveredDate: status === 'delivered' ? (existingOrder?.deliveredDate || new Date().toISOString()) : null,
    warrantyDays: (existingOrder?.warrantyDays && existingOrder.warrantyDays !== 30) ? existingOrder.warrantyDays : (AppState.shopConfig.warrantyDays || 45),
    status,
    budgetDecision: existingOrder?.budgetDecision || null,
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

function closeOrderModal(returnToOrder = false) {
  const lastOrderId = AppState.currentOrder ? AppState.currentOrder.id : null;
  const modal = document.getElementById('orderModal');
  if (modal) modal.classList.add('hidden');
  AppState.currentOrder = null;

  if (returnToOrder && lastOrderId && typeof openOrderDetailModal === 'function') {
    openOrderDetailModal(lastOrderId);
  }
}

function returnToOrderDetailFromEdit() {
  closeOrderModal(true);
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

// ==========================================
// 10.8 MÓDULO DE ENTREGA DE EQUIPO & LIQUIDACIÓN
// ==========================================

let currentDeliveryOrderId = null;

function openDeliveryModal(orderId) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) {
    showToast('No se encontró la orden especificada.', 'error');
    return;
  }

  currentDeliveryOrderId = orderId;
  const modal = document.getElementById('deliveryModal');
  if (!modal) return;

  // Llenar datos de la orden
  const orderBadge = document.getElementById('deliveryOrderBadge');
  const clientName = document.getElementById('deliveryClientName');
  const eqTitle = document.getElementById('deliveryEquipmentTitle');
  const balContainer = document.getElementById('deliveryBalanceContainer');
  const balAmount = document.getElementById('deliveryBalanceAmount');
  const balBadge = document.getElementById('deliveryBalanceStatusBadge');
  const paySection = document.getElementById('deliveryPaymentSection');
  const amtInput = document.getElementById('deliveryAmountPaid');
  const refInput = document.getElementById('deliveryPaymentReference');
  const notesInput = document.getElementById('deliveryNotes');
  const submitBtn = document.getElementById('btnConfirmDeliverySubmit');

  if (orderBadge) orderBadge.innerText = `#${order.id}`;
  if (clientName) clientName.innerText = `Cliente: ${(order.client?.name || 'Cliente').toUpperCase()}`;
  if (eqTitle) eqTitle.innerText = `${order.equipment?.brand || ''} ${order.equipment?.model || ''} (${order.equipment?.type || 'Equipo'})`.trim();

  // Calcular balance actual
  const balance = Number(order.costs?.balance) || 0;
  if (balAmount) balAmount.innerText = `$${balance.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`;

  if (balance > 0) {
    // Hay saldo pendiente: solicitar método de pago
    if (balContainer) {
      balContainer.className = 'p-4 rounded-2xl border bg-amber-950/20 border-amber-500/40 text-amber-300';
    }
    if (balBadge) {
      balBadge.innerHTML = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5"><i class="fas fa-clock"></i> Saldo Pendiente</span>`;
    }
    if (paySection) paySection.classList.remove('hidden');
    if (amtInput) {
      amtInput.value = balance;
      amtInput.max = balance;
    }
    if (refInput) refInput.value = '';
    if (submitBtn) {
      submitBtn.innerHTML = '<i class="fas fa-check-double"></i><span>Liquidar Saldo y Entregar Equipo</span>';
    }
  } else {
    // Ya está liquidado al 100%
    if (balContainer) {
      balContainer.className = 'p-4 rounded-2xl border bg-emerald-950/20 border-emerald-500/40 text-emerald-300';
    }
    if (balBadge) {
      balBadge.innerHTML = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5"><i class="fas fa-check-circle"></i> Cuenta Liquidada</span>`;
    }
    if (paySection) paySection.classList.add('hidden');
    if (submitBtn) {
      submitBtn.innerHTML = '<i class="fas fa-handshake"></i><span>Confirmar Entrega de Equipo</span>';
    }
  }

  if (notesInput) {
    notesInput.value = 'Equipo entregado y probado a entera satisfacción del cliente. Garantía oficial de 45 días activada.';
  }

  // Prellenar fecha y hora actual o la existente si ya fue entregado
  const dtInput = document.getElementById('deliveryDateTime');
  if (dtInput) {
    const existingDate = (order.status === 'delivered' && order.deliveredDate)
      ? new Date(order.deliveredDate)
      : new Date();
    
    // Formato local YYYY-MM-DDTHH:mm para input datetime-local
    const pad = n => String(n).padStart(2, '0');
    const localIso = `${existingDate.getFullYear()}-${pad(existingDate.getMonth() + 1)}-${pad(existingDate.getDate())}T${pad(existingDate.getHours())}:${pad(existingDate.getMinutes())}`;
    dtInput.value = localIso;
  }

  const techInput = document.getElementById('deliveryTechnician');
  if (techInput) {
    techInput.value = AppState.auth.currentUser?.name || AppState.auth.currentUser?.username || order.technician || 'GlitchLab Mostrador';
  }

  modal.classList.remove('hidden');
}

function closeDeliveryModal(returnToOrder = true) {
  const lastOrderId = currentDeliveryOrderId;
  const modal = document.getElementById('deliveryModal');
  if (modal) modal.classList.add('hidden');
  currentDeliveryOrderId = null;

  if (returnToOrder && lastOrderId && typeof openOrderDetailModal === 'function') {
    openOrderDetailModal(lastOrderId);
  }
}

function returnToOrderDetailFromDelivery() {
  closeDeliveryModal(true);
}

function handleConfirmDelivery(e) {
  e.preventDefault();
  if (!currentDeliveryOrderId) return;

  const order = AppState.orders.find(o => o.id === currentDeliveryOrderId);
  if (!order) return;

  const balance = Number(order.costs?.balance) || 0;
  const techInputValue = document.getElementById('deliveryTechnician')?.value.trim();
  const currentUserName = techInputValue || AppState.auth.currentUser?.name || AppState.auth.currentUser?.username || 'Taller';
  const notesText = document.getElementById('deliveryNotes')?.value.trim() || 'Equipo entregado al cliente.';

  // Obtener fecha y hora seleccionada en el formulario
  const dtInputValue = document.getElementById('deliveryDateTime')?.value;
  const deliveryIsoDate = dtInputValue ? new Date(dtInputValue).toISOString() : new Date().toISOString();

  // Si hay saldo pendiente, registrar el pago seleccionado
  if (balance > 0) {
    const selectedRadio = document.querySelector('input[name="deliveryPayMethod"]:checked');
    const payMethod = selectedRadio ? selectedRadio.value : 'Efectivo';
    const amountVal = parseFloat(document.getElementById('deliveryAmountPaid')?.value) || balance;
    const refText = document.getElementById('deliveryPaymentReference')?.value.trim();

    if (amountVal <= 0) {
      alert('Por favor ingresa un monto válido para liquidar el saldo.');
      return;
    }

    if (!order.costs) {
      order.costs = { advance: 0, balance: 0, estimated: 0, payments: [] };
    }
    if (!order.costs.payments) {
      order.costs.payments = [];
      if (order.costs.advance > 0) {
        order.costs.payments.push({
          id: 'pay_' + (Date.now() - 2000),
          date: order.date || new Date().toISOString(),
          amount: Number(order.costs.advance),
          method: order.costs.paymentMethod || 'Efectivo',
          note: 'Anticipo inicial'
        });
      }
    }

    const paymentRecord = {
      id: 'pay_' + Date.now(),
      date: deliveryIsoDate,
      amount: amountVal,
      method: payMethod,
      note: refText ? `Liquidación de entrega (${refText})` : 'Liquidación al entregar equipo'
    };

    order.costs.payments.push(paymentRecord);

    // Recalcular saldo
    const totalPaid = order.costs.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    order.costs.advance = totalPaid;
    const estimated = Number(order.costs.estimated) || 0;
    order.costs.balance = Math.max(0, estimated - totalPaid);
    order.costs.paymentMethod = payMethod;

    // Registrar pago en bitácora
    if (!order.bitacora) order.bitacora = [];
    order.bitacora.unshift({
      id: 'bit_pay_' + Date.now(),
      date: deliveryIsoDate,
      title: `Pago Recibido al Entregar: $${amountVal.toLocaleString('es-MX', { minimumFractionDigits: 2 })} (${payMethod})`,
      notes: paymentRecord.note + (order.costs.balance > 0 ? `. Saldo restante: $${order.costs.balance.toLocaleString('es-MX')}` : ' (Cuenta liquidada al 100%)'),
      technician: currentUserName,
      status: 'delivered'
    });
  }

  // Actualizar estatus a ENTREGADO con fecha y activación de 45 días de garantía
  order.status = 'delivered';
  order.deliveredDate = deliveryIsoDate;
  if (!order.warrantyDays) {
    order.warrantyDays = AppState.shopConfig.warrantyDays || 45;
  }

  // Registrar entrega en bitácora
  if (!order.bitacora) order.bitacora = [];
  order.bitacora.unshift({
    id: 'bit_deliv_' + Date.now(),
    date: deliveryIsoDate,
    title: '🤝 Equipo Entregado al Cliente',
    notes: `${notesText} Cobertura oficial de 45 días de garantía iniciada.`,
    technician: currentUserName,
    status: 'delivered'
  });

  saveOrders();
  syncSingleOrderToSupabase(order);
  closeDeliveryModal();
  renderDashboard();
  renderOrders();

  // Si el modal de detalle está abierto, refrescarlo
  if (currentDetailOrderId === order.id) {
    openOrderDetailModal(order.id);
  }

  showToast(`✅ Equipo de Orden #${order.id} entregado y registrado exitosamente.`);
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

let currentStickerSize = '51x25'; // '51x25', '50x30', '60x40', '76x50', '100x150'

function setPrintFormat(format) {
  currentPrintFormat = format;
  const order = AppState.orders.find(o => o.id === currentPrintOrderId);
  if (!order) return;

  document.body.classList.remove('ticket-thermal-mode', 'ticket-sticker-mode', 'sticker-size-51x25', 'sticker-size-50x30', 'sticker-size-60x40', 'sticker-size-76x50', 'sticker-size-100x150');

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
    '51x25': '51mm 25mm',
    '50x30': '50mm 30mm',
    '60x40': '60mm 40mm',
    '76x50': '76mm 50mm',
    '100x150': '100mm 150mm'
  };
  const dim = pageSizes[size] || '51mm 25mm';
  styleEl.innerHTML = `@media print { 
    @page { size: ${dim}; margin: 0mm !important; } 
    body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
    #print-area { width: 100% !important; margin: 0 !important; padding: 0 !important; background: transparent !important; }
    .aiyin-sticker-box { box-shadow: none !important; margin: 0 auto !important; }
  }`;
}

function setStickerSize(size) {
  currentStickerSize = size;
  document.body.classList.remove('sticker-size-51x25', 'sticker-size-50x30', 'sticker-size-60x40', 'sticker-size-76x50', 'sticker-size-100x150');
  document.body.classList.add(`sticker-size-${size}`);
  applyStickerPageStyle(size);
  updateStickerSizeButtons();

  const order = AppState.orders.find(o => o.id === currentPrintOrderId);
  if (order) generatePrintTemplate(order, 'sticker');
}

function updateStickerSizeButtons() {
  const btn51 = document.getElementById('btnStickerSize51x25');
  const btn50 = document.getElementById('btnStickerSize50x30');
  const btn60 = document.getElementById('btnStickerSize60x40');
  const btn76 = document.getElementById('btnStickerSize76x50');
  const btn100 = document.getElementById('btnStickerSize100x150');

  [btn51, btn50, btn60, btn76, btn100].forEach(b => {
    if (b) {
      b.classList.remove('bg-sky-500', 'text-white');
      b.classList.add('bg-slate-800', 'text-slate-300');
    }
  });

  if (currentStickerSize === '51x25' && btn51) {
    btn51.classList.add('bg-sky-500', 'text-white');
    btn51.classList.remove('bg-slate-800', 'text-slate-300');
  } else if (currentStickerSize === '50x30' && btn50) {
    btn50.classList.add('bg-sky-500', 'text-white');
    btn50.classList.remove('bg-slate-800', 'text-slate-300');
  } else if (currentStickerSize === '60x40' && btn60) {
    btn60.classList.add('bg-sky-500', 'text-white');
    btn60.classList.remove('bg-slate-800', 'text-slate-300');
  } else if (currentStickerSize === '76x50' && btn76) {
    btn76.classList.add('bg-sky-500', 'text-white');
    btn76.classList.remove('bg-slate-800', 'text-slate-300');
  } else if (currentStickerSize === '100x150' && btn100) {
    btn100.classList.add('bg-sky-500', 'text-white');
    btn100.classList.remove('bg-slate-800', 'text-slate-300');
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

  const trackingUrl = getTrackingUrl(order.id);

  if (format === 'sticker') {
    // ETIQUETA ADHESIVA PARA IMPRESORA TÉRMICA AIYIN AE-240BT (203 DPI)
    // REQUISITOS OBLIGATORIOS:
    // 1. Folio / Número de orden
    // 2. Nombre completo del cliente (sin resumir)
    // 3. Número de teléfono completo
    // 4. Datos del equipo (marca, modelo, tipo)
    // 5. Falla reportada completa (sin truncar ni resumir)
    // 6. Accesorios dejados (completo: indicando si dejó y cuáles, o solo equipo)
    // 7. PIN o Contraseña si aplica
    // 8. Código QR de rastreo en vivo

    const accList = (order.equipment?.accessories && Array.isArray(order.equipment.accessories) && order.equipment.accessories.length > 0)
      ? order.equipment.accessories.filter(a => a && a.trim()).join(', ')
      : '';
    const includesAccessories = accList
      ? `SÍ (${accList})`
      : `NO (Solo equipo)`;

    const clientName = (order.client?.name || 'Cliente sin registrar').trim();
    const clientPhone = (formatPhoneNumber(order.client?.phone) || 'Sin teléfono').trim();
    const equipBrand = (order.equipment?.brand || '').trim();
    const equipModel = (order.equipment?.model || '').trim();
    const equipType = (order.equipment?.type || 'Equipo').trim();
    const equipFull = `${equipBrand} ${equipModel}`.trim() || equipType;
    const orderIssue = (order.issue || 'No especificada').trim();
    const equipPassword = (order.equipment?.password || '').trim();
    const equipSerial = (order.equipment?.serial || '').trim();

    const dateFormattedShort = new Date(order.date).toLocaleDateString('es-MX', {
      day: '2-digit', month: '2-digit', year: '2-digit'
    });

    if (currentStickerSize === '51x25') {
      // 1. MEDIDA 51x25mm (ESTÁNDAR EQUIPOS - 2" x 1") - Sin QR, máxima legibilidad térmica
      container.innerHTML = `
        <div class="aiyin-sticker-box" style="font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; width: 49mm; max-width: 49mm; min-height: 23.8mm; max-height: 23.8mm; margin: 0 auto; padding: 0.8mm 1.2mm; border: 1.2px solid #000; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; font-size: 6.8px; line-height: 1.15; word-break: break-word; overflow: hidden;">
          
          <!-- Encabezado con Folio destacado -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.2px solid #000; padding-bottom: 0.8px; margin-bottom: 0.6px;">
            <div style="font-size: 8px; font-weight: 900; letter-spacing: 0.3px;">GLITCHLAB</div>
            <div style="background: #000; color: #fff; font-size: 10px; font-weight: 900; padding: 0.5px 5px; border-radius: 2px; font-family: monospace;">
              #${order.id}
            </div>
          </div>

          <!-- Contenido sin QR a ancho completo -->
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-around; padding: 0.2px 0;">
            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><strong>CLI:</strong> ${escapeHtml(clientName)}</div>
            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><strong>TEL:</strong> ${escapeHtml(clientPhone)} ${equipPassword ? `| <strong>PIN:</strong> ${escapeHtml(equipPassword)}` : ''}</div>
            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><strong>EQ:</strong> ${escapeHtml(equipFull)}</div>
            <div style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.1;"><strong>FALLA:</strong> ${escapeHtml(orderIssue)}</div>
            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"><strong>ACC:</strong> ${escapeHtml(includesAccessories)}</div>
          </div>

          <!-- Pie compacto -->
          <div style="border-top: 1px solid #000; padding-top: 0.6px; margin-top: 0.5px; display: flex; justify-content: space-between; align-items: center; font-size: 5.8px; color: #111;">
            <span>FECHA: ${dateFormattedShort}</span>
            <span style="font-weight: bold; letter-spacing: 0.2px;">glitchlab.mx</span>
          </div>
        </div>
      `;

    } else if (currentStickerSize === '50x30') {
      // 2. MEDIDA 50x30mm (MINI) - Sin QR para maximizar espacio
      container.innerHTML = `
        <div class="aiyin-sticker-box" style="font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; width: 48mm; max-width: 48mm; min-height: 28.5mm; margin: 0 auto; padding: 1.2mm 1.5mm; border: 1.5px solid #000; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; font-size: 7px; line-height: 1.18; word-break: break-word;">
          
          <!-- Encabezado -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #000; padding-bottom: 1px; margin-bottom: 1px;">
            <div style="font-size: 8.5px; font-weight: 900; letter-spacing: 0.3px;">GLITCHLAB</div>
            <div style="background: #000; color: #fff; font-size: 11px; font-weight: 900; padding: 0.5px 5px; border-radius: 2px; font-family: monospace;">
              #${order.id}
            </div>
          </div>

          <!-- Contenido sin resumir a ancho completo -->
          <div style="flex: 1; min-width: 0;">
            <div><strong>CLI:</strong> ${escapeHtml(clientName)}</div>
            <div><strong>TEL:</strong> ${escapeHtml(clientPhone)}</div>
            <div><strong>EQ:</strong> ${escapeHtml(equipFull)}</div>
            <div style="margin-top: 1px;"><strong>FALLA:</strong> ${escapeHtml(orderIssue)}</div>
            <div style="margin-top: 1px;"><strong>ACC:</strong> ${escapeHtml(includesAccessories)}</div>
          </div>

          <!-- Pie -->
          <div style="border-top: 1px solid #000; padding-top: 1px; margin-top: 1px; display: flex; justify-content: space-between; font-size: 6px; color: #333;">
            <span>FECHA: ${dateFormattedShort}</span>
            ${equipPassword ? `<span>PIN: <strong>${escapeHtml(equipPassword)}</strong></span>` : '<span>glitchlab.mx</span>'}
          </div>
        </div>
      `;

    } else if (currentStickerSize === '76x50') {
      // 2. MEDIDA 76x50mm (GRANDE / 3" x 2") - Espaciosa y legible, todo visible
      container.innerHTML = `
        <div class="aiyin-sticker-box" style="font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; width: 73mm; max-width: 73mm; min-height: 47mm; margin: 0 auto; padding: 2.2mm 2.5mm; border: 2.5px solid #000; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; font-size: 8.5px; line-height: 1.25; word-break: break-word;">
          
          <!-- Encabezado -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 2px; margin-bottom: 2px;">
            <div>
              <div style="font-size: 13.5px; font-weight: 900; letter-spacing: 0.5px; line-height: 1;">GLITCHLAB</div>
              <div style="font-size: 7.5px; font-weight: 800; text-transform: uppercase;">SERVICIO TÉCNICO ESPECIALIZADO EN MICROELECTRÓNICA</div>
            </div>
            <div style="background: #000; color: #fff; font-size: 17px; font-weight: 900; padding: 2px 9px; border-radius: 4px; font-family: monospace;">
              #${order.id}
            </div>
          </div>

          <!-- Fila 1: Cliente & Teléfono -->
          <div style="display: flex; justify-content: space-between; gap: 4px; padding: 1px 0;">
            <div><strong>CLIENTE:</strong> ${escapeHtml(clientName)}</div>
            <div><strong>TEL:</strong> ${escapeHtml(clientPhone)}</div>
          </div>

          <!-- Fila 2: Equipo & Seguridad -->
          <div style="border-top: 1px dashed #666; padding-top: 1.5px; margin-top: 1px;">
            <div><strong>EQUIPO:</strong> ${escapeHtml(equipFull)} (${escapeHtml(equipType)}) ${equipSerial ? `| S/N: ${escapeHtml(equipSerial)}` : ''} ${equipPassword ? `| PIN: <strong>${escapeHtml(equipPassword)}</strong>` : ''}</div>
          </div>

          <!-- Fila 3: Falla Reportada Completa -->
          <div style="border: 1.5px solid #000; background: #fafafa; padding: 3px 5px; border-radius: 4px; margin: 2px 0;">
            <div style="font-size: 8px; font-weight: 900; text-transform: uppercase;">FALLA REPORTADA:</div>
            <div style="font-size: 9px; font-weight: 700; color: #000; line-height: 1.25;">
              ${escapeHtml(orderIssue)}
            </div>
          </div>

          <!-- Fila 4: Accesorios Dejados -->
          <div style="margin-bottom: 2px;">
            <span style="font-size: 8px; font-weight: 900; text-transform: uppercase;">ACCESORIOS DEJADOS: </span>
            <span style="font-size: 9px; font-weight: 800; color: #000;">${escapeHtml(includesAccessories)}</span>
          </div>

          <!-- Pie con QR y Rastreo -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1.5px solid #000; padding-top: 2px; margin-top: 1px;">
            <div style="font-size: 7.5px; line-height: 1.25; color: #333;">
              <div>FECHA: <strong>${dateFormattedShort}</strong></div>
              <div>ESCANEA PARA SEGUIMIENTO Y ESTATUS EN VIVO</div>
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
          new QRCode(qrEl, { text: trackingUrl, width: 38, height: 38 });
        }
      }, 50);

    } else if (currentStickerSize === '100x150') {
      // 3. MEDIDA 100x150mm (4" x 6" - Formato Caja / Empaque / Almacén Industrial) - Todo íntegro
      container.innerHTML = `
        <div class="aiyin-sticker-box" style="font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; width: 95mm; max-width: 95mm; min-height: 142mm; margin: 0 auto; padding: 4mm; border: 3px solid #000; box-sizing: border-box; line-height: 1.35; display: flex; flex-direction: column; justify-content: space-between; word-break: break-word;">
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
            <div style="background: #f4f4f5; border: 1.5px solid #000; border-radius: 4px; padding: 6px; margin-bottom: 8px; font-size: 10.5px;">
              <div style="font-size: 8.5px; font-weight: 900; text-transform: uppercase; border-bottom: 1px solid #ccc; padding-bottom: 2px; margin-bottom: 3px;">1. DATOS DEL CLIENTE</div>
              <div><strong>NOMBRE:</strong> ${escapeHtml(clientName)}</div>
              <div><strong>TELÉFONO:</strong> ${escapeHtml(clientPhone)}</div>
              ${order.client?.address ? `<div><strong>DOMICILIO:</strong> ${escapeHtml(order.client.address)}</div>` : ''}
            </div>

            <!-- Sección 2: Dispositivo -->
            <div style="border: 1.5px solid #000; border-radius: 4px; padding: 6px; margin-bottom: 8px; font-size: 11px;">
              <div style="font-size: 8.5px; font-weight: 900; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 3px;">2. DATOS DEL EQUIPO & SEGURIDAD</div>
              <div style="font-size: 14px; font-weight: 900;">${escapeHtml(equipFull)} (${escapeHtml(equipType)})</div>
              <div style="font-size: 10px;">SERIE: ${escapeHtml(equipSerial || 'Sin número')}</div>
              ${equipPassword ? `<div style="font-size: 11px; font-weight: bold; margin-top: 2px;">🔑 CONTRASEÑA/PIN: <span style="background: #000; color: #fff; padding: 1px 5px; border-radius: 3px;">${escapeHtml(equipPassword)}</span></div>` : ''}
            </div>

            <!-- Sección 3: Falla y Accesorios -->
            <div style="border: 1.5px solid #000; border-radius: 4px; padding: 6px; margin-bottom: 8px; font-size: 11px;">
              <div style="font-size: 8.5px; font-weight: 900; text-transform: uppercase; margin-bottom: 2px;">3. FALLA REPORTADA:</div>
              <div style="font-weight: 700; margin-bottom: 6px; line-height: 1.3;">"${escapeHtml(orderIssue)}"</div>
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
      // 4. MEDIDA ESTÁNDAR 60x40mm (Recomendada para Aiyin AE-240BT) - Todo íntegro sin resumir nada
      container.innerHTML = `
        <div class="aiyin-sticker-box" style="font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; width: 57mm; max-width: 57mm; min-height: 38mm; margin: 0 auto; padding: 1.8mm 2mm; border: 2px solid #000; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; font-size: 7.8px; line-height: 1.2; word-break: break-word;">
          
          <!-- Encabezado con Número de Orden Destacado -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 2px; margin-bottom: 2px;">
            <div>
              <div style="font-size: 11px; font-weight: 900; letter-spacing: 0.4px; line-height: 1;">GLITCHLAB</div>
              <div style="font-size: 6.5px; font-weight: 800; text-transform: uppercase; color: #333;">MICROELECTRÓNICA & TALLER</div>
            </div>
            <div style="background: #000; color: #fff; font-size: 14px; font-weight: 900; padding: 1.5px 7px; border-radius: 3px; font-family: monospace;">
              #${order.id}
            </div>
          </div>

          <!-- Cliente y Contacto -->
          <div style="padding: 1px 0;">
            <div><strong>CLIENTE:</strong> ${escapeHtml(clientName)}</div>
            <div><strong>TELÉFONO:</strong> ${escapeHtml(clientPhone)} ${equipPassword ? `| PIN: <strong>${escapeHtml(equipPassword)}</strong>` : ''}</div>
          </div>

          <!-- Equipo -->
          <div style="border-top: 1px dashed #666; padding-top: 1.5px; margin-top: 1px;">
            <div><strong>EQUIPO:</strong> ${escapeHtml(equipFull)} ${equipType && equipType !== equipFull ? `(${escapeHtml(equipType)})` : ''}</div>
          </div>

          <!-- Falla Reportada Completa -->
          <div style="border: 1px solid #000; background: #fafafa; padding: 2px 4px; border-radius: 3px; margin: 2px 0;">
            <div style="font-size: 7px; font-weight: 900; text-transform: uppercase;">FALLA REPORTADA:</div>
            <div style="font-size: 7.8px; font-weight: 700; color: #000; line-height: 1.18;">
              ${escapeHtml(orderIssue)}
            </div>
          </div>

          <!-- Accesorios Dejados Completos -->
          <div style="margin-bottom: 1.5px;">
            <span style="font-size: 7px; font-weight: 900; text-transform: uppercase;">ACCESORIOS: </span>
            <span style="font-size: 7.8px; font-weight: 800; color: #000;">${escapeHtml(includesAccessories)}</span>
          </div>

          <!-- Pie: Rastreo y QR -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1.5px solid #000; padding-top: 2px; margin-top: 1px;">
            <div style="font-size: 6.8px; line-height: 1.2; color: #333;">
              <div>FECHA: <strong>${dateFormattedShort}</strong></div>
              <div style="font-weight: bold;">ESCANEA PARA RASTREO EN VIVO</div>
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
          new QRCode(qrEl, { text: trackingUrl, width: 30, height: 30 });
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
          <div><strong>TELÉFONO:</strong> ${escapeHtml(formatPhoneNumber(order.client?.phone))}</div>
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
    <div class="customer-receipt-card" style="font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; max-width: 800px; margin: 0 auto; padding: 20px 22px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; box-sizing: border-box;">
      
      <!-- Cabecera Principal con Logo y Folio -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0ea5e9; padding-bottom: 12px; margin-bottom: 14px;">
        <div>
          <!-- Logo Oficial GlitchLab con Chip Microelectrónica -->
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
              <rect x="4" y="4" width="16" height="16" rx="2" stroke="#0ea5e9" fill="#f0f9ff"/>
              <rect x="9" y="9" width="6" height="6" fill="#0ea5e9"/>
              <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>
            </svg>
            <span style="font-size: 24px; font-weight: 900; letter-spacing: 0.04em; color: #0f172a; line-height: 1;">Glitch<span style="color: #0ea5e9;">Lab</span></span>
          </div>
          <!-- Onda Electrocardiograma Idéntica al Sistema -->
          <div style="width: 165px; height: 14px; margin-top: 2px; margin-bottom: 2px;">
            <svg viewBox="0 0 200 20" style="width: 100%; height: 100%; display: block;" preserveAspectRatio="none">
              <path d="M 0,10 L 55,10 C 62,10 65,7.5 68,7.5 C 71,7.5 74,10 79,10 L 92,10 L 97,13 L 104,1.5 L 111,18.5 L 117,8.5 L 122,10 L 132,10 C 139,10 144,6.5 150,6.5 C 156,6.5 161,10 168,10 L 200,10" fill="none" stroke="#bae6fd" stroke-width="1.3"></path>
              <path d="M 0,10 L 55,10 C 62,10 65,7.5 68,7.5 C 71,7.5 74,10 79,10 L 92,10 L 97,13 L 104,1.5 L 111,18.5 L 117,8.5 L 122,10 L 132,10 C 139,10 144,6.5 150,6.5 C 156,6.5 161,10 168,10 L 200,10" fill="none" stroke="#0ea5e9" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
              <circle cx="104" cy="1.5" r="2.4" fill="#0284c7"></circle>
            </svg>
          </div>
          <div style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #0284c7; margin-top: 1px;">
            ${AppState.shopConfig.slogan || 'SERVICIO TÉCNICO ESPECIALIZADO EN MICROELECTRÓNICA'}
          </div>
          <div style="font-size: 10.5px; color: #475569; margin-top: 3px; line-height: 1.35;">
            ${AppState.shopConfig.address}<br>
            Tel / WhatsApp: <strong>${AppState.shopConfig.phone}</strong> | Correo: ${AppState.shopConfig.email}
          </div>
        </div>

        <div style="text-align: right;">
          <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; padding: 6px 14px; border-radius: 8px; display: inline-block;">
            <div style="font-size: 9.5px; text-transform: uppercase; font-weight: 700; color: #0284c7;">COMPROBANTE DE SERVICIO</div>
            <div style="font-size: 22px; font-weight: 900; color: #0c4a6e; font-family: monospace; line-height: 1.1;">#${order.id}</div>
          </div>
          <div style="font-size: 10.5px; color: #64748b; margin-top: 4px;">
            <strong>Ingreso:</strong> ${dateFormatted}
          </div>
          ${order.status === 'delivered' && order.deliveredDate ? `
            <div style="font-size: 10.5px; color: #059669; margin-top: 2px;">
              <strong>Entrega:</strong> ${new Date(order.deliveredDate).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          ` : ''}
          <div style="font-size: 9.5px; color: #0284c7; margin-top: 2px; font-weight: 600;">
            ${order.status === 'delivered' ? `Estancia en taller: ${calculateWorkshopDays(order).shortLabel}` : `Tiempo en taller: ${calculateWorkshopDays(order).label}`}
          </div>
        </div>
      </div>

      <!-- Bloques de Información: Cliente y Dispositivo -->
      <div style="display: flex; gap: 14px; margin-bottom: 12px;">
        <div style="flex: 1; min-width: 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px;">
          <div style="font-size: 10.5px; font-weight: 800; color: #0284c7; text-transform: uppercase; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px;">
            1. Datos del Cliente
          </div>
          <div style="font-size: 11.5px; line-height: 1.5;">
            <div><strong>Nombre:</strong> ${escapeHtml(order.client?.name || '')}</div>
            <div><strong>Teléfono:</strong> ${escapeHtml(formatPhoneNumber(order.client?.phone) || '')}</div>
            <div><strong>Correo:</strong> ${escapeHtml(order.client?.email || 'N/A')}</div>
            <div><strong>Dirección:</strong> ${escapeHtml(order.client?.address || 'N/A')}</div>
          </div>
        </div>

        <div style="flex: 1; min-width: 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px;">
          <div style="font-size: 10.5px; font-weight: 800; color: #0284c7; text-transform: uppercase; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px;">
            2. Datos del Dispositivo & Acceso
          </div>
          <div style="font-size: 11.5px; line-height: 1.5;">
            <div><strong>Tipo:</strong> ${escapeHtml(order.equipment?.type || '')}</div>
            <div><strong>Marca / Modelo:</strong> ${escapeHtml(order.equipment?.brand || '')} ${escapeHtml(order.equipment?.model || '')}</div>
            <div><strong>No. Serie / IMEI:</strong> ${escapeHtml(order.equipment?.serial || 'Sin número')}</div>
            <div style="margin-top: 3px; padding: 2px 7px; background: #e0f2fe; border-radius: 4px; font-weight: bold; color: #0369a1; display: inline-block;">
              🔑 Clave/PIN: ${escapeHtml(order.equipment?.password || 'Sin contraseña')}
            </div>
          </div>
        </div>
      </div>

      <!-- Falla Reportada y Diagnóstico Inicial -->
      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px;">
        <div style="font-size: 10.5px; font-weight: 800; color: #0284c7; text-transform: uppercase; margin-bottom: 4px;">
          3. Motivo de Ingreso & Diagnóstico Técnico
        </div>
        <div style="font-size: 11.5px; line-height: 1.45; margin-bottom: 6px;">
          <strong>Falla Reportada por el Cliente:</strong><br>
          <span style="color: #334155;">${escapeHtml(order.issue || 'No especificada')}</span>
        </div>
        ${order.initialDiagnosis ? `
          <div style="font-size: 11.5px; line-height: 1.45; margin-bottom: 6px; background: #f8fafc; padding: 6px 10px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <strong>Diagnóstico Técnico Inicial:</strong><br>
            <span style="color: #334155;">${escapeHtml(order.initialDiagnosis)}</span>
          </div>
        ` : ''}
        <div style="display: flex; gap: 14px; font-size: 10.5px; color: #475569; padding-top: 5px; border-top: 1px dashed #cbd5e1;">
          <div style="flex: 1;">
            <strong>Accesorios:</strong> ${order.equipment?.accessories?.length ? order.equipment.accessories.join(', ') : 'Ninguno (Solo equipo)'}
          </div>
          <div style="flex: 1;">
            <strong>Condición Física:</strong> ${order.equipment?.condition?.length ? order.equipment.condition.join(', ') : 'Buen estado aparente'}
            ${order.equipment?.conditionNotes ? ` (${escapeHtml(order.equipment.conditionNotes)})` : ''}
          </div>
        </div>
      </div>

      <!-- Desglose Financiero y Código QR -->
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 12px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 8px;">
        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
          <div id="printQrContainerCustomer" class="pdf-qr-placeholder" style="min-width: 80px; min-height: 80px;"></div>
          <div style="font-size: 10.5px; line-height: 1.35; color: #475569;">
            <strong style="color: #0284c7;">Rastreo en Tiempo Real:</strong><br>
            Escanea este código con tu celular para consultar el estado de tu equipo, fotos del avance y bitácora en vivo.
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; flex-shrink: 0;">
          <table style="width: 240px; border-collapse: collapse; font-size: 11.5px;">
            <tr>
              <td style="padding: 3px; color: #64748b;">Costo Estimado:</td>
              <td style="padding: 3px; text-align: right; font-weight: 600;">$${est} MXN</td>
            </tr>
            <tr>
              <td style="padding: 3px; color: #64748b;">Anticipo Recibido:</td>
              <td style="padding: 3px; text-align: right; font-weight: 600; color: #0284c7;">-$${adv} MXN</td>
            </tr>
            <tr style="border-top: 2px solid #0ea5e9; background-color: #f0f9ff;">
              <td style="padding: 5px; font-weight: 700; color: #0c4a6e;">Saldo Restante:</td>
              <td style="padding: 5px; text-align: right; font-weight: 900; font-size: 14px; color: #0c4a6e;">$${bal} MXN</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Firmas -->
      <div style="display: flex; justify-content: space-between; gap: 36px; margin-top: 14px; margin-bottom: 12px; text-align: center;">
        <div style="flex: 1;">
          <div style="height: 42px; display: flex; align-items: flex-end; justify-content: center;">
            <span style="font-family: cursive; font-size: 15px; color: #0369a1;">GlitchLab Laboratorio</span>
          </div>
          <div style="border-top: 1px solid #94a3b8; padding-top: 3px; font-size: 10.5px; font-weight: 600; color: #475569;">
            Recibido por GlitchLab
          </div>
        </div>

        <div style="flex: 1;">
          <div style="height: 42px; display: flex; align-items: flex-end; justify-content: center;">
            ${order.signature ? `<img src="${order.signature}" style="max-height: 40px; max-width: 150px;" />` : '<div style="font-size: 10.5px; color: #94a3b8; font-style: italic;">Sin firma digital</div>'}
          </div>
          <div style="border-top: 1px solid #94a3b8; padding-top: 3px; font-size: 10.5px; font-weight: 600; color: #475569;">
            Firma del Cliente de Conformidad
          </div>
        </div>
      </div>

      <!-- Términos Legales -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 9px; color: #64748b; line-height: 1.3; text-align: justify;">
        <strong>Términos del Servicio:</strong><br>
        ${AppState.shopConfig.terms.replace(/\n/g, '<br>')}
      </div>

    </div>
  `;
}

// Descarga Directa del Comprobante en PDF (Garantizado a 1 sola página)
function downloadCustomerPDF(orderId) {
  const targetId = orderId || currentPrintOrderId;
  const order = AppState.orders.find(o => o.id === targetId);
  if (!order) {
    alert('No se encontró la orden especificada.');
    return;
  }

  // 1. Limpiar cualquier elemento temporal previo
  document.querySelectorAll('.glitch-pdf-render-temp').forEach(el => el.remove());

  // 2. Si el modal no está abierto en client_pdf, configurarlo una sola vez
  if (currentPrintOrderId !== order.id || currentPrintFormat !== 'client_pdf') {
    openPrintModal(order.id);
  }

  showToast(`Generando Comprobante PDF de Orden #${order.id}...`);

  setTimeout(() => {
    // Tomar la tarjeta interna del comprobante para no incluir el padding extra del modal
    const receiptCard = document.querySelector('#print-area .customer-receipt-card') || document.getElementById('print-area');
    if (!receiptCard) {
      window.print();
      return;
    }

    if (typeof html2pdf !== 'undefined') {
      const opt = {
        margin: [4, 4, 4, 4],
        filename: `GlitchLab_Comprobante_${order.id}_Cliente.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          scrollY: 0,
          logging: false
        },
        jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: 'legacy' }
      };

      html2pdf().set(opt).from(receiptCard).save().then(() => {
        showToast(`Comprobante PDF #${order.id} descargado con éxito.`);
      }).catch(err => {
        console.error('Error con html2pdf:', err);
        showToast('Abriendo ventana de impresión para Guardar como PDF...');
        window.print();
      });
    } else {
      window.print();
    }
  }, 250);
}

function triggerPrint() {
  window.print();
}

function closePrintModal(returnToOrder = true) {
  const lastOrderId = currentPrintOrderId;
  const modal = document.getElementById('printModal');
  if (modal) modal.classList.add('hidden');
  document.body.classList.remove('ticket-thermal-mode', 'ticket-sticker-mode');
  currentPrintOrderId = null;

  if (returnToOrder && lastOrderId && typeof openOrderDetailModal === 'function') {
    openOrderDetailModal(lastOrderId);
  }
}

function returnToOrderDetailFromPrint() {
  closePrintModal(true);
}

// Control del Menú Dropdown de Ajustes del Header
function toggleSettingsMenu(e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const menu = document.getElementById('settingsDropdownMenu');
  if (menu) {
    menu.classList.toggle('hidden');
  }
}

function closeSettingsMenu() {
  const menu = document.getElementById('settingsDropdownMenu');
  if (menu) {
    menu.classList.add('hidden');
  }
}

// Configuración del Taller Modal
function openShopSettingsModal() {
  document.getElementById('cfgShopName').value = AppState.shopConfig.name || '';
  document.getElementById('cfgShopSlogan').value = AppState.shopConfig.slogan || '';
  document.getElementById('cfgShopPhone').value = AppState.shopConfig.phone || '';
  document.getElementById('cfgShopEmail').value = AppState.shopConfig.email || '';
  document.getElementById('cfgShopAddress').value = AppState.shopConfig.address || '';
  const schedEl = document.getElementById('cfgShopSchedule');
  if (schedEl) schedEl.value = AppState.shopConfig.schedule || '';
  const webEl = document.getElementById('cfgShopWebsite');
  if (webEl) webEl.value = AppState.shopConfig.website || '';
  const trackEl = document.getElementById('cfgShopTrackingDomain');
  if (trackEl) trackEl.value = AppState.shopConfig.trackingDomain || '';
  document.getElementById('cfgShopTerms').value = AppState.shopConfig.terms || '';
  document.getElementById('cfgShopWarrantyDays').value = AppState.shopConfig.warrantyDays || 45;

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
  const schedEl = document.getElementById('cfgShopSchedule');
  if (schedEl) AppState.shopConfig.schedule = schedEl.value.trim();
  const webEl = document.getElementById('cfgShopWebsite');
  if (webEl) AppState.shopConfig.website = webEl.value.trim();
  const trackEl = document.getElementById('cfgShopTrackingDomain');
  if (trackEl) AppState.shopConfig.trackingDomain = trackEl.value.trim();
  AppState.shopConfig.terms = document.getElementById('cfgShopTerms').value.trim();
  AppState.shopConfig.warrantyDays = parseInt(document.getElementById('cfgShopWarrantyDays').value, 10) || 45;

  saveConfig();
  closeShopSettingsModal();
  showToast('Configuración del taller guardada exitosamente.');
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

// Formatear números telefónicos en grupos legibles (ej: 311 339 6969) para evitar confusión con números repetidos
function formatPhoneNumber(phone) {
  if (!phone) return '';
  const str = phone.toString().trim();
  const digits = str.replace(/\D/g, '');
  
  if (digits.length === 10) {
    // Estándar México: 311 339 6969
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
  } else if (digits.length === 12 && digits.startsWith('52')) {
    // Internacional +52 311 339 6969
    return `+52 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 12)}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    // Internacional US/CA: +1 555 123 4567
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 11)}`;
  } else if (digits.length === 7) {
    // Fijo local 7 dígitos: 339 6969
    return `${digits.slice(0, 3)} ${digits.slice(3, 7)}`;
  } else if (digits.length > 6) {
    // Agrupación en bloques de 3
    return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
  }
  return str;
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

// ==========================================
// 12. GENERADOR DE NOTAS DE VENTA & COTIZACIONES (HISTORIAL, EDICIÓN, DUPLICADO)
// ==========================================

let currentQuickDocType = 'nota'; // 'nota' o 'cotizacion'
let currentQuickDocItems = [];
let currentQuickDocFilter = 'all'; // 'all', 'nota', 'cotizacion'
let currentEditingDocId = null; // null si es nuevo documento, id o folio si se está editando

function loadQuickDocs() {
  const saved = localStorage.getItem('glitchlab_quick_docs');
  if (saved) {
    try {
      AppState.quickDocs = JSON.parse(saved);
    } catch (e) {
      console.error('Error cargando notas y cotizaciones:', e);
      AppState.quickDocs = [];
    }
  }

  if (!AppState.quickDocs || AppState.quickDocs.length === 0) {
    // Registros iniciales de ejemplo para que el usuario pueda visualizar el historial inmediatamente
    AppState.quickDocs = [
      {
        id: 'doc_' + (Date.now() - 86400000 * 2),
        type: 'nota',
        typeName: 'NOTA DE VENTA',
        folio: 'NV-101',
        date: new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10),
        extraLabel: 'Forma de Pago',
        extraValue: 'Transferencia',
        client: {
          name: 'Carlos Mendoza',
          phone: '3111234567',
          email: 'carlos.mendoza@email.com',
          address: 'Av. Insurgentes #450, Tepic'
        },
        items: [
          { qty: 1, desc: 'SSD NVMe 512GB Kingston NV2 (Instalación y clonación incluida)', price: 950 },
          { qty: 1, desc: 'Mantenimiento Preventivo y Pasta Térmica Arctic MX-4', price: 450 }
        ],
        warranty: '45 días de garantía en partes instaladas',
        technician: 'GlitchLab Mostrador',
        notes: 'Equipo entregado y probado a satisfacción.',
        totals: { subtotal: 1400, discount: 0, iva: 0, total: 1400, includeIva: false },
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
      },
      {
        id: 'doc_' + (Date.now() - 86400000 * 1),
        type: 'cotizacion',
        typeName: 'COTIZACIÓN',
        folio: 'COT-101',
        date: new Date(Date.now() - 86400000 * 1).toISOString().slice(0, 10),
        extraLabel: 'Vigencia',
        extraValue: '15 días naturales',
        client: {
          name: 'Mariana Flores',
          phone: '3119876543',
          email: 'mariana.fl@gmail.com',
          address: 'Col. San Juan #12'
        },
        items: [
          { qty: 1, desc: 'Reballing Chipset Gráfico BGA + Termal Pads K5 Pro', price: 1850 },
          { qty: 1, desc: 'Limpieza ultrasónica de placa madre', price: 350 }
        ],
        warranty: '60 días de garantía en microsoldadura BGA',
        technician: 'Laboratorio GlitchLab',
        notes: 'Precios en MXN. Requiere 50% de anticipo para ingresar a laboratorio.',
        totals: { subtotal: 2200, discount: 100, iva: 0, total: 2100, includeIva: false },
        createdAt: new Date(Date.now() - 86400000 * 1).toISOString()
      }
    ];
    saveQuickDocs();
  } else {
    updateQuickDocsBadge();
  }
}

function saveQuickDocs() {
  localStorage.setItem('glitchlab_quick_docs', JSON.stringify(AppState.quickDocs || []));
  updateQuickDocsBadge();
}

function updateQuickDocsBadge() {
  const badge = document.getElementById('quickDocsCountBadge');
  if (badge) {
    badge.innerText = (AppState.quickDocs || []).length;
  }
}

// Abrir el modal de Ventas y Cotizaciones
function openQuickDocModal(viewOrType = 'history') {
  const modal = document.getElementById('quickDocModal');
  if (!modal) return;

  if (viewOrType === 'nota' || viewOrType === 'cotizacion' || viewOrType === 'form') {
    startNewQuickDoc(viewOrType === 'cotizacion' ? 'cotizacion' : 'nota');
  } else {
    switchQuickDocView('history');
  }

  modal.classList.remove('hidden');
}

// Cerrar modal
function closeQuickDocModal() {
  const modal = document.getElementById('quickDocModal');
  if (modal) modal.classList.add('hidden');
}

// Alternar vistas: Historial vs Formulario
function switchQuickDocView(viewMode, defaultType = 'nota') {
  const tabHistory = document.getElementById('tabQuickDocViewHistory');
  const tabForm = document.getElementById('tabQuickDocViewForm');
  const historySec = document.getElementById('quickDocHistorySection');
  const formSec = document.getElementById('quickDocFormSection');
  const typeToggle = document.getElementById('quickDocTypeToggleContainer');
  const folioBadge = document.getElementById('quickDocFolioBadge');
  const subtitle = document.getElementById('quickDocModalSubtitle');

  if (viewMode === 'history') {
    if (tabHistory) tabHistory.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition bg-white text-slate-950 shadow flex items-center gap-1.5 active:scale-95';
    if (tabForm) tabForm.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition text-slate-400 hover:text-white flex items-center gap-1.5 active:scale-95';

    if (historySec) historySec.classList.remove('hidden');
    if (formSec) formSec.classList.add('hidden');
    if (typeToggle) typeToggle.classList.add('hidden');
    if (folioBadge) folioBadge.classList.add('hidden');
    if (subtitle) subtitle.innerText = 'GlitchLab • Control de notas de venta y cotizaciones emitidas';

    renderQuickDocsHistory();
  } else {
    if (tabHistory) tabHistory.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition text-slate-400 hover:text-white flex items-center gap-1.5 active:scale-95';
    if (tabForm) tabForm.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition bg-white text-slate-950 shadow flex items-center gap-1.5 active:scale-95';

    if (historySec) historySec.classList.add('hidden');
    if (formSec) formSec.classList.remove('hidden');
    if (typeToggle) typeToggle.classList.remove('hidden');
    if (folioBadge) folioBadge.classList.remove('hidden');
    if (subtitle) subtitle.innerText = 'GlitchLab • Comprobante de venta, servicio o cotización formal';

    if (!currentEditingDocId) {
      prepareQuickDocForm(defaultType || currentQuickDocType);
    }
  }
}

// Iniciar un documento nuevo desde cero
function startNewQuickDoc(type = 'nota') {
  currentEditingDocId = null;
  const editBanner = document.getElementById('quickDocEditBanner');
  if (editBanner) editBanner.classList.add('hidden');

  const saveBtnText = document.getElementById('qdBtnSaveText');
  if (saveBtnText) saveBtnText.innerText = 'Guardar en Historial';

  // Limpiar campos del cliente
  const nameInp = document.getElementById('qdClientName');
  const phoneInp = document.getElementById('qdClientPhone');
  const emailInp = document.getElementById('qdClientEmail');
  const addrInp = document.getElementById('qdClientAddress');
  const notesInp = document.getElementById('qdNotesText');
  const discInp = document.getElementById('qdDiscountInput');
  const ivaInp = document.getElementById('qdIncludeIva');

  if (nameInp) nameInp.value = '';
  if (phoneInp) phoneInp.value = '';
  if (emailInp) emailInp.value = '';
  if (addrInp) addrInp.value = '';
  if (notesInp) notesInp.value = '';
  if (discInp) discInp.value = '0';
  if (ivaInp) ivaInp.checked = false;

  currentQuickDocItems = [
    { id: Date.now(), qty: 1, desc: '', price: 0 }
  ];

  switchQuickDocView('form', type);
}

// Preparar campos al abrir formulario nuevo
function prepareQuickDocForm(type = 'nota') {
  currentQuickDocType = type;

  const dateInput = document.getElementById('qdDate');
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

  const techInput = document.getElementById('qdTechnicianText');
  if (techInput) techInput.value = (AppState.auth.currentUser?.name || AppState.auth.currentUser?.username || 'GlitchLab Mostrador');

  setQuickDocType(currentQuickDocType);
  renderQuickDocItems();
  calculateQuickDocTotals();
}

// Cambiar filtro en historial (Todos / Notas / Cotizaciones)
function setQuickDocFilter(filter) {
  currentQuickDocFilter = filter;

  const btnAll = document.getElementById('btnQdFilterAll');
  const btnNota = document.getElementById('btnQdFilterNota');
  const btnCot = document.getElementById('btnQdFilterCot');

  [btnAll, btnNota, btnCot].forEach(b => {
    if (b) {
      b.classList.remove('bg-slate-800', 'text-white', 'font-bold');
      b.classList.add('text-slate-400', 'font-semibold');
    }
  });

  const activeBtn = filter === 'nota' ? btnNota : (filter === 'cotizacion' ? btnCot : btnAll);
  if (activeBtn) {
    activeBtn.classList.remove('text-slate-400', 'font-semibold');
    activeBtn.classList.add('bg-slate-800', 'text-white', 'font-bold');
  }

  renderQuickDocsHistory();
}

// Renderizar la lista de documentos en el historial
function renderQuickDocsHistory() {
  const container = document.getElementById('quickDocHistoryListContainer');
  const emptyState = document.getElementById('quickDocHistoryEmptyState');
  if (!container) return;

  const searchVal = (document.getElementById('quickDocSearchInput')?.value || '').toLowerCase().trim();

  let docs = (AppState.quickDocs || []).filter(doc => {
    const matchesFilter = currentQuickDocFilter === 'all' || doc.type === currentQuickDocFilter;
    if (!matchesFilter) return false;

    if (!searchVal) return true;

    const folioMatch = (doc.folio || '').toLowerCase().includes(searchVal);
    const clientNameMatch = (doc.client?.name || '').toLowerCase().includes(searchVal);
    const clientPhoneMatch = (doc.client?.phone || '').replace(/\D/g, '').includes(searchVal.replace(/\D/g, ''));
    const itemsMatch = (doc.items || []).some(i => (i.desc || '').toLowerCase().includes(searchVal));

    return folioMatch || clientNameMatch || clientPhoneMatch || itemsMatch;
  });

  updateQuickDocsBadge();

  if (docs.length === 0) {
    container.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  container.innerHTML = docs.map(doc => {
    const isNota = doc.type === 'nota';
    const dateFormatted = new Date(doc.date + 'T12:00:00').toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
    const totalFormatted = (doc.totals?.total || 0).toLocaleString('es-MX', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });

    const itemsSummary = (doc.items || []).slice(0, 3).map(item => `
      <span class="inline-block bg-slate-950/80 border border-slate-800/80 px-2 py-0.5 rounded text-[11px] text-slate-300 mr-1.5 mb-1">
        <strong class="text-sky-300 font-mono">${item.qty}x</strong> ${escapeHtml(item.desc || 'Concepto')}
      </span>
    `).join('') + ((doc.items || []).length > 3 ? `<span class="text-[10px] text-slate-500 font-bold">+${doc.items.length - 3} más</span>` : '');

    return `
      <div class="p-3.5 sm:p-4 bg-slate-900/90 hover:bg-slate-850 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3.5 transition group shadow-md hover:border-slate-700">
        
        <!-- Datos Principales: Folio, Tipo, Fecha, Cliente y Partidas -->
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2 mb-1.5">
            <span class="px-2.5 py-0.5 rounded-lg font-mono font-black text-xs sm:text-sm ${isNota ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'}">
              #${escapeHtml(doc.folio)}
            </span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${isNota ? 'bg-sky-950 text-sky-300 border border-sky-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'}">
              <i class="${isNota ? 'fas fa-receipt' : 'fas fa-file-lines'} mr-1"></i>${escapeHtml(doc.typeName)}
            </span>
            <span class="text-xs text-slate-400 flex items-center gap-1 font-mono">
              <i class="far fa-calendar text-[11px] text-slate-500"></i> ${dateFormatted}
            </span>
          </div>

          <div class="flex flex-wrap items-baseline gap-2 mb-2">
            <h4 class="text-sm font-extrabold text-white tracking-wide uppercase">${escapeHtml(doc.client?.name || 'Público General')}</h4>
            ${doc.client?.phone ? `
              <span class="text-xs text-sky-400 font-mono font-semibold flex items-center gap-1">
                <i class="fas fa-phone text-[10px]"></i> ${escapeHtml(formatPhoneNumber(doc.client.phone))}
              </span>
            ` : ''}
            ${doc.extraValue ? `
              <span class="text-[10px] font-semibold text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                ${escapeHtml(doc.extraLabel)}: <strong class="text-slate-300">${escapeHtml(doc.extraValue)}</strong>
              </span>
            ` : ''}
          </div>

          <!-- Resumen de Conceptos -->
          <div class="flex flex-wrap items-center">
            ${itemsSummary}
          </div>
        </div>

        <!-- Columna Derecha: Importe Total y Barra de Acciones -->
        <div class="flex flex-col sm:flex-row md:flex-col lg:flex-row items-start sm:items-center md:items-end lg:items-center justify-between md:justify-center gap-3 shrink-0 pt-2.5 sm:pt-0 border-t border-slate-800/80 sm:border-t-0">
          <div class="text-left sm:text-right md:text-right">
            <span class="text-[10px] text-slate-400 uppercase font-semibold block">${isNota ? 'Total Cobrado' : 'Total Cotizado'}</span>
            <span class="text-base sm:text-lg font-black font-mono text-white tracking-tight">$${totalFormatted} <span class="text-xs text-slate-400 font-normal">MXN</span></span>
          </div>

          <!-- Botones de Acción: Editar, Duplicar, Borrar, PDF, Imprimir y WhatsApp -->
          <div class="flex flex-wrap items-center gap-1.5">
            <!-- Editar -->
            <button 
              type="button" 
              onclick="editQuickDoc('${doc.id}')" 
              class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition border border-slate-700 active:scale-95 shadow" 
              title="Editar este documento"
            >
              <i class="fas fa-pen-to-square text-[11px]"></i>
              <span class="hidden sm:inline">Editar</span>
            </button>

            <!-- Duplicar -->
            <button 
              type="button" 
              onclick="duplicateQuickDoc('${doc.id}')" 
              class="px-2.5 py-1.5 bg-slate-800 hover:bg-purple-900/60 text-purple-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition border border-slate-700 active:scale-95 shadow" 
              title="Duplicar como nuevo documento"
            >
              <i class="fas fa-copy text-[11px]"></i>
              <span class="hidden sm:inline">Duplicar</span>
            </button>

            <!-- Borrar -->
            <button 
              type="button" 
              onclick="deleteQuickDoc('${doc.id}')" 
              class="px-2 py-1.5 bg-slate-800 hover:bg-rose-950/80 text-slate-400 hover:text-rose-400 rounded-lg text-xs font-semibold flex items-center gap-1 transition border border-slate-700 active:scale-95 shadow" 
              title="Eliminar del historial"
            >
              <i class="fas fa-trash-can text-[11px]"></i>
            </button>

            <!-- Descargar PDF -->
            <button 
              type="button" 
              onclick="downloadQuickDocFromHistory('${doc.id}')" 
              class="px-2.5 py-1.5 bg-red-950/60 hover:bg-red-900/70 text-red-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition border border-red-800/60 active:scale-95 shadow" 
              title="Descargar Comprobante PDF"
            >
              <i class="fas fa-file-pdf text-[11px]"></i>
              <span class="hidden sm:inline">PDF</span>
            </button>

            <!-- Imprimir -->
            <button 
              type="button" 
              onclick="printQuickDocFromHistory('${doc.id}')" 
              class="px-2.5 py-1.5 bg-sky-950/60 hover:bg-sky-900/70 text-sky-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition border border-sky-800/60 active:scale-95 shadow" 
              title="Imprimir documento"
            >
              <i class="fas fa-print text-[11px]"></i>
              <span class="hidden sm:inline">Imprimir</span>
            </button>

            <!-- WhatsApp -->
            <button 
              type="button" 
              onclick="sendQuickDocWhatsAppFromHistory('${doc.id}')" 
              class="px-2.5 py-1.5 bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-1 transition border border-emerald-800/60 active:scale-95 shadow" 
              title="Enviar por WhatsApp"
            >
              <i class="fab fa-whatsapp text-xs"></i>
            </button>
          </div>
        </div>

      </div>
    `;
  }).join('');
}

// Cargar un documento para edición completa
function editQuickDoc(id) {
  const doc = (AppState.quickDocs || []).find(d => d.id === id || d.folio === id);
  if (!doc) return;

  currentEditingDocId = doc.id;

  // Cambiar a la vista de formulario
  switchQuickDocView('form', doc.type);
  setQuickDocType(doc.type);

  // Llenar campos
  const folioInp = document.getElementById('qdFolio');
  const folioBadge = document.getElementById('quickDocFolioBadge');
  const dateInp = document.getElementById('qdDate');
  const extraInp = document.getElementById('qdExtraFieldSelect');
  const nameInp = document.getElementById('qdClientName');
  const phoneInp = document.getElementById('qdClientPhone');
  const emailInp = document.getElementById('qdClientEmail');
  const addrInp = document.getElementById('qdClientAddress');
  const warrantyInp = document.getElementById('qdWarrantyText');
  const techInp = document.getElementById('qdTechnicianText');
  const notesInp = document.getElementById('qdNotesText');
  const discInp = document.getElementById('qdDiscountInput');
  const ivaInp = document.getElementById('qdIncludeIva');

  if (folioInp) folioInp.value = doc.folio;
  if (folioBadge) folioBadge.innerText = doc.folio;
  if (dateInp) dateInp.value = doc.date;
  if (extraInp) extraInp.value = doc.extraValue || '';
  if (nameInp) nameInp.value = doc.client?.name || '';
  if (phoneInp) phoneInp.value = doc.client?.phone || '';
  if (emailInp) emailInp.value = doc.client?.email || '';
  if (addrInp) addrInp.value = doc.client?.address || '';
  if (warrantyInp) warrantyInp.value = doc.warranty || '';
  if (techInp) techInp.value = doc.technician || '';
  if (notesInp) notesInp.value = doc.notes || '';
  if (discInp) discInp.value = doc.totals?.discount || 0;
  if (ivaInp) ivaInp.checked = !!doc.totals?.includeIva;

  // Cargar partidas clonadas
  currentQuickDocItems = JSON.parse(JSON.stringify(doc.items || []));
  if (currentQuickDocItems.length === 0) {
    currentQuickDocItems = [{ id: Date.now(), qty: 1, desc: '', price: 0 }];
  }

  // Mostrar Banner de Edición
  const editBanner = document.getElementById('quickDocEditBanner');
  const folioLabel = document.getElementById('quickDocEditingFolioLabel');
  if (editBanner) editBanner.classList.remove('hidden');
  if (folioLabel) folioLabel.innerText = doc.folio;

  const saveBtnText = document.getElementById('qdBtnSaveText');
  if (saveBtnText) saveBtnText.innerText = 'Guardar Cambios';

  renderQuickDocItems();
  calculateQuickDocTotals();

  // Scroll al inicio del formulario
  const form = document.getElementById('quickDocForm');
  if (form) form.scrollTop = 0;

  if (typeof showToast === 'function') {
    showToast(`Editando ${doc.typeName} #${doc.folio}`);
  }
}

// Cancelar edición y regresar al historial
function cancelQuickDocEdit() {
  currentEditingDocId = null;
  const editBanner = document.getElementById('quickDocEditBanner');
  if (editBanner) editBanner.classList.add('hidden');
  switchQuickDocView('history');
}

// Duplicar un documento existente con nuevo folio
function duplicateQuickDoc(id) {
  const doc = (AppState.quickDocs || []).find(d => d.id === id || d.folio === id);
  if (!doc) return;

  currentEditingDocId = null;
  const editBanner = document.getElementById('quickDocEditBanner');
  if (editBanner) editBanner.classList.add('hidden');

  const saveBtnText = document.getElementById('qdBtnSaveText');
  if (saveBtnText) saveBtnText.innerText = 'Guardar en Historial';

  // Abrir en modo formulario del tipo correspondiente
  switchQuickDocView('form', doc.type);
  setQuickDocType(doc.type);

  // Copiar datos del cliente y condiciones con fecha de hoy
  const dateInp = document.getElementById('qdDate');
  const extraInp = document.getElementById('qdExtraFieldSelect');
  const nameInp = document.getElementById('qdClientName');
  const phoneInp = document.getElementById('qdClientPhone');
  const emailInp = document.getElementById('qdClientEmail');
  const addrInp = document.getElementById('qdClientAddress');
  const warrantyInp = document.getElementById('qdWarrantyText');
  const techInp = document.getElementById('qdTechnicianText');
  const notesInp = document.getElementById('qdNotesText');
  const discInp = document.getElementById('qdDiscountInput');
  const ivaInp = document.getElementById('qdIncludeIva');

  if (dateInp) dateInp.value = new Date().toISOString().slice(0, 10);
  if (extraInp) extraInp.value = doc.extraValue || '';
  if (nameInp) nameInp.value = doc.client?.name || '';
  if (phoneInp) phoneInp.value = doc.client?.phone || '';
  if (emailInp) emailInp.value = doc.client?.email || '';
  if (addrInp) addrInp.value = doc.client?.address || '';
  if (warrantyInp) warrantyInp.value = doc.warranty || '';
  if (techInp) techInp.value = (AppState.auth.currentUser?.name || AppState.auth.currentUser?.username || 'GlitchLab Mostrador');
  if (notesInp) notesInp.value = doc.notes || '';
  if (discInp) discInp.value = doc.totals?.discount || 0;
  if (ivaInp) ivaInp.checked = !!doc.totals?.includeIva;

  currentQuickDocItems = JSON.parse(JSON.stringify(doc.items || []));

  renderQuickDocItems();
  calculateQuickDocTotals();

  const newFolio = document.getElementById('qdFolio')?.value || '';
  if (typeof showToast === 'function') {
    showToast(`Documento #${doc.folio} duplicado como nuevo folio #${newFolio}`);
  }
}

// Eliminar documento del historial
function deleteQuickDoc(id) {
  const doc = (AppState.quickDocs || []).find(d => d.id === id || d.folio === id);
  if (!doc) return;

  const confirmMsg = `¿Estás seguro de que deseas eliminar permanentemente el documento #${doc.folio} de ${doc.client?.name || 'Cliente'}?`;
  if (!confirm(confirmMsg)) return;

  AppState.quickDocs = AppState.quickDocs.filter(d => d.id !== id && d.folio !== id);
  saveQuickDocs();
  renderQuickDocsHistory();

  if (typeof showToast === 'function') {
    showToast(`Documento #${doc.folio} eliminado del historial.`);
  }
}

// Guardar registro de la nota o cotización en el historial global
function saveQuickDocRecord(doc) {
  if (currentEditingDocId) {
    // Modo Edición: Actualizar registro existente
    const idx = (AppState.quickDocs || []).findIndex(d => d.id === currentEditingDocId || d.folio === doc.folio);
    if (idx !== -1) {
      AppState.quickDocs[idx] = {
        ...AppState.quickDocs[idx],
        ...doc,
        updatedAt: new Date().toISOString()
      };
    } else {
      doc.id = currentEditingDocId;
      doc.createdAt = new Date().toISOString();
      AppState.quickDocs.unshift(doc);
    }
    currentEditingDocId = null;
    const editBanner = document.getElementById('quickDocEditBanner');
    if (editBanner) editBanner.classList.add('hidden');
    saveQuickDocs();
    if (typeof showToast === 'function') {
      showToast(`Documento #${doc.folio} actualizado correctamente.`);
    }
  } else {
    // Modo Nuevo Documento
    doc.id = 'doc_' + Date.now();
    doc.createdAt = new Date().toISOString();
    AppState.quickDocs.unshift(doc);
    saveNextQuickDocSequence(doc.type);
    saveQuickDocs();
    if (typeof showToast === 'function') {
      showToast(`${doc.typeName} #${doc.folio} guardada en el historial.`);
    }
  }
}

// Guardar desde el botón del formulario y volver al historial
function saveQuickDocOnly() {
  const doc = getQuickDocFormData();
  saveQuickDocRecord(doc);
  switchQuickDocView('history');
}

// Descargar PDF de un documento desde el historial
function downloadQuickDocFromHistory(id) {
  const doc = (AppState.quickDocs || []).find(d => d.id === id || d.folio === id);
  if (!doc) return;

  const printContainer = document.getElementById('quickDocPrintContainer');
  if (!printContainer) return;

  if (typeof showToast === 'function') {
    showToast(`Generando PDF de #${doc.folio}...`);
  }

  printContainer.innerHTML = getQuickDocHtml(doc);
  printContainer.classList.remove('hidden');

  setTimeout(() => {
    const cardEl = printContainer.querySelector('.quickdoc-export-card') || printContainer;
    if (typeof html2pdf !== 'undefined') {
      const opt = {
        margin: [4, 4, 4, 4],
        filename: `GlitchLab_${doc.folio}_${(doc.client?.name || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollY: 0, logging: false },
        jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: 'legacy' }
      };

      html2pdf().set(opt).from(cardEl).save().then(() => {
        if (typeof showToast === 'function') showToast(`PDF descargado con éxito.`);
        printContainer.classList.add('hidden');
      }).catch(err => {
        console.error('Error con html2pdf:', err);
        window.print();
        printContainer.classList.add('hidden');
      });
    } else {
      window.print();
      printContainer.classList.add('hidden');
    }
  }, 250);
}

// Imprimir directamente desde el historial
function printQuickDocFromHistory(id) {
  const doc = (AppState.quickDocs || []).find(d => d.id === id || d.folio === id);
  if (!doc) return;

  const printContainer = document.getElementById('quickDocPrintContainer');
  if (!printContainer) return;

  printContainer.innerHTML = getQuickDocHtml(doc);
  printContainer.classList.remove('hidden');
  document.body.classList.add('quickdoc-printing');

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove('quickdoc-printing');
      printContainer.classList.add('hidden');
    }, 500);
  }, 200);
}

// Enviar por WhatsApp desde el historial
function sendQuickDocWhatsAppFromHistory(id) {
  const doc = (AppState.quickDocs || []).find(d => d.id === id || d.folio === id);
  if (!doc) return;

  const phoneDigits = (doc.client?.phone || '').replace(/\D/g, '');
  if (!phoneDigits) {
    alert('Este documento no tiene número telefónico registrado para abrir WhatsApp.');
    return;
  }

  let itemsSummary = '';
  (doc.items || []).forEach(i => {
    itemsSummary += `• ${i.qty}x ${i.desc} - $${((Number(i.qty) || 0) * (Number(i.price) || 0)).toLocaleString('es-MX')} MXN\n`;
  });

  const msg = `¡Hola *${doc.client?.name || 'Cliente'}*! Te saludamos de *GlitchLab*.\n\n` +
    `Te compartimos el detalle de tu *${doc.typeName} #${doc.folio}*:\n` +
    `📅 *Fecha:* ${doc.date}\n` +
    `📌 *${doc.extraLabel}:* ${doc.extraValue}\n\n` +
    `*Conceptos:*\n${itemsSummary}\n` +
    (doc.totals?.discount > 0 ? `💵 *Descuento:* -$${doc.totals.discount.toLocaleString('es-MX')} MXN\n` : '') +
    (doc.totals?.includeIva ? `🧾 *IVA (16%):* $${doc.totals.iva.toLocaleString('es-MX')} MXN\n` : '') +
    `💰 *TOTAL:* $${doc.totals?.total?.toLocaleString('es-MX')} MXN\n\n` +
    (doc.warranty ? `🛡️ *Garantía:* ${doc.warranty}\n` : '') +
    (doc.notes ? `📝 *Notas:* ${doc.notes}\n\n` : '\n') +
    `📍 ${AppState.shopConfig.address}\n` +
    `¡Quedamos a tus órdenes!`;

  const intlPhone = phoneDigits.length === 10 ? `52${phoneDigits}` : phoneDigits;
  window.open(`https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// Alternar entre Nota de Venta y Cotización
function setQuickDocType(type) {
  currentQuickDocType = type;

  const tabNota = document.getElementById('tabDocTypeNota');
  const tabCot = document.getElementById('tabDocTypeCotizacion');
  const modalTitle = document.getElementById('quickDocModalTitle');
  const iconBox = document.getElementById('quickDocIconBox');
  const folioBadge = document.getElementById('quickDocFolioBadge');
  const folioInput = document.getElementById('qdFolio');
  const extraLabel = document.getElementById('qdExtraFieldLabel');
  const extraSelect = document.getElementById('qdExtraFieldSelect');
  const warrantyInput = document.getElementById('qdWarrantyText');
  const totalLabel = document.getElementById('qdTotalLabel');

  // Si no estamos editando, asignamos el siguiente folio
  if (!currentEditingDocId) {
    const nextNum = getNextQuickDocSequence(type);
    const folio = type === 'nota' ? `NV-${nextNum}` : `COT-${nextNum}`;
    if (folioBadge) folioBadge.innerText = folio;
    if (folioInput) folioInput.value = folio;
  }

  if (type === 'nota') {
    if (tabNota) {
      tabNota.className = 'px-2.5 py-1 rounded-lg text-xs font-bold transition bg-sky-500 text-white shadow';
    }
    if (tabCot) {
      tabCot.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold transition text-slate-400 hover:text-white';
    }
    if (modalTitle) modalTitle.innerText = currentEditingDocId ? 'Editar Nota de Venta' : 'Generar Nota de Venta';
    if (iconBox) {
      iconBox.className = 'h-9 w-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center text-base';
      iconBox.innerHTML = '<i class="fas fa-receipt"></i>';
    }
    if (extraLabel) extraLabel.innerText = 'Forma de Pago';
    if (extraSelect) {
      const prevVal = extraSelect.value;
      extraSelect.innerHTML = `
        <option value="Efectivo">Efectivo</option>
        <option value="Transferencia">Transferencia Electrónica</option>
        <option value="Tarjeta">Tarjeta de Crédito / Débito</option>
        <option value="Mixto">Pago Mixto</option>
        <option value="Pendiente">Pendiente de Liquidar</option>
      `;
      if (prevVal && ['Efectivo', 'Transferencia', 'Tarjeta', 'Mixto', 'Pendiente'].includes(prevVal)) {
        extraSelect.value = prevVal;
      }
    }
    if (warrantyInput && !warrantyInput.value.trim()) {
      warrantyInput.value = '45 días de garantía en partes instaladas';
    }
    if (totalLabel) totalLabel.innerText = 'Total Cobrado:';
  } else {
    if (tabNota) {
      tabNota.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold transition text-slate-400 hover:text-white';
    }
    if (tabCot) {
      tabCot.className = 'px-2.5 py-1 rounded-lg text-xs font-bold transition bg-emerald-500 text-white shadow';
    }
    if (modalTitle) modalTitle.innerText = currentEditingDocId ? 'Editar Cotización' : 'Generar Cotización Formal';
    if (iconBox) {
      iconBox.className = 'h-9 w-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-base';
      iconBox.innerHTML = '<i class="fas fa-file-invoice-dollar"></i>';
    }
    if (extraLabel) extraLabel.innerText = 'Vigencia de la Cotización';
    if (extraSelect) {
      const prevVal = extraSelect.value;
      extraSelect.innerHTML = `
        <option value="15 días naturales">15 días naturales</option>
        <option value="30 días naturales">30 días naturales</option>
        <option value="7 días (sujeto a stock)">7 días (sujeto a disponibilidad)</option>
        <option value="Precios sujetos a cambio sin previo aviso">Sujeto a tipo de cambio / stock</option>
      `;
      if (prevVal && ['15 días naturales', '30 días naturales', '7 días (sujeto a stock)', 'Precios sujetos a cambio sin previo aviso'].includes(prevVal)) {
        extraSelect.value = prevVal;
      }
    }
    if (warrantyInput && !warrantyInput.value.trim()) {
      warrantyInput.value = 'Garantía según fabricante o refacción especificada';
    }
    if (totalLabel) totalLabel.innerText = 'Total Cotizado:';
  }
}

// Obtener secuencia numérica continua para notas o cotizaciones
function getNextQuickDocSequence(type) {
  const key = type === 'nota' ? 'glitchlab_last_nota_num' : 'glitchlab_last_cot_num';
  let maxNum = parseInt(localStorage.getItem(key) || '100', 10);
  (AppState.quickDocs || []).forEach(d => {
    if (d.type === type && d.folio) {
      const num = parseInt(d.folio.replace(/\D/g, ''), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return maxNum + 1;
}

// Renderizar tabla dinámica de partidas/conceptos
function renderQuickDocItems() {
  const tbody = document.getElementById('quickDocItemsTbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  currentQuickDocItems.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-900/40 transition group';
    tr.innerHTML = `
      <td class="py-2 px-1 text-center">
        <input 
          type="number" 
          value="${item.qty || 1}" 
          min="1" 
          step="any"
          oninput="updateQuickDocItem(${index}, 'qty', this.value)"
          class="w-14 bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-center font-mono text-xs text-white focus:outline-none focus:border-sky-500"
        >
      </td>
      <td class="py-2 px-2">
        <input 
          type="text" 
          value="${escapeHtml(item.desc || '')}" 
          placeholder="Ej: Cambio de pantalla OLED, Mantenimiento preventivo, SSD 1TB..."
          oninput="updateQuickDocItem(${index}, 'desc', this.value)"
          class="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
        >
      </td>
      <td class="py-2 px-2 text-right">
        <div class="flex items-center justify-end gap-1">
          <span class="text-slate-500">$</span>
          <input 
            type="number" 
            value="${item.price || 0}" 
            min="0" 
            step="any"
            oninput="updateQuickDocItem(${index}, 'price', this.value)"
            class="w-24 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-right font-mono text-xs text-white focus:outline-none focus:border-sky-500"
          >
        </div>
      </td>
      <td class="py-2 px-2 text-right font-mono font-bold text-slate-200">
        $${((Number(item.qty) || 0) * (Number(item.price) || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td class="py-2 px-1 text-center">
        <button 
          type="button" 
          onclick="removeQuickDocItemRow(${index})" 
          class="text-slate-500 hover:text-red-400 p-1 rounded transition opacity-50 group-hover:opacity-100"
          title="Eliminar partida"
        >
          <i class="fas fa-trash-can text-xs"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function updateQuickDocItem(index, field, value) {
  if (!currentQuickDocItems[index]) return;
  if (field === 'qty') currentQuickDocItems[index].qty = Math.max(0.1, Number(value) || 1);
  else if (field === 'price') currentQuickDocItems[index].price = Math.max(0, Number(value) || 0);
  else currentQuickDocItems[index].desc = value;

  // Actualizar sólo la celda de importe si cambia precio o cantidad
  calculateQuickDocTotals();
}

function addQuickDocItemRow(initialDesc = '', initialPrice = 0, initialQty = 1) {
  currentQuickDocItems.push({
    id: Date.now() + Math.random(),
    qty: initialQty,
    desc: initialDesc,
    price: initialPrice
  });
  renderQuickDocItems();
  calculateQuickDocTotals();
}

function removeQuickDocItemRow(index) {
  if (currentQuickDocItems.length <= 1) {
    currentQuickDocItems = [{ id: Date.now(), qty: 1, desc: '', price: 0 }];
  } else {
    currentQuickDocItems.splice(index, 1);
  }
  renderQuickDocItems();
  calculateQuickDocTotals();
}

// Cargar producto rápido desde el inventario del taller
function addQuickDocItemFromInventory() {
  openQuickDocInventoryPicker();
}

function openQuickDocInventoryPicker() {
  if (!AppState.inventory || AppState.inventory.length === 0) {
    if (typeof loadInventory === 'function') loadInventory();
  }

  // Poblar categorías en el filtro
  const catSelect = document.getElementById('quickDocInvCategoryFilter');
  if (catSelect) {
    const categories = Array.from(new Set((AppState.inventory || []).map(i => i.category).filter(Boolean)));
    catSelect.innerHTML = '<option value="">Todas las categorías</option>' + 
      categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  }

  // Limpiar buscador
  const searchInput = document.getElementById('quickDocInvSearchInput');
  if (searchInput) searchInput.value = '';

  renderQuickDocInventoryPickerItems();

  const modal = document.getElementById('quickDocInventoryModal');
  if (modal) modal.classList.remove('hidden');
}

function closeQuickDocInventoryPicker() {
  const modal = document.getElementById('quickDocInventoryModal');
  if (modal) modal.classList.add('hidden');
}

function renderQuickDocInventoryPickerItems() {
  const container = document.getElementById('quickDocInvListContainer');
  const emptyState = document.getElementById('quickDocInvEmptyState');
  const countText = document.getElementById('quickDocInvCountText');
  if (!container) return;

  const q = (document.getElementById('quickDocInvSearchInput')?.value || '').toLowerCase().trim();
  const cat = document.getElementById('quickDocInvCategoryFilter')?.value || '';

  const filtered = (AppState.inventory || []).filter(item => {
    const matchesSearch = !q ||
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.sku && item.sku.toLowerCase().includes(q)) ||
      (item.category && item.category.toLowerCase().includes(q));
    const matchesCat = !cat || item.category === cat;
    return matchesSearch && matchesCat;
  });

  if (countText) countText.textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  container.innerHTML = filtered.map(item => {
    const isLow = (item.stock || 0) <= (item.minStock || 0);
    const isOutOfStock = (item.stock || 0) <= 0;
    const priceVal = Number(item.price || item.salePrice || 0);
    const safeName = escapeHtml(item.name || 'Sin nombre');
    const safeSku = escapeHtml(item.sku || 'S/N');
    const safeCat = escapeHtml(item.category || 'General');

    let stockBadge = '';
    if (isOutOfStock) {
      stockBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/80 text-rose-400 border border-rose-800/80">0 pzas • Agotado</span>`;
    } else if (isLow) {
      stockBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-400 border border-amber-800/80">${item.stock} pzas • Stock Bajo</span>`;
    } else {
      stockBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800/80">${item.stock} pzas en stock</span>`;
    }

    return `
      <div class="p-3 bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition group">
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <span class="text-xs sm:text-sm font-bold text-white group-hover:text-amber-300 transition-colors">${safeName}</span>
            <span class="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">${safeSku}</span>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span class="text-sky-400 font-medium">${safeCat}</span>
            <span class="text-slate-600">•</span>
            ${stockBadge}
          </div>
        </div>

        <div class="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t border-slate-800/60 sm:border-t-0">
          <div class="text-right">
            <span class="text-[10px] text-slate-400 block font-medium">Precio Venta</span>
            <span class="text-sm sm:text-base font-extrabold text-white font-mono">$${priceVal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>

          <div class="flex items-center gap-1.5">
            <input 
              type="number" 
              id="qdInvQty_${item.id}" 
              value="1" 
              min="1" 
              max="${Math.max(1, item.stock || 99)}" 
              class="w-14 bg-slate-950 border border-slate-700 text-white rounded-lg px-2 py-1.5 text-center text-xs font-bold focus:outline-none focus:border-amber-500"
              title="Cantidad a agregar"
            >
            <button 
              type="button" 
              id="qdBtnAdd_${item.id}"
              onclick="addInventoryItemToQuickDoc('${item.id}')"
              class="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-lg text-xs transition flex items-center gap-1.5 shadow active:scale-95 shadow-amber-500/10"
              title="Agregar este producto a la nota o cotización"
            >
              <i class="fas fa-plus text-[11px]"></i>
              <span>Agregar</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function addInventoryItemToQuickDoc(itemId) {
  const item = (AppState.inventory || []).find(i => String(i.id) === String(itemId));
  if (!item) return;

  const qtyInput = document.getElementById(`qdInvQty_${itemId}`);
  const qty = Math.max(1, Number(qtyInput?.value) || 1);
  const price = Number(item.price || item.salePrice || 0);
  const desc = item.name + (item.sku ? ` [${item.sku}]` : '');

  // Si la primera partida está totalmente en blanco, la reemplazamos con este item
  if (currentQuickDocItems.length === 1 && !currentQuickDocItems[0].desc && Number(currentQuickDocItems[0].price) === 0) {
    currentQuickDocItems[0].desc = desc;
    currentQuickDocItems[0].price = price;
    currentQuickDocItems[0].qty = qty;
  } else {
    addQuickDocItemRow(desc, price, qty);
  }

  renderQuickDocItems();
  calculateQuickDocTotals();
  if (typeof showToast === 'function') {
    showToast(`"${item.name}" (x${qty}) agregado.`);
  }

  // Feedback visual breve en el botón
  const btn = document.getElementById(`qdBtnAdd_${itemId}`);
  if (btn) {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-check text-[11px] text-white"></i> <span class="text-white">¡Listo!</span>`;
    btn.className = 'px-3 py-1.5 bg-emerald-600 text-white font-bold rounded-lg text-xs transition flex items-center gap-1.5 shadow active:scale-95';
    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.className = 'px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-lg text-xs transition flex items-center gap-1.5 shadow active:scale-95 shadow-amber-500/10';
    }, 1000);
  }
}

// Calcular Totales, Descuentos e IVA
function calculateQuickDocTotals() {
  let subtotal = 0;
  currentQuickDocItems.forEach(item => {
    const q = Number(item.qty) || 0;
    const p = Number(item.price) || 0;
    subtotal += q * p;
  });

  const discountInput = document.getElementById('qdDiscountInput');
  const discount = Math.max(0, Number(discountInput?.value) || 0);

  const includeIvaCheckbox = document.getElementById('qdIncludeIva');
  const includeIva = includeIvaCheckbox ? includeIvaCheckbox.checked : false;

  const taxableAmount = Math.max(0, subtotal - discount);
  const iva = includeIva ? (taxableAmount * 0.16) : 0;
  const total = taxableAmount + iva;

  const subtotalEl = document.getElementById('qdSubtotalText');
  const ivaRowEl = document.getElementById('qdIvaRow');
  const ivaEl = document.getElementById('qdIvaText');
  const totalEl = document.getElementById('qdTotalText');

  if (subtotalEl) subtotalEl.innerText = `$${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (ivaRowEl) {
    if (includeIva) {
      ivaRowEl.classList.remove('hidden');
      if (ivaEl) ivaEl.innerText = `$${iva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } else {
      ivaRowEl.classList.add('hidden');
    }
  }
  if (totalEl) totalEl.innerText = `$${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return { subtotal, discount, iva, total, includeIva };
}

// Autocompletar clientes existentes al escribir en Nota / Cotización
function handleQuickDocClientAutocomplete(e) {
  const val = e.target.value.toLowerCase().trim();
  const dropdown = document.getElementById('qdClientAutocompleteDropdown');
  if (!dropdown) return;

  if (val.length < 2) {
    dropdown.classList.add('hidden');
    return;
  }

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
        clientMap.set(key, {
          name: o.client.name,
          phone: o.client.phone,
          email: o.client.email || '',
          address: o.client.address || ''
        });
      }
    }
  });

  const matches = Array.from(clientMap.values()).filter(c =>
    (c.name && c.name.toLowerCase().includes(val)) ||
    (c.phone && c.phone.replace(/\D/g, '').includes(val.replace(/\D/g, '')))
  ).slice(0, 5);

  if (matches.length === 0) {
    dropdown.classList.add('hidden');
    return;
  }

  dropdown.innerHTML = matches.map(c => `
    <div onclick="selectQuickDocClient('${escapeHtml(c.name)}', '${escapeHtml(c.phone)}', '${escapeHtml(c.email || '')}', '${escapeHtml(c.address || '')}')" class="px-4 py-2 hover:bg-slate-800 cursor-pointer border-b border-slate-800/60 last:border-0 transition">
      <div class="text-xs font-bold text-white">${escapeHtml(c.name)}</div>
      <div class="text-[11px] text-sky-400 font-mono">${escapeHtml(formatPhoneNumber(c.phone))}</div>
    </div>
  `).join('');

  dropdown.classList.remove('hidden');
}

function selectQuickDocClient(name, phone, email, address) {
  const nameInp = document.getElementById('qdClientName');
  const phoneInp = document.getElementById('qdClientPhone');
  const emailInp = document.getElementById('qdClientEmail');
  const addrInp = document.getElementById('qdClientAddress');
  const dropdown = document.getElementById('qdClientAutocompleteDropdown');

  if (nameInp) nameInp.value = name;
  if (phoneInp) phoneInp.value = formatPhoneNumber(phone);
  if (emailInp) emailInp.value = email || '';
  if (addrInp) addrInp.value = address || '';
  if (dropdown) dropdown.classList.add('hidden');
}

// Limpiar formulario
function resetQuickDocForm() {
  document.getElementById('quickDocForm')?.reset();
  currentQuickDocItems = [{ id: Date.now(), qty: 1, desc: '', price: 0 }];
  openQuickDocModal(currentQuickDocType);
}

// Obtener datos consolidados del documento actual
function getQuickDocFormData() {
  const folio = document.getElementById('qdFolio')?.value || 'NV-101';
  const date = document.getElementById('qdDate')?.value || new Date().toISOString().slice(0, 10);
  const extraVal = document.getElementById('qdExtraFieldSelect')?.value || '';
  const clientName = document.getElementById('qdClientName')?.value.trim() || 'Público General';
  const clientPhone = document.getElementById('qdClientPhone')?.value.trim() || '';
  const clientEmail = document.getElementById('qdClientEmail')?.value.trim() || '';
  const clientAddress = document.getElementById('qdClientAddress')?.value.trim() || '';
  const warranty = document.getElementById('qdWarrantyText')?.value.trim() || '';
  const technician = document.getElementById('qdTechnicianText')?.value.trim() || 'GlitchLab Mostrador';
  const notes = document.getElementById('qdNotesText')?.value.trim() || '';

  const totals = calculateQuickDocTotals();

  // Filtrar partidas válidas
  const validItems = currentQuickDocItems.filter(i => (i.desc && i.desc.trim()) || Number(i.price) > 0);
  if (validItems.length === 0) {
    validItems.push({ qty: 1, desc: 'Servicio / Venta General', price: totals.total });
  }

  return {
    type: currentQuickDocType,
    typeName: currentQuickDocType === 'nota' ? 'NOTA DE VENTA' : 'COTIZACIÓN',
    folio,
    date,
    extraLabel: currentQuickDocType === 'nota' ? 'Forma de Pago' : 'Vigencia',
    extraValue: extraVal,
    client: {
      name: clientName,
      phone: clientPhone,
      email: clientEmail,
      address: clientAddress
    },
    items: validItems,
    warranty,
    technician,
    notes,
    totals
  };
}

// Generar plantilla HTML profesional idéntica al comprobante oficial de GlitchLab (1 sola página)
function getQuickDocHtml(doc) {
  const dateFormatted = new Date(doc.date + 'T12:00:00').toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });

  const rowsHtml = doc.items.map(item => `
    <tr>
      <td style="padding: 6px 8px; border-bottom: 1px solid #f1f5f9; text-align: center; font-family: monospace; font-size: 11px;">${item.qty}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #f1f5f9; font-size: 11.5px; color: #1e293b;">${escapeHtml(item.desc)}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #f1f5f9; text-align: right; font-family: monospace; font-size: 11px;">$${(Number(item.price) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #f1f5f9; text-align: right; font-family: monospace; font-size: 11.5px; font-weight: 600; color: #0f172a;">$${((Number(item.qty) || 0) * (Number(item.price) || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>
  `).join('');

  return `
    <div class="quickdoc-export-card" style="font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; max-width: 800px; margin: 0 auto; padding: 22px 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; box-sizing: border-box;">
      
      <!-- Cabecera Principal con Logo Oficial y Folio -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0ea5e9; padding-bottom: 12px; margin-bottom: 14px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
              <rect x="4" y="4" width="16" height="16" rx="2" stroke="#0ea5e9" fill="#f0f9ff"/>
              <rect x="9" y="9" width="6" height="6" fill="#0ea5e9"/>
              <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>
            </svg>
            <span style="font-size: 24px; font-weight: 900; letter-spacing: 0.04em; color: #0f172a; line-height: 1;">Glitch<span style="color: #0ea5e9;">Lab</span></span>
          </div>
          <!-- Onda Electrocardiograma Oficial -->
          <div style="width: 165px; height: 14px; margin-top: 2px; margin-bottom: 2px;">
            <svg viewBox="0 0 200 20" style="width: 100%; height: 100%; display: block;" preserveAspectRatio="none">
              <path d="M 0,10 L 55,10 C 62,10 65,7.5 68,7.5 C 71,7.5 74,10 79,10 L 92,10 L 97,13 L 104,1.5 L 111,18.5 L 117,8.5 L 122,10 L 132,10 C 139,10 144,6.5 150,6.5 C 156,6.5 161,10 168,10 L 200,10" fill="none" stroke="#bae6fd" stroke-width="1.3"></path>
              <path d="M 0,10 L 55,10 C 62,10 65,7.5 68,7.5 C 71,7.5 74,10 79,10 L 92,10 L 97,13 L 104,1.5 L 111,18.5 L 117,8.5 L 122,10 L 132,10 C 139,10 144,6.5 150,6.5 C 156,6.5 161,10 168,10 L 200,10" fill="none" stroke="#0ea5e9" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
              <circle cx="104" cy="1.5" r="2.4" fill="#0284c7"></circle>
            </svg>
          </div>
          <div style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #0284c7; margin-top: 1px;">
            ${AppState.shopConfig.slogan || 'SERVICIO TÉCNICO ESPECIALIZADO EN MICROELECTRÓNICA'}
          </div>
          <div style="font-size: 10.5px; color: #475569; margin-top: 3px; line-height: 1.35;">
            ${AppState.shopConfig.address}<br>
            Tel / WhatsApp: <strong>${AppState.shopConfig.phone}</strong> | Correo: ${AppState.shopConfig.email}
          </div>
        </div>

        <div style="text-align: right;">
          <div style="background-color: ${doc.type === 'nota' ? '#f0f9ff' : '#ecfdf5'}; border: 1px solid ${doc.type === 'nota' ? '#bae6fd' : '#a7f3d0'}; padding: 6px 14px; border-radius: 8px; display: inline-block;">
            <div style="font-size: 9.5px; text-transform: uppercase; font-weight: 800; color: ${doc.type === 'nota' ? '#0284c7' : '#059669'}; letter-spacing: 0.05em;">${doc.typeName}</div>
            <div style="font-size: 22px; font-weight: 900; color: ${doc.type === 'nota' ? '#0c4a6e' : '#065f46'}; font-family: monospace; line-height: 1.1;">#${doc.folio}</div>
          </div>
          <div style="font-size: 10.5px; color: #64748b; margin-top: 4px;">
            <strong>Fecha:</strong> ${dateFormatted}
          </div>
          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
            <strong>${doc.extraLabel}:</strong> ${escapeHtml(doc.extraValue)}
          </div>
        </div>
      </div>

      <!-- Datos del Cliente -->
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px;">
        <div style="font-size: 10.5px; font-weight: 800; color: #0284c7; text-transform: uppercase; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px;">
          Cliente / Receptor del Documento
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 11.5px; line-height: 1.5;">
          <div style="flex: 1; min-width: 220px;">
            <div><strong>Nombre:</strong> ${escapeHtml(doc.client.name)}</div>
            <div><strong>Teléfono:</strong> ${escapeHtml(formatPhoneNumber(doc.client.phone) || 'N/A')}</div>
          </div>
          <div style="flex: 1; min-width: 220px;">
            <div><strong>Correo:</strong> ${escapeHtml(doc.client.email || 'N/A')}</div>
            <div><strong>Dirección:</strong> ${escapeHtml(doc.client.address || 'N/A')}</div>
          </div>
        </div>
      </div>

      <!-- Tabla de Partidas / Conceptos -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background-color: #f1f5f9; color: #475569; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em;">
            <th style="padding: 7px 8px; text-align: center; width: 50px;">Cant.</th>
            <th style="padding: 7px 8px; text-align: left;">Descripción del Concepto / Refacción</th>
            <th style="padding: 7px 8px; text-align: right; width: 100px;">Precio Unit.</th>
            <th style="padding: 7px 8px; text-align: right; width: 110px;">Importe</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <!-- Resumen Financiero y Totales -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 14px;">
        <div style="flex: 1; font-size: 10.5px; color: #475569; line-height: 1.4; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px;">
          ${doc.warranty ? `<div><strong>Garantía / Vigencia:</strong> ${escapeHtml(doc.warranty)}</div>` : ''}
          ${doc.technician ? `<div><strong>Atendido por:</strong> ${escapeHtml(doc.technician)}</div>` : ''}
          ${doc.notes ? `<div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #cbd5e1;"><strong>Observaciones:</strong><br>${escapeHtml(doc.notes)}</div>` : ''}
        </div>

        <div style="width: 240px; flex-shrink: 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 11.5px;">
            <tr>
              <td style="padding: 3px 4px; color: #64748b;">Subtotal:</td>
              <td style="padding: 3px 4px; text-align: right; font-weight: 600; font-family: monospace;">$${doc.totals.subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            </tr>
            ${doc.totals.discount > 0 ? `
              <tr>
                <td style="padding: 3px 4px; color: #ef4444;">Descuento:</td>
                <td style="padding: 3px 4px; text-align: right; font-weight: 600; font-family: monospace; color: #ef4444;">-$${doc.totals.discount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            ` : ''}
            ${doc.totals.includeIva ? `
              <tr>
                <td style="padding: 3px 4px; color: #64748b;">IVA (16%):</td>
                <td style="padding: 3px 4px; text-align: right; font-weight: 600; font-family: monospace;">$${doc.totals.iva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            ` : ''}
            <tr style="border-top: 2px solid #0ea5e9; background-color: #f0f9ff;">
              <td style="padding: 6px 4px; font-weight: 800; color: #0c4a6e;">TOTAL:</td>
              <td style="padding: 6px 4px; text-align: right; font-weight: 900; font-size: 15px; color: #0c4a6e; font-family: monospace;">$${doc.totals.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Firmas -->
      <div style="display: flex; justify-content: space-between; gap: 40px; margin-top: 14px; margin-bottom: 12px; text-align: center;">
        <div style="flex: 1;">
          <div style="height: 38px; display: flex; align-items: flex-end; justify-content: center;">
            <span style="font-family: cursive; font-size: 14px; color: #0369a1;">GlitchLab Laboratorio</span>
          </div>
          <div style="border-top: 1px solid #94a3b8; padding-top: 3px; font-size: 10px; font-weight: 600; color: #475569;">
            Emisor Autorizado (GlitchLab)
          </div>
        </div>

        <div style="flex: 1;">
          <div style="height: 38px; display: flex; align-items: flex-end; justify-content: center;">
            <span style="font-size: 10px; color: #94a3b8; font-style: italic;">Conformidad del Cliente</span>
          </div>
          <div style="border-top: 1px solid #94a3b8; padding-top: 3px; font-size: 10px; font-weight: 600; color: #475569;">
            Firma del Cliente
          </div>
        </div>
      </div>

      <!-- Términos y Condiciones -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 8.5px; color: #64748b; line-height: 1.3; text-align: justify;">
        <strong>Condiciones:</strong> Este comprobante respalda los conceptos y especificaciones descritos. Para hacer válida cualquier garantía es indispensable presentar este documento. Precios expresados en Pesos Mexicanos (MXN). ¡Gracias por su preferencia!
      </div>

    </div>
  `;
}

// Descargar en PDF de 1 página limpia
function downloadQuickDocPDF() {
  const doc = getQuickDocFormData();
  const printContainer = document.getElementById('quickDocPrintContainer');
  if (!printContainer) return;

  // Guardar en el historial
  saveQuickDocRecord(doc);

  showToast(`Generando ${doc.typeName} #${doc.folio} en PDF...`);

  printContainer.innerHTML = getQuickDocHtml(doc);
  printContainer.classList.remove('hidden');

  setTimeout(() => {
    const cardEl = printContainer.querySelector('.quickdoc-export-card') || printContainer;

    if (typeof html2pdf !== 'undefined') {
      const opt = {
        margin: [4, 4, 4, 4],
        filename: `GlitchLab_${doc.folio}_${doc.client.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          scrollY: 0,
          logging: false
        },
        jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: 'legacy' }
      };

      html2pdf().set(opt).from(cardEl).save().then(() => {
        showToast(`${doc.typeName} #${doc.folio} descargada con éxito.`);
        printContainer.classList.add('hidden');
      }).catch(err => {
        console.error('Error con html2pdf en QuickDoc:', err);
        showToast('Abriendo ventana de impresión para Guardar como PDF...');
        printQuickDocDirect();
      });
    } else {
      printQuickDocDirect();
    }
  }, 250);
}

// Imprimir directo con impresora térmica o convencional
function printQuickDocDirect() {
  const doc = getQuickDocFormData();
  const printContainer = document.getElementById('quickDocPrintContainer');
  if (!printContainer) return;

  // Guardar en el historial
  saveQuickDocRecord(doc);

  printContainer.innerHTML = getQuickDocHtml(doc);
  printContainer.classList.remove('hidden');
  document.body.classList.add('quickdoc-printing');

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove('quickdoc-printing');
      printContainer.classList.add('hidden');
    }, 500);
  }, 200);
}

// Compartir resumen por WhatsApp al cliente
function sendQuickDocWhatsApp() {
  const doc = getQuickDocFormData();
  const phoneDigits = (doc.client.phone || '').replace(/\D/g, '');
  if (!phoneDigits) {
    alert('Por favor ingresa el número telefónico del cliente para abrir WhatsApp.');
    return;
  }

  // Guardar en el historial
  saveQuickDocRecord(doc);

  let itemsSummary = '';
  doc.items.forEach(i => {
    itemsSummary += `• ${i.qty}x ${i.desc} - $${((Number(i.qty) || 0) * (Number(i.price) || 0)).toLocaleString('es-MX')} MXN\n`;
  });

  const msg = `¡Hola *${doc.client.name}*! Te saludamos de *GlitchLab*.\n\n` +
    `Te compartimos el detalle de tu *${doc.typeName} #${doc.folio}*:\n` +
    `📅 *Fecha:* ${doc.date}\n` +
    `📌 *${doc.extraLabel}:* ${doc.extraValue}\n\n` +
    `*Conceptos:*\n${itemsSummary}\n` +
    (doc.totals.discount > 0 ? `💵 *Descuento:* -$${doc.totals.discount.toLocaleString('es-MX')} MXN\n` : '') +
    (doc.totals.includeIva ? `🧾 *IVA (16%):* $${doc.totals.iva.toLocaleString('es-MX')} MXN\n` : '') +
    `💰 *TOTAL:* $${doc.totals.total.toLocaleString('es-MX')} MXN\n\n` +
    (doc.warranty ? `🛡️ *Garantía:* ${doc.warranty}\n` : '') +
    (doc.notes ? `📝 *Notas:* ${doc.notes}\n\n` : '\n') +
    `📍 ${AppState.shopConfig.address}\n` +
    `¡Quedamos a tus órdenes!`;

  const intlPhone = phoneDigits.length === 10 ? `52${phoneDigits}` : phoneDigits;
  window.open(`https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// Guardar número consecutivo al emitir
function saveNextQuickDocSequence(type) {
  const key = type === 'nota' ? 'glitchlab_last_nota_num' : 'glitchlab_last_cot_num';
  const current = getNextQuickDocSequence(type);
  localStorage.setItem(key, current.toString());

  // Actualizar folio en la interfaz
  const nextNum = getNextQuickDocSequence(type);
  const folio = type === 'nota' ? `NV-${nextNum}` : `COT-${nextNum}`;
  const folioBadge = document.getElementById('quickDocFolioBadge');
  const folioInput = document.getElementById('qdFolio');
  if (folioBadge) folioBadge.innerText = folio;
  if (folioInput) folioInput.value = folio;
}

function handleQuickDocSubmit(e) {
  e.preventDefault();
  downloadQuickDocPDF();
}

// ==========================================
// 13. GENERADOR DE PDF: RESUMEN DE TRABAJO TÉCNICO (INFORME FINAL DE REPARACIÓN)
// ==========================================

function downloadWorkSummaryPDF(orderId) {
  const targetId = orderId || currentDetailOrderId || currentPrintOrderId;
  const order = AppState.orders.find(o => o.id === targetId);
  if (!order) {
    alert('No se encontró la orden de servicio.');
    return;
  }

  showToast(`Generando Resumen de Trabajo de Orden #${order.id}...`);

  const printContainer = document.getElementById('workSummaryPrintContainer');
  if (!printContainer) return;

  printContainer.innerHTML = getWorkSummaryHtml(order);
  printContainer.classList.remove('hidden');

  setTimeout(() => {
    const cardEl = printContainer.querySelector('.work-summary-export-card') || printContainer;

    if (typeof html2pdf !== 'undefined') {
      const opt = {
        margin: [4, 4, 4, 4],
        filename: `GlitchLab_Resumen_Trabajo_Orden_${order.id}_${(order.client?.name || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          scrollY: 0,
          logging: false
        },
        jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: 'legacy' }
      };

      html2pdf().set(opt).from(cardEl).save().then(() => {
        showToast(`Resumen de Trabajo #${order.id} descargado con éxito.`);
        printContainer.classList.add('hidden');
      }).catch(err => {
        console.error('Error con html2pdf en Resumen de Trabajo:', err);
        showToast('Abriendo ventana de impresión para Guardar como PDF...');
        printWorkSummaryDirect(order.id);
      });
    } else {
      printWorkSummaryDirect(order.id);
    }
  }, 250);
}

// Imprimir directo el Resumen de Trabajo
function printWorkSummaryDirect(orderId) {
  const targetId = orderId || currentDetailOrderId || currentPrintOrderId;
  const order = AppState.orders.find(o => o.id === targetId);
  if (!order) return;

  const printContainer = document.getElementById('workSummaryPrintContainer');
  if (!printContainer) return;

  printContainer.innerHTML = getWorkSummaryHtml(order);
  printContainer.classList.remove('hidden');
  document.body.classList.add('work-summary-printing');

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      document.body.classList.remove('work-summary-printing');
      printContainer.classList.add('hidden');
    }, 500);
  }, 200);
}

// Plantilla HTML del Resumen Técnico de Trabajo (Diseño impecable en 1 sola página)
function getWorkSummaryHtml(order) {
  const dateFormatted = new Date(order.date).toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const deliveredDateFormatted = order.deliveredDate
    ? new Date(order.deliveredDate).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Equipo en laboratorio / Finalizado';

  const est = (order.costs?.estimated || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const adv = (order.costs?.advance || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const bal = (order.costs?.balance || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });

  const meta = StatusMeta[order.status] || { label: order.status, timingLabel: '' };
  const trackingUrl = getTrackingUrl(order.id);

  // Historial de intervenciones realizadas (Bitácora cronológica)
  const bitacoraItems = Array.isArray(order.bitacora) && order.bitacora.length > 0
    ? [...order.bitacora].reverse() // Mostrar en orden de avance
    : [
        {
          date: order.date,
          title: 'Recepción y Pruebas Preliminares',
          notes: 'Se ingresó el equipo a laboratorio para evaluación y diagnóstico microelectrónico.',
          technician: order.technician || 'GlitchLab'
        }
      ];

  const bitacoraHtml = bitacoraItems.map((b, idx) => {
    const bDate = b.date ? new Date(b.date).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    return `
      <div style="padding: 6px 10px; margin-bottom: 5px; background: #f8fafc; border-left: 3px solid #0ea5e9; border-radius: 4px; font-size: 11px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
          <strong style="color: #0c4a6e; font-size: 11.5px;">${idx + 1}. ${escapeHtml(b.title || 'Procedimiento Técnico')}</strong>
          <span style="font-size: 9.5px; color: #64748b; font-family: monospace;">${bDate}</span>
        </div>
        <div style="color: #334155; line-height: 1.35; font-size: 11px;">${escapeHtml(b.notes || '')}</div>
        ${b.technician ? `<div style="font-size: 9.5px; color: #0284c7; margin-top: 2px; font-weight: 600;">Técnico: ${escapeHtml(b.technician)}</div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="work-summary-export-card" style="font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; max-width: 800px; margin: 0 auto; padding: 20px 22px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; box-sizing: border-box;">
      
      <!-- Cabecera Principal con Logo Oficial y Título -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0ea5e9; padding-bottom: 12px; margin-bottom: 12px;">
        <div>
          <!-- Logo Oficial GlitchLab con Chip Microelectrónica -->
          <div style="display: flex; align-items: center; gap: 8px;">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
              <rect x="4" y="4" width="16" height="16" rx="2" stroke="#0ea5e9" fill="#f0f9ff"/>
              <rect x="9" y="9" width="6" height="6" fill="#0ea5e9"/>
              <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>
            </svg>
            <span style="font-size: 24px; font-weight: 900; letter-spacing: 0.04em; color: #0f172a; line-height: 1;">Glitch<span style="color: #0ea5e9;">Lab</span></span>
          </div>
          <!-- Onda Electrocardiograma Idéntica al Sistema -->
          <div style="width: 165px; height: 14px; margin-top: 2px; margin-bottom: 2px;">
            <svg viewBox="0 0 200 20" style="width: 100%; height: 100%; display: block;" preserveAspectRatio="none">
              <path d="M 0,10 L 55,10 C 62,10 65,7.5 68,7.5 C 71,7.5 74,10 79,10 L 92,10 L 97,13 L 104,1.5 L 111,18.5 L 117,8.5 L 122,10 L 132,10 C 139,10 144,6.5 150,6.5 C 156,6.5 161,10 168,10 L 200,10" fill="none" stroke="#bae6fd" stroke-width="1.3"></path>
              <path d="M 0,10 L 55,10 C 62,10 65,7.5 68,7.5 C 71,7.5 74,10 79,10 L 92,10 L 97,13 L 104,1.5 L 111,18.5 L 117,8.5 L 122,10 L 132,10 C 139,10 144,6.5 150,6.5 C 156,6.5 161,10 168,10 L 200,10" fill="none" stroke="#0ea5e9" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
              <circle cx="104" cy="1.5" r="2.4" fill="#0284c7"></circle>
            </svg>
          </div>
          <div style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #0284c7; margin-top: 1px;">
            ${AppState.shopConfig.slogan || 'SERVICIO TÉCNICO ESPECIALIZADO EN MICROELECTRÓNICA'}
          </div>
          <div style="font-size: 10.5px; color: #475569; margin-top: 3px; line-height: 1.35;">
            ${AppState.shopConfig.address}<br>
            Tel / WhatsApp: <strong>${AppState.shopConfig.phone}</strong> | Correo: ${AppState.shopConfig.email}
          </div>
        </div>

        <div style="text-align: right;">
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 6px 14px; border-radius: 8px; display: inline-block;">
            <div style="font-size: 9.5px; text-transform: uppercase; font-weight: 800; color: #15803d; letter-spacing: 0.05em;">INFORME TÉCNICO DE SERVICIO</div>
            <div style="font-size: 22px; font-weight: 900; color: #14532d; font-family: monospace; line-height: 1.1;">#${order.id}</div>
          </div>
          <div style="font-size: 10.5px; color: #64748b; margin-top: 4px;">
            <strong>Recepción:</strong> ${dateFormatted}
          </div>
          ${order.status === 'delivered' && order.deliveredDate ? `
            <div style="font-size: 10.5px; color: #059669; margin-top: 1px;">
              <strong>Entrega:</strong> ${deliveredDateFormatted}
            </div>
          ` : ''}
          <div style="font-size: 10px; color: #64748b; margin-top: 1px;">
            <strong>Estatus:</strong> <span style="font-weight: bold; color: #0284c7;">${meta.label}</span>
          </div>
          <div style="font-size: 9.5px; color: #0284c7; margin-top: 2px; font-weight: 600;">
            ${order.status === 'delivered' ? `Estancia en taller: ${calculateWorkshopDays(order).shortLabel}` : `Tiempo en taller: ${calculateWorkshopDays(order).label}`}
          </div>
        </div>
      </div>

      <!-- Datos del Cliente y Equipo (2 Columnas) -->
      <div style="display: flex; gap: 12px; margin-bottom: 12px;">
        <div style="flex: 1; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 9px 12px;">
          <div style="font-size: 10.5px; font-weight: 800; color: #0284c7; text-transform: uppercase; margin-bottom: 4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">
            1. Datos del Cliente
          </div>
          <div style="font-size: 11.5px; line-height: 1.45;">
            <div><strong>Cliente:</strong> ${escapeHtml(order.client?.name || '')}</div>
            <div><strong>Teléfono:</strong> ${escapeHtml(formatPhoneNumber(order.client?.phone) || 'N/A')}</div>
            <div><strong>Correo:</strong> ${escapeHtml(order.client?.email || 'N/A')}</div>
          </div>
        </div>

        <div style="flex: 1; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 9px 12px;">
          <div style="font-size: 10.5px; font-weight: 800; color: #0284c7; text-transform: uppercase; margin-bottom: 4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">
            2. Datos del Dispositivo
          </div>
          <div style="font-size: 11.5px; line-height: 1.45;">
            <div><strong>Dispositivo:</strong> ${escapeHtml(order.equipment?.type || '')} ${escapeHtml(order.equipment?.brand || '')} ${escapeHtml(order.equipment?.model || '')}</div>
            <div><strong>No. Serie:</strong> ${escapeHtml(order.equipment?.serial || 'Sin número')}</div>
            <div><strong>Técnico Resp.:</strong> ${escapeHtml(order.technician || 'Laboratorio GlitchLab')}</div>
          </div>
        </div>
      </div>

      <!-- Falla de Ingreso y Diagnóstico Inicial -->
      <div style="display: flex; gap: 12px; margin-bottom: 12px;">
        <div style="flex: 1; background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 9px 12px;">
          <div style="font-size: 10.5px; font-weight: 800; color: #b45309; text-transform: uppercase; margin-bottom: 3px;">
            ⚠️ Motivo de Ingreso / Falla Reportada
          </div>
          <div style="font-size: 11px; color: #78350f; line-height: 1.4;">
            ${escapeHtml(order.issue || 'No especificada')}
          </div>
        </div>

        <div style="flex: 1; background-color: #f0f9ff; border: 1px solid #e0f2fe; border-radius: 8px; padding: 9px 12px;">
          <div style="font-size: 10.5px; font-weight: 800; color: #0369a1; text-transform: uppercase; margin-bottom: 3px;">
            🔍 Diagnóstico Inicial de Laboratorio
          </div>
          <div style="font-size: 11px; color: #075985; line-height: 1.4;">
            ${escapeHtml(order.initialDiagnosis || 'Falla diagnosticada en laboratorio de microelectrónica.')}
          </div>
        </div>
      </div>

      <!-- SECCIÓN PRINCIPAL: Trabajos, Reparaciones y Bitácora Realizada -->
      <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
          <div style="font-size: 11px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; display: flex; items-center; gap: 6px;">
            <span style="color: #0ea5e9;">⚙️</span> Trabajos & Reparaciones Realizadas al Equipo
          </div>
          <span style="font-size: 10px; color: #64748b;">${bitacoraItems.length} registro(s) de intervención</span>
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px;">
          ${bitacoraHtml}
        </div>
      </div>

      <!-- Desglose Financiero, Garantía y QR de Rastreo -->
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 12px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 8px;">
        <div style="flex: 1; font-size: 10.5px; color: #475569; line-height: 1.4;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            <strong style="color: #0284c7; font-size: 11px;">🛡️ Cobertura de Garantía:</strong>
            <span style="font-weight: 700; color: #0f172a;">${order.warrantyDays || AppState.shopConfig.warrantyDays || 45} días naturales</span>
          </div>
          <div style="font-size: 10px; color: #64748b;">
            Válida sobre los componentes reemplazados y la mano de obra descrita en este informe técnico.
          </div>
        </div>

        <div style="width: 230px; flex-shrink: 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 11.5px;">
            <tr>
              <td style="padding: 2px 4px; color: #64748b;">Costo Total Servicio:</td>
              <td style="padding: 2px 4px; text-align: right; font-weight: 600; font-family: monospace;">$${est} MXN</td>
            </tr>
            <tr>
              <td style="padding: 2px 4px; color: #64748b;">Total Cubierto:</td>
              <td style="padding: 2px 4px; text-align: right; font-weight: 600; font-family: monospace; color: #0284c7;">$${adv} MXN</td>
            </tr>
            <tr style="border-top: 1.5px solid #0ea5e9; background-color: #f0f9ff;">
              <td style="padding: 4px 4px; font-weight: 800; color: #0c4a6e;">Saldo Restante:</td>
              <td style="padding: 4px 4px; text-align: right; font-weight: 900; font-size: 14px; color: #0c4a6e; font-family: monospace;">$${bal} MXN</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Firmas de Conformidad -->
      <div style="display: flex; justify-content: space-between; gap: 36px; margin-top: 12px; margin-bottom: 10px; text-align: center;">
        <div style="flex: 1;">
          <div style="height: 38px; display: flex; align-items: flex-end; justify-content: center;">
            <span style="font-family: cursive; font-size: 15px; color: #0369a1;">GlitchLab Laboratorio</span>
          </div>
          <div style="border-top: 1px solid #94a3b8; padding-top: 3px; font-size: 10px; font-weight: 600; color: #475569;">
            Técnico Especialista GlitchLab
          </div>
        </div>

        <div style="flex: 1;">
          <div style="height: 38px; display: flex; align-items: flex-end; justify-content: center;">
            ${order.signature ? `<img src="${order.signature}" style="max-height: 36px; max-width: 140px;" />` : '<div style="font-size: 10px; color: #94a3b8; font-style: italic;">Conformidad del Cliente</div>'}
          </div>
          <div style="border-top: 1px solid #94a3b8; padding-top: 3px; font-size: 10px; font-weight: 600; color: #475569;">
            Firma del Cliente de Conformidad
          </div>
        </div>
      </div>

      <!-- Pie y Aviso Legal -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 6px; font-size: 8.5px; color: #64748b; line-height: 1.25; text-align: justify;">
        <strong>Nota de Entrega & Garantía:</strong> Este reporte técnico certifica las reparaciones y componentes intervenidos en las instalaciones de GlitchLab. La garantía no cubre daños por líquidos, caídas, variaciones eléctricas externas o manipulación de sellos por terceros.
      </div>

    </div>
  `;
}
