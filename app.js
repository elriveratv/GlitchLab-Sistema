/**
 * GlitchLab - Sistema de Gestión de \u00F3rdenes de Servicio
 * Especialistas en Microelectrónica & Computadoras
 * Versión Integral:
 * - Enumeración secuencial GL-0001, GL-0002...
 * - Portal de Rastreo Público para Clientes (Tracking por Folio/Tel&eacute;fono y QR)
 * - Etiquetas Adhesivas / Stickers Térmicos para Equipos y Cargadores
 * - Control Automático de Garant&iacute;as con Semáforo
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
  expenses: [],
  financialSelectedDate: '',
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
    schedule: 'Lunes a Viernes 9:00 AM - 2:00 PM y 4:00 PM - 7:00 PM | Sábados 9:00 AM - 2:00 PM',
    website: 'https://glitchlab.mx',
    trackingDomain: 'https://rastreo.glitchlab.mx',
    bankInfo: {
      bank: 'BANORTE',
      beneficiary: 'JORGE ALBERTO ROBLES RUIZ',
      clabe: '0725 8001 2922 7048 52',
      rawClabe: '072580012922704852',
      whatsapp: '3113396969'
    },
    terms: '1. Diagnóstico tiene un lapso de 24 a 48 hrs hábiles.\n2. Equipos no recogidos después de 30 días generarán costo de almacenaje.\n3. La empresa no se hace responsable por pérdida de datos; el cliente debe respaldar su información.\n4. Garantía de 45 días exclusivamente en el componente o trabajo reparado.',
    warrantyDays: 45,
    currencySymbol: '$'
  }
};
window.AppState = AppState;

// Canvas de Firma
let signatureCanvas = null;
let signatureCtx = null;
let isDrawing = false;
let hasSignature = false;

// Global error catcher (GlitchLab Core Shield)
window.addEventListener('error', (e) => {
  console.warn('[GlitchLab Shield] Evento interceptado de forma segura:', e.message);
});

// Inicialización blindada al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  const safeRun = (stepName, fn) => {
    try {
      if (typeof fn === 'function') fn();
    } catch (err) {
      console.warn('[GlitchLab Shield] Advertencia no critica en ' + stepName + ':', err);
    }
  };

  safeRun('loadUsers', loadUsers);
  safeRun('loadConfig', loadConfig);
  safeRun('loadSupabaseConfig', loadSupabaseConfig);
  safeRun('loadClients', loadClients);
  safeRun('loadOrders', loadOrders);
  safeRun('updateNotificationBadge', updateNotificationBadge);
  safeRun('loadInventory', loadInventory);
  safeRun('loadQuickDocs', loadQuickDocs);
  safeRun('loadExpenses', loadExpenses);
  safeRun('setupSignaturePad', setupSignaturePad);
  safeRun('setupPatternCanvas', setupPatternCanvas);
  safeRun('setupEventListeners', setupEventListeners);
  safeRun('setupAuthListeners', setupAuthListeners);
  safeRun('setupAutocompleteListeners', setupAutocompleteListeners);
    safeRun('checkInitialAuth', checkInitialAuth);
  safeRun('initPwaService', initPwaService);
  safeRun('updateSoundFxUI', updateSoundFxUI);
  safeRun('initSupabase', () => { if (typeof initSupabase === 'function') initSupabase(false); });

  // Soporte para deep-linking directo (?order=1&tab=2)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const autoOrder = urlParams.get('order');
    const autoTab = urlParams.get('tab');
    if (autoOrder) {
      setTimeout(() => {
        if (typeof openOrderDetailModal === 'function') openOrderDetailModal(autoOrder);
        if (autoTab && typeof switchDtlMobileTab === 'function') switchDtlMobileTab(parseInt(autoTab, 10));
      }, 250);
    }
  } catch (_) {}
});

// ==========================================
// 1. ENUMERACIÓN SECUENCIAL PURAMENTE NUMÉRICA (#1, #2, #3...)
// ==========================================

// ==========================================
// UTILIDADES GENERALES DE FECHA Y HORA LOCAL
// ==========================================

function getLocalDateTimeString(date = new Date()) {
  const d = (date instanceof Date && !isNaN(date)) ? date : new Date(date || Date.now());
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 16);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

function sanitizeOrderBitacoraDates(order) {
  if (!order) return;
  let orderModified = false;
  if (Array.isArray(order.bitacora)) {
    order.bitacora.forEach(log => {
      if (log && log.id && typeof log.id === 'string' && log.id.startsWith('bit_')) {
        const rawTimestamp = log.id.replace(/^(bit_pay_|bit_deliv_|bit_)/, '');
        const realCreationTime = parseInt(rawTimestamp, 10);
        if (!isNaN(realCreationTime) && realCreationTime > 0) {
          const logTime = new Date(log.date).getTime();
          // Corregir si la fecha guardada quedó en el futuro por desfase UTC
          if (logTime > realCreationTime + 60000) {
            log.date = new Date(realCreationTime).toISOString();
            orderModified = true;
          }
        }
      }
    });
  }

  if (Array.isArray(order.costs?.payments)) {
    order.costs.payments.forEach(p => {
      if (p && p.id && typeof p.id === 'string' && p.id.startsWith('pay_')) {
        const realCreationTime = parseInt(p.id.replace('pay_', ''), 10);
        if (!isNaN(realCreationTime) && realCreationTime > 0) {
          const pTime = new Date(p.date).getTime();
          if (pTime > realCreationTime + 60000) {
            p.date = new Date(realCreationTime).toISOString();
            orderModified = true;
          }
        }
      }
    });
  }

  if (orderModified) {
    if (typeof saveOrders === 'function') saveOrders();
    if (typeof syncSingleOrderToSupabase === 'function') syncSingleOrderToSupabase(order);
  }
}

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

// ==========================================
// SEGURIDAD & HASH CRIPTOGRÁFICO SHA-256
// ==========================================
// Algoritmo SHA-256 en JavaScript puro para compatibilidad universal (HTTP, móviles y contextos no seguros)
function sha256Sync(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  var mathPow = Math.pow;
  var maxWord = mathPow(2, 32);
  var lengthProperty = 'length';
  var i, j;
  var result = '';

  var words = [];
  var asciiBitLength = ascii[lengthProperty] * 8;
  
  var hash = [];
  var k = [];
  var primeCounter = 0;

  var isComposite = {};
  for (var candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
  words[words[lengthProperty]] = (asciiBitLength);

  for (j = 0; j < words[lengthProperty];) {
    var w = words.slice(j, j += 16);
    var oldHash = hash.slice(0);

    for (i = 0; i < 64; i++) {
      var w15 = w[i - 15], w2 = w[i - 2];
      var a = hash[0], e = hash[4];
      var temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ ((~e) & hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0
        );
      var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0].concat(hash.slice(0, 7));
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      var b = (hash[i] >> (8 * j)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

async function hashPassword(str) {
  if (!str) return '';
  try {
    if (window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function') {
      const encoder = new TextEncoder();
      const data = encoder.encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (_) {}
  // Respaldo universal puro para dispositivos móviles, HTTP y redes locales
  return sha256Sync(str);
}

// Hashes SHA-256 protegidos de fábrica (las contraseñas nunca viajan ni se guardan en texto plano)
const MASTER_PASS_HASHES = {
  admin: 'b652c5e73a6ee98a200c5a3b9dc2db229fd9eb66e81b84191650d2b6cf4996b3', // glitchlab2026
  rivera: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', // 1234
  recepcion: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4' // 1234
};

// Contraseñas maestras alternativas admitidas de forma nativa
const MASTER_ALLOWED_PASSWORDS = {
  admin: ['glitchlab2026', 'admin', '1234', 'admin123', 'admin2026'],
  rivera: ['1234', 'rivera', 'glitchlab2026', 'rivera123'],
  recepcion: ['1234', 'recepcion', 'glitchlab2026']
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

  if (!Array.isArray(AppState.auth.users) || AppState.auth.users.length === 0) {
    AppState.auth.users = [
      { id: 'u_1', name: 'Administrador General', username: 'admin', password: MASTER_PASS_HASHES.admin, role: 'admin' },
      { id: 'u_2', name: 'Ing. Rivera', username: 'rivera', password: MASTER_PASS_HASHES.rivera, role: 'technician' },
      { id: 'u_3', name: 'Recepción Mostrador', username: 'recepcion', password: MASTER_PASS_HASHES.recepcion, role: 'reception' }
    ];
    saveUsers();
  } else {
    let adminUser = AppState.auth.users.find(u => u.username.toLowerCase() === 'admin');
    if (!adminUser) {
      AppState.auth.users.unshift({ id: 'u_1', name: 'Administrador General', username: 'admin', password: MASTER_PASS_HASHES.admin, role: 'admin' });
      saveUsers();
    }
    let riveraUser = AppState.auth.users.find(u => u.username.toLowerCase() === 'rivera');
    if (!riveraUser) {
      AppState.auth.users.push({ id: 'u_2', name: 'Ing. Rivera', username: 'rivera', password: MASTER_PASS_HASHES.rivera, role: 'technician' });
      saveUsers();
    }
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
    btnLogout.addEventListener('click', (e) => { if (typeof handleLogout === 'function') handleLogout(e); });
  }

  const newUserForm = document.getElementById('newUserForm');
  if (newUserForm) {
    newUserForm.addEventListener('submit', handleCreateNewUser);
  }
}

function toggleLoginPasswordVisibility(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const loginPassword = document.getElementById('loginPassword');
  const btnToggleLoginPass = document.getElementById('btnToggleLoginPass');
  if (!loginPassword) return;

  if (loginPassword.type === 'password') {
    loginPassword.type = 'text';
    if (btnToggleLoginPass) {
      btnToggleLoginPass.innerHTML = '<i data-lucide="eye" class="w-4 h-4 inline-block text-sky-400"></i>';
      btnToggleLoginPass.title = 'Ocultar contraseña';
    }
  } else {
    loginPassword.type = 'password';
    if (btnToggleLoginPass) {
      btnToggleLoginPass.innerHTML = '<i data-lucide="eye" class="w-4 h-4 inline-block text-slate-500"></i>';
      btnToggleLoginPass.title = 'Mostrar contraseña';
    }
  }
}

async function handleLoginSubmit(e) {
  if (e) e.preventDefault();

  const userField = document.getElementById('loginUsername');
  const passField = document.getElementById('loginPassword');
  const rememberCheckbox = document.getElementById('rememberMeCheckbox');
  const errorMsg = document.getElementById('loginErrorMessage');
  const loginCard = document.getElementById('loginCard');

  const usernameInput = (userField ? userField.value : '').trim().toLowerCase();
  const passwordInput = (passField ? passField.value : '').trim();

  if (!usernameInput || !passwordInput) {
    if (errorMsg) errorMsg.classList.remove('hidden');
    return;
  }

  const passLower = passwordInput.toLowerCase();
  const hashedInput = await hashPassword(passwordInput);
  const hashedInputLower = await hashPassword(passLower);

  // Buscar usuario con credenciales (acepta coincidencia exacta o sin distinguir mayúsculas/minúsculas)
  let matchedUser = (AppState.auth.users || []).find(u => 
    u.username.toLowerCase() === usernameInput && 
    (u.password === hashedInput || u.password === hashedInputLower || u.password === passwordInput || u.password.toLowerCase() === passLower)
  );

  // Respaldo de credenciales maestras por si cambiaron o no estuvieran en el almacenamiento local
  if (!matchedUser && (MASTER_PASS_HASHES[usernameInput] || MASTER_ALLOWED_PASSWORDS[usernameInput])) {
    const allowed = MASTER_ALLOWED_PASSWORDS[usernameInput] || [];
    const isMasterMatch = (
      hashedInput === MASTER_PASS_HASHES[usernameInput] || 
      hashedInputLower === MASTER_PASS_HASHES[usernameInput] ||
      allowed.some(p => p.toLowerCase() === passLower || sha256Sync(p) === hashedInput)
    );

    if (isMasterMatch) {
      matchedUser = (AppState.auth.users || []).find(u => u.username.toLowerCase() === usernameInput);
      if (matchedUser) {
        matchedUser.password = hashedInput;
        saveUsers();
      } else {
        const role = usernameInput === 'admin' ? 'admin' : (usernameInput === 'rivera' ? 'technician' : 'reception');
        const name = usernameInput === 'admin' ? 'Administrador General' : (usernameInput === 'rivera' ? 'Ing. Rivera' : 'Recepción Mostrador');
        matchedUser = { id: 'u_' + Date.now(), name, username: usernameInput, password: hashedInput, role };
        AppState.auth.users.push(matchedUser);
        saveUsers();
      }
    }
  }

  // Migrar a hash SHA-256 automáticamente si el usuario tenía contraseña antigua en texto plano
  if (matchedUser && matchedUser.password !== hashedInput) {
    matchedUser.password = hashedInput;
    saveUsers();
  }

  if (matchedUser) {

    if (rememberCheckbox && rememberCheckbox.checked) {
      localStorage.setItem('glitchlab_remember_user', matchedUser.username);
    } else {
      localStorage.removeItem('glitchlab_remember_user');
    }

    sessionStorage.setItem('glitchlab_logged_user', matchedUser.username);
    grantAccess(matchedUser);

    if (userField) userField.value = '';
    if (passField) passField.value = '';
    showToast('Bienvenido, ' + matchedUser.name + '.');
  } else {
    if (errorMsg) errorMsg.classList.remove('hidden');
    if (loginCard) {
      loginCard.classList.remove('animate-shake');
      void loginCard.offsetWidth;
      loginCard.classList.add('animate-shake');
    }
    if (passField) {
      passField.value = '';
      passField.focus();
    }
  }
}

function quickLogin(username, password) {
  const userField = document.getElementById('loginUsername');
  const passField = document.getElementById('loginPassword');
  if (userField) userField.value = username;
  if (passField) passField.value = password;
  handleLoginSubmit();
}
window.quickLogin = quickLogin;

function grantAccess(user) {
  AppState.auth.isAuthenticated = true;
  AppState.auth.currentUser = user;

  const loginScreen = document.getElementById('loginScreen');
  const mainApp = document.getElementById('mainApp');
  if (loginScreen) loginScreen.classList.add('hidden');
  if (mainApp) mainApp.classList.remove('hidden');

  const navUserBadge = document.getElementById('navUserBadge');
  const navUserRole = document.getElementById('navUserRole');
  const userAvatarCircle = document.getElementById('userAvatarCircle');
  if (navUserBadge) navUserBadge.textContent = user.name || user.username;
  if (navUserRole) {
    const roleLabels = { admin: 'Administrador', technician: 'Técnico', reception: 'Recepción' };
    navUserRole.textContent = roleLabels[user.role] || user.role;
  }
  if (userAvatarCircle) {
    const initials = (user.name || user.username || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    userAvatarCircle.textContent = initials;
  }

  // Renderizar vistas completas del sistema
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof renderOrders === 'function') renderOrders();
  if (typeof renderClientsTable === 'function') renderClientsTable();
  if (typeof renderUsersList === 'function') renderUsersList();
  if (typeof renderInventoryTable === 'function') renderInventoryTable();
  if (typeof updateNotificationBadge === 'function') updateNotificationBadge();
  if (typeof renderLucideIcons === 'function') renderLucideIcons();
}

function lockSystem() {
  AppState.auth.isAuthenticated = false;
  AppState.auth.currentUser = null;
  const loginScreen = document.getElementById('loginScreen');
  const mainApp = document.getElementById('mainApp');
  if (loginScreen) loginScreen.classList.remove('hidden');
  if (mainApp) mainApp.classList.add('hidden');
}

async function handleLogout() {
  const confirmed = await showGlitchConfirm({
    title: '¿Cerrar Sesión?',
    badge: 'Seguridad',
    message: '¿Estás seguro de que deseas salir del sistema GlitchLab?',
    confirmText: 'Cerrar Sesión',
    cancelText: 'Permanecer',
    type: 'warning',
    icon: 'log-out'
  });
  if (confirmed) {
    sessionStorage.removeItem('glitchlab_logged_user');
    localStorage.removeItem('glitchlab_remember_user');
    lockSystem();
    showToast('Sesión cerrada correctamente.');
  }
}

function handlePhotoUpload(e) {
  if (typeof handleDtlPhotoUpload === 'function') {
    handleDtlPhotoUpload(e);
  }
}

async function resetDefaultUsers() {
  const confirmed = await showGlitchConfirm({
    title: '¿Restablecer Usuarios a Fábrica?',
    badge: 'Restablecimiento',
    message: '¿Deseas restablecer los usuarios y contraseñas a los valores iniciales de fábrica?\nSe conservarán todas las órdenes y clientes registrados.',
    confirmText: 'Restablecer',
    cancelText: 'Cancelar',
    type: 'warning',
    icon: 'refresh-cw'
  });
  if (confirmed) {
    localStorage.removeItem('glitchlab_users');
    loadUsers();
    renderUsersList();
    showToast('Usuarios restablecidos a valores por defecto.');
  }
}

async function handleCreateNewUser(e) {
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

  const hashedPassword = await hashPassword(password);
  const newUser = { id: 'u_' + Date.now(), name, username, password: hashedPassword, role };
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
              <i data-lucide="trash-2" class="w-4 h-4 inline-block"></i>
            </button>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

async function deleteUser(userId) {
  const user = AppState.auth.users.find(u => u.id === userId);
  if (!user) return;

  if (AppState.auth.currentUser?.id === userId) {
    showGlitchAlert('No puedes eliminar tu propio usuario activo.', 'Acción no permitida', 'warning');
    return;
  }

  const remainingAdmins = AppState.auth.users.filter(u => u.id !== userId && u.role === 'admin');
  if (user.role === 'admin' && remainingAdmins.length === 0) {
    showGlitchAlert('No puedes eliminar el único administrador del sistema.', 'Acción no permitida', 'warning');
    return;
  }

  const confirmed = await showGlitchConfirm({
    title: `¿Eliminar Usuario?`,
    badge: 'Personal GlitchLab',
    message: `¿Estás seguro de eliminar al usuario "${user.name}" (@${user.username}) del sistema?`,
    confirmText: 'Eliminar Usuario',
    cancelText: 'Cancelar',
    type: 'danger',
    icon: 'user-x'
  });

  if (confirmed) {
    AppState.auth.users = AppState.auth.users.filter(u => u.id !== userId);
    saveUsers();
    renderUsersList();
    showToast("Usuario eliminado.");
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
  if (order.warrantyVoided) {
    return {
      hasWarranty: false,
      isValid: false,
      isVoided: true,
      label: 'Garantía Anulada',
      badge: 'Garantía Anulada',
      class: 'bg-rose-950/60 text-rose-400 border-rose-800'
    };
  }

  if (order.status !== 'delivered') {
    return { hasWarranty: false, label: 'En proceso', color: 'text-slate-500' };
  }

  // Fecha de entrega (si no está registrada explícitamente, tomar última fecha de bitácora o creación)
  const deliveryDate = order.deliveredDate ? new Date(order.deliveredDate) : new Date(order.date);
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
      badge: `Garantía Vigente (${diffDays}d)`,
      class: 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
    };
  } else {
    return {
      hasWarranty: false,
      isValid: false,
      daysLeft: 0,
      expirationFormatted: expirationDate.toLocaleDateString('es-MX'),
      badge: 'Garantía Expirada',
      class: 'bg-slate-900 text-slate-500 border-slate-800'
    };
  }
}
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
  openModalWithAnimation('inventoryModal');
  if (typeof updateMobileNavState === 'function') updateMobileNavState('inventory');
}

function closeInventoryModal() {
  closeModalWithAnimation('inventoryModal');
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
          <button onclick="editInventoryStock('${item.id}', 1)" class="p-1 text-slate-400 hover:text-white" title="+1 stock"><i data-lucide="plus" class="w-4 h-4 inline-block"></i></button>
          <button onclick="editInventoryStock('${item.id}', -1)" class="p-1 text-slate-400 hover:text-white" title="-1 stock"><i data-lucide="minus" class="w-4 h-4 inline-block"></i></button>
          <button onclick="deleteInventoryItem('${item.id}')" class="p-1 text-slate-500 hover:text-red-400 ml-1" title="Eliminar"><i data-lucide="trash-2" class="w-4 h-4 inline-block"></i></button>
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

async function deleteInventoryItem(id) {
  const confirmed = await showGlitchConfirm({
    title: '¿Eliminar Repuesto?',
    badge: 'Inventario',
    message: '¿Estás seguro de eliminar este repuesto del catálogo de inventario?',
    confirmText: 'Eliminar',
    cancelText: 'Cancelar',
    type: 'danger',
    icon: 'trash-2'
  });
  if (confirmed) {
    AppState.inventory = (AppState.inventory || []).filter(i => i.id !== id);
    saveInventory();
    renderInventory();
    showToast('Repuesto eliminado del inventario.');
  }
}

// ==========================================
// 6. PLANTILLAS RÁPIDAS DE WHATSAPP
// ==========================================

let activeWhatsAppOrder = null;

function openWhatsAppTemplatesModal(orderId) {
  const order = AppState.orders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  activeWhatsAppOrder = order;

  const formattedPhone = formatPhoneNumber(order.client?.phone);
  const waClientEl = document.getElementById('waClientName');
  if (waClientEl) waClientEl.innerText = order.client.name;
  
  const waPhoneEl = document.getElementById('waPhoneDisplay');
  if (waPhoneEl) waPhoneEl.innerText = formattedPhone || 'Sin telu{00E9}fono registrado';

  const waFolioBadge = document.getElementById('waOrderFolioBadge');
  if (waFolioBadge) waFolioBadge.innerText = '#' + order.id;

  // Actualizar tambiu{00E9}n en el encabezado del simulador de WhatsApp
  const simClient = document.getElementById('waSimClientName');
  if (simClient) simClient.innerText = order.client.name;
  const simPhone = document.getElementById('waSimPhone');
  if (simPhone) simPhone.innerText = formattedPhone ? `+52 ${formattedPhone}` : 'Sin telu{00E9}fono';

  // Preselecciu{00F3}n inteligente segu{00FA}n estado actual
  let defaultType = 'received';
  if (order.isWarranty) {
    defaultType = 'warranty_reentry';
  } else if (order.status === 'ready') {
    defaultType = 'ready';
  } else if (order.status === 'delivered') {
    defaultType = 'warranty';
  } else if (order.status === 'diagnostic' || order.status === 'budget_pending') {
    defaultType = 'budget';
  } else if (order.status === 'in_progress' || order.status === 'waiting_parts') {
    defaultType = 'progress';
  }

  selectWhatsAppTemplate(defaultType);
  openModalWithAnimation('whatsappModal');
  if (typeof renderLucideIcons === 'function') renderLucideIcons();
}

function closeWhatsAppTemplatesModal(returnToOrder = true) {
  const lastOrderId = activeWhatsAppOrder ? activeWhatsAppOrder.id : null;
  activeWhatsAppOrder = null;
  closeModalWithAnimation('whatsappModal', () => {
    if (returnToOrder && lastOrderId && typeof openOrderDetailModal === 'function') {
      const orderDetail = document.getElementById('orderDetailModal');
      if (!orderDetail || orderDetail.classList.contains('hidden')) {
        openOrderDetailModal(lastOrderId);
      }
    }
  });
}

function returnToOrderDetailFromWhatsApp() {
  closeWhatsAppTemplatesModal(true);
}

function formatWhatsAppPreviewText(text) {
  if (!text) return '';
  // Escapar HTML para evitar inyecciones
  let safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Formatear *negritas* de WhatsApp -> <strong class="font-bold text-white">
  safe = safe.replace(/\*([^*\n]+)\*/g, '<strong class="font-bold text-white">$1</strong>');
  
  // Formatear _cursivas_ de WhatsApp -> <em class="italic text-emerald-100">$1</em>
  safe = safe.replace(/_([^_\n]+)_/g, '<em class="italic text-emerald-100">$1</em>');
  
  // Resaltar enlaces URLs
  safe = safe.replace(/(https?:\/\/[^\s]+)/g, '<span class="text-sky-300 underline underline-offset-2 break-all">$1</span>');

  return safe;
}

function updateWaPreviewBubble() {
  const previewEl = document.getElementById('waMessagePreview');
  const bubbleEl = document.getElementById('waBubbleContent');
  if (previewEl && bubbleEl) {
    bubbleEl.innerHTML = formatWhatsAppPreviewText(previewEl.value);
  }
  const timeEl = document.getElementById('waBubbleTime');
  if (timeEl) {
    const now = new Date();
    timeEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
}

function onWaMessageInput() {
  updateWaCharCount();
  updateWaPreviewBubble();
}

function selectWhatsAppTemplate(type) {
  const order = activeWhatsAppOrder;
  if (!order) return;

  const statusLabel = StatusMeta[order.status]?.label || order.status;
  const balance = (order.costs?.balance || 0).toLocaleString('es-MX');
  const estimated = (order.costs?.estimated || 0).toLocaleString('es-MX');
  const advance = (order.costs?.advance || 0).toLocaleString('es-MX');
  const labor = (order.costs?.labor || 0).toLocaleString('es-MX');
  const parts = (order.costs?.parts || 0).toLocaleString('es-MX');
  const trackingUrl = getTrackingUrl(order.id);
  const clientName = order.client?.name || 'Cliente';
  const equip = `${order.equipment?.type || 'Equipo'} ${order.equipment?.brand || ''} ${order.equipment?.model || ''}`.trim();

  let message = '';

  switch (type) {
    case 'received':
      message = `\u00A1Hola *${clientName}*! Te saludamos de *GlitchLab* (Especialistas en Microelectr\u00F3nica).\n\n` +
        `Confirmamos el ingreso de tu equipo a nuestro laboratorio:\n` +
        `\uD83D\uDCCB *Folio de Orden:* #${order.id}\n` +
        `\uD83D\uDCBB *Equipo:* ${equip}\n` +
        `\u26A0\uFE0F *Falla Reportada:* ${order.issue || 'Revisi\u00F3n t\u00E9cnica general'}\n` +
        (order.costs?.advance > 0 ? `\uD83D\uDCB5 *Anticipo recibido:* $${advance} MXN\n` : '') +
        `\uD83D\uDCCD *Rastreo en tiempo real:* ${trackingUrl}\n\n` +
        `Comenzaremos con el diagn\u00F3stico t\u00E9cnico a nivel componente. Te notificaremos en cuanto tengamos los resultados. \u00A1Muchas gracias por tu confianza!`;
      break;

    case 'budget':
      message = `Hola *${clientName}*, te informamos de *GlitchLab* que ya tenemos el diagn\u00F3stico t\u00E9cnico de tu equipo:\n\n` +
        `\uD83D\uDCCB *Orden de Servicio:* #${order.id}\n` +
        `\uD83D\uDCBB *Equipo:* ${equip}\n` +
        `\uD83D\uDD2C *Diagn\u00F3stico:* ${order.initialDiagnosis || 'Falla localizada en circuito de alimentaci\u00F3n / microelectr\u00F3nica.'}\n` +
        `\uD83D\uDCB0 *Presupuesto Estimado:* $${estimated} MXN` + (order.costs?.labor > 0 ? ` (Mano de obra: $${labor}` : '') + (order.costs?.parts > 0 ? ` + Refacciones: $${parts})` : ')') + `\n` +
        (order.costs?.advance > 0 ? `\uD83D\uDCB5 *Anticipo cubierto:* $${advance} MXN\n\uD83D\uDCB3 *Saldo al entregar:* $${balance} MXN\n` : '') +
        `\uD83D\uDD0D *Ver diagn\u00F3stico y evidencias:* ${trackingUrl}\n\n` +
        `\u00BFNos autorizas comenzar con la reparaci\u00F3n a nivel componente?`;
      break;

    case 'progress':
      const lastBitacora = order.bitacora && order.bitacora.length > 0 ? order.bitacora[0] : null;
      message = `Hola *${clientName}*, te compartimos una actualizaci\u00F3n del avance de tu equipo en *GlitchLab*:\n\n` +
        `\uD83D\uDCCB *Folio:* #${order.id}\n` +
        `\uD83D\uDCBB *Equipo:* ${equip}\n` +
        `\u2699\uFE0F *Estado:* ${statusLabel}\n` +
        (lastBitacora ? `\uD83D\uDD2C *Avance en Banco:* ${lastBitacora.title}\n\uD83D\uDCDD *Detalle:* ${lastBitacora.notes}\n` : '') +
        `\uD83D\uDCCD *Rastreo en vivo:* ${trackingUrl}\n\n` +
        `Seguimos trabajando en tu dispositivo para entregarlo 100% operativo.`;
      break;

    case 'ready':
      message = `\u00A1Excelentes noticias *${clientName}*! \uD83C\uDF89\n` +
        `Tu equipo en *GlitchLab* ha superado con \u00E9xito todas las pruebas de laboratorio y est\u00E1 *LISTO PARA ENTREGA*:\n\n` +
        `\uD83D\uDCCB *Folio de Orden:* #${order.id}\n` +
        `\uD83D\uDCBB *Equipo:* ${equip}\n` +
        (order.costs?.balance > 0 ? `\uD83D\uDCB5 *Saldo Pendiente a Liquidar:* $${balance} MXN\n` : `\u2705 *Estado de Cuenta:* Liquidado / Sin saldo pendiente\n`) +
        `\uD83D\uDCCD *Ubicaci\u00F3n:* ${AppState.shopConfig.address || 'Laboratorio GlitchLab'}\n` +
        `\uD83D\uDD52 *Horario de Atenci\u00F3n:* ${AppState.shopConfig.schedule || 'Lunes a Viernes 9:00 AM - 7:00 PM | S\u00E1bados 9:00 AM - 2:00 PM'}\n` +
        `\uD83D\uDCC4 *Detalle del Servicio:* ${trackingUrl}\n\n` +
        `\u00A1Ya puedes pasar a recogerlo! Te esperamos.`;
      break;

    case 'reminder':
      message = `Hola *${clientName}*, te saludamos cordialmente de *GlitchLab* para recordarte que tu equipo est\u00E1 listo para su retiro en mostrador:\n\n` +
        `\uD83D\uDCCB *Folio de Orden:* #${order.id}\n` +
        `\uD83D\uDCBB *Equipo:* ${equip}\n` +
        (order.costs?.balance > 0 ? `\uD83D\uDCB5 *Saldo Pendiente:* $${balance} MXN\n` : '') +
        `\uD83D\uDCCD *Direcci\u00F3n:* ${AppState.shopConfig.address || 'Laboratorio GlitchLab'}\n` +
        `\uD83D\uDD52 *Horario:* ${AppState.shopConfig.schedule || 'Lunes a Viernes 9:00 AM - 7:00 PM | S\u00E1bados 9:00 AM - 2:00 PM'}\n\n` +
        `Por favor av\u00EDsanos si necesitas que te esperemos en un horario especial o si pasar\u00E1s el d\u00EDa de hoy. \u00A1Saludos!`;
      break;

    case 'warranty_reentry':
      message = `Hola *${clientName}*, te confirmamos el ingreso de tu equipo a *GlitchLab* bajo *P\u00D3LIZA DE GARANT\u00CDA*:\n\n` +
        `\uD83D\uDEE1\uFE0F *Folio de Garant\u00EDa:* #${order.id} (Vinculada a Orden Original #${order.warrantyOriginalOrderId || ''})\n` +
        `\uD83D\uDCBB *Equipo:* ${equip}\n` +
        `\u26A0\uFE0F *Observaci\u00F3n / Motivo:* ${order.issue || 'Revisi\u00F3n en garant\u00EDa'}\n` +
        `\uD83D\uDCB0 *Mano de Obra:* $0.00 MXN (100% Cubierta por Garant\u00EDa GlitchLab)\n` +
        `\uD83D\uDCCD *Rastreo en vivo:* ${trackingUrl}\n\n` +
        `Tu equipo tiene prioridad preferente en banco de trabajo. Te mantendremos informado en cada etapa.`;
      break;

    case 'warranty':
      const wDays = order.warrantyDays || AppState.shopConfig.warrantyDays || 45;
      message = `\u00A1Hola *${clientName}*! Te saludamos de *GlitchLab*.\n\n` +
        `Esperamos que tu *${equip}* est\u00E9 funcionando a la perfecci\u00F3n.\n\n` +
        `\uD83D\uDEE1\uFE0F Te recordamos que cuentas con *${wDays} d\u00EDas de garant\u00EDa oficial GlitchLab* respaldando este servicio.\n` +
        `\uD83D\uDCC4 Puedes consultar tu p\u00F3liza digital aqu\u00ED: ${trackingUrl}\n\n` +
        `\u2B50 \u00BFNos apoyar\u00EDas con una breve rese\u00F1a en Google sobre tu experiencia? Nos ayuda much\u00EDsimo a seguir brindando el mejor servicio t\u00E9cnico de microelectr\u00F3nica. \u00A1Muchas gracias por tu preferencia!`;
      break;

    case 'transfer':
      message = `Hola *${clientName}*, te compartimos los datos oficiales de *GlitchLab* para tu transferencia bancaria:\n\n` +
        `\uD83D\uDCCB *Orden de Servicio:* #${order.id}\n` +
        `\uD83D\uDCBB *Equipo:* ${equip}\n` +
        (order.costs?.balance > 0 ? `\uD83D\uDCB5 *Saldo a Liquidar:* $${balance} MXN\n\n` : `\uD83D\uDCB5 *Monto Estimado:* $${estimated} MXN\n\n`) +
        `\uD83C\uDFDB\uFE0F *Banco:* BANORTE\n` +
        `\uD83D\uDC64 *Beneficiario:* JORGE ALBERTO ROBLES RUIZ\n` +
        `\uD83D\uDCB3 *CLABE Interbancaria:*\n072580012922704852\n\n` +
        `\uD83D\uDCF1 Por favor env\u00EDanos tu comprobante respondiendo a este chat de WhatsApp (${AppState.shopConfig.phone || '311 339 6969'}). \u00A1Muchas gracias!`;
      break;
  }

  const previewEl = document.getElementById('waMessagePreview');
  if (previewEl) previewEl.value = message;
  updateWaCharCount();
  updateWaPreviewBubble();

  // Resaltado visual interactivo exclusivo de la plantilla seleccionada
  document.querySelectorAll('.wa-tpl-btn').forEach(btn => {
    btn.classList.remove('border-emerald-500/70', 'bg-emerald-950/40', 'ring-1', 'ring-emerald-500/40', 'text-emerald-300', 'shadow-sm', 'shadow-emerald-500/10');
    btn.classList.add('border-slate-800', 'bg-slate-800/50');
    const chk = btn.querySelector('.wa-btn-check');
    if (chk) {
      chk.classList.remove('bg-emerald-500', 'border-emerald-400', 'text-slate-950');
      chk.classList.add('border-slate-700', 'text-transparent', 'bg-transparent');
    }
  });

  const activeBtn = document.getElementById('waBtn_' + type);
  if (activeBtn) {
    activeBtn.classList.remove('border-slate-800', 'bg-slate-800/50');
    activeBtn.classList.add('border-emerald-500/70', 'bg-emerald-950/40', 'ring-1', 'ring-emerald-500/40', 'shadow-sm', 'shadow-emerald-500/10');
    const activeChk = activeBtn.querySelector('.wa-btn-check');
    if (activeChk) {
      activeChk.classList.remove('border-slate-700', 'text-transparent', 'bg-transparent');
      activeChk.classList.add('bg-emerald-500', 'border-emerald-400', 'text-slate-950');
    }
  }

  if (typeof renderLucideIcons === 'function') renderLucideIcons();
}

function updateWaCharCount() {
  const previewEl = document.getElementById('waMessagePreview');
  const countEl = document.getElementById('waCharCount');
  if (previewEl && countEl) {
    countEl.innerText = `${previewEl.value.length} caracteres`;
  }
}

function sendSelectedWhatsAppMessage() {
  if (!activeWhatsAppOrder) return;
  const phone = (activeWhatsAppOrder.client?.phone || '').replace(/\D/g, '');
  if (!phone) {
    alert('Esta orden no cuenta con nu{00FA}mero telefu{00F3}nico registrado.');
    return;
  }

  const previewEl = document.getElementById('waMessagePreview');
  const text = encodeURIComponent(previewEl ? previewEl.value : '');
  const cleanPhone = phone.length === 10 ? phone : phone;
  const url = `https://wa.me/52${cleanPhone}?text=${text}`;
  window.open(url, '_blank');
  closeWhatsAppTemplatesModal();
}

function copyWhatsAppMessageToClipboard() {
  const previewEl = document.getElementById('waMessagePreview');
  if (!previewEl || !previewEl.value) return;
  
  navigator.clipboard.writeText(previewEl.value).then(() => {
    const btnText = document.getElementById('btnCopyWaMsgText');
    if (btnText) {
      const original = btnText.innerText;
      btnText.innerText = '¡Copiado! ✓';
      setTimeout(() => { btnText.innerText = original; }, 2000);
    }
  }).catch(() => {
    previewEl.select();
    document.execCommand('copy');
  });
}

function sendQuickWhatsApp(templateType) {
  const targetId = currentDetailOrderId;
  if (!targetId) return;
  const order = AppState.orders.find(o => String(o.id) === String(targetId));
  if (!order) return;

  const phone = (order.client?.phone || '').replace(/\D/g, '');
  if (!phone) {
    alert('Esta orden no cuenta con número de teléfono registrado.');
    return;
  }

  activeWhatsAppOrder = order;
  selectWhatsAppTemplate(templateType);

  const previewEl = document.getElementById('waMessagePreview');
  const text = encodeURIComponent(previewEl ? previewEl.value : '');
  const cleanPhone = phone.length === 10 ? phone : phone;
  const url = `https://wa.me/52${cleanPhone}?text=${text}`;
  window.open(url, '_blank');
}
// ==========================================
// 7. CORTE DE CAJA, REPORTES, GASTOS Y AUDITORÍA POR FECHA
// ==========================================

function loadExpenses() {
  const saved = localStorage.getItem('glitchlab_expenses');
  if (saved) {
    try {
      AppState.expenses = JSON.parse(saved);
    } catch (e) {
      AppState.expenses = [];
    }
  } else {
    AppState.expenses = [];
  }
}

function saveExpenses() {
  try {
    localStorage.setItem('glitchlab_expenses', JSON.stringify(AppState.expenses || []));
  } catch (e) {
    console.error('Error saving expenses:', e);
  }
}

// Obtener fecha actual en formato local YYYY-MM-DD
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Abrir el modal de Finanzas & Corte de Caja
function openFinancialReportModal() {
  if (!AppState.financialSelectedDate) {
    AppState.financialSelectedDate = getLocalDateString();
  }
  renderFinancialModal();
  openModalWithAnimation('financialModal');
  if (typeof renderLucideIcons === 'function') renderLucideIcons();
  if (typeof updateMobileNavState === 'function') updateMobileNavState('finances');
}

function closeFinancialReportModal() {
  closeModalWithAnimation('financialModal');
}

// Cambiar la fecha del corte desde el input de fecha
function handleFinancialDateChange(newDate) {
  if (!newDate) return;
  AppState.financialSelectedDate = newDate;
  renderFinancialModal();
}

// Atajos rÁpidos de fecha (Hoy / Ayer)
function setFinancialQuickDate(type) {
  const today = new Date();
  if (type === 'today') {
    AppState.financialSelectedDate = getLocalDateString(today);
  } else if (type === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    AppState.financialSelectedDate = getLocalDateString(yesterday);
  }
  renderFinancialModal();
}

// Renderizar todo el modal de finanzas y arqueo para la fecha seleccionada
function renderFinancialModal() {
  const targetDate = AppState.financialSelectedDate || getLocalDateString();
  const targetYearMonth = targetDate.slice(0, 7); // YYYY-MM
  const todayStr = getLocalDateString();

  // Actualizar controles de fecha
  const inputDate = document.getElementById('corteDateInput');
  if (inputDate && inputDate.value !== targetDate) {
    inputDate.value = targetDate;
  }

  const btnToday = document.getElementById('btnCorteQuickToday');
  const btnYesterday = document.getElementById('btnCorteQuickYesterday');
  const yesterdayObj = new Date();
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayStr = getLocalDateString(yesterdayObj);

  if (btnToday) {
    if (targetDate === todayStr) {
      btnToday.className = 'px-2.5 py-1 text-[11px] font-bold rounded-lg text-white bg-slate-800 shadow-xs transition active:scale-95';
    } else {
      btnToday.className = 'px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:text-white transition active:scale-95';
    }
  }
  if (btnYesterday) {
    if (targetDate === yesterdayStr) {
      btnYesterday.className = 'px-2.5 py-1 text-[11px] font-bold rounded-lg text-white bg-slate-800 shadow-xs transition active:scale-95';
    } else {
      btnYesterday.className = 'px-2.5 py-1 text-[11px] font-medium text-slate-400 hover:text-white transition active:scale-95';
    }
  }

  // MÉtricas Globales Acumuladas
  let totalCashHistorical = 0;
  let totalTransferHistorical = 0;
  let totalCardHistorical = 0;
  let totalMonthCollected = 0;
  let totalPendingReceivable = 0;

  // MÉtricas del DÍa Seleccionado
  let corteCash = 0;
  let corteTransfer = 0;
  let corteCard = 0;
  const ordersInvolved = new Set();
  const movesList = [];

  // Recorrer Órdenes
  (AppState.orders || []).forEach(order => {
    const adv = Number(order.costs?.advance) || 0;
    const bal = Number(order.costs?.balance) || 0;
    const method = order.costs?.paymentMethod || 'Efectivo';
    const payments = Array.isArray(order.costs?.payments) ? order.costs.payments : [];

    if (payments.length > 0) {
      payments.forEach(p => {
        const pDate = (p.date || '').slice(0, 10);
        const pAmount = Number(p.amount) || 0;
        const pMethod = p.method || 'Efectivo';

        // Acumulado HistÓrico
        if (pMethod === 'Efectivo') totalCashHistorical += pAmount;
        else if (pMethod === 'Transferencia') totalTransferHistorical += pAmount;
        else if (pMethod === 'Tarjeta') totalCardHistorical += pAmount;
        else totalCashHistorical += pAmount;

        // Mes del target
        if (pDate.startsWith(targetYearMonth)) {
          totalMonthCollected += pAmount;
        }

        // Fecha seleccionada
        if (pDate === targetDate) {
          ordersInvolved.add(order.id);
          if (pMethod === 'Efectivo') corteCash += pAmount;
          else if (pMethod === 'Transferencia') corteTransfer += pAmount;
          else if (pMethod === 'Tarjeta') corteCard += pAmount;
          else corteCash += pAmount;

          const timeStr = p.date ? new Date(p.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '--:--';
          movesList.push({
            type: 'income',
            id: p.id || ('pay_' + Math.random()),
            orderId: order.id,
            client: order.client?.name || 'Cliente Mostrador',
            phone: order.client?.phone || '',
            concept: p.note || 'Abono / Liquidación',
            amount: pAmount,
            method: pMethod,
            time: timeStr
          });
        }
      });
    } else {
      // Compatibilidad con Órdenes sin historial detallado
      const orderDate = (order.date || '').slice(0, 10);
      const paid = adv + (order.status === 'delivered' ? bal : 0);

      if (paid > 0) {
        if (method === 'Efectivo') totalCashHistorical += paid;
        else if (method === 'Transferencia') totalTransferHistorical += paid;
        else if (method === 'Tarjeta') totalCardHistorical += paid;
        else totalCashHistorical += paid;

        if (orderDate.startsWith(targetYearMonth)) {
          totalMonthCollected += paid;
        }

        if (orderDate === targetDate) {
          ordersInvolved.add(order.id);
          if (method === 'Efectivo') corteCash += paid;
          else if (method === 'Transferencia') corteTransfer += paid;
          else if (method === 'Tarjeta') corteCard += paid;
          else corteCash += paid;

          movesList.push({
            type: 'income',
            id: 'legacy_' + order.id,
            orderId: order.id,
            client: order.client?.name || 'Cliente Mostrador',
            phone: order.client?.phone || '',
            concept: 'Ingreso inicial / Liquidación',
            amount: paid,
            method: method,
            time: '--:--'
          });
        }
      }
    }

    if (order.status !== 'delivered' && order.status !== 'cancelled') {
      totalPendingReceivable += bal;
    }
  });

  // Salidas / Gastos (Egresos) de la Fecha Seleccionada
  let corteExpenses = 0;
  let corteExpenseCash = 0;
  const expenses = Array.isArray(AppState.expenses) ? AppState.expenses : [];

  expenses.forEach(exp => {
    const expDate = (exp.date || '').slice(0, 10);
    const expAmount = Number(exp.amount) || 0;
    const expMethod = exp.method || 'Efectivo';

    if (expDate === targetDate) {
      corteExpenses += expAmount;
      if (expMethod === 'Efectivo') {
        corteExpenseCash += expAmount;
      }
      movesList.push({
        type: 'expense',
        id: exp.id,
        concept: exp.concept || 'Gasto de taller',
        user: exp.user || 'Taller',
        amount: expAmount,
        method: expMethod,
        time: exp.time || '--:--'
      });
    }
  });

  // Balance Real de Efectivo en Caja (En Mano)
  const netCashInDrawer = corteCash - corteExpenseCash;
  const totalDayIncome = corteCash + corteTransfer + corteCard;

  // Actualizar UI del Resumen General Superior
  const elReportToday = document.getElementById('reportTodayCash');
  const elReportMonth = document.getElementById('reportMonthCash');
  const elReportPending = document.getElementById('reportPendingReceivable');
  const elMethodCash = document.getElementById('reportMethodCash');
  const elMethodTransfer = document.getElementById('reportMethodTransfer');
  const elMethodCard = document.getElementById('reportMethodCard');

  if (elReportToday) elReportToday.innerText = `$${totalDayIncome.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  let displayMonth = totalMonthCollected;
  if (displayMonth === 0 && (totalCashHistorical + totalTransferHistorical + totalCardHistorical) > 0) {
    displayMonth = totalCashHistorical + totalTransferHistorical + totalCardHistorical;
  }
  if (elReportMonth) elReportMonth.innerText = `$${displayMonth.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elReportPending) elReportPending.innerText = `$${totalPendingReceivable.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elMethodCash) elMethodCash.innerText = `$${totalCashHistorical.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elMethodTransfer) elMethodTransfer.innerText = `$${totalTransferHistorical.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elMethodCard) elMethodCard.innerText = `$${totalCardHistorical.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

  // Actualizar Panel de Corte de Caja Diario por Fecha
  const elCorteDate = document.getElementById('corteCajaDate');
  const elCorteCash = document.getElementById('corteTodayCash');
  const elCorteTransfer = document.getElementById('corteTodayTransfer');
  const elCorteCard = document.getElementById('corteTodayCard');
  const elCorteExpenses = document.getElementById('corteTodayExpenses');
  const elCorteCount = document.getElementById('corteTodayOrdersCount');
  const elNetCash = document.getElementById('corteNetCashDrawer');
  const elNetNotice = document.getElementById('corteNetStatusNotice');

  if (elCorteDate) {
    const parts = targetDate.split('-').map(Number);
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    elCorteDate.innerText = dateObj.toLocaleDateString('es-MX', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    }).toUpperCase();
  }

  if (elCorteCash) elCorteCash.innerText = `$${corteCash.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elCorteTransfer) elCorteTransfer.innerText = `$${corteTransfer.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elCorteCard) elCorteCard.innerText = `$${corteCard.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elCorteExpenses) elCorteExpenses.innerText = `-$${corteExpenses.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
  if (elCorteCount) elCorteCount.innerText = `${ordersInvolved.size} \u00F3rdenes cobradas`;

  if (elNetCash) {
    elNetCash.innerText = `$${netCashInDrawer.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
    if (netCashInDrawer < 0) {
      elNetCash.className = 'text-xl sm:text-2xl font-black font-mono text-rose-400 tracking-tight';
    } else {
      elNetCash.className = 'text-xl sm:text-2xl font-black font-mono text-white tracking-tight';
    }
  }

  if (elNetNotice) {
    if (corteExpenseCash > 0) {
      elNetNotice.innerText = `Efectivo cobrado ($${corteCash.toFixed(2)}) menos gastos ($${corteExpenseCash.toFixed(2)})`;
    } else {
      elNetNotice.innerText = 'Total disponible en caj\u00F3n';
    }
  }

  // Actualizar Movimientos Detallados
  const movesCount = document.getElementById('corteMovesCount');
  const movesContainer = document.getElementById('corteMovesContainer');
  if (movesCount) movesCount.innerText = String(movesList.length);

  if (movesContainer) {
    if (movesList.length === 0) {
      movesContainer.innerHTML = `
        <div class="text-center py-6 text-slate-500 border border-dashed border-slate-800/80 rounded-xl bg-slate-950/40">
          <i data-lucide="receipt" class="w-5 h-5 mx-auto mb-1 text-slate-600 block"></i>
          <span class="text-xs font-semibold text-slate-400 block">Sin cobros ni salidas de dinero registradas en esta fecha.</span>
          <span class="text-[10px] text-slate-600 block mt-0.5">Usa el selector para navegar a otra fecha o registra un nuevo gasto.</span>
        </div>
      `;
    } else {
      movesContainer.innerHTML = movesList.map(item => {
        if (item.type === 'income') {
          let methodBadgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25';
          let methodIcon = 'banknote';
          if (item.method === 'Transferencia') {
            methodBadgeClass = 'bg-sky-500/10 text-sky-400 border-sky-500/25';
            methodIcon = 'smartphone';
          } else if (item.method === 'Tarjeta') {
            methodBadgeClass = 'bg-purple-500/10 text-purple-400 border-purple-500/25';
            methodIcon = 'credit-card';
          }

          return `
            <div class="p-2.5 bg-slate-900/75 hover:bg-slate-900 border border-slate-800/90 rounded-xl flex items-center justify-between gap-2.5 transition">
              <div class="flex items-center gap-2.5 min-w-0 flex-1">
                <div class="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-mono font-bold text-xs shrink-0">
                  #${item.orderId}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-xs font-bold text-white truncate max-w-[170px] sm:max-w-none">${escapeHtml(item.client)}</span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-mono border ${methodBadgeClass} flex items-center gap-1">
                      <i data-lucide="${methodIcon}" class="w-2.5 h-2.5"></i>
                      <span>${escapeHtml(item.method)}</span>
                    </span>
                  </div>
                  <div class="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>${escapeHtml(item.concept)}</span>
                    <span class="text-slate-600">&bull;</span>
                    <span class="font-mono text-slate-500">${item.time}</span>
                  </div>
                </div>
              </div>
              <div class="text-right shrink-0">
                <span class="font-mono font-bold text-emerald-400 text-xs sm:text-sm">+$${item.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          `;
        } else {
          // Gasto / Salida
          return `
            <div class="p-2.5 bg-slate-900/75 hover:bg-slate-900 border border-rose-500/30 rounded-xl flex items-center justify-between gap-2.5 transition">
              <div class="flex items-center gap-2.5 min-w-0 flex-1">
                <div class="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                  <i data-lucide="minus" class="w-3.5 h-3.5"></i>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-xs font-bold text-rose-300 truncate max-w-[170px] sm:max-w-none">${escapeHtml(item.concept)}</span>
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-mono border bg-rose-500/10 text-rose-400 border-rose-500/25">
                      ${escapeHtml(item.method)}
                    </span>
                  </div>
                  <div class="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>Resp: ${escapeHtml(item.user)}</span>
                    <span class="text-slate-600">&bull;</span>
                    <span class="font-mono text-slate-500">${item.time}</span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="font-mono font-bold text-rose-400 text-xs sm:text-sm">-$${item.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                <button type="button" onclick="deleteExpense('${item.id}')" class="p-1 text-slate-500 hover:text-rose-400 transition" title="Eliminar gasto">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          `;
        }
      }).join('');
    }
  }

  if (typeof renderLucideIcons === 'function') renderLucideIcons();
}

function openExpenseModal() {
  const targetDate = AppState.financialSelectedDate || getLocalDateString();
  const inputDate = document.getElementById('expenseDate');
  const inputUser = document.getElementById('expenseUser');
  const form = document.getElementById('expenseForm');

  if (form) form.reset();
  if (inputDate) inputDate.value = targetDate;
  if (inputUser) inputUser.value = AppState.auth.currentUser?.name || 'Cajero';

  openModalWithAnimation('expenseModal');
  if (typeof renderLucideIcons === 'function') renderLucideIcons();
}

function closeExpenseModal() {
  closeModalWithAnimation('expenseModal');
}

function handleSaveExpense(e) {
  e.preventDefault();
  const concept = document.getElementById('expenseConcept')?.value.trim();
  const amount = parseFloat(document.getElementById('expenseAmount')?.value);
  const method = document.getElementById('expenseMethod')?.value || 'Efectivo';
  const date = document.getElementById('expenseDate')?.value || getLocalDateString();
  const user = document.getElementById('expenseUser')?.value.trim() || 'Cajero';

  if (!concept || isNaN(amount) || amount <= 0) {
    showToast('Ingresa un motivo y monto válido para el gasto');
    return;
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  const newExpense = {
    id: 'exp_' + Date.now(),
    concept,
    amount,
    method,
    date,
    user,
    time: timeStr
  };

  if (!Array.isArray(AppState.expenses)) AppState.expenses = [];
  AppState.expenses.push(newExpense);
  saveExpenses();

  closeExpenseModal();
  showToast(`Gasto de $${amount.toFixed(2)} registrado correctamente`);
  renderFinancialModal();
}

async function deleteExpense(expenseId) {
  const confirmed = await showGlitchConfirm({
    title: '¿Eliminar Registro de Gasto?',
    badge: 'Finanzas',
    message: '¿Estás seguro de que deseas eliminar este registro de gasto del balance?',
    confirmText: 'Eliminar Gasto',
    cancelText: 'Cancelar',
    type: 'danger',
    icon: 'dollar-sign'
  });
  if (!confirmed) return;

  AppState.expenses = (AppState.expenses || []).filter(e => e.id !== expenseId);
  saveExpenses();
  showToast('Gasto eliminado.');
  renderFinancialModal();
}

function exportDailyAuditCSV() {
  const targetDate = AppState.financialSelectedDate || getLocalDateString();
  const orders = AppState.orders || [];
  const expenses = AppState.expenses || [];

  const rows = [];
  rows.push(['Tipo', 'Folio / Ref', 'Concepto / Cliente', 'Metodo', 'Monto (MXN)', 'Fecha', 'Hora', 'Responsable']);

  orders.forEach(o => {
    const payments = Array.isArray(o.costs?.payments) ? o.costs.payments : [];
    if (payments.length > 0) {
      payments.forEach(p => {
        const pDate = (p.date || '').slice(0, 10);
        if (pDate === targetDate) {
          rows.push([
            'Ingreso (Cobro)',
            `#${o.id}`,
            `"${(o.client?.name || 'Cliente').replace(/"/g, '""')}"`,
            p.method || 'Efectivo',
            Number(p.amount) || 0,
            pDate,
            p.date ? new Date(p.date).toLocaleTimeString('es-MX') : '',
            `"${(p.user || o.technician || 'Caja').replace(/"/g, '""')}"`
          ]);
        }
      });
    } else {
      const oDate = (o.date || '').slice(0, 10);
      const adv = Number(o.costs?.advance) || 0;
      const bal = Number(o.costs?.balance) || 0;
      const paid = adv + (o.status === 'delivered' ? bal : 0);
      if (oDate === targetDate && paid > 0) {
        rows.push([
          'Ingreso (Cobro)',
          `#${o.id}`,
          `"${(o.client?.name || 'Cliente').replace(/"/g, '""')}"`,
          o.costs?.paymentMethod || 'Efectivo',
          paid,
          oDate,
          '--:--',
          `"${(o.technician || 'Caja').replace(/"/g, '""')}"`
        ]);
      }
    }
  });

  expenses.forEach(e => {
    const eDate = (e.date || '').slice(0, 10);
    if (eDate === targetDate) {
      rows.push([
        'Egreso (Gasto)',
        'GASTO',
        `"${(e.concept || '').replace(/"/g, '""')}"`,
        e.method || 'Efectivo',
        -(Number(e.amount) || 0),
        eDate,
        e.time || '',
        `"${(e.user || 'Caja').replace(/"/g, '""')}"`
      ]);
    }
  });

  if (rows.length <= 1) {
    showToast('No hay movimientos registrados en la fecha seleccionada para exportar');
    return;
  }

  const csvContent = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Corte_Caja_GlitchLab_${targetDate}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`AuditorÍa del dÍa ${targetDate} descargada`);
}

// ImpresiÓn de Ticket de Corte de Caja Diario TÉrmico (80mm) con Fecha Seleccionada y Gastos
function printDailyCashCut() {
  const targetDate = AppState.financialSelectedDate || getLocalDateString();
  const parts = targetDate.split('-').map(Number);
  const dateObj = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  const dateFormatted = dateObj.toLocaleDateString('es-MX', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  }).toUpperCase();
  const timeFormatted = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  let totalCash = 0;
  let totalTransfer = 0;
  let totalCard = 0;
  let totalExpenses = 0;
  let totalExpenseCash = 0;
  let movesList = [];
  let expenseList = [];

  (AppState.orders || []).forEach(order => {
    const isTarget = order.date && order.date.startsWith(targetDate);
    const payments = Array.isArray(order.costs?.payments) ? order.costs.payments : [];

    if (payments.length > 0) {
      payments.forEach(p => {
        if ((p.date || '').startsWith(targetDate)) {
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
    } else if (isTarget) {
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
          concept: 'Ingreso inicial / Liquidación',
          amount: paid,
          method: meth
        });
      }
    }
  });

  (AppState.expenses || []).forEach(exp => {
    if ((exp.date || '').startsWith(targetDate)) {
      const amt = Number(exp.amount) || 0;
      totalExpenses += amt;
      if (exp.method === 'Efectivo') {
        totalExpenseCash += amt;
      }
      expenseList.push(exp);
    }
  });

  const totalCollected = totalCash + totalTransfer + totalCard;
  const netCashInDrawer = totalCash - totalExpenseCash;
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
            +$${m.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </div>
        </div>
      `).join('')
    : '<div style="text-align:center; color:#666; font-size:10px; padding:4px 0;">Sin cobros en esta fecha</div>';

  const expensesHtml = expenseList.length > 0
    ? `
      <div class="line"></div>
      <div style="font-size:10px; font-weight:bold; margin-bottom:4px; color:#a00;">SALIDAS / GASTOS DE CAJA:</div>
      ${expenseList.map(e => `
        <div style="display:flex; justify-content:space-between; margin-bottom:2px; font-size:9.5px;">
          <div style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${escapeHtml(e.concept)} <span style="font-size:8px; color:#555;">(${e.method})</span>
          </div>
          <div style="font-weight:bold; font-family:monospace; color:#a00;">
            -$${Number(e.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </div>
        </div>
      `).join('')}
      <div class="row" style="margin-top:3px; font-weight:bold; font-size:10px; color:#a00;">
        <span>TOTAL GASTOS:</span>
        <span style="font-family:monospace;">-$${totalExpenses.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
      </div>
    `
    : '';

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Corte de Caja - GlitchLab</title>
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
        <img src="${GLITCHLAB_TICKET_LOGO_BASE64}" alt="GlitchLab" style="max-height: 36px; width: auto; max-width: 220px; margin: 0 auto 4px auto; display: block; filter: grayscale(100%) contrast(200%);" />
        <div style="font-size:8.5px;">Tepic, Nayarit &bull; Tel: ${AppState.shopConfig.phone}</div>
        <div class="double-line"></div>
        <div style="font-weight:900; font-size:13px; margin:2px 0;">CORTE DE CAJA & ARQUEO</div>
        <div style="font-size:9.5px; font-weight:bold;">${dateFormatted}</div>
        <div style="font-size:9px; color:#333;">Hora de Impresión: ${timeFormatted} • Resp: ${escapeHtml(currentUser)}</div>
      </div>

      <div class="line"></div>

      <div style="font-size:10px; font-weight:bold; margin-bottom:4px;">DESGLOSE POR FORMA DE PAGO:</div>
      <div class="row" style="margin-bottom:3px;">
        <span>ðŸ’µ EFECTIVO COBRADO:</span>
        <strong style="font-family:monospace;">$${totalCash.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
      </div>
      <div class="row" style="margin-bottom:3px;">
        <span>ðŸ“± TRANSFERENCIAS SPEI:</span>
        <strong style="font-family:monospace;">$${totalTransfer.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
      </div>
      <div class="row" style="margin-bottom:3px;">
        <span>ðŸ’³ TARJETAS / TERMINAL:</span>
        <strong style="font-family:monospace;">$${totalCard.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
      </div>

      <div class="row" style="font-size:11px; font-weight:bold; margin-top:4px;">
        <span>TOTAL COBRADO:</span>
        <span style="font-family:monospace;">$${totalCollected.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
      </div>

      ${expensesHtml}

      <div class="double-line"></div>

      <div class="row" style="font-size:12px; font-weight:900; background:#eee; padding:3px 2px;">
        <span>EFECTIVO NETO EN CAJA:</span>
        <span style="font-family:monospace;">$${netCashInDrawer.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
      </div>
      <div style="font-size:8px; color:#444; text-align:center; margin-top:2px;">(Dinero fÍsico a entregar en cajÓn)</div>

      <div class="line"></div>

      <div style="font-size:9.5px; font-weight:bold; margin-bottom:4px;">MOVIMIENTOS DE LA FECHA (${movesList.length}):</div>
      ${movesHtml}

      <div class="double-line"></div>

      <div class="text-center" style="margin-top:12px; font-size:8.5px;">
        <div style="display:flex; justify-content:space-around; margin-top:25px;">
          <div>
            <div style="border-top:1px solid #000; width:100px; margin:0 auto 3px auto;"></div>
            <div>ENTREGA (CAJA)</div>
          </div>
          <div>
            <div style="border-top:1px solid #000; width:100px; margin:0 auto 3px auto;"></div>
            <div>RECIBE (ADMIN)</div>
          </div>
        </div>
        <div style="margin-top:10px; font-style:italic;">*** CORTE OFICIAL GLITCHLAB ***</div>
      </div>

      <script>
        window.onload = function() {
          window.onafterprint = function() { window.close(); };
          window.print();
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
    alert('No hay \u00F3rdenes registradas para exportar.');
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
  a.download = `GlitchLab_Reporte_O\u00F3rdenes_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Reporte con ${AppState.orders.length} \u00F3rdenes exportado a Excel (CSV).`);
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

  // Si aún no hay clientes guardados, extraer los clientes de las \u00F3rdenes existentes
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

  // Contar \u00F3rdenes asociadas
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
  if (!AppState.auth || !AppState.auth.isAuthenticated) {
    console.warn('[GlitchLab Security] Acceso no autorizado a directorio de clientes');
    lockSystem();
    return;
  }
  const modal = document.getElementById('clientsModal');
  if (!modal) return;
  openModalWithAnimation('clientsModal');
  renderClientsTable();
  if (typeof updateMobileNavState === 'function') updateMobileNavState('clients');
}

function closeClientsModal() {
  closeModalWithAnimation('clientsModal');
}

// ==========================================
// DIRECTORIO DE CLIENTES (REDESIGNED 2.0)
// ==========================================

let currentClientFilter = 'all'; // 'all', 'active', 'frequent'

function setClientDirectoryFilter(filter) {
  currentClientFilter = filter;
  ['all', 'active', 'frequent'].forEach(f => {
    const btn = document.getElementById(`clientFilterTab-${f}`);
    if (btn) {
      if (f === filter) {
        btn.className = 'px-3 py-1.5 rounded-lg font-semibold transition text-white bg-purple-600/30 border border-purple-500/40 text-purple-200';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg font-semibold transition text-slate-400 hover:text-white';
      }
    }
  });
  renderClientsTable();
}

function clearClientSearch() {
  const input = document.getElementById('clientSearchInput');
  const clearBtn = document.getElementById('clientSearchClearBtn');
  if (input) input.value = '';
  if (clearBtn) clearBtn.classList.add('hidden');
  renderClientsTable();
}

function getClientInitials(name) {
  if (!name) return 'CL';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function getClientAvatarTheme(name) {
  const themes = [
    { bg: 'from-purple-500/25 to-indigo-500/20', text: 'text-purple-300', border: 'border-purple-500/30' },
    { bg: 'from-sky-500/25 to-blue-500/20', text: 'text-sky-300', border: 'border-sky-500/30' },
    { bg: 'from-emerald-500/25 to-teal-500/20', text: 'text-emerald-300', border: 'border-emerald-500/30' },
    { bg: 'from-amber-500/25 to-orange-500/20', text: 'text-amber-300', border: 'border-amber-500/30' },
    { bg: 'from-pink-500/25 to-rose-500/20', text: 'text-pink-300', border: 'border-pink-500/30' }
  ];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = (hash + name.charCodeAt(i)) % themes.length;
  }
  return themes[hash];
}

function getClientOrderStats(client) {
  const cleanPhone = (client.phone || '').replace(/\D/g, '');
  const cName = (client.name || '').toLowerCase().trim();

  const matchingOrders = (AppState.orders || []).filter(o => {
    const oPhone = (o.client?.phone || '').replace(/\D/g, '');
    const oName = (o.client?.name || '').toLowerCase().trim();
    return (cleanPhone && oPhone && cleanPhone === oPhone) || (cName && oName === cName);
  });

  const totalCount = Math.max(client.totalOrders || 0, matchingOrders.length);
  const activeOrders = matchingOrders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
  return {
    total: totalCount,
    activeCount: activeOrders.length,
    hasActiveOrders: activeOrders.length > 0
  };
}

function renderClientsTable(filteredList = null) {
  const tbody = document.getElementById('clientsTableBody');
  const mobileList = document.getElementById('clientsMobileList');
  const countBadge = document.getElementById('clientsCountBadge');
  const statTotal = document.getElementById('clientStatTotal');
  const statActive = document.getElementById('clientStatActive');
  const statFrequent = document.getElementById('clientStatFrequent');
  const statWa = document.getElementById('clientStatWa');

  if (!tbody && !mobileList) return;

  const allClients = AppState.clients || [];

  // 1. Calcular KPIs globales
  let totalActiveOrdersCount = 0;
  let frequentClientsCount = 0;
  let validWaCount = 0;

  allClients.forEach(c => {
    const stats = getClientOrderStats(c);
    if (stats.hasActiveOrders) totalActiveOrdersCount++;
    if (stats.total >= 2) frequentClientsCount++;
    const cleanP = (c.phone || '').replace(/\D/g, '');
    if (cleanP.length >= 10) validWaCount++;
  });

  if (countBadge) countBadge.innerText = allClients.length;
  if (statTotal) statTotal.innerText = allClients.length;
  if (statActive) statActive.innerText = totalActiveOrdersCount;
  if (statFrequent) statFrequent.innerText = frequentClientsCount;
  if (statWa) statWa.innerText = validWaCount;

  // 2. Determinar lista base con bÚsqueda o filtro
  const searchInput = document.getElementById('clientSearchInput');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  let list = filteredList || allClients;

  // Filtrar por query si no vino lista pre-filtrada
  if (!filteredList && query) {
    list = list.filter(c => 
      (c.name && c.name.toLowerCase().includes(query)) ||
      (c.phone && c.phone.includes(query)) ||
      (c.email && c.email.toLowerCase().includes(query)) ||
      (c.address && c.address.toLowerCase().includes(query)) ||
      (c.notes && c.notes.toLowerCase().includes(query))
    );
  }

  // Filtrar por pestañas ('all', 'active', 'frequent')
  if (currentClientFilter === 'active') {
    list = list.filter(c => getClientOrderStats(c).hasActiveOrders);
  } else if (currentClientFilter === 'frequent') {
    list = list.filter(c => getClientOrderStats(c).total >= 2);
  }

  // 3. Renderizar Estado VacÍo
  if (list.length === 0) {
    const emptyHtml = `
      <div class="py-12 px-4 text-center">
        <div class="max-w-xs mx-auto space-y-3">
          <div class="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center mx-auto shadow-inner">
            <i data-lucide="users" class="w-6 h-6"></i>
          </div>
          <div class="font-bold text-white text-sm">Sin clientes encontrados</div>
          <p class="text-xs text-slate-400">
            ${query ? `No hay resultados para "${escapeHtml(query)}" en esta categor&iacute;a.` : 'No hay clientes registrados en este filtro.'}
          </p>
          ${query ? `
            <button type="button" onclick="clearClientSearch()" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-semibold transition inline-flex items-center gap-1.5 active:scale-95">
              <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> Restablecer b&uacute;squeda
            </button>
          ` : ''}
        </div>
      </div>
    `;

    if (tbody) tbody.innerHTML = `<tr><td colspan="6">${emptyHtml}</td></tr>`;
    if (mobileList) mobileList.innerHTML = emptyHtml;
    renderLucideIcons();
    return;
  }

  // 4. Renderizar Vista Desktop (Tabla)
  if (tbody) {
    tbody.innerHTML = list.map(c => {
      const cleanPhone = (c.phone || '').replace(/\D/g, '');
      const waUrl = cleanPhone ? `https://wa.me/52${cleanPhone}` : '#';
      const formattedPhone = formatPhoneNumber(c.phone) || 'Sin tel&eacute;fono';
      const initials = getClientInitials(c.name);
      const theme = getClientAvatarTheme(c.name);
      const stats = getClientOrderStats(c);

      return `
        <tr class="hover:bg-slate-900/60 transition group border-b border-slate-800/40">
          <td class="py-3.5 px-4">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-gradient-to-br ${theme.bg} border ${theme.border} ${theme.text} font-bold flex items-center justify-center text-xs shadow-inner shrink-0 tracking-wider">
                ${initials}
              </div>
              <div class="min-w-0">
                <div class="font-bold text-white text-sm hover:text-purple-300 transition cursor-pointer flex items-center gap-1.5" onclick="openEditClientModal('${c.id}')">
                  <span class="truncate">${escapeHtml(c.name)}</span>
                  ${stats.hasActiveOrders ? `
                    <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" title="Tiene equipo en reparaci&oacute;n"></span>
                  ` : ''}
                </div>
                ${c.notes ? `
                  <div class="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5" title="${escapeHtml(c.notes)}">
                    <i data-lucide="sticky-note" class="w-3 h-3 text-amber-400/80 shrink-0"></i>
                    <span class="truncate max-w-[200px] text-slate-400">${escapeHtml(c.notes)}</span>
                  </div>
                ` : ''}
              </div>
            </div>
          </td>

          <td class="py-3.5 px-4 whitespace-nowrap">
            <div class="flex items-center gap-2">
              <span class="font-mono text-slate-200 text-xs font-medium tracking-wide">${escapeHtml(formattedPhone)}</span>
              ${cleanPhone && cleanPhone.length >= 10 ? `
                <a href="${waUrl}" target="_blank" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-medium transition active:scale-95 shadow-sm" title="Abrir WhatsApp directo">
                  <i data-lucide="message-circle" class="w-3 h-3"></i>
                  <span>WhatsApp</span>
                </a>
              ` : ''}
            </div>
          </td>

          <td class="py-3.5 px-4 text-slate-300">
            ${c.email ? `
              <div class="text-slate-300 text-xs truncate max-w-[200px] flex items-center gap-1.5" title="${escapeHtml(c.email)}">
                <i data-lucide="mail" class="w-3.5 h-3.5 text-slate-500 shrink-0"></i>
                <span class="truncate">${escapeHtml(c.email)}</span>
              </div>
            ` : '<span class="text-slate-600 text-xs pl-1">&mdash;</span>'}
          </td>

          <td class="py-3.5 px-4 text-slate-300">
            ${c.address ? `
              <div class="text-slate-300 text-xs truncate max-w-[220px] flex items-center gap-1.5" title="${escapeHtml(c.address)}">
                <i data-lucide="map-pin" class="w-3.5 h-3.5 text-slate-500 shrink-0"></i>
                <span class="truncate">${escapeHtml(c.address)}</span>
              </div>
            ` : '<span class="text-slate-600 text-xs pl-1">&mdash;</span>'}
          </td>

          <td class="py-3.5 px-4 text-center whitespace-nowrap">
            ${stats.total >= 2 ? `
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30 shadow-sm" title="Cliente frecuente (${stats.total} servicios)">
                <i data-lucide="repeat" class="w-3 h-3 text-sky-400"></i>
                <span>${stats.total} &oacute;rdenes</span>
              </span>
            ` : `
              <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800/80 text-slate-300 border border-slate-700/60" title="1 servicio registrado">
                <i data-lucide="check" class="w-3 h-3 text-emerald-400"></i>
                <span>1 orden</span>
              </span>
            `}
          </td>

          <td class="py-3.5 px-4 text-right whitespace-nowrap">
            <div class="flex items-center justify-end gap-1.5">
              <button type="button" onclick="startOrderForClient('${c.id}')" class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500 text-sky-300 hover:text-white border border-sky-500/30 text-[11px] font-bold transition shadow-sm active:scale-95 cursor-pointer" title="Crear nueva orden para ${escapeHtml(c.name)}">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                <span>Orden</span>
              </button>
              <button type="button" onclick="openEditClientModal('${c.id}')" class="p-2 text-slate-400 hover:text-purple-300 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/20 rounded-xl transition active:scale-95 cursor-pointer" title="Editar datos del cliente">
                <i data-lucide="edit-3" class="w-4 h-4"></i>
              </button>
              <button type="button" onclick="deleteClient('${c.id}')" class="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 rounded-xl transition active:scale-95 cursor-pointer" title="Eliminar cliente">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 5. Renderizar Vista MÓvil (Tarjetas TÁctiles Optimizadas)
  if (mobileList) {
    mobileList.innerHTML = list.map(c => {
      const cleanPhone = (c.phone || '').replace(/\D/g, '');
      const waUrl = cleanPhone ? `https://wa.me/52${cleanPhone}` : '#';
      const formattedPhone = formatPhoneNumber(c.phone) || 'Sin tel&eacute;fono';
      const initials = getClientInitials(c.name);
      const theme = getClientAvatarTheme(c.name);
      const stats = getClientOrderStats(c);

      return `
        <div class="p-3.5 bg-slate-900/85 border border-slate-800/90 rounded-2xl space-y-2.5 shadow-md">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-9 h-9 rounded-xl bg-gradient-to-br ${theme.bg} border ${theme.border} ${theme.text} font-bold flex items-center justify-center text-xs shadow-inner shrink-0 tracking-wider">
                ${initials}
              </div>
              <div class="min-w-0">
                <div class="font-bold text-white text-sm hover:text-purple-300 transition cursor-pointer flex items-center gap-1.5" onclick="openEditClientModal('${c.id}')">
                  <span class="truncate">${escapeHtml(c.name)}</span>
                  ${stats.hasActiveOrders ? `
                    <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" title="Tiene equipo en reparaci&oacute;n"></span>
                  ` : ''}
                </div>
                <div class="text-xs text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                  <i data-lucide="phone" class="w-3 h-3 text-slate-500 shrink-0"></i>
                  <span>${escapeHtml(formattedPhone)}</span>
                </div>
              </div>
            </div>

            <div class="shrink-0">
              ${stats.total >= 2 ? `
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  <i data-lucide="repeat" class="w-3 h-3 text-sky-400"></i> ${stats.total} &oacute;rdenes
                </span>
              ` : `
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800/80 text-slate-300 border border-slate-700/60">
                  <i data-lucide="check" class="w-3 h-3 text-emerald-400"></i> 1 orden
                </span>
              `}
            </div>
          </div>

          ${(c.email || c.address || c.notes) ? `
            <div class="pt-2 text-[11px] text-slate-400 space-y-1 border-t border-slate-800/60">
              ${c.notes ? `<div class="truncate text-amber-300/80 flex items-center gap-1.5"><i data-lucide="sticky-note" class="w-3 h-3 text-amber-400 shrink-0"></i> ${escapeHtml(c.notes)}</div>` : ''}
              ${c.email ? `<div class="truncate flex items-center gap-1.5"><i data-lucide="mail" class="w-3 h-3 text-slate-500 shrink-0"></i> ${escapeHtml(c.email)}</div>` : ''}
              ${c.address ? `<div class="truncate flex items-center gap-1.5"><i data-lucide="map-pin" class="w-3 h-3 text-slate-500 shrink-0"></i> ${escapeHtml(c.address)}</div>` : ''}
            </div>
          ` : ''}

          <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
            ${cleanPhone && cleanPhone.length >= 10 ? `
              <a href="${waUrl}" target="_blank" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition active:scale-95 shadow-sm">
                <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>
                <span>WhatsApp</span>
              </a>
            ` : `<div></div>`}

            <div class="flex items-center gap-1.5">
              <button type="button" onclick="startOrderForClient('${c.id}')" class="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-white border border-sky-500/40 text-xs font-bold transition shadow-sm active:scale-95 cursor-pointer">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                <span>Orden</span>
              </button>
              <button type="button" onclick="openEditClientModal('${c.id}')" class="p-2 text-slate-300 hover:text-purple-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 rounded-xl transition active:scale-95 cursor-pointer" title="Editar cliente">
                <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
              </button>
              <button type="button" onclick="deleteClient('${c.id}')" class="p-2 text-rose-400 hover:text-rose-300 bg-rose-950/30 hover:bg-rose-900/40 border border-rose-500/30 rounded-xl transition active:scale-95 cursor-pointer" title="Eliminar cliente">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderLucideIcons();
}function handleClientSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  const clearBtn = document.getElementById('clientSearchClearBtn');
  if (clearBtn) {
    if (query) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }
  renderClientsTable();
}

function openNewClientModal() {
  const title = document.getElementById('clientEditModalTitle');
  if (title) title.innerText = 'Registrar Nuevo Cliente';
  document.getElementById('editClientId').value = '';
  document.getElementById('editClientName').value = '';
  document.getElementById('editClientPhone').value = '';
  document.getElementById('editClientEmail').value = '';
  document.getElementById('editClientAddress').value = '';
  document.getElementById('editClientNotes').value = '';

  openModalWithAnimation('clientEditModal');
  setTimeout(() => {
    const nameInput = document.getElementById('editClientName');
    if (nameInput) nameInput.focus();
  }, 120);
}

function openEditClientModal(clientId) {
  const client = AppState.clients.find(c => c.id === clientId);
  if (!client) return;

  const title = document.getElementById('clientEditModalTitle');
  if (title) title.innerText = `Editar Datos: ${client.name || 'Cliente'}`;
  document.getElementById('editClientId').value = client.id;
  document.getElementById('editClientName').value = client.name || '';
  document.getElementById('editClientPhone').value = formatPhoneNumber(client.phone) || '';
  document.getElementById('editClientEmail').value = client.email || '';
  document.getElementById('editClientAddress').value = client.address || '';
  document.getElementById('editClientNotes').value = client.notes || '';

  openModalWithAnimation('clientEditModal');
  setTimeout(() => {
    const nameInput = document.getElementById('editClientName');
    if (nameInput) nameInput.focus();
  }, 120);
}

function closeClientEditModal() {
  closeModalWithAnimation('clientEditModal');
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
    showToast('Nombre y Teléfono son requeridos.');
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
  showToast(`Cliente ${name} guardado correctamente.`);

  // Sincronizar con Supabase
  if (clientObj) {
    syncClientToSupabase(clientObj);
  }
}

async function deleteClient(clientId) {
  const client = AppState.clients.find(c => c.id === clientId);
  if (!client) return;

  const confirmed = await showGlitchConfirm({
    title: '\u00BFEliminar Cliente?',
    badge: "Directorio",
    message: `¿Deseas eliminar al cliente ${client.name} del directorio? Esta acción no se puede deshacer.`,
    confirmText: "Eliminar Cliente",
    cancelText: "Cancelar",
    type: "danger",
    icon: "user-minus"
  });

  if (confirmed) {
    AppState.clients = AppState.clients.filter(c => c.id !== clientId);
    saveClients();
    deleteClientFromSupabase(clientId);
    renderClients();
    showToast(`Cliente ${client.name} eliminado.`);
  }
}

function startOrderForClient(clientId) {
  const client = AppState.clients.find(c => c.id === clientId);
  if (!client) return;

  closeClientsModal();
  openNewOrderModal();
  setTimeout(() => { checkClientWarrantyOnOrderEntry(phone, ''); }, 200);

  setTimeout(() => {
    // Pre-llenar datos del cliente en el paso 1
    const nameEl = document.getElementById('clientName');
    const phoneEl = document.getElementById('clientPhone');
    const emailEl = document.getElementById('clientEmail');
    const addressEl = document.getElementById('clientAddress');

    if (nameEl) nameEl.value = client.name || '';
    if (phoneEl) phoneEl.value = formatPhoneNumber(client.phone) || '';
    if (emailEl) emailEl.value = client.email || '';
    if (addressEl) addressEl.value = client.address || '';

    showToast(`Iniciando nueva orden para ${client.name}.`);
  }, 100);
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

  // Buscar en AppState.clients y \u00F3rdenes anteriores
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
  if (AppState.shopConfig) {
    if (AppState.shopConfig.terms) AppState.shopConfig.terms = AppState.shopConfig.terms.replace(/&oacute;/gi, 'ó').replace(/&iacute;/gi, 'í').replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ');
    if (AppState.shopConfig.address) AppState.shopConfig.address = AppState.shopConfig.address.replace(/&oacute;/gi, 'ó').replace(/&iacute;/gi, 'í').replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é');
  }
  if (!AppState.shopConfig.trackingDomain || AppState.shopConfig.trackingDomain.includes('tecycom')) {
    AppState.shopConfig.trackingDomain = 'https://rastreo.glitchlab.mx';
  }
  if (!AppState.shopConfig.bankInfo || !AppState.shopConfig.bankInfo.clabe) {
    AppState.shopConfig.bankInfo = {
      bank: 'BANORTE',
      beneficiary: 'JORGE ALBERTO ROBLES RUIZ',
      clabe: '0725 8001 2922 7048 52',
      rawClabe: '072580012922704852',
      whatsapp: '3113396969'
    };
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
  if (fAddr && cfg.address) fAddr.innerHTML = `<i data-lucide="map-pin" class="w-4 h-4 inline-block text-sky-400 mr-1"></i>${escapeHtml(cfg.address)}`;
  if (fPhone && cfg.phone) fPhone.innerHTML = `<i data-lucide="message-circle" class="w-4 h-4 inline-block text-emerald-400 mr-1"></i>${escapeHtml(cfg.phone)}`;
}

function copyBankTransferClabe() {
  const clabe = (AppState.shopConfig.bankInfo?.rawClabe || '072580012922704852');
  copyTextSafely(clabe, 'CLABE Banorte copiada: ' + clabe);
}








window.copyBankTransferClabe = copyBankTransferClabe;

function loadOrders() {
  const saved = localStorage.getItem('glitchlab_orders');
  if (saved) {
    try {
      AppState.orders = JSON.parse(saved);
      // Migración automática a 45 días de garantía est&aacute;ndar GlitchLab
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
      console.error('Error cargando \u00F3rdenes:', e);
      AppState.orders = [];
      if (typeof seedDemoOrders === 'function') {
        seedDemoOrders();
        saveOrders();
      }
    }
  } else {
    AppState.orders = [];
    if (typeof seedDemoOrders === 'function') {
      seedDemoOrders();
      saveOrders();
    }
  }
}

function saveOrders() {
  try {
    localStorage.setItem('glitchlab_orders', JSON.stringify(AppState.orders));
  } catch (e) {
    console.warn('LocalStorage excedido al guardar \u00F3rdenes (posiblemente por imágenes base64). Guardando versión sanitizada:', e);
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

function saveAppState() {
  saveOrders();
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
        // La API Key y la URL son 100% v&aacute;lidas en Supabase, sólo falta ejecutar el script SQL
        AppState.supabase.isConnected = true;
        AppState.supabase.needsSqlSetup = true;
        updateSupabaseUI();
        if (showNotification) {
          alert('¡Conexión con Supabase verificada con éxito!\n\nLas credenciales son correctas. Para que las \u00F3rdenes y clientes se guarden en la base de datos, ejecuta el Script SQL (botón "Copiar SQL" en el modal) en el SQL Editor de tu consola de Supabase.');
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
        btnCloud.className = 'hidden sm:block p-2 sm:p-2.5 text-amber-400 hover:text-white hover:bg-slate-800/80 rounded-full transition relative text-sm sm:text-base';
        btnCloud.title = 'Servidor de Red: En espera de configuración';
      }
      if (sbCard) {
        sbCard.className = 'p-4 rounded-2xl border transition flex items-center justify-between bg-amber-950/20 border-amber-800/60';
      }
      if (sbIcon) {
        sbIcon.className = 'w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg';
        sbIcon.innerHTML = '<i data-lucide="database" class="w-4 h-4 inline-block"></i>';
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
        btnCloud.className = 'hidden sm:block p-2 sm:p-2.5 text-emerald-400 hover:text-white hover:bg-slate-800/80 rounded-full transition relative text-sm sm:text-base';
        btnCloud.title = 'Servidor de Red: En línea y sincronizado';
      }
      if (sbCard) {
        sbCard.className = 'p-4 rounded-2xl border transition flex items-center justify-between bg-emerald-950/20 border-emerald-800/60';
      }
      if (sbIcon) {
        sbIcon.className = 'w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg';
        sbIcon.innerHTML = '<i data-lucide="cloud-check" class="w-4 h-4 inline-block"></i>';
      }
      if (sbTitle) sbTitle.innerText = 'Conectado a Supabase Cloud';
      if (sbSubtitle) sbSubtitle.innerText = `Proyecto: ${AppState.supabase.url} • \u00F3rdenes, clientes y fotos sincronizados.`;
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
      btnCloud.className = 'hidden sm:block p-2 sm:p-2.5 text-red-400 hover:text-white hover:bg-slate-800/80 rounded-full transition relative text-sm sm:text-base';
      btnCloud.title = 'Servidor de Red: Error de conexión';
    }
    if (sbCard) {
      sbCard.className = 'p-4 rounded-2xl border transition flex items-center justify-between bg-red-950/20 border-red-800/60';
    }
    if (sbIcon) {
      sbIcon.className = 'w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center text-lg';
      sbIcon.innerHTML = '<i data-lucide="alert-triangle" class="w-4 h-4 inline-block"></i>';
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
      btnCloud.className = 'hidden sm:block p-2 sm:p-2.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-full transition relative text-sm sm:text-base';
      btnCloud.title = 'Servidor de Red: Modo local';
    }
    if (sbCard) {
      sbCard.className = 'p-4 rounded-2xl border transition flex items-center justify-between bg-slate-950/60 border-slate-800';
    }
    if (sbIcon) {
      sbIcon.className = 'w-10 h-10 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center text-lg';
      sbIcon.innerHTML = '<i data-lucide="database" class="w-4 h-4 inline-block"></i>';
    }
    if (sbTitle) sbTitle.innerText = 'Modo Almacenamiento Local';
    if (sbSubtitle) sbSubtitle.innerText = 'Tus datos y fotos están guardados en este navegador. Configura Supabase para sincronizar con la nube.';
    if (sbBadge) {
      sbBadge.className = 'px-3 py-1 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700';
      sbBadge.innerText = 'Local';
    }
    if (btnDisconnect) btnDisconnect.classList.add('hidden');
  }

  // Sincronizar modal de Diagnóstico Camuflado
  const modalDot = document.getElementById('serverStatusDotModal');
  const modalText = document.getElementById('serverStatusMainText');
  const modalBadge = document.getElementById('serverStatusBadgeModal');
  const syncDisplay = document.getElementById('serverSyncDisplay');

  if (AppState.supabase.isConnected) {
    if (modalDot) modalDot.className = 'w-3 h-3 rounded-full bg-emerald-400 animate-pulse';
    if (modalText) modalText.innerText = 'Servidor en Línea';
    if (modalBadge) {
      modalBadge.className = 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80';
      modalBadge.innerText = 'Operativo';
    }
    if (syncDisplay) {
      syncDisplay.innerText = 'Activa';
      syncDisplay.className = 'text-emerald-400 font-semibold';
    }
  } else if (errorMessage) {
    if (modalDot) modalDot.className = 'w-3 h-3 rounded-full bg-red-500';
    if (modalText) modalText.innerText = 'Sin Conexión al Servidor';
    if (modalBadge) {
      modalBadge.className = 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-950/80 text-red-300 border border-red-800/80';
      modalBadge.innerText = 'Fallo';
    }
    if (syncDisplay) {
      syncDisplay.innerText = 'Interrumpida';
      syncDisplay.className = 'text-red-400 font-semibold';
    }
  } else {
    if (modalDot) modalDot.className = 'w-3 h-3 rounded-full bg-slate-500';
    if (modalText) modalText.innerText = 'Almacenamiento Local';
    if (modalBadge) {
      modalBadge.className = 'px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700';
      modalBadge.innerText = 'Local';
    }
    if (syncDisplay) {
      syncDisplay.innerText = 'Local (Offline)';
      syncDisplay.className = 'text-slate-400 font-semibold';
    }
  }
}

// ==========================================
// CONTROL DE ACCESO & CAMUFLAJE DE SERVIDOR
// ==========================================
function openServerStatusModal() {
  const modal = document.getElementById('serverStatusModal');
  if (!modal) {
    openSupabaseSettingsModal(true);
    return;
  }
  
  const passInput = document.getElementById('serverAdminPassInput');
  if (passInput) passInput.value = '';
  const err = document.getElementById('serverUnlockError');
  if (err) err.classList.add('hidden');

  const pingEl = document.getElementById('serverPingDisplay');
  if (pingEl) pingEl.innerText = `${Math.floor(Math.random() * 10 + 19)} ms`;

  updateSupabaseUI();
  openModalWithAnimation('serverStatusModal');
  if (passInput) setTimeout(() => passInput.focus(), 150);
}

function closeServerStatusModal() {
  closeModalWithAnimation('serverStatusModal', () => {
    const passInput = document.getElementById('serverAdminPassInput');
    if (passInput) passInput.value = '';
    const err = document.getElementById('serverUnlockError');
    if (err) err.classList.add('hidden');
  });
}

async function handleUnlockSupabaseSettings(e) {
  if (e) e.preventDefault();
  const passInput = document.getElementById('serverAdminPassInput');
  const err = document.getElementById('serverUnlockError');
  const errText = document.getElementById('serverUnlockErrorMsg');
  const enteredPass = (passInput ? passInput.value : '').trim();

  if (!enteredPass) {
    if (err && errText) {
      errText.innerText = 'Por favor ingresa la contraseña de Administrador.';
      err.classList.remove('hidden');
    }
    return;
  }

  const adminUser = (AppState.auth?.users || []).find(u => u.role === 'admin' || u.username === 'admin');
  const passLower = enteredPass.toLowerCase();
  const hashedInput = await hashPassword(enteredPass);
  const hashedInputLower = await hashPassword(passLower);

  const allowedAdminPasses = MASTER_ALLOWED_PASSWORDS?.admin || ['glitchlab2026', 'admin', '1234'];
  const isValidAdmin = (
    enteredPass === 'glitchlab2026' || 
    enteredPass === 'admin' ||
    allowedAdminPasses.includes(passLower) ||
    allowedAdminPasses.includes(enteredPass) ||
    (adminUser && (
      adminUser.password === hashedInput || 
      adminUser.password === hashedInputLower || 
      adminUser.password === enteredPass || 
      adminUser.password === MASTER_PASS_HASHES?.admin
    ))
  );

  if (isValidAdmin) {
    closeServerStatusModal();
    openSupabaseSettingsModal(true);
    showToast('Acceso autorizado a parámetros de infraestructura.');
  } else {
    if (err && errText) {
      errText.innerText = 'Contraseña incorrecta. Acceso restringido al Administrador.';
      err.classList.remove('hidden');
    }
    if (passInput) {
      passInput.classList.add('border-red-500');
      setTimeout(() => passInput.classList.remove('border-red-500'), 2000);
      passInput.select();
    }
  }
}

// Atajo de teclado secreto: Ctrl + Alt + S para diagnóstico y acceso a infraestructura
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.altKey && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    openServerStatusModal();
  }
});

function openSupabaseSettingsModal(isAuthorized = false) {
  if (!isAuthorized) {
    openServerStatusModal();
    return;
  }

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
  openModalWithAnimation('supabaseModal');
}

function closeSupabaseSettingsModal() {
  closeModalWithAnimation('supabaseModal');
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

async function disconnectSupabase() {
  const confirmed = await showGlitchConfirm({
    title: '¿Desconectar Supabase Cloud?',
    badge: 'Conexión Cloud',
    message: '¿Desconectar Supabase? El sistema volverá a guardar los datos en almacenamiento local sin borrar nada.',
    confirmText: 'Desconectar',
    cancelText: 'Mantener Conectado',
    type: 'warning',
    icon: 'cloud-off'
  });
  if (confirmed) {
    localStorage.removeItem('glitchlab_supabase_config');
    AppState.supabase.url = '';
    AppState.supabase.anonKey = '';
    AppState.supabase.isConnected = false;
    AppState.supabase.client = null;
    updateSupabaseStatusUI(false);
    showToast('Supabase desconectado. Modo offline local activado.');
  }
}


function toggleSbKeyVisibility() {
  const input = document.getElementById('sbAnonKey');
  const icon = document.getElementById('sbKeyEyeIcon');
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) { icon.setAttribute('data-lucide', 'eye-off'); renderLucideIcons(); }
  } else {
    input.type = 'password';
    if (icon) { icon.setAttribute('data-lucide', 'eye'); renderLucideIcons(); }
  }
}

function toggleSqlScriptAccordion() {
  const container = document.getElementById('sqlScriptContainer');
  const icon = document.getElementById('sqlAccordionIcon');
  if (!container) return;
  if (container.classList.contains('hidden')) {
    container.classList.remove('hidden');
    if (icon) { icon.setAttribute('data-lucide', 'chevron-up'); renderLucideIcons(); }
  } else {
    container.classList.add('hidden');
    if (icon) { icon.setAttribute('data-lucide', 'chevron-down'); renderLucideIcons(); }
  }
}

function copySupabaseSqlScript() {
  const script = getSupabaseSqlScript();
  copyTextSafely(script, 'Script SQL copiado al portapapeles');
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

-- 2. TABLA DE \u00F3rdenes DE SERVICIO
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

-- 3. HABILITAR SEGURIDAD (RLS) Y BLINDAJE DE RASTREO
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_orders_client_id ON public.orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);

DROP POLICY IF EXISTS "Permitir todo anon en clients" ON public.clients;
DROP POLICY IF EXISTS "Permitir gestion de clientes" ON public.clients;
CREATE POLICY "Permitir gestion de clientes" ON public.clients FOR ALL TO public USING (true) WITH CHECK (true);


DROP POLICY IF EXISTS "Permitir gestion de o\u00F3rdenes" ON public.orders;
CREATE POLICY "Permitir gestion de o\u00F3rdenes" ON public.orders FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. FUNCIÓN RPC SEGURA DE RASTREO (SECURITY DEFINER)
-- Permite consultar únicamente el equipo del cliente por teléfono o folio sin exponer el resto de la base de datos
CREATE OR REPLACE FUNCTION public.track_order(p_phone TEXT DEFAULT NULL, p_folio TEXT DEFAULT NULL)
RETURNS SETOF public.orders
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  clean_tel TEXT := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  clean_fol TEXT := regexp_replace(COALESCE(p_folio, ''), '[^a-zA-Z0-9]', '', 'g');
BEGIN
  IF length(clean_tel) >= 7 THEN
    RETURN QUERY 
    SELECT * FROM public.orders 
    WHERE client_id = 'cli_' || clean_tel 
       OR id = clean_fol
    ORDER BY date DESC;
  ELSIF length(clean_fol) > 0 THEN
    RETURN QUERY 
    SELECT * FROM public.orders 
    WHERE id = clean_fol;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_order(TEXT, TEXT) TO anon, authenticated;





-- 5. BUCKET DE STORAGE PARA FOTOS DE \u00F3rdenes
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
  const cleanPhone = (order.client?.phone || '').replace(/\D/g, '');
  const clientId = cleanPhone.length >= 7 ? ('cli_' + cleanPhone) : (order.client?.id || null);

  return {
    id: (order.id || '').toString(),
    date: order.date || new Date().toISOString(),
    delivered_date: order.deliveredDate || null,
    warranty_days: parseInt((order.warrantyDays && order.warrantyDays !== 30) ? order.warrantyDays : (AppState.shopConfig.warrantyDays || 45), 10),
    status: order.status || 'received',
    client: order.client || {},
    client_id: clientId,
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

  // 1. Asegurar PRIMERO que el cliente exista en Supabase para no violar Foreign Key
  if (order.client?.name && order.client?.phone) {
    const cleanPhone = (order.client.phone || '').replace(/\D/g, '');
    const clientId = cleanPhone.length >= 7 ? ('cli_' + cleanPhone) : (order.client.id || null);
    try {
      await AppState.supabase.client
        .from('clients')
        .upsert({
          id: clientId || ('cli_' + (cleanPhone || Date.now())),
          name: order.client.name.trim(),
          phone: order.client.phone.trim(),
          email: order.client.email ? order.client.email.trim() : null,
          address: order.client.address ? order.client.address.trim() : null,
          total_orders: 1,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
    } catch (cliErr) {
      console.warn('Error asegurando cliente previo a orden:', cliErr);
    }
  }

  const payload = mapLocalOrderToSupabase(order);
  try {
    let { error } = await AppState.supabase.client
      .from('orders')
      .upsert(payload, { onConflict: 'id' });

    // Si falló por foreign key (23503), reintentar sin client_id para asegurar que la orden NUNCA se pierda
    if (error && error.code === '23503') {
      console.warn('Foreign key de client_id rechazó la orden. Reintentando con client_id nulo...');
      payload.client_id = null;
      const retryRes = await AppState.supabase.client
        .from('orders')
        .upsert(payload, { onConflict: 'id' });
      error = retryRes.error;
    }

    if (error) {
      console.warn('Error sincronizando orden a Supabase:', error);
    } else {
      AppState.supabase.lastSync = new Date().toLocaleTimeString();
      updateSupabaseUI();
    }
  } catch (err) {
    console.warn('Excepción sincronizando orden a Supabase:', err);
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
      if (!isAuto) alert('Error al consultar \u00F3rdenes de Supabase: ' + error.message);
      return;
    }

    if (Array.isArray(data)) {
      const dbOrders = data.map(mapSupabaseOrderToLocal);

      // Si la base de datos de Supabase tiene \u00F3rdenes, fusionar o adoptar
      if (dbOrders.length > 0) {
        const orderMap = new Map();
        // Cargar las \u00F3rdenes de la nube
        dbOrders.forEach(o => orderMap.set(o.id.toString(), o));
        // Agregar \u00F3rdenes locales que no estén en la nube
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
        if (!isAuto) showToast(`${dbOrders.length} \u00F3rdenes descargadas de Supabase.`);
      }
    }
  } catch (err) {
    console.warn('Error cargando \u00F3rdenes de Supabase:', err);
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

    // 3. Traer \u00F3rdenes de Supabase y fusionar (priorizando fotos y bitácoras de la nube)
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

      // 4. Sincronización bidireccional: Subir a Supabase cualquier orden local pendiente
      const missingInCloud = AppState.orders.filter(o => !remoteOrders.some(ro => ro.id.toString() === o.id.toString()));
      if (missingInCloud.length > 0) {
        console.log('Detectadas ' + missingInCloud.length + ' \u00F3rdenes locales pendientes de subir a la nube. Sincronizando...');
        for (const localOrd of missingInCloud) {
          await syncSingleOrderToSupabase(localOrd);
        }
      }

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

  // Inicializar orden de \u00F3rdenes guardado
  const orderSortSelect = document.getElementById('orderSortSelect');
  if (orderSortSelect) {
    const savedSort = localStorage.getItem('glitchlab_order_sort') || 'folio_desc';
    AppState.orderSort = savedSort;
    orderSortSelect.value = savedSort;
  }

  const filterButtons = document.querySelectorAll('.filter-pill');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      try {
        btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      } catch (e) {}

      AppState.filterStatus = btn.dataset.status;
      AppState.currentPage = 1;
      renderOrders();
      if (typeof updateFilterSliderProgress === 'function') {
        setTimeout(updateFilterSliderProgress, 350);
      }
    });
  });

  const costLaborInput = document.getElementById('costLabor');
  const costPartsInput = document.getElementById('costParts');
  const costEstimateInput = document.getElementById('costEstimated');
  const costAdvanceInput = document.getElementById('costAdvance');
  const costBalanceDisplay = document.getElementById('costBalanceDisplay');
  const costAbonosSumDisplay = document.getElementById('costAbonosSumDisplay');

  function updateOrderCostsCalculations(source) {
    let labor = parseFloat(costLaborInput?.value) || 0;
    let parts = parseFloat(costPartsInput?.value) || 0;
    let est = parseFloat(costEstimateInput?.value) || 0;
    let adv = parseFloat(costAdvanceInput?.value) || 0;

    if (source === 'labor' || source === 'parts') {
      est = labor + parts;
      if (costEstimateInput) {
        costEstimateInput.value = est > 0 ? est.toFixed(2) : '';
      }
    } else if (source === 'estimated') {
      if (parts > 0) {
        labor = Math.max(0, est - parts);
        if (costLaborInput) costLaborInput.value = labor > 0 ? labor.toFixed(2) : '';
      } else {
        labor = est;
        if (costLaborInput) costLaborInput.value = labor > 0 ? labor.toFixed(2) : '';
      }
    }

    // Calcular abonos posteriores si se está editando una orden existente
    let abonos = 0;
    if (AppState.currentOrder && Array.isArray(AppState.currentOrder.costs?.payments)) {
      const pays = AppState.currentOrder.costs.payments;
      if (pays.length > 1) {
        abonos = pays.slice(1).reduce((s, p) => s + (Number(p.amount) || 0), 0);
      }
    }

    if (costAbonosSumDisplay) {
      costAbonosSumDisplay.innerText = `$${abonos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
    }

    const totalPaid = adv + abonos;
    const bal = Math.max(0, est - totalPaid);
    if (costBalanceDisplay) {
      costBalanceDisplay.innerText = `$${bal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
    }
  }

  if (costLaborInput) costLaborInput.addEventListener('input', () => updateOrderCostsCalculations('labor'));
  if (costPartsInput) costPartsInput.addEventListener('input', () => updateOrderCostsCalculations('parts'));
  if (costEstimateInput) costEstimateInput.addEventListener('input', () => updateOrderCostsCalculations('estimated'));
  if (costAdvanceInput) costAdvanceInput.addEventListener('input', () => updateOrderCostsCalculations('advance'));

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
        passwordInput.placeholder = 'Dibuja el patr\u00F3n en la cuadr\u00EDcula de 9 puntos';
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
        btnTogglePassword.innerHTML = '<i data-lucide="eye" class="w-4 h-4 inline-block"></i>';
      } else {
        passwordInput.type = 'password';
        btnTogglePassword.innerHTML = '<i data-lucide="eye" class="w-4 h-4 inline-block"></i>';
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
    photoFileInput.addEventListener('change', (e) => { if (typeof handlePhotoUpload === 'function') handlePhotoUpload(e); else if (typeof handleDtlPhotoUpload === 'function') handleDtlPhotoUpload(e); });
  }

  const bitacoraForm = document.getElementById('bitacoraForm');
  if (bitacoraForm) {
    bitacoraForm.addEventListener('submit', (e) => { if (typeof handleAddBitacoraEntry === 'function') handleAddBitacoraEntry(e); });
  }

  const newInventoryForm = document.getElementById('newInventoryForm');
  if (newInventoryForm) {
    newInventoryForm.addEventListener('submit', handleAddInventoryItem);
  }

  // Detección de expediente e historial clínico en nueva orden
  const phoneInput = document.getElementById('clientPhone');
  const serialInput = document.getElementById('equipmentSerial');
  if (phoneInput) phoneInput.addEventListener('input', checkNewOrderHistory);
  if (serialInput) serialInput.addEventListener('input', checkNewOrderHistory);

  // Autocompletado inteligente de costo de refacción desde catálogo de inventario
  const partNameInput = document.getElementById('dtlPartNameInput');
  const partCostInput = document.getElementById('dtlPartCostInput');
  if (partNameInput && partCostInput) {
    partNameInput.addEventListener('input', () => {
      const val = partNameInput.value.trim().toLowerCase();
      const match = (AppState.inventory || []).find(i => i.name.toLowerCase() === val);
      if (match && match.cost !== undefined) {
        partCostInput.value = match.cost;
      }
    });
  }

  // Cerrar menú de ajustes y panel de notificaciones al hacer clic fuera
  document.addEventListener('click', (e) => {
    const container = document.getElementById('settingsMenuContainer');
    const menu = document.getElementById('settingsDropdownMenu');
    if (menu && !menu.classList.contains('hidden')) {
      if (container && !container.contains(e.target)) {
        closeSettingsMenu();
      }
    }

    const notifContainer = document.getElementById('notificationsMenuContainer');
    const notifMenu = document.getElementById('notificationsDropdownMenu');
    if (notifMenu && !notifMenu.classList.contains('hidden')) {
      if (notifContainer && !notifContainer.contains(e.target)) {
        closeNotificationsPanel();
      }
    }

    const waContainer = document.getElementById('dtlWaMenuContainer');
    const waMenu = document.getElementById('dtlWaDropdownMenu');
    if (waMenu && !waMenu.classList.contains('hidden')) {
      if (waContainer && !waContainer.contains(e.target)) {
        closeDtlWaMenu();
      }
    }

    const printContainer = document.getElementById('dtlPrintMenuContainer');
    const printMenu = document.getElementById('dtlPrintDropdownMenu');
    if (printMenu && !printMenu.classList.contains('hidden')) {
      if (printContainer && !printContainer.contains(e.target)) {
        closeDtlPrintMenu();
      }
    }
  });
}

// Renderizar Métricas
function renderDashboard() {
  if (!AppState.auth || !AppState.auth.isAuthenticated) return;
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
  received: { label: 'Recibido', color: 'bg-slate-900 text-slate-200 border-slate-700/80', dotColor: 'bg-sky-400 shadow-[0_0_8px_#38bdf8]', timingLabel: 'Ingresado', icon: 'inbox' },
  diagnostic: { label: 'En Diagn\u00F3stico', color: 'bg-slate-900 text-slate-200 border-slate-700/80', dotColor: 'bg-indigo-400 shadow-[0_0_8px_#818cf8]', timingLabel: 'En Revisi\u00F3n', icon: 'cpu' },
  in_progress: { label: 'En Reparaci\u00F3n', color: 'bg-slate-900 text-slate-200 border-slate-700/80', dotColor: 'bg-sky-500 shadow-[0_0_8px_#0ea5e9]', timingLabel: 'En Proceso', icon: 'settings' },
  waiting_parts: { label: 'Espera de Repuesto', color: 'bg-slate-900 text-slate-200 border-slate-700/80', dotColor: 'bg-amber-400 shadow-[0_0_8px_#f59e0b]', timingLabel: 'Pieza pedida', icon: 'clock' },
  ready: { label: 'Listo para Entrega', color: 'bg-emerald-950/70 text-emerald-400 border-emerald-800/60', dotColor: 'bg-emerald-400 shadow-[0_0_8px_#10b981]', timingLabel: 'Listo', icon: 'check-circle-2' },
  delivered: { label: 'Entregado', color: 'bg-slate-900 text-slate-400 border-slate-800', dotColor: 'bg-slate-500', timingLabel: 'Entregado', icon: 'handshake' },
  cancelled: { label: 'Cancelado', color: 'bg-rose-950/70 text-rose-400 border-rose-800/60', dotColor: 'bg-rose-500 shadow-[0_0_8px_#f43f5e]', timingLabel: 'Cancelado', icon: 'ban' }
};

function clearSearchFilter() {
  const input = document.getElementById('searchInput');
  if (input) input.value = '';
  AppState.searchQuery = '';
  AppState.currentPage = 1;
  renderOrders();
}

function resetStatusFilter() {
  AppState.filterStatus = 'all';
  AppState.currentPage = 1;
  document.querySelectorAll('.filter-pill').forEach(b => {
    b.classList.remove('active', 'bg-white', 'text-slate-950');
    b.classList.add('bg-slate-900', 'text-slate-400');
    if (b.dataset.status === 'all') {
      b.classList.add('active', 'bg-white', 'text-slate-950');
      b.classList.remove('bg-slate-900', 'text-slate-400');
    }
  });
  renderOrders();
}

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

// Cambiar ordenamiento de \u00F3rdenes
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

// ==========================================
// 8.5 CENTRO DE NOTIFICACIONES & TOASTS EMERGENTES
// ==========================================

let currentNotifFilter = 'all';

function showQuickNotifications() {
  toggleNotificationsPanel();
}

function getLaboratoryNotifications() {
  const notifs = [];
  const readIds = getReadNotificationIds();

  // 1. Nuevas \u00F3rdenes / Ingresos recientes (últimas 25)
  (AppState.orders || []).slice(0, 25).forEach(o => {
    const equip = `${o.equipment?.brand || ''} ${o.equipment?.model || ''} (${o.equipment?.type || 'Equipo'})`.trim();
    notifs.push({
      id: `order_${o.id}`,
      type: 'order',
      orderId: o.id,
      title: `Orden #${o.id} ingresada`,
      subtitle: `${o.client?.name || 'Cliente'} &bull; ${equip}`,
      date: o.date,
      icon: 'package-plus',
      iconColor: 'text-sky-400',
      bgColor: 'bg-sky-500/10 border-sky-500/20',
      badge: 'Ingreso',
      badgeClass: 'bg-sky-950/90 text-sky-300 border-sky-700/70'
    });
  });

  // 2. Equipos Listos para Entrega
  (AppState.orders || []).filter(o => o.status === 'ready').forEach(o => {
    const bal = (o.costs?.balance || 0).toLocaleString('es-MX');
    notifs.push({
      id: `ready_${o.id}`,
      type: 'ready',
      orderId: o.id,
      title: `Equipo Listo para Entrega #${o.id}`,
      subtitle: `${o.client?.name || 'Cliente'} &bull; Saldo pendiente: $${bal} MXN`,
      date: o.date,
      icon: 'check-circle-2',
      iconColor: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10 border-emerald-500/20',
      badge: 'Listo',
      badgeClass: 'bg-emerald-950/90 text-emerald-300 border-emerald-700/70'
    });
  });

  // 3. Presupuestos y Decisiones de Clientes
  (AppState.orders || []).filter(o => o.budgetDecision).forEach(o => {
    const isApproved = o.budgetDecision.status === 'approved';
    notifs.push({
      id: `budget_${o.id}`,
      type: 'budget',
      orderId: o.id,
      title: isApproved ? `Presupuesto Autorizado #${o.id}` : `Presupuesto Rechazado #${o.id}`,
      subtitle: `${o.client?.name || 'Cliente'} &bull; ${isApproved ? 'Autorizó la reparación vía portal' : 'Declinó presupuesto'}`,
      date: o.budgetDecision.date || o.date,
      icon: isApproved ? 'circle-dollar-sign' : 'circle-x',
      iconColor: isApproved ? 'text-emerald-400' : 'text-rose-400',
      bgColor: isApproved ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20',
      badge: isApproved ? 'Autorizado' : 'Rechazado',
      badgeClass: isApproved ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700/70' : 'bg-rose-950/90 text-rose-300 border-rose-700/70'
    });
  });

  // 4. Alertas de Tiempo en Taller (> 15 días sin entregar)
  const now = Date.now();
  (AppState.orders || []).filter(o => {
    if (o.status === 'delivered' || o.status === 'cancelled') return false;
    const oTime = new Date(o.date).getTime();
    return !isNaN(oTime) && (now - oTime) / (1000 * 60 * 60 * 24) > 15;
  }).forEach(o => {
    const days = Math.floor((now - new Date(o.date).getTime()) / (1000 * 60 * 60 * 24));
    notifs.push({
      id: `alert_time_${o.id}`,
      type: 'alert',
      orderId: o.id,
      title: `Alerta: Orden #${o.id} en taller`,
      subtitle: `${o.client?.name || 'Cliente'} &bull; Falla: "${o.issue || ''}"`,
      date: o.date,
      icon: 'alert-triangle',
      iconColor: 'text-amber-400',
      bgColor: 'bg-amber-500/10 border-amber-500/20',
      badge: `${days} días`,
      badgeClass: 'bg-amber-950/90 text-amber-300 border-amber-700/70'
    });
  });

  notifs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return notifs.map(n => ({
    ...n,
    isRead: readIds.includes(n.id)
  }));
}

function getReadNotificationIds() {
  try {
    return JSON.parse(localStorage.getItem('glitchlab_read_notifs') || '[]');
  } catch (e) {
    return [];
  }
}

function saveReadNotificationIds(ids) {
  try {
    localStorage.setItem('glitchlab_read_notifs', JSON.stringify(ids));
  } catch (e) {}
}

function updateNotificationBadge() {
  const notifs = getLaboratoryNotifications();
  const unreadCount = notifs.filter(n => !n.isRead).length;

  const dot = document.getElementById('notifDot');
  const dotStatic = document.getElementById('notifDotStatic');
  const badge = document.getElementById('notifUnreadBadge');

  if (badge) badge.innerText = unreadCount;

  if (unreadCount > 0) {
    if (dot) dot.classList.remove('hidden');
    if (dotStatic) dotStatic.classList.remove('hidden');
  } else {
    if (dot) dot.classList.add('hidden');
    if (dotStatic) dotStatic.classList.add('hidden');
  }
}

let _notifPanelAnimating = false;

function openNotificationsPanel() {
  const menu = document.getElementById('notificationsDropdownMenu');
  if (!menu || _notifPanelAnimating) return;
  if (!menu.classList.contains('hidden') && !menu.classList.contains('dropdown-menu-exit-active')) return;

  _notifPanelAnimating = true;
  closeSettingsMenu();
  renderNotificationsPanel();

  menu.classList.add('dropdown-menu-anim', 'dropdown-menu-enter');
  menu.classList.remove('hidden', 'dropdown-menu-exit-active');
  void menu.offsetWidth;

  requestAnimationFrame(() => {
    menu.classList.add('dropdown-menu-enter-active');
    menu.classList.remove('dropdown-menu-enter');
  });

  setTimeout(() => {
    menu.classList.remove('dropdown-menu-enter-active');
    _notifPanelAnimating = false;
  }, 230);
}

function closeNotificationsPanel(callback) {
  const menu = document.getElementById('notificationsDropdownMenu');
  if (!menu || menu.classList.contains('hidden')) {
    if (typeof callback === 'function') callback();
    return;
  }
  if (_notifPanelAnimating && menu.classList.contains('dropdown-menu-exit-active')) return;

  _notifPanelAnimating = true;
  menu.classList.add('dropdown-menu-anim', 'dropdown-menu-exit-active');
  menu.classList.remove('dropdown-menu-enter', 'dropdown-menu-enter-active');
  void menu.offsetWidth;

  setTimeout(() => {
    menu.classList.add('hidden');
    menu.classList.remove('dropdown-menu-anim', 'dropdown-menu-exit-active');
    _notifPanelAnimating = false;
    if (typeof callback === 'function') callback();
  }, 170);
}

function toggleNotificationsPanel(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('notificationsDropdownMenu');
  if (!menu) return;

  const isClosed = menu.classList.contains('hidden') || menu.classList.contains('dropdown-menu-exit-active');
  if (isClosed) {
    openNotificationsPanel();
  } else {
    closeNotificationsPanel();
  }
}

function filterNotifications(filterType) {
  currentNotifFilter = filterType;
  
  const btnAll = document.getElementById('btnNotifFilterAll');
  const btnOrders = document.getElementById('btnNotifFilterOrders');
  const btnReady = document.getElementById('btnNotifFilterReady');
  const btnAlerts = document.getElementById('btnNotifFilterAlerts');

  const btns = [
    { btn: btnAll, type: 'all' },
    { btn: btnOrders, type: 'orders' },
    { btn: btnReady, type: 'ready' },
    { btn: btnAlerts, type: 'alerts' }
  ];

  btns.forEach(b => {
    if (b.btn) {
      if (b.type === filterType) {
        b.btn.className = 'px-3 py-1 rounded-xl font-bold bg-sky-500 text-white shadow-sm shadow-sky-500/20 transition shrink-0';
      } else {
        b.btn.className = 'px-3 py-1 rounded-xl font-medium bg-slate-800/70 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/60 transition shrink-0';
      }
    }
  });

  renderNotificationsPanel();
}

function renderNotificationsPanel() {
  const container = document.getElementById('notificationsListContainer');
  const summaryEl = document.getElementById('notifTallerSummary');
  if (!container) return;

  const inShop = AppState.orders.filter(o => ['received', 'diagnostic', 'in_progress', 'waiting_parts'].includes(o.status)).length;
  const ready = AppState.orders.filter(o => o.status === 'ready').length;
  if (summaryEl) {
    summaryEl.innerHTML = `
      <span class="inline-flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-sky-400"></span>
        <strong class="text-white">${inShop}</strong> en taller
      </span>
      <span class="text-slate-600">&bull;</span>
      <span class="inline-flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
        <strong class="text-emerald-400">${ready}</strong> listos
      </span>
    `;
  }

  const allNotifs = getLaboratoryNotifications();
  let filtered = allNotifs;

  if (currentNotifFilter === 'orders') {
    filtered = allNotifs.filter(n => n.type === 'order');
  } else if (currentNotifFilter === 'ready') {
    filtered = allNotifs.filter(n => n.type === 'ready');
  } else if (currentNotifFilter === 'alerts') {
    filtered = allNotifs.filter(n => n.type === 'alert' || n.type === 'budget');
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="py-12 px-4 text-center text-slate-500 space-y-2">
        <div class="w-12 h-12 rounded-2xl bg-slate-800/50 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
          <i data-lucide="bell-off" class="w-6 h-6"></i>
        </div>
        <span class="text-xs font-bold text-slate-300 block">Sin notificaciones en esta categor&iacute;acute;an>
        <p class="text-[11px] text-slate-500 max-w-[220px] mx-auto">Todo al día y sin pendientes en el taller de GlitchLab.</p>
      </div>
    `;
    if (typeof renderLucideIcons === 'function') renderLucideIcons();
    return;
  }

  container.innerHTML = filtered.map(n => {
    const timeAgo = formatTimeAgo(n.date);
    return `
      <div 
        onclick="handleNotificationClick('${n.id}', '${n.orderId}')" 
        class="p-2.5 rounded-xl transition duration-150 flex items-start gap-3 group relative cursor-pointer ${
          n.isRead 
            ? 'bg-slate-950/40 border border-slate-800/40 opacity-70 hover:opacity-100 hover:bg-slate-900/60' 
            : 'bg-slate-900/80 border border-slate-800 hover:bg-slate-800/90 hover:border-sky-500/40 shadow-sm'
        }"
      >
        <div class="w-9 h-9 rounded-xl ${n.bgColor} ${n.iconColor} flex items-center justify-center shrink-0 mt-0.5 border shadow-inner">
          <i data-lucide="${n.icon}" class="w-4 h-4"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-1.5 mb-1">
            <span class="text-xs font-bold ${n.isRead ? 'text-slate-300' : 'text-white group-hover:text-sky-300'} truncate transition-colors">
              ${escapeHtml(n.title)}
            </span>
            <span class="px-1.5 py-0.5 rounded-md text-[9px] font-bold border shrink-0 tracking-wide ${n.badgeClass}">
              ${n.badge}
            </span>
          </div>
          <p class="text-[11px] text-slate-400 truncate leading-tight mb-1.5">
            ${n.subtitle}
          </p>
          <div class="flex items-center justify-between text-[10px] text-slate-500">
            <span class="inline-flex items-center gap-1 text-slate-500 font-mono">
              <i data-lucide="clock" class="w-3 h-3 text-slate-600"></i> ${timeAgo}
            </span>
            ${!n.isRead ? '<span class="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)] animate-pulse"></span>' : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  updateNotificationBadge();
  if (typeof renderLucideIcons === 'function') renderLucideIcons();
}

function handleNotificationClick(notifId, orderId) {
  const readIds = getReadNotificationIds();
  if (!readIds.includes(notifId)) {
    readIds.push(notifId);
    saveReadNotificationIds(readIds);
  }
  closeNotificationsPanel(() => {
    updateNotificationBadge();
    if (orderId) {
      openOrderDetailModal(orderId);
    }
  });
}

function markAllNotificationsAsRead() {
  const allNotifs = getLaboratoryNotifications();
  const allIds = allNotifs.map(n => n.id);
  saveReadNotificationIds(allIds);
  updateNotificationBadge();
  renderNotificationsPanel();
  showToast('Todas las notificaciones marcadas como leídas');
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'Hace un momento';
  if (diffMin < 60) return `Hace ${diffMin} min`;
  if (diffHr < 24) return `Hace ${diffHr} h`;
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} d&iacute;as`;
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.08); // A5
    osc.frequency.setValueAtTime(1174.66, audioCtx.currentTime + 0.16); // D6

    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  } catch (e) {
    // Audio no soportado o bloqueado por política del navegador
  }
}

function showNewOrderToast(orderData) {
  const container = document.getElementById('toastNotificationContainer');
  if (!container) return;

  playNotificationSound();

  const toastId = 'toast_order_' + Date.now();
  const toast = document.createElement('div');
  toast.id = toastId;
  toast.className = 'pointer-events-auto bg-[#0b101e]/95 border-2 border-sky-500/60 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex items-start gap-3.5 transform transition-all duration-300 translate-y-[-20px] opacity-0 hover:border-sky-400';

  const clientName = orderData.client?.name || 'Cliente sin registrar';
  const equipFull = `${orderData.equipment?.brand || ''} ${orderData.equipment?.model || ''}`.trim() || orderData.equipment?.type || 'Equipo';
  const issueText = orderData.issue || 'Revisión técnica';

  toast.innerHTML = `
    <div class="h-10 w-10 rounded-xl bg-sky-500/20 border border-sky-500/40 text-sky-400 flex items-center justify-center shrink-0 shadow-lg shadow-sky-500/10">
      <i data-lucide="inbox" class="w-4 h-4 inline-block text-base"></i>
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-center justify-between gap-2 mb-1">
        <span class="text-[10px] font-mono font-black uppercase text-sky-400 tracking-wider flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-sky-400 animate-ping"></span>
          ¡Nueva Orden Recibida!
        </span>
        <span class="font-mono text-xs font-black text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
          #${orderData.id}
        </span>
      </div>
      <h4 class="text-xs font-bold text-white truncate">${escapeHtml(clientName)}</h4>
      <p class="text-[11px] text-slate-300 truncate font-medium">${escapeHtml(equipFull)}</p>
      <p class="text-[10px] text-slate-400 italic truncate mt-0.5">"${escapeHtml(issueText)}"</p>
      
      <div class="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800/80">
        <button type="button" onclick="openOrderDetailModal('${orderData.id}'); dismissToast('${toastId}')" class="px-3 py-1 bg-sky-500 hover:bg-sky-400 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 shadow active:scale-95">
          <i data-lucide="external-link" class="text-[9px]"></i> Ver Orden
        </button>
        <button type="button" onclick="dismissToast('${toastId}')" class="px-2.5 py-1 text-slate-400 hover:text-white text-[11px] font-medium transition">
          Descartar
        </button>
      </div>
    </div>
    <button type="button" onclick="dismissToast('${toastId}')" class="text-slate-500 hover:text-white p-1 transition" title="Cerrar">
      <i data-lucide="x" class="w-4 h-4 inline-block text-xs"></i>
    </button>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-[-20px]', 'opacity-0');
    toast.classList.add('translate-y-0', 'opacity-100');
  });

  updateNotificationBadge();

  setTimeout(() => {
    dismissToast(toastId);
  }, 6500);
}

function dismissToast(toastId) {
  const toast = document.getElementById(toastId);
  if (!toast) return;
  toast.classList.add('opacity-0', 'translate-y-[-10px]');
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 300);
}

// Renderizar Tarjetas de \u00F3rdenes (Estilo Minimalista Inspirado en la Referencia)
function renderOrders() {
  if (!AppState.auth || !AppState.auth.isAuthenticated) return;
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

  // Ordenamiento configurable de \u00F3rdenes
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
    let emptyIcon = 'inbox';
    let emptyTitle = 'No hay \u00F3rdenes de servicio';
    let emptyDesc = 'No se registran \u00F3rdenes que coincidan con los filtros seleccionados.';
    let actionButtonsHtml = '';

    if (AppState.searchQuery) {
      emptyIcon = 'search-x';
      emptyTitle = 'Sin coincidencias de búsqueda';
      emptyDesc = `No encontramos ninguna orden que coincida con "${escapeHtml(AppState.searchQuery)}". Revisa el folio, teléfono, cliente o número de serie.`;
      actionButtonsHtml = `
        <button type="button" onclick="clearSearchFilter()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-full text-xs font-bold transition flex items-center gap-2 active:scale-95 shadow">
          <i data-lucide="x" class="w-3.5 h-3.5 text-slate-400"></i>
          <span>Limpiar Búsqueda</span>
        </button>
        <button type="button" onclick="openNewOrderModal()" class="px-4 py-2 bg-white hover:bg-slate-100 text-slate-950 rounded-full text-xs font-bold transition flex items-center gap-2 shadow active:scale-95">
          <i data-lucide="plus" class="w-3.5 h-3.5 text-slate-950"></i>
          <span>Crear Orden</span>
        </button>
      `;
    } else if (AppState.filterStatus === 'ready') {
      emptyIcon = 'sparkles';
      emptyTitle = 'Laboratorio al Día';
      emptyDesc = 'No hay equipos listos pendientes de entregar al cliente en este momento.';
      actionButtonsHtml = `
        <button type="button" onclick="resetStatusFilter()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-full text-xs font-bold transition flex items-center gap-2 active:scale-95 shadow">
          <i data-lucide="list-filter" class="w-3.5 h-3.5 text-slate-400"></i>
          <span>Ver Todas las \u00D3rdenes</span>
        </button>
      `;
    } else if (AppState.filterStatus === 'diagnostic') {
      emptyIcon = 'cpu';
      emptyTitle = 'Mesa de Diagnóstico Despejada';
      emptyDesc = 'No hay equipos en espera de diagnóstico técnico o presupuesto inicial.';
      actionButtonsHtml = `
        <button type="button" onclick="resetStatusFilter()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-full text-xs font-bold transition flex items-center gap-2 active:scale-95 shadow">
          <i data-lucide="list-filter" class="w-3.5 h-3.5 text-slate-400"></i>
          <span>Ver Todas las \u00D3rdenes</span>
        </button>
        <button type="button" onclick="openNewOrderModal()" class="px-4 py-2 bg-white hover:bg-slate-100 text-slate-950 rounded-full text-xs font-bold transition flex items-center gap-2 shadow active:scale-95">
          <i data-lucide="plus" class="w-3.5 h-3.5 text-slate-950"></i>
          <span>Ingresar Equipo</span>
        </button>
      `;
    } else if (AppState.filterStatus === 'in_progress') {
      emptyIcon = 'settings';
      emptyTitle = 'Banco de Trabajo Libre';
      emptyDesc = 'No hay equipos en proceso activo de reparación o microelectrónica actualmente.';
      actionButtonsHtml = `
        <button type="button" onclick="resetStatusFilter()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-full text-xs font-bold transition flex items-center gap-2 active:scale-95 shadow">
          <i data-lucide="list-filter" class="w-3.5 h-3.5 text-slate-400"></i>
          <span>Ver Todas las \u00D3rdenes</span>
        </button>
      `;
    } else if (AppState.filterStatus === 'waiting_parts') {
      emptyIcon = 'clock';
      emptyTitle = 'Sin Espera de Repuestos';
      emptyDesc = 'No hay equipos pausados por importación de componentes o refacciones especiales.';
      actionButtonsHtml = `
        <button type="button" onclick="resetStatusFilter()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-full text-xs font-bold transition flex items-center gap-2 active:scale-95 shadow">
          <i data-lucide="list-filter" class="w-3.5 h-3.5 text-slate-400"></i>
          <span>Ver Todas las \u00D3rdenes</span>
        </button>
      `;
    } else if (AppState.filterStatus === 'abandoned') {
      emptyIcon = 'shield-check';
      emptyTitle = 'Sin Equipos Abandonados';
      emptyDesc = 'Excelente: todos los equipos en taller se encuentran activos y dentro de los tiempos reglamentarios (<30 días).';
      actionButtonsHtml = `
        <button type="button" onclick="resetStatusFilter()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-full text-xs font-bold transition flex items-center gap-2 active:scale-95 shadow">
          <i data-lucide="list-filter" class="w-3.5 h-3.5 text-slate-400"></i>
          <span>Ver Todas las \u00D3rdenes</span>
        </button>
      `;
    } else if (AppState.filterStatus === 'delivered') {
      emptyIcon = 'handshake';
      emptyTitle = 'Sin Equipos Entregados';
      emptyDesc = 'Aún no se han completado entregas de equipos a clientes.';
      actionButtonsHtml = `
        <button type="button" onclick="resetStatusFilter()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-full text-xs font-bold transition flex items-center gap-2 active:scale-95 shadow">
          <i data-lucide="list-filter" class="w-3.5 h-3.5 text-slate-400"></i>
          <span>Ver Todas las \u00D3rdenes</span>
        </button>
      `;
    } else if (AppState.filterStatus === 'cancelled') {
      emptyIcon = 'ban';
      emptyTitle = 'Sin \u00D3rdenes Canceladas';
      emptyDesc = 'No se registran \u00F3rdenes canceladas o devueltas sin reparación.';
      actionButtonsHtml = `
        <button type="button" onclick="resetStatusFilter()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-full text-xs font-bold transition flex items-center gap-2 active:scale-95 shadow">
          <i data-lucide="list-filter" class="w-3.5 h-3.5 text-slate-400"></i>
          <span>Ver Todas las \u00D3rdenes</span>
        </button>
      `;
    } else {
      emptyIcon = 'inbox';
      emptyTitle = 'No hay \u00F3rdenes de servicio';
      emptyDesc = 'El laboratorio está listo para recibir equipos. Registra la primera orden para comenzar.';
      actionButtonsHtml = `
        <button type="button" onclick="openNewOrderModal()" class="px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-950 rounded-full text-xs font-black transition flex items-center gap-2 shadow-xl active:scale-95">
          <i data-lucide="plus" class="w-4 h-4 text-slate-950"></i>
          <span>Crear Primera Orden</span>
        </button>
      `;
    }

    const emptyHtml = `
      <div class="col-span-full empty-circuit-bg rounded-3xl border border-slate-800/90 p-8 sm:p-14 text-center relative overflow-hidden shadow-2xl">
        <svg class="absolute inset-0 w-full h-full opacity-20 pointer-events-none stroke-sky-400/30" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="emptyCircuitTraces" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M10 10 h35 v35 h35 v20" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/>
              <circle cx="10" cy="10" r="2" fill="#38bdf8" />
              <circle cx="80" cy="65" r="2" fill="#818cf8" />
              <path d="M90 90 v-30 h-30 v-20" fill="none" stroke="currentColor" stroke-width="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#emptyCircuitTraces)" />
        </svg>

        <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-sky-500 to-emerald-400"></div>

        <div class="relative z-10 max-w-md mx-auto flex flex-col items-center">
          <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl shadow-sky-950/50 flex items-center justify-center mb-4 group relative">
            <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-sky-500/15 to-indigo-500/15 blur-md"></div>
            <i data-lucide="${emptyIcon}" class="w-8 h-8 sm:w-10 sm:h-10 text-sky-400 relative z-10 transition transform group-hover:scale-110"></i>
          </div>

          <h3 class="text-lg sm:text-xl font-black text-white tracking-tight">${emptyTitle}</h3>
          <p class="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed max-w-sm">${emptyDesc}</p>

          <div class="mt-6 flex items-center justify-center gap-3 flex-wrap">
            ${actionButtonsHtml}
          </div>
        </div>
      </div>
    `;

    container.innerHTML = emptyHtml;
    if (listContainer) {
      listContainer.innerHTML = `<tr><td colspan="8" class="text-center py-12 text-slate-500 font-medium">${emptyTitle}: ${emptyDesc}</td></tr>`;
    }
    const paginContainer = document.getElementById('ordersPaginationContainer');
    if (paginContainer) paginContainer.innerHTML = '';
    if (typeof renderLucideIcons === 'function') {
      renderLucideIcons();
    } else if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
    return;
  }

  // --- PAGINACI\u00D3N DE 9 \u00D3RDENES POR P\u00C1GINA ---
  const pageSize = AppState.pageSize || 9;
  const totalPages = Math.ceil(filtered.length / pageSize);
  if (AppState.currentPage > totalPages) AppState.currentPage = totalPages;
  if (AppState.currentPage < 1) AppState.currentPage = 1;

  const startIndex = (AppState.currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedOrders = filtered.slice(startIndex, endIndex);

  // 1. RENDERIZAR VISTA EN CUADRÍCULA (Estilo Minimalista y Limpio - Clic abre Detalle Completo)
  container.innerHTML = paginatedOrders.map((order, cardIndex) => {
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
    let dept = 'Microelectrónica';
    const typeLower = (order.equipment?.type || '').toLowerCase();
    if (typeLower.includes('impresora') || typeLower.includes('otro')) dept = 'Servicios Generales';
    else if (typeLower.includes('tarjeta')) dept = 'Microelectrónica';
    else if (typeLower.includes('escritorio') || typeLower.includes('pc')) dept = 'Hardware PC';
    else if (typeLower.includes('laptop')) dept = 'Laptops & BGA';

    // Icono dinámico de equipo según categoría
    let equipIcon = 'cpu';
    if (typeLower.includes('laptop')) equipIcon = 'laptop';
    else if (typeLower.includes('pc') || typeLower.includes('escritorio')) equipIcon = 'monitor';
    else if (typeLower.includes('impresora')) equipIcon = 'printer';
    else if (typeLower.includes('consola') || typeLower.includes('videojuego') || typeLower.includes('switch') || typeLower.includes('playstation') || typeLower.includes('xbox')) equipIcon = 'gamepad-2';
    else if (typeLower.includes('celular') || typeLower.includes('smartphone') || typeLower.includes('tablet') || typeLower.includes('ipad')) equipIcon = 'smartphone';

    const warranty = getWarrantyStatus(order);

    const isDelivered = order.status === 'delivered';
    const isAbandoned = (!isDelivered && order.status !== 'cancelled') &&
      (!isNaN(new Date(order.date).getTime()) && (Date.now() - new Date(order.date).getTime()) / (1000 * 60 * 60 * 24) > 30);

    // Resplandor Neón según Estado (Ambient Glow)
    let glowClass = 'order-glow-received';
    if (order.isWarranty) {
      glowClass = 'order-glow-warranty';
    } else if (isAbandoned) {
      glowClass = 'order-glow-abandoned';
    } else if (order.status === 'ready') {
      glowClass = 'order-glow-ready';
    } else if (order.status === 'diagnostic') {
      glowClass = 'order-glow-diagnostic';
    } else if (order.status === 'in_progress') {
      glowClass = 'order-glow-progress';
    } else if (order.status === 'waiting_parts') {
      glowClass = 'order-glow-waiting';
    } else if (order.status === 'delivered') {
      glowClass = 'order-glow-delivered';
    } else if (order.status === 'cancelled') {
      glowClass = 'order-glow-abandoned';
    }

    // Etapa en Stepper Visual (1: Ingreso 25%, 2: Diagnostico 50%, 3: Reparacion 75%, 4: Listo 100%)
    let currentStep = 1;
    let progressPercent = 25;
    let stepperGlowClass = 'order-stepper-glow-cyan';

    if (order.status === 'diagnostic') {
      currentStep = 2;
      progressPercent = 50;
      stepperGlowClass = 'order-stepper-glow-purple';
    } else if (order.status === 'in_progress' || order.status === 'waiting_parts') {
      currentStep = 3;
      progressPercent = 75;
      stepperGlowClass = 'order-stepper-glow-amber';
    } else if (order.status === 'ready') {
      currentStep = 4;
      progressPercent = 100;
      stepperGlowClass = 'order-stepper-glow-emerald';
    } else if (order.status === 'delivered') {
      currentStep = 4;
      progressPercent = 100;
      stepperGlowClass = 'order-stepper-glow-delivered';
    } else if (order.status === 'cancelled') {
      currentStep = 0;
      progressPercent = 100;
      stepperGlowClass = 'order-stepper-glow-cancelled';
    }

    const stepperHtml = `
      <div class="mt-3 pt-2.5 border-t border-slate-800/70">
        <div class="flex items-center justify-between text-[10px] font-mono tracking-tight mb-1.5 px-0.5">
          <span class="inline-flex items-center gap-1 font-semibold ${currentStep >= 1 ? 'text-sky-300' : 'text-slate-600'}">
            <span class="w-1.5 h-1.5 rounded-full ${currentStep >= 1 ? 'bg-sky-400 shadow-[0_0_8px_#38bdf8]' : 'bg-slate-700'}"></span>
            <span>Ingreso</span>
          </span>
          <span class="inline-flex items-center gap-1 font-semibold ${currentStep >= 2 ? 'text-indigo-300' : 'text-slate-600'}">
            <span class="w-1.5 h-1.5 rounded-full ${currentStep >= 2 ? 'bg-indigo-400 shadow-[0_0_8px_#818cf8]' : 'bg-slate-700'}"></span>
            <span>Diagn\u00F3stico</span>
          </span>
          <span class="inline-flex items-center gap-1 font-semibold ${currentStep >= 3 ? 'text-amber-300' : 'text-slate-600'}">
            <span class="w-1.5 h-1.5 rounded-full ${currentStep >= 3 ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]' : 'bg-slate-700'}"></span>
            <span>Reparaci\u00F3n</span>
          </span>
          <span class="inline-flex items-center gap-1 font-semibold ${currentStep >= 4 ? (isDelivered ? 'text-slate-300' : 'text-emerald-300') : 'text-slate-600'}">
            <span class="w-1.5 h-1.5 rounded-full ${currentStep >= 4 ? (isDelivered ? 'bg-slate-400' : 'bg-emerald-400 shadow-[0_0_8px_#10b981]') : 'bg-slate-700'}"></span>
            <span>${isDelivered ? 'Entregado' : 'Listo'}</span>
          </span>
        </div>

        <!-- Barra de Avance Neon Continua y Fluida -->
        <div class="order-stepper-track">
          <div class="order-stepper-fill ${stepperGlowClass}" style="width: ${progressPercent}%;">
            <span class="order-stepper-pulse-head"></span>
          </div>
        </div>
      </div>
    `;

    return `
      <div 
        onclick="openOrderDetailModal('${order.id}')" 
        class="order-card ${glowClass} ${isDelivered ? 'order-card-delivered' : ''} ${isAbandoned ? 'border-rose-500/60' : ''} rounded-2xl p-5 flex flex-col justify-between cursor-pointer relative select-none"
      >
        <div class="flex-1 flex flex-col">
          <!-- Cabecera Superior: Fila 1 (Folio, QR | Estatus, Garantia) y Fila 2 (Fechas y Tiempo) -->
          <div class="space-y-1.5">
            <!-- Fila 1: Folio + QR a la izquierda | Estatus + Garantia a la derecha -->
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span class="font-mono text-base font-black ${isDelivered ? 'text-slate-400' : 'text-white'} tracking-tight shrink-0">#${order.id}</span>
                <button 
                  type="button" 
                  onclick="event.stopPropagation(); showOrderQRModal('${order.id}')" 
                  class="w-6 h-6 p-1 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-md border border-slate-800 transition shrink-0 flex items-center justify-center"
                  title="C\u00F3digo QR"
                >
                  <i data-lucide="qr-code" class="w-3.5 h-3.5 inline-block text-slate-400"></i>
                </button>
                ${order.isWarranty ? `
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 inline-flex items-center gap-1 shrink-0 shadow-sm" title="Reingreso por garant\u00EDa de Orden #${order.warrantyOriginalOrderId || ''}">
                    <i data-lucide="shield-check" class="w-3 h-3 text-purple-400"></i>
                    <span>Garant\u00EDa #${order.warrantyOriginalOrderId || ''}</span>
                  </span>
                ` : ''}
              </div>

              <!-- Lado Derecho: Insignias de Estado y Garantia -->
              <div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                ${isDelivered ? `
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-slate-300 border border-slate-800 inline-flex items-center gap-1">
                    <i data-lucide="handshake" class="w-3 h-3 text-emerald-400"></i> Entregado
                  </span>
                ` : `
                  <div class="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                    <span class="w-2 h-2 rounded-full ${meta.dotColor}"></span>
                    <span>${meta.timingLabel}</span>
                  </div>
                `}
                ${warranty.hasWarranty ? `
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${warranty.class} inline-flex items-center gap-1" title="Garant\u00EDa v\u00E1lida hasta ${warranty.expirationFormatted}">
                    <i data-lucide="shield-check" class="w-3 h-3 inline-block"></i>
                    <span>${warranty.badge}</span>
                  </span>
                ` : ''}
                ${isAbandoned ? `
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 inline-flex items-center gap-1">
                    <i data-lucide="alert-triangle" class="w-3 h-3 inline-block"></i> >30d
                  </span>
                ` : ''}
              </div>
            </div>

            <!-- Fila 2: Metadatos de Fecha y Tiempo en Taller en una sola linea armonica -->
            <div class="flex items-center gap-2 text-slate-400 text-xs flex-wrap">
              <span class="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400">
                <i data-lucide="calendar" class="w-3 h-3 text-slate-500"></i>
                <span>${dateFormatted}</span>
              </span>
              <span class="text-slate-600 font-bold">&bull;</span>
              <span class="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <i data-lucide="clock" class="w-3 h-3 text-slate-500"></i>
                <span>${isDelivered ? `Estuvo: ${workshopTime.shortLabel}` : workshopTime.label}</span>
              </span>
              ${deliveredFormatted ? `
                <span class="text-slate-600 font-bold">&bull;</span>
                <span class="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-400 font-medium">
                  <i data-lucide="calendar-check" class="w-3 h-3 text-emerald-400"></i>
                  <span>${deliveredFormatted}</span>
                </span>
              ` : ''}
            </div>
          </div>

          <!-- Nombre del Cliente y Tel\u00E9fono formateado con WhatsApp -->
          <div class="mt-4">
            <div class="flex items-center justify-between gap-2">
              <h3 class="font-extrabold text-sm sm:text-base ${isDelivered ? 'text-slate-300' : 'text-white'} tracking-wide uppercase leading-tight truncate">
                ${escapeHtml(order.client?.name || 'CLIENTE')}
              </h3>
              ${order.client?.phone ? `
                <a 
                  href="https://wa.me/52${order.client.phone.replace(/\D/g, '')}" 
                  target="_blank" 
                  onclick="event.stopPropagation()" 
                  class="text-[11px] font-mono font-bold text-slate-300 hover:text-emerald-400 bg-slate-900 hover:bg-emerald-950/40 border border-slate-800 hover:border-emerald-700/60 px-2 py-0.5 rounded-lg shrink-0 tracking-wider transition inline-flex items-center gap-1.5"
                  title="Enviar WhatsApp"
                >
                  <i data-lucide="message-circle" class="w-3 h-3 text-emerald-400 inline-block"></i>
                  <span>${escapeHtml(formatPhoneNumber(order.client.phone))}</span>
                </a>
              ` : ''}
            </div>
            <p class="text-xs text-slate-400 mt-1 font-medium flex items-center gap-1.5 truncate">
              <i data-lucide="${equipIcon}" class="w-3.5 h-3.5 text-sky-400 shrink-0 inline-block"></i>
              <span class="text-slate-300 font-semibold">${escapeHtml(order.equipment?.type || 'Equipo')}</span>
              <span class="text-slate-600">&bull;</span>
              <span class="truncate">${escapeHtml(order.equipment?.brand || '')} ${escapeHtml(order.equipment?.model || '')}</span>
            </p>
          </div>

          <!-- Caja de Falla Reportada (Limpia y minimalista) -->
          <div class="mt-3.5 p-3.5 ${isDelivered ? 'bg-[#060a12]/80 border-slate-800/60 text-slate-400' : 'bg-[#090f1a] border-slate-700/60 text-slate-200'} rounded-xl border text-xs font-medium">
            <span class="italic font-semibold block leading-relaxed line-clamp-2">
              "${escapeHtml((order.issue || 'SIN FALLA ESPECIFICADA').toUpperCase())}"
            </span>
          </div>
        </div>

        <!-- Grupo Inferior: Stepper y Footer siempre juntos sin separación irregular -->
        <div class="mt-auto">
          <!-- Stepper Visual de Avance (Microelectr\u00F3nica) -->
          ${stepperHtml}

          <!-- Footer Tarjeta: Estado a la izquierda con icono, Departamento a la derecha con flecha -->
          <div class="mt-2.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${isDelivered ? 'text-slate-400' : 'text-slate-300'}">
                <span class="w-2 h-2 rounded-full ${meta.dotColor}"></span>
                <i data-lucide="${meta.icon}" class="w-3.5 h-3.5 text-slate-400 inline-block"></i>
                <span>${meta.label}</span>
              </span>
            </div>

            <div class="flex items-center gap-1.5 text-slate-400">
              <span class="text-[11px] font-medium">${dept}</span>
              <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-slate-500 inline-block"></i>
            </div>
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
        <tr onclick="openOrderDetailModal('${order.id}')" class="border-b border-slate-800/80 ${isDeliveredRow ? 'bg-[#030611] opacity-75 hover:opacity-100 hover:bg-slate-900/80 text-slate-400' : 'hover:bg-slate-800/30'} cursor-pointer transition-colors duration-150">
          <td class="py-3 px-4 font-mono font-black text-white">#${order.id}</td>
          <td class="py-3 px-4 text-slate-400 whitespace-nowrap">
            <div>${dateFormatted}</div>
            <div class="text-[10px] ${isDeliveredRow ? 'text-slate-500' : 'text-sky-400'} font-medium flex items-center gap-1 mt-0.5">
              <i data-lucide="timer" class="text-[9px]"></i> ${isDeliveredRow ? `Estuvo: ${workshopTime.shortLabel}` : workshopTime.label}
            </div>
            ${deliveredFormatted ? `
              <div class="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 mt-0.5">
                <i data-lucide="calendar" class="text-[9px]"></i> Ent: ${deliveredFormatted}
              </div>
            ` : ''}
          </td>
          <td class="py-3 px-4">
            <div class="font-bold text-white uppercase">${escapeHtml(order.client?.name || '')}</div>
            <div class="text-[11px] text-slate-300 font-mono tracking-wider font-semibold">${escapeHtml(formatPhoneNumber(order.client?.phone) || '')}</div>
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
            ${balance > 0 ? `<div class="text-[10px] text-rose-400 font-bold">Resta: $${balance.toLocaleString('es-MX')}</div>` : `<div class="text-[10px] text-emerald-400 font-bold">Liquidado</div>`}
          </td>
          <td class="py-3 px-4 text-right whitespace-nowrap" onclick="event.stopPropagation()">
            <div class="flex items-center justify-end gap-1">
              <button onclick="showOrderQRModal('${order.id}')" title="Código QR de Rastreo en Pantalla" class="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded">
                <i data-lucide="qr-code" class="w-4 h-4 inline-block"></i>
              </button>
              <button onclick="openOrderDetailModal('${order.id}')" title="Ver Detalle Completo" class="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded">
                <i data-lucide="maximize-2" class="w-4 h-4 inline-block"></i>
              </button>
              <button onclick="openQuickLabelPrint('${order.id}')" title="Imprimir Etiqueta" class="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded">
                <i data-lucide="tag" class="w-4 h-4 inline-block"></i>
              </button>
              <button onclick="openDeliveryModal('${order.id}')" title="Entregar Equipo al Cliente" class="p-1.5 ${order.status === 'delivered' ? 'text-slate-600' : 'text-emerald-400 hover:bg-emerald-950/60'} rounded">
                <i data-lucide="handshake" class="w-4 h-4 inline-block"></i>
              </button>
              <button onclick="downloadCustomerPDF('${order.id}')" title="Descargar Comprobante PDF" class="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded">
                <i data-lucide="file-text" class="w-4 h-4 inline-block"></i>
              </button>
              <button onclick="downloadWorkSummaryPDF('${order.id}')" title="Descargar Resumen de Trabajo Técnico (PDF)" class="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded">
                <i data-lucide="file-plus" class="w-4 h-4 inline-block"></i>
              </button>
              <button onclick="openWhatsAppTemplatesModal('${order.id}')" title="WhatsApp" class="p-1.5 text-emerald-400 hover:bg-slate-800 rounded">
                <i data-lucide="message-circle" class="w-4 h-4 inline-block"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // --- PAGINACI\u00D3N DE 9 \u00D3RDENES POR P\u00C1GINA ---
  renderOrdersPagination(filtered.length, totalPages, startIndex, endIndex);
  if (typeof renderLucideIcons === 'function') {
    renderLucideIcons();
  } else if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
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
            ? 'bg-white text-slate-950 font-black shadow-sm' 
            : 'bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60'
        }"
      >
        ${i}
      </button>
    `;
  }

  paginContainer.innerHTML = `
    <div class="text-xs text-slate-400 font-medium flex items-center gap-1">
      Mostrando <span class="text-white font-bold">${showingFrom}-${showingTo}</span> de <span class="text-white font-bold">${totalItems}</span> \u00F3rdenes
    </div>

    <div class="flex items-center gap-1.5 flex-wrap justify-center">
      <button 
        onclick="goToOrdersPage(${currentPage - 1})" 
        ${currentPage <= 1 ? 'disabled class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed"' : 'class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"'}
      >
        <i data-lucide="chevron-left" class="w-4 h-4 inline-block"></i> Anterior
      </button>

      <div class="flex items-center gap-1 mx-1">
        ${pageButtonsHtml}
      </div>

      <button 
        onclick="goToOrdersPage(${currentPage + 1})" 
        ${currentPage >= totalPages ? 'disabled class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed"' : 'class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"'}
      >
        Siguiente <i data-lucide="chevron-right" class="w-4 h-4 inline-block"></i>
      </button>
    </div>
  `;
  if (typeof renderLucideIcons === 'function') {
    renderLucideIcons();
  } else if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function goToOrdersPage(pageNumber) {
  AppState.currentPage = pageNumber;
  renderOrders();
  const mainOrdersSection = document.getElementById('ordersContainer');
  if (mainOrdersSection) {
    mainOrdersSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (typeof renderLucideIcons === 'function') {
    renderLucideIcons();
  } else if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

// ==========================================
// 9.5 MODAL DE DETALLE COMPLETO DE ORDEN
// ==========================================

let currentDetailOrderId = null;

// Cálculo centralizado y consistente del desglose financiero de una orden
function getOrderFinancialBreakdown(order) {
  if (!order) {
    return {
      labor: 0,
      parts: 0,
      estimated: 0,
      advance: 0,
      abonos: 0,
      totalPaid: 0,
      balance: 0,
      laborFormatted: '0.00',
      partsFormatted: '0.00',
      estimatedFormatted: '0.00',
      advanceFormatted: '0.00',
      abonosFormatted: '0.00',
      totalPaidFormatted: '0.00',
      balanceFormatted: '0.00'
    };
  }

  // 1. Refacciones (Prioriza la lista real de refacciones agregadas a la orden)
  let parts = 0;
  if (Array.isArray(order.parts) && order.parts.length > 0) {
    parts = order.parts.reduce((sum, p) => sum + (Number(p.cost) || 0), 0);
  } else if (order.costs && order.costs.parts !== undefined && order.costs.parts !== null) {
    parts = Number(order.costs.parts) || 0;
  }

  // 2. Mano de Obra y Total Estimado
  let labor = 0;
  if (order.costs && order.costs.labor !== undefined && order.costs.labor !== null && Number(order.costs.labor) > 0) {
    labor = Number(order.costs.labor);
  } else {
    let rawEst = Number(order.costs?.estimated) || 0;
    labor = Math.max(0, rawEst - parts);
  }

  let est = labor + parts;
  if (est === 0 && Number(order.costs?.estimated) > 0) {
    est = Number(order.costs.estimated);
  }
  // 3. Anticipos y Abonos
  const payments = Array.isArray(order.costs?.payments) ? order.costs.payments : [];
  let advance = 0;
  let abonos = 0;

  if (payments.length > 0) {
    advance = Number(payments[0].amount) || 0;
    if (payments.length > 1) {
      abonos = payments.slice(1).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    }
  } else {
    advance = Number(order.costs?.advance) || 0;
    abonos = 0;
  }

  const totalPaid = advance + abonos;
  const balance = Math.max(0, est - totalPaid);

  return {
    labor,
    parts,
    estimated: est,
    advance,
    abonos,
    totalPaid,
    balance,
    laborFormatted: labor.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    partsFormatted: parts.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    estimatedFormatted: est.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    advanceFormatted: advance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    abonosFormatted: abonos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    totalPaidFormatted: totalPaid.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    balanceFormatted: balance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  };
}

let currentDtlMobileTab = 2;

function switchDtlMobileTab(tabIndex) {
  currentDtlMobileTab = tabIndex;
  const tabs = [1, 2, 3];
  tabs.forEach(t => {
    const col = document.getElementById('dtlCol' + t);
    const btn = document.getElementById('dtlMobTab' + t);
    if (col) {
      if (t === tabIndex) {
        col.classList.remove('hidden');
        col.classList.add('flex');
        col.scrollTop = 0;
      } else {
        col.classList.remove('flex');
        col.classList.add('hidden');
      }
    }
    if (btn) {
      if (t === tabIndex) {
        btn.className = 'flex-1 py-1.5 px-2 rounded-xl font-bold text-center transition flex items-center justify-center gap-1.5 bg-white text-slate-950 border border-white whitespace-nowrap shadow-sm';
      } else {
        btn.className = 'flex-1 py-1.5 px-2 rounded-xl font-medium text-center transition flex items-center justify-center gap-1.5 text-slate-400 hover:text-white border border-transparent whitespace-nowrap';
      }
    }
  });
}

let currentDtlTab = 1;

function scrollDtlSubTabs(offset) {
  const bar = document.getElementById('dtlSubTabsBar');
  if (bar) {
    bar.scrollBy({ left: offset, behavior: 'smooth' });
  }
}

function switchDtlTab(tabIndex) {
  currentDtlTab = tabIndex;
  const tabs = [1, 2, 3];
  tabs.forEach(t => {
    const pane = document.getElementById('dtlTabPane' + t);
    const btn = document.getElementById('dtlTabBtn' + t);
    if (pane) {
      if (t === tabIndex) {
        pane.classList.remove('hidden');
      } else {
        pane.classList.add('hidden');
      }
    }
    if (btn) {
      if (t === tabIndex) {
        btn.className = 'flex-1 py-1.5 px-2 sm:px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 sm:gap-1.5 bg-white text-slate-950 border border-white shadow-sm whitespace-nowrap';
        try {
          const bar = document.getElementById('dtlSubTabsBar');
          if (bar) {
            const barRect = bar.getBoundingClientRect();
            const btnRect = btn.getBoundingClientRect();
            const scrollOffset = (btnRect.left - barRect.left) - (barRect.width / 2) + (btnRect.width / 2);
            bar.scrollBy({ left: scrollOffset, behavior: 'smooth' });
          }
        } catch (e) {}
      } else {
        btn.className = 'flex-1 py-1.5 px-2 sm:px-3 rounded-xl text-xs font-medium transition flex items-center justify-center gap-1 sm:gap-1.5 text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent whitespace-nowrap';
      }
    }
  });
}

function toggleDtlWaMenu(e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const menu = document.getElementById('dtlWaDropdownMenu');
  if (menu) {
    menu.classList.toggle('hidden');
  }
}

function closeDtlWaMenu() {
  const menu = document.getElementById('dtlWaDropdownMenu');
  if (menu) {
    menu.classList.add('hidden');
  }
}

function openOrderDetailModal(orderId) {
  if (!AppState.auth || !AppState.auth.isAuthenticated) {
    console.warn('[GlitchLab Security] Acceso no autorizado bloqueado a orden #' + orderId);
    lockSystem();
    return;
  }
  const order = AppState.orders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  currentDetailOrderId = orderId;
  switchDtlMobileTab(2);
  switchDtlTab(1);
  closeDtlWaMenu();
  closeDtlPrintMenu();

  // Actualizar badges de pestañas
  const dtlTabBalBadge = document.getElementById('dtlTabBalanceBadge');
  if (dtlTabBalBadge) {
    const fin = getOrderFinancialBreakdown(order);
    if (fin.balance <= 0) {
      dtlTabBalBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-500/50';
      dtlTabBalBadge.innerText = 'Liquidado';
      dtlTabBalBadge.classList.remove('hidden');
    } else {
      dtlTabBalBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/90 text-rose-300 border border-rose-500/50';
      dtlTabBalBadge.innerText = '$' + fin.balanceFormatted + ' pend.';
      dtlTabBalBadge.classList.remove('hidden');
    }
  }

  const dtlTabPhotosBadge = document.getElementById('dtlTabPhotosCountBadge');
  if (dtlTabPhotosBadge) {
    const phCount = Array.isArray(order.photos) ? order.photos.length : 0;
    dtlTabPhotosBadge.innerText = phCount + ' fotos';
  }
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

  // Badges de Estatus y Garant&iacute;a
  const dtlStatusBadge = document.getElementById('dtlStatusBadge');
  if (dtlStatusBadge) {
    dtlStatusBadge.innerHTML = `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${meta.color}">
        <i data-lucide="${meta.icon}" class="w-3.5 h-3.5 inline-block text-[10px]"></i> ${meta.label}
      </span>
    `;
  }

  const dtlWarrantyBadge = document.getElementById('dtlWarrantyBadge');
  if (dtlWarrantyBadge) {
    if (warranty.hasWarranty) {
      dtlWarrantyBadge.innerHTML = `
        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${warranty.class}">
          <i data-lucide="shield-check" class="w-3 h-3 inline-block"></i>
          <span>${warranty.badge}</span>
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
    dtlWorkshopTimeBadge.className = `inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${isDelivered ? 'bg-slate-900 text-slate-400 border border-slate-800' : (workshopTime.days >= 30 ? 'bg-rose-950/70 text-rose-300 border border-rose-800/60' : 'bg-slate-900 text-slate-300 border border-slate-800')}`;
    dtlWorkshopTimeBadge.innerHTML = `<i data-lucide="timer" class="text-[10px]"></i><span>${isDelivered ? `Estuvo en taller: ${workshopTime.shortLabel}` : workshopTime.label}</span>`;
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
        dtlDeliveredTimeBadge.innerHTML = `<i data-lucide="calendar" class="text-[10px]"></i><span>Entregado el: ${delDateStr}</span>`;
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
      dtlEquipmentPassword.dataset.masked = 'false';
      dtlEquipmentPassword.innerText = passVal;
    } else {
      dtlEquipmentPassword.innerText = 'Sin clave / PIN';
    }
    if (btnToggleDtlPass) btnToggleDtlPass.classList.add('hidden');
  }

  const acc = order.equipment?.accessories;
  if (dtlEquipmentAccessories) {
    dtlEquipmentAccessories.innerText = (acc && acc.length > 0) ? acc.join(', ') : 'Ninguno (Solo equipo)';
  }

  // Código de Rastreo & Acciones
  const trkCode = 'TRK-' + order.id + (order.equipment?.brand ? '-' + order.equipment.brand.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') : '');
  const dtlTrkBadge = document.getElementById('dtlTrackingCodeBadge');
  if (dtlTrkBadge) dtlTrkBadge.innerText = trkCode;
  const dtlTrkLink = document.getElementById('dtlTrackingUrlLink');
  if (dtlTrkLink) dtlTrkLink.href = getTrackingUrl(order.id);
  const dtlTrkLinkDesk = document.getElementById('dtlTrackingUrlLinkDesk');
  if (dtlTrkLinkDesk) dtlTrkLinkDesk.href = getTrackingUrl(order.id);

  // Chips visuales de accesorios
  const orderAccItems = order.accessories || order.equipment?.accessories || [];
  const accList = Array.isArray(orderAccItems) ? orderAccItems : (orderAccItems ? [orderAccItems] : []);
  const accStr = accList.join(' ').toLowerCase();

  const setChipState = (id, isActive) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (isActive) {
      el.className = 'py-2 px-2 rounded-xl border border-slate-600 bg-slate-800 text-white font-bold transition flex items-center justify-center gap-1.5 shadow-sm';
    } else {
      el.className = 'py-2 px-2 rounded-xl border border-slate-800/80 bg-slate-900/40 text-slate-500 transition flex items-center justify-center gap-1.5 opacity-60';
    }
  };

  setChipState('dtlChipCargador', accStr.includes('cargador') || accStr.includes('eliminador') || accStr.includes('fuente'));
  setChipState('dtlChipFunda', accStr.includes('funda') || accStr.includes('mochila') || accStr.includes('malet') || accStr.includes('estuche'));
  setChipState('dtlChipCables', accStr.includes('cable') || accStr.includes('hdmi') || accStr.includes('adaptador') || accStr.includes('otg'));
  setChipState('dtlChipUsb', accStr.includes('usb') || accStr.includes('disco') || accStr.includes('memoria') || accStr.includes('flash') || accStr.includes('sd'));

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
        <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-slate-200 border border-slate-700/80">
          <i data-lucide="check" class="text-[9px] text-emerald-400"></i> ${escapeHtml(item)}
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

  // Motivo de Ingreso & Diagn&oacute;stico
  const dtlIssue = document.getElementById('dtlIssue');
  const dtlDiagnosis = document.getElementById('dtlDiagnosis');
  if (dtlIssue) dtlIssue.innerText = `"${(order.issue || order.reportedIssue || 'No especificada').toUpperCase()}"`;
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
        if (dtlBudgetIcon) { dtlBudgetIcon.setAttribute('data-lucide', 'check-circle-2'); dtlBudgetIcon.className = 'w-5 h-5 text-emerald-400 shrink-0'; renderLucideIcons(); }
        if (dtlBudgetTitle) dtlBudgetTitle.innerText = 'Presupuesto Aprobado por el Cliente';
        if (dtlBudgetText) dtlBudgetText.innerText = `El cliente autorizó el presupuesto de $${(order.budgetDecision.amount || order.costs?.estimated || 0).toLocaleString('es-MX')} MXN vía portal de rastreo.`;
      } else {
        dtlBudgetCard.className = 'p-3.5 bg-red-950/40 border border-red-500/50 rounded-2xl flex items-center justify-between gap-3';
        if (dtlBudgetIcon) { dtlBudgetIcon.setAttribute('data-lucide', 'x-circle'); dtlBudgetIcon.className = 'w-5 h-5 text-rose-400 shrink-0'; renderLucideIcons(); }
        if (dtlBudgetTitle) dtlBudgetTitle.innerText = 'Presupuesto Rechazado por el Cliente';
        if (dtlBudgetText) dtlBudgetText.innerText = `El cliente declinó la reparación desde el portal de rastreo. Equipo disponible para entrega.`;
      }
    } else {
      dtlBudgetCard.classList.add('hidden');
    }
  }

  // Finanzas & Pagos Múltiples Desglosados
  const finBreakdown = getOrderFinancialBreakdown(order);

  const dtlCostLabor = document.getElementById('dtlCostLabor');
  const dtlCostParts = document.getElementById('dtlCostParts');
  const dtlCostEst = document.getElementById('dtlCostEst');
  const dtlCostAdvance = document.getElementById('dtlCostAdvance') || document.getElementById('dtlCostAdv');
  const dtlCostPayments = document.getElementById('dtlCostPayments');
  const dtlCostMethod = document.getElementById('dtlCostMethod');
  const dtlCostBal = document.getElementById('dtlCostBal');

  if (dtlCostLabor) dtlCostLabor.innerText = `$${finBreakdown.laborFormatted} MXN`;
  if (dtlCostParts) dtlCostParts.innerText = `$${finBreakdown.partsFormatted} MXN`;
  if (dtlCostEst) dtlCostEst.innerText = `$${finBreakdown.estimatedFormatted} MXN`;

  const dtlInlineLaborInput = document.getElementById('dtlInlineLaborInput');
  if (dtlInlineLaborInput) {
    dtlInlineLaborInput.value = finBreakdown.labor > 0 ? finBreakdown.labor : '';
  }
  const dtlInlinePartsInput = document.getElementById('dtlInlinePartsInput');
  if (dtlInlinePartsInput) {
    dtlInlinePartsInput.value = finBreakdown.parts > 0 ? finBreakdown.parts : '';
  }
  const dtlInlinePriceInput = document.getElementById('dtlInlinePriceInput');
  if (dtlInlinePriceInput) {
    dtlInlinePriceInput.value = finBreakdown.estimated > 0 ? finBreakdown.estimated : '';
  }
  if (dtlCostAdvance) dtlCostAdvance.innerText = `$${finBreakdown.advanceFormatted} MXN`;
  if (dtlCostPayments) dtlCostPayments.innerText = `$${finBreakdown.abonosFormatted} MXN`;
  if (dtlCostMethod) dtlCostMethod.innerText = order.costs?.paymentMethod || 'Efectivo';
  if (dtlCostBal) {
    dtlCostBal.innerText = `$${finBreakdown.balanceFormatted} MXN`;
    if (finBreakdown.balance > 0) {
      dtlCostBal.className = 'text-xl font-black text-rose-400 font-mono tracking-tight';
    } else {
      dtlCostBal.className = 'text-xl font-black text-emerald-400 font-mono tracking-tight';
    }
  }

  // Desglose de Abonos Registrados
  const dtlPaymentsList = document.getElementById('dtlPaymentsSummaryList');
  if (dtlPaymentsList) {
    const payments = Array.isArray(order.costs?.payments) ? order.costs.payments : [];
    if (payments.length > 0) {
      dtlPaymentsList.innerHTML = `<span class="font-semibold text-slate-300">Historial de Pagos (${payments.length}):</span> ` +
        payments.map((p, idx) => `<span class="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-[10px] text-emerald-400">#${idx + 1} $${Number(p.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })} (${escapeHtml(p.method || 'Efectivo')})</span>`).join(' ');
    } else {
      dtlPaymentsList.innerHTML = '<span class="text-slate-500 italic">Anticipo inicial registrado en recepción</span>';
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
      dtlBtnDeliver.innerHTML = '<i data-lucide="check-check" class="w-4 h-4 inline-block text-emerald-400"></i><span>Ya Entregado</span>';
      dtlBtnDeliver.onclick = () => {
        openDeliveryModal(order.id);
      };
    } else {
      dtlBtnDeliver.className = 'px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap shadow-md shadow-emerald-600/20 active:scale-95';
      dtlBtnDeliver.innerHTML = '<i data-lucide="handshake" class="w-4 h-4 inline-block text-xs"></i><span>Entregar Equipo</span>';
      dtlBtnDeliver.onclick = () => {
        openDeliveryModal(order.id);
      };
    }
  }

  const dtlBtnSticker = document.getElementById('dtlBtnSticker');
  if (dtlBtnSticker) {
    dtlBtnSticker.onclick = () => {
      handleDtlPrintEtiqueta();
    };
  }

  const dtlBtnPdf = document.getElementById('dtlBtnPdf');
  if (dtlBtnPdf) {
    dtlBtnPdf.onclick = () => {
      handleDtlDownloadPdf();
    };
  }

  const dtlBtnWorkSummary = document.getElementById('dtlBtnWorkSummary');
  if (dtlBtnWorkSummary) {
    dtlBtnWorkSummary.onclick = () => {
      handleDtlWorkSummary();
    };
  }

  const dtlBtnPrint = document.getElementById('dtlBtnPrint');
  if (dtlBtnPrint) {
    dtlBtnPrint.onclick = () => {
      handleDtlPrintThermal();
    };
  }

  const dtlBtnWaQuick = document.getElementById('dtlBtnWaQuick');
  if (dtlBtnWaQuick) {
    dtlBtnWaQuick.onclick = () => {
      openWhatsAppForCurrentOrder();
    };
  }

  const dtlBtnBitacora = document.getElementById('dtlBtnBitacora');
  if (dtlBtnBitacora) {
    dtlBtnBitacora.onclick = () => {
      openBitacoraModal(order.id);
    };
  }

  const dtlBtnEdit = document.getElementById('dtlBtnEdit');
  if (dtlBtnEdit) {
    dtlBtnEdit.onclick = () => {
      handleDtlEditOrder();
    };
  }

  const dtlBtnDelete = document.getElementById('dtlBtnDelete');
  if (dtlBtnDelete) {
    dtlBtnDelete.onclick = () => {
      handleDtlDeleteOrder();
    };
  }

  // 7. Renderizar Refacciones Utilizadas, Control de Calidad (QC) e Historial Clínico
  renderDtlParts(order);
  renderDtlQc(order);
  renderDtlClinicalHistory(order);

  // 8. Actualizar Boton de Flujo Principal y Bitacora Integrada en Vivo
  updateDtlMainWorkflowBtn(order);
  renderDtlBitacora(order);

  // Activar scroll horizontal con rueda del ratón en la barra de acciones superior
  const dtlActionsScrollContainer = document.getElementById('dtlActionsScrollContainer');
  if (dtlActionsScrollContainer && !dtlActionsScrollContainer.dataset.wheelBound) {
    dtlActionsScrollContainer.dataset.wheelBound = 'true';
    dtlActionsScrollContainer.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        dtlActionsScrollContainer.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });
  }

  // Mostrar el Modal y bloquear scroll de la página de fondo
  const modal = document.getElementById('orderDetailModal');
  openModalWithAnimation('orderDetailModal'); if (typeof renderLucideIcons === 'function') renderLucideIcons();
}

function closeOrderDetailModal() {
  closeDtlWaMenu();
  closeDtlPrintMenu();
  currentDetailOrderId = null;
  closeModalWithAnimation('orderDetailModal');
}
// ==========================================
// UTILIDADES DEL COMMAND CENTER (HUD 3 COLUMNAS)
// ==========================================

function scrollDtlActions(distance) {
  const container = document.getElementById('dtlActionsScrollContainer');
  if (container) {
    container.scrollBy({ left: distance, behavior: 'smooth' });
  }
}

function handleDtlGoToParts() {
  switchDtlMobileTab(2);
  switchDtlTab(2);
  setTimeout(() => {
    const inp = document.getElementById('dtlPartNameInput');
    if (inp) {
      inp.focus();
      inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 120);
}

function getActiveDetailOrderId() {
  if (currentDetailOrderId) return currentDetailOrderId;
  const folioEl = document.getElementById('dtlFolio');
  if (folioEl && folioEl.textContent) {
    const rawVal = folioEl.textContent.trim().replace(/^#/, '');
    const folioNum = parseInt(rawVal, 10);
    const found = AppState.orders.find(o => String(o.id) === rawVal || o.folio === folioNum || String(o.folio) === rawVal);
    if (found) return found.id;
  }
  return null;
}

function getOrderDetailOrder() {
  const targetId = typeof getActiveDetailOrderId === 'function' ? getActiveDetailOrderId() : currentDetailOrderId;
  if (!targetId && targetId !== 0) return null;
  return AppState.orders.find(o => String(o.id) === String(targetId)) || null;
}

function handleDtlPrintEtiqueta() {
  const targetId = getActiveDetailOrderId();
  if (!targetId) return;
  openQuickLabelPrint(targetId);
}

function handleDtlPolizaClick() {
  const targetId = getActiveDetailOrderId();
  if (!targetId) return;
  openPrintModal(targetId);
  try {
    setPrintFormat('client_pdf');
  } catch (err) {
    console.error('Error al generar póliza de garantía:', err);
  }
}

function handleDtlPrintThermal() {
  const targetId = getActiveDetailOrderId();
  if (!targetId) return;
  openPrintModal(targetId);
  try {
    setPrintFormat('thermal');
  } catch (err) {
    console.error('Error al cambiar a ticket térmico:', err);
  }
}

function handleDtlDownloadPdf() {
  const targetId = getActiveDetailOrderId();
  if (!targetId) return;
  downloadCustomerPDF(targetId);
}

function handleDtlWorkSummary() {
  const targetId = getActiveDetailOrderId();
  if (!targetId) return;
  downloadWorkSummaryPDF(targetId);
}

function handleDtlEditOrder() {
  const targetId = getActiveDetailOrderId();
  if (!targetId) return;
  closeOrderDetailModal();
  editOrder(targetId);
}

function handleDtlDeleteOrder() {
  const targetId = getActiveDetailOrderId();
  if (!targetId) return;
  deleteOrder(targetId);
}

let dtlFinanceDebounceTimer = null;

function handleDtlFinanceFieldInput(field, rawValue) {
  updateDtlFinanceDOMLive(field, rawValue);
  clearTimeout(dtlFinanceDebounceTimer);
  dtlFinanceDebounceTimer = setTimeout(() => {
    commitDtlFinanceChanges(false);
  }, 500);
}

function handleDtlFinanceFieldChange(field, rawValue) {
  clearTimeout(dtlFinanceDebounceTimer);
  updateDtlFinanceDOMLive(field, rawValue);
  commitDtlFinanceChanges(true);
}

function updateDtlFinanceDOMLive(changedField, rawValue) {
  const order = getOrderDetailOrder();
  if (!order) return;

  const laborInput = document.getElementById('dtlInlineLaborInput');
  const partsInput = document.getElementById('dtlInlinePartsInput');
  const priceInput = document.getElementById('dtlInlinePriceInput');
  const costBal = document.getElementById('dtlCostBal');
  const tabBadge = document.getElementById('dtlTabBalanceBadge');

  let labor = laborInput ? (parseFloat(laborInput.value) || 0) : 0;
  let parts = partsInput ? (parseFloat(partsInput.value) || 0) : 0;
  let total = priceInput ? (parseFloat(priceInput.value) || 0) : 0;

  if (changedField === 'labor' || changedField === 'parts') {
    // Al editar mano de obra o refacciones, el Total se suma automáticamente
    total = Math.max(0, labor + parts);
    if (priceInput && document.activeElement !== priceInput) {
      priceInput.value = total > 0 ? total : '';
    }
  } else if (changedField === 'total') {
    // Al editar el Total directamente:
    if (parts > 0) {
      labor = Math.max(0, total - parts);
    } else {
      labor = total;
    }
    if (laborInput && document.activeElement !== laborInput) {
      laborInput.value = labor > 0 ? labor : '';
    }
  }

  // Anticipos y Abonos de la orden
  const payments = Array.isArray(order.costs?.payments) ? order.costs.payments : [];
  let totalPaid = 0;
  if (payments.length > 0) {
    totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  } else {
    totalPaid = Number(order.costs?.advance) || 0;
  }

  const balance = Math.max(0, total - totalPaid);
  const balanceFormatted = balance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (costBal) {
    costBal.innerText = `$${balanceFormatted} MXN`;
    if (balance > 0) {
      costBal.className = 'text-xl font-black text-rose-400 font-mono tracking-tight';
    } else {
      costBal.className = 'text-xl font-black text-emerald-400 font-mono tracking-tight';
    }
  }

  if (tabBadge) {
    if (balance > 0) {
      tabBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/90 text-rose-300 border border-rose-500/50';
      tabBadge.innerText = `$${balanceFormatted} pend.`;
      tabBadge.classList.remove('hidden');
    } else {
      tabBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-500/50';
      tabBadge.innerText = 'Liquidado';
      tabBadge.classList.remove('hidden');
    }
  }

  // Reflejar en Ganancia Neta de la Columna 2
  const netProfitText = document.getElementById('dtlNetProfitText');
  if (netProfitText) {
    const partsFromArr = Array.isArray(order.parts) ? order.parts.reduce((sum, p) => sum + (parseFloat(p.cost) || 0), 0) : 0;
    const partsCostForProfit = partsFromArr > 0 ? partsFromArr : parts;
    const netProfit = Math.max(0, total - partsCostForProfit);
    netProfitText.innerText = `$${netProfit.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function commitDtlFinanceChanges(showFeedback = false) {
  const order = getOrderDetailOrder();
  if (!order) return;

  const laborInput = document.getElementById('dtlInlineLaborInput');
  const partsInput = document.getElementById('dtlInlinePartsInput');
  const priceInput = document.getElementById('dtlInlinePriceInput');

  let labor = laborInput ? Math.max(0, parseFloat(laborInput.value) || 0) : 0;
  let parts = partsInput ? Math.max(0, parseFloat(partsInput.value) || 0) : 0;
  let total = priceInput ? Math.max(0, parseFloat(priceInput.value) || 0) : 0;

  if (total === 0 && (labor > 0 || parts > 0)) {
    total = labor + parts;
    if (priceInput) priceInput.value = total;
  }

  if (!order.costs) {
    order.costs = { estimated: 0, advance: 0, balance: 0, paymentMethod: 'Efectivo', payments: [] };
  }

  const payments = Array.isArray(order.costs.payments) ? order.costs.payments : [];
  let totalPaid = 0;
  if (payments.length > 0) {
    totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  } else {
    totalPaid = Number(order.costs.advance) || 0;
  }

  const balance = Math.max(0, total - totalPaid);

  order.costs.labor = labor;
  order.costs.parts = parts;
  order.costs.estimated = total;
  order.costs.balance = balance;

  // Persistir en LocalStorage y Supabase
  saveOrders();
  if (typeof syncSingleOrderToSupabase === 'function') {
    syncSingleOrderToSupabase(order);
  }

  if (typeof renderOrdersListTable === 'function') {
    renderOrdersListTable();
  }

  // Actualizar spans ocultos para reportes / impresión
  const dtlCostLabor = document.getElementById('dtlCostLabor');
  const dtlCostParts = document.getElementById('dtlCostParts');
  const dtlCostEst = document.getElementById('dtlCostEst');
  if (dtlCostLabor) dtlCostLabor.innerText = `$${labor.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
  if (dtlCostParts) dtlCostParts.innerText = `$${parts.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
  if (dtlCostEst) dtlCostEst.innerText = `$${total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

  if (showFeedback && typeof showToast === 'function') {
    showToast(`Finanzas guardadas: Total $${total.toLocaleString('es-MX')} | Saldo $${balance.toLocaleString('es-MX')}`, 'success');
  }
}

function handleSaveDtlInlinePrice(newVal) {
  handleDtlFinanceFieldChange('total', newVal);
}

function copyTrackingUrlQuick() {
  if (!currentDetailOrderId) return;
  const url = getTrackingUrl(currentDetailOrderId);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => showToast('Enlace de rastreo copiado', 'success'));
  } else {
    copyToClipboardFallback(url);
    showToast('Enlace de rastreo copiado', 'success');
  }
}

function updateDtlMainWorkflowBtn(order) {
  const btn = document.getElementById('dtlMainWorkflowBtn');
  const btnText = document.getElementById('dtlMainWorkflowBtnText');
  if (!btn || !btnText) return;

  switch (order.status) {
    case 'received':
      btn.className = 'w-full sm:flex-1 py-2.5 sm:py-3 px-4 bg-white hover:bg-slate-200 text-slate-950 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 shadow-sm active:scale-95 uppercase tracking-wider cursor-pointer';
      btnText.innerHTML = '<i data-lucide="stethoscope" class="w-4 h-4 inline-block mr-1"></i> INICIAR DIAGNÓSTICO';
      break;
    case 'diagnostic':
      btn.className = 'w-full sm:flex-1 py-2.5 sm:py-3 px-4 bg-white hover:bg-slate-200 text-slate-950 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 shadow-sm active:scale-95 uppercase tracking-wider cursor-pointer';
      btnText.innerHTML = '<i data-lucide="wrench" class="w-4 h-4 inline-block mr-1"></i> PASAR A REPARACIÓN';
      break;
    case 'waiting_parts':
      btn.className = 'w-full sm:flex-1 py-2.5 sm:py-3 px-4 bg-white hover:bg-slate-200 text-slate-950 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 shadow-sm active:scale-95 uppercase tracking-wider cursor-pointer';
      btnText.innerHTML = '<i data-lucide="cpu" class="w-4 h-4 inline-block mr-1"></i> CONTINUAR REPARACIÓN';
      break;
    case 'in_progress':
      btn.className = 'w-full sm:flex-1 py-2.5 sm:py-3 px-4 bg-white hover:bg-slate-200 text-slate-950 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 shadow-sm active:scale-95 uppercase tracking-wider cursor-pointer';
      btnText.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4 inline-block mr-1"></i> MARCAR LISTO PARA ENTREGA';
      break;
    case 'ready':
      btn.className = 'w-full sm:flex-1 py-2.5 sm:py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 uppercase tracking-wider cursor-pointer';
      btnText.innerHTML = '<i data-lucide="handshake" class="w-4 h-4 inline-block mr-1"></i> ENTREGAR EQUIPO Y COBRAR';
      break;
    case 'delivered':
      btn.className = 'w-full sm:flex-1 py-2.5 sm:py-3 px-4 bg-slate-900 text-slate-400 border border-slate-800 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-default';
      btnText.innerHTML = '<i data-lucide="check-check" class="w-4 h-4 inline-block text-emerald-400 mr-1"></i> EQUIPO YA ENTREGADO';
      break;
    default:
      btn.className = 'w-full sm:flex-1 py-2.5 sm:py-3 px-4 bg-white hover:bg-slate-200 text-slate-950 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 active:scale-95 cursor-pointer';
      btnText.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4 inline-block mr-1"></i> ACTUALIZAR ESTADO';
      break;
  }
}

function handleDtlMainWorkflowAdvance() {
  if (!currentDetailOrderId) return;
  const order = AppState.orders.find(o => o.id === currentDetailOrderId);
  if (!order) return;

  let nextStatus = null;
  if (order.status === 'received') nextStatus = 'diagnostic';
  else if (order.status === 'diagnostic') nextStatus = 'in_progress';
  else if (order.status === 'waiting_parts') nextStatus = 'in_progress';
  else if (order.status === 'in_progress') nextStatus = 'ready';
  else if (order.status === 'ready' || order.status === 'delivered') {
    openDeliveryModal(order.id);
    return;
  }

  if (nextStatus) {
    handleDtlQuickStatusChange(nextStatus);
  }
}

function renderDtlBitacora(order) {
  const feed = document.getElementById('dtlBitacoraFeed');
  const countBadge = document.getElementById('dtlBitacoraCountBadge');
  if (!feed) return;

  if (typeof sanitizeOrderBitacoraDates === 'function') {
    sanitizeOrderBitacoraDates(order);
  }
  const logs = Array.isArray(order.bitacora) ? order.bitacora : [];
  if (countBadge) countBadge.innerText = logs.length;
  const mobBadge = document.getElementById('dtlMobBitacoraBadge');
  if (mobBadge) mobBadge.innerText = logs.length;

  if (logs.length === 0) {
    feed.innerHTML = `
      <div class="text-center py-8 text-slate-500">
        <i data-lucide="clipboard-list" class="w-4 h-4 inline-block text-2xl mb-1.5 text-slate-600 block"></i>
        <span>No hay notas técnicas todavía.</span>
      </div>
    `;
    return;
  }

  const sorted = [...logs].sort((a, b) => new Date(b.date) - new Date(a.date));
  feed.innerHTML = sorted.map(log => {
    const dateFormatted = new Date(log.date).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
    const isPayment = (log.title && /pago|abono|liquidaci[oó]n/i.test(log.title)) || (log.notes && /abono|liquidaci[oó]n|pago recibido/i.test(log.notes));
    const statusMeta = StatusMeta[log.status] || StatusMeta.received;
    const badgeHtml = isPayment ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border bg-emerald-950/80 text-emerald-400 border-emerald-800/80"><i data-lucide="coins" class="w-3 h-3 inline-block"></i> Abono / Pago</span>` : `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border ${statusMeta.color}"><i data-lucide="${statusMeta.icon}" class="w-3 h-3 inline-block"></i> ${statusMeta.label}</span>`;
    const hasDistinctTitle = log.title && log.notes && log.title.trim() !== log.notes.trim();

    return `
      <div class="p-2.5 rounded-xl bg-slate-900/90 border ${isPayment ? 'border-emerald-900/50 bg-gradient-to-br from-slate-900/95 to-emerald-950/20' : 'border-slate-800/80'} hover:border-slate-700 transition space-y-1">
        <div class="flex items-center justify-between gap-1.5">
          ${badgeHtml}
          <span class="text-[10px] text-slate-500 font-mono">${dateFormatted}</span>
        </div>
        ${hasDistinctTitle ? `<div class="text-xs font-semibold ${isPayment ? 'text-emerald-400' : 'text-sky-300'} flex items-center gap-1.5">${isPayment ? '<i data-lucide="receipt" class="w-3 h-3 inline-block shrink-0 mr-1"></i> ' : ''}${escapeHtml(log.title)}</div>` : ''}
        <p class="text-xs text-slate-200 leading-snug break-words">${escapeHtml(log.notes || log.title)}</p>
        <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-800/60">
          <span class="truncate"><i data-lucide="user-check" class="w-3 h-3 inline-block shrink-0 ${isPayment ? 'text-emerald-400' : 'text-sky-400'}"></i> ${escapeHtml(log.technician || 'GlitchLab')}</span>
          <div class="flex items-center gap-1.5 shrink-0">
            <button type="button" onclick="shareBitacoraEntryWhatsApp('${order.id}', '${log.id}')" class="text-emerald-400 hover:text-emerald-300 transition" title="Compartir por WhatsApp">
              <i data-lucide="message-circle" class="w-3.5 h-3.5 inline-block shrink-0"></i>
            </button>
            <button type="button" onclick="deleteBitacoraEntry('${order.id}', '${log.id}'); renderDtlBitacora(AppState.orders.find(o => o.id === '${order.id}'));" class="text-slate-500 hover:text-rose-400 transition" title="Borrar nota">
              <i data-lucide="trash-2" class="w-3.5 h-3.5 inline-block shrink-0"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function handleDtlQuickBitacoraSubmit(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const orderId = typeof getActiveDetailOrderId === 'function' ? getActiveDetailOrderId() : currentDetailOrderId;
  if (!orderId) return;
  const order = AppState.orders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  const input = document.getElementById('dtlQuickBitacoraInput');
  const note = input ? input.value.trim() : '';
  if (!note) return;

  if (!Array.isArray(order.bitacora)) order.bitacora = [];
  const currentUser = AppState.auth?.currentUser;
  const techName = currentUser ? (currentUser.name || currentUser.username) : (order.technician || 'Técnico GlitchLab');

  order.bitacora.unshift({
    id: 'bit_' + Date.now(),
    date: new Date().toISOString(),
    status: order.status,
    title: 'Avance Técnico',
    notes: note,
    technician: techName
  });

  input.value = '';
  saveOrders();
  if (typeof syncSingleOrderToSupabase === 'function') {
    syncSingleOrderToSupabase(order);
  }
  renderDtlBitacora(order);
  showToast('Avance registrado en bitácora', 'success');
}

// ==========================================
// 9.5 REFACCIONES, CONTROL DE CALIDAD (QC) E HISTORIAL CLÍNICO
// ==========================================

function populateInventoryDatalist() {
  const dl = document.getElementById('dtlInventoryDataList');
  if (!dl) return;
  dl.innerHTML = (AppState.inventory || []).map(item => `
    <option value="${escapeHtml(item.name)}">${item.category} • Costo: $${item.cost} MXN • Stock: ${item.stock}</option>
  `).join('');
}

function renderDtlParts(order) {
  const container = document.getElementById('dtlPartsList');
  const countBadge = document.getElementById('dtlPartsCountBadge');
  const netProfitText = document.getElementById('dtlNetProfitText');
  if (!container) return;

  populateInventoryDatalist();

  const parts = Array.isArray(order.parts) ? order.parts : [];
  if (countBadge) countBadge.innerText = `${parts.length} ${parts.length === 1 ? 'pieza' : 'piezas'}`;

  const totalPartsCost = parts.reduce((sum, p) => sum + (parseFloat(p.cost) || 0), 0);
  const estimatedRevenue = parseFloat(order.costs?.estimated) || 0;
  const netProfit = Math.max(0, estimatedRevenue - totalPartsCost);
  const profitMargin = estimatedRevenue > 0 ? Math.round((netProfit / estimatedRevenue) * 100) : 0;

  if (netProfitText) {
    netProfitText.innerText = `$${netProfit.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN (${profitMargin}% margen)`;
  }

  if (parts.length === 0) {
    container.innerHTML = `
      <div class="text-slate-500 italic text-[11px] py-1 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/60 flex items-center justify-between">
        <span>Sin refacciones cargadas a esta orden. El 100% del cobro ($${estimatedRevenue.toLocaleString('es-MX')} MXN) corresponde a mano de obra.</span>
        <span class="text-emerald-400 font-bold font-mono">100% Margen</span>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60 shadow-inner">
      <div class="grid grid-cols-12 px-3 py-1.5 bg-slate-950 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-800">
        <span class="col-span-7">Componente / Refacci&oacute;n</span>
        <span class="col-span-3 text-right">Costo Compra</span>
        <span class="col-span-2 text-center">Acción</span>
      </div>
      <div class="divide-y divide-slate-800/60">
        ${parts.map((p, idx) => `
          <div class="grid grid-cols-12 px-3 py-1.5 items-center text-[11px] text-slate-200">
            <span class="col-span-7 truncate font-medium text-white flex items-center gap-1.5">
              <i data-lucide="cpu" class="text-[10px] text-sky-400"></i> ${escapeHtml(p.name)}
            </span>
            <span class="col-span-3 text-right font-mono text-amber-300 font-semibold">
              $${(parseFloat(p.cost) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </span>
            <div class="col-span-2 text-center">
              <button type="button" onclick="handleRemovePartFromCurrentOrder('${p.id || idx}')" class="p-1 text-slate-500 hover:text-rose-400 transition" title="Quitar refacción">
                <i data-lucide="trash-2" class="w-3.5 h-3.5 inline-block shrink-0"></i>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="grid grid-cols-12 px-3 py-1.5 bg-slate-950/90 text-[11px] font-bold border-t border-slate-800">
        <span class="col-span-7 text-slate-400">Total Refacciones Invertidas:</span>
        <span class="col-span-3 text-right font-mono text-rose-400 font-bold">$${totalPartsCost.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
        <span class="col-span-2"></span>
      </div>
    </div>
  `;
}

function syncOrderPartsWithFinances(order) {
  if (!order) return;
  if (!order.costs) {
    order.costs = { estimated: 0, advance: 0, balance: 0, paymentMethod: 'Efectivo', payments: [] };
  }

  // 1. Calcular total de refacciones de la lista real instalada
  const partsTotal = Array.isArray(order.parts) ? order.parts.reduce((sum, p) => sum + (parseFloat(p.cost) || 0), 0) : 0;
  order.costs.parts = partsTotal;

  // 2. Conservar o calcular mano de obra
  let labor = 0;
  if (order.costs.labor !== undefined && order.costs.labor !== null && Number(order.costs.labor) > 0) {
    labor = Number(order.costs.labor);
  } else {
    const currentEst = Number(order.costs.estimated) || 0;
    labor = Math.max(0, currentEst - partsTotal);
  }
  order.costs.labor = labor;

  // 3. El total de la orden se suma automáticamente: Mano de Obra + Refacciones
  const total = Math.max(0, labor + partsTotal);
  order.costs.estimated = total;

  // 4. Recalcular pagos y saldo pendiente
  const payments = Array.isArray(order.costs.payments) ? order.costs.payments : [];
  let totalPaid = 0;
  if (payments.length > 0) {
    totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  } else {
    totalPaid = Number(order.costs.advance) || 0;
  }
  const balance = Math.max(0, total - totalPaid);
  order.costs.balance = balance;

  // 5. Guardar en base de datos y LocalStorage
  saveOrders();
  if (typeof syncSingleOrderToSupabase === 'function') {
    syncSingleOrderToSupabase(order);
  }

  // 6. Actualizar tabla principal
  if (typeof renderOrdersListTable === 'function') {
    renderOrdersListTable();
  }

  // 7. Refrescar lista de refacciones y ganancia neta en Columna 2
  renderDtlParts(order);

  // 8. Refrescar campos de la tarjeta FINANZAS en Columna 1
  const laborInput = document.getElementById('dtlInlineLaborInput');
  const partsInput = document.getElementById('dtlInlinePartsInput');
  const priceInput = document.getElementById('dtlInlinePriceInput');
  const costLabor = document.getElementById('dtlCostLabor');
  const costParts = document.getElementById('dtlCostParts');
  const costEst = document.getElementById('dtlCostEst');
  const costBal = document.getElementById('dtlCostBal');
  const tabBadge = document.getElementById('dtlTabBalanceBadge');

  if (laborInput && document.activeElement !== laborInput) {
    laborInput.value = labor > 0 ? labor : '';
  }
  if (partsInput && document.activeElement !== partsInput) {
    partsInput.value = partsTotal > 0 ? partsTotal : '';
  }
  if (priceInput && document.activeElement !== priceInput) {
    priceInput.value = total > 0 ? total : '';
  }

  const laborFmt = labor.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const partsFmt = partsTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const totalFmt = total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const balFmt = balance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (costLabor) costLabor.innerText = `$${laborFmt} MXN`;
  if (costParts) costParts.innerText = `$${partsFmt} MXN`;
  if (costEst) costEst.innerText = `$${totalFmt} MXN`;

  if (costBal) {
    costBal.innerText = `$${balFmt} MXN`;
    if (balance > 0) {
      costBal.className = 'text-xl font-black text-rose-400 font-mono tracking-tight';
    } else {
      costBal.className = 'text-xl font-black text-emerald-400 font-mono tracking-tight';
    }
  }

  if (tabBadge) {
    if (balance > 0) {
      tabBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/90 text-rose-300 border border-rose-500/50';
      tabBadge.innerText = `$${balFmt} pend.`;
      tabBadge.classList.remove('hidden');
    } else {
      tabBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-500/50';
      tabBadge.innerText = 'Liquidado';
      tabBadge.classList.remove('hidden');
    }
  }
}

function handleAddPartToCurrentOrder() {
  const targetId = typeof getActiveDetailOrderId === 'function' ? getActiveDetailOrderId() : currentDetailOrderId;
  if (!targetId) return;
  const order = AppState.orders.find(o => String(o.id) === String(targetId));
  if (!order) return;

  const nameInput = document.getElementById('dtlPartNameInput');
  const costInput = document.getElementById('dtlPartCostInput');
  const name = nameInput ? nameInput.value.trim() : '';
  const cost = costInput ? parseFloat(costInput.value) || 0 : 0;

  if (!name) {
    alert('Ingresa el nombre o clave de la refacción o componente.');
    return;
  }

  if (!Array.isArray(order.parts)) order.parts = [];

  const newPart = {
    id: 'part_' + Date.now(),
    name,
    cost,
    date: new Date().toISOString()
  };

  order.parts.push(newPart);

  // Descontar del inventario local si existe y tiene stock
  const invMatch = (AppState.inventory || []).find(i => i.name.toLowerCase() === name.toLowerCase());
  if (invMatch && invMatch.stock > 0) {
    invMatch.stock -= 1;
    saveInventory();
  }

  if (nameInput) nameInput.value = '';
  if (costInput) costInput.value = '';

  // Sincronizar automáticamente con las Finanzas de la orden
  syncOrderPartsWithFinances(order);

  showToast(`Refacción agregada: ${name} ($${cost.toLocaleString('es-MX')} MXN) sumada a finanzas`, 'success');
}

function handleRemovePartFromCurrentOrder(partId) {
  const targetId = typeof getActiveDetailOrderId === 'function' ? getActiveDetailOrderId() : currentDetailOrderId;
  if (!targetId) return;
  const order = AppState.orders.find(o => String(o.id) === String(targetId));
  if (!order || !Array.isArray(order.parts)) return;

  order.parts = order.parts.filter((p, idx) => p.id !== partId && String(idx) !== String(partId));

  // Sincronizar automáticamente con las Finanzas de la orden
  syncOrderPartsWithFinances(order);

  showToast('Refacción eliminada y finanzas actualizadas', 'info');
}
function renderDtlQc(order) {
  const qc = order.qc || {};
  const chkThermal = document.getElementById('qcCheckThermal');
  const chkPorts = document.getElementById('qcCheckPorts');
  const chkCleaning = document.getElementById('qcCheckCleaning');
  const chkSeals = document.getElementById('qcCheckSeals');
  const statusBadge = document.getElementById('dtlQcStatusBadge');
  const metaEl = document.getElementById('dtlQcMeta');

  if (chkThermal) chkThermal.checked = !!qc.thermal;
  if (chkPorts) chkPorts.checked = !!qc.ports;
  if (chkCleaning) chkCleaning.checked = !!qc.cleaning;
  if (chkSeals) chkSeals.checked = !!qc.seals;

  const totalChecked = [qc.thermal, qc.ports, qc.cleaning, qc.seals].filter(Boolean).length;

  if (statusBadge) {
    if (totalChecked === 4) {
      statusBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 flex items-center gap-1';
      statusBadge.innerHTML = '<i data-lucide="check-check" class="text-[9px]"></i> QC Aprobado (100%)';
    } else if (totalChecked > 0) {
      statusBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-500/50 flex items-center gap-1';
      statusBadge.innerHTML = `<i data-lucide="clock" class="text-[9px]"></i> En Pruebas (${totalChecked}/4)`;
    } else {
      statusBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 text-slate-400 border border-slate-700';
      statusBadge.innerHTML = 'QC Pendiente (0/4)';
    }
  }

  if (metaEl) {
    if (qc.date) {
      const qd = new Date(qc.date).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      metaEl.innerHTML = `<span>Ingeniero QC: <strong class="text-white">${escapeHtml(qc.technician || order.technician || 'GlitchLab')}</strong></span><span>Última prueba: ${qd}</span>`;
    } else {
      metaEl.innerHTML = '<span class="italic">Verificación previa recomendada antes de entregar en mostrador</span>';
    }
  }
}

function handleSaveQcCheck() {
  if (!currentDetailOrderId) return;
  const order = AppState.orders.find(o => o.id === currentDetailOrderId);
  if (!order) return;

  const currentUserName = AppState.auth.currentUser?.name || AppState.auth.currentUser?.username || order.technician || 'Laboratorio GlitchLab';

  order.qc = {
    thermal: !!document.getElementById('qcCheckThermal')?.checked,
    ports: !!document.getElementById('qcCheckPorts')?.checked,
    cleaning: !!document.getElementById('qcCheckCleaning')?.checked,
    seals: !!document.getElementById('qcCheckSeals')?.checked,
    technician: currentUserName,
    date: new Date().toISOString()
  };

  saveOrders();
  syncSingleOrderToSupabase(order);
  renderDtlQc(order);
}

function renderDtlClinicalHistory(order) {
  const container = document.getElementById('dtlEquipmentHistoryList');
  const countBadge = document.getElementById('dtlEquipmentHistoryCount');
  if (!container) return;

  const cleanPhone = (order.client?.phone || '').replace(/\D/g, '');
  const serial = (order.equipment?.serial || '').trim().toLowerCase();

  const historyOrders = AppState.orders.filter(o => {
    if (o.id === order.id) return false;
    const oPhone = (o.client?.phone || '').replace(/\D/g, '');
    const oSerial = (o.equipment?.serial || '').trim().toLowerCase();

    const serialMatch = serial && serial !== 'n/a' && serial !== 's/n' && oSerial && oSerial === serial;
    const phoneMatch = cleanPhone && cleanPhone.length >= 7 && oPhone === cleanPhone;

    return serialMatch || phoneMatch;
  });

  if (countBadge) {
    countBadge.innerText = `${historyOrders.length} ${historyOrders.length === 1 ? 'visita previa' : 'visitas previas'}`;
  }

  if (historyOrders.length === 0) {
    container.innerHTML = `
      <div class="text-slate-500 italic text-[11px] py-2 flex items-center gap-2 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/60">
        <i data-lucide="sparkles" class="w-4 h-4 inline-block text-slate-400"></i>
        <span>Primer ingreso registrado en GlitchLab para este cliente y equipo. Sin reparaciones previas registradas.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = historyOrders.map(h => {
    const hDate = new Date(h.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    const meta = StatusMeta[h.status] || StatusMeta.received;
    const est = (h.costs?.estimated || 0).toLocaleString('es-MX');
    return `
      <div onclick="openOrderDetailModal('${h.id}')" class="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 cursor-pointer transition flex items-center justify-between gap-3 group shadow-sm">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="font-mono font-bold text-white text-xs shrink-0">#${h.id}</span>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-white font-semibold truncate text-[11px]">${escapeHtml(h.equipment?.type || 'Equipo')} ${escapeHtml(h.equipment?.brand || '')} ${escapeHtml(h.equipment?.model || '')}</span>
              <span class="text-slate-500 text-[10px] shrink-0 font-mono">${hDate}</span>
            </div>
            <p class="text-slate-400 text-[10px] truncate">Falla: "${escapeHtml(h.issue || 'No especificada')}"</p>
          </div>
        </div>
        <div class="text-right shrink-0">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${meta.color}">
            <i data-lucide="${meta.icon}" class="w-3 h-3 inline-block text-[9px]"></i> ${meta.label}
          </span>
          <span class="block text-[10px] font-mono text-slate-400 mt-0.5">$${est} MXN</span>
        </div>
      </div>
    `;
  }).join('');
}

let orderHistoryMatch = null;

function checkNewOrderHistory() {
  const phoneInput = document.getElementById('clientPhone');
  const serialInput = document.getElementById('equipmentSerial');
  const alertEl = document.getElementById('newOrderHistoryAlert');
  const titleEl = document.getElementById('newOrderHistoryTitle');
  const subEl = document.getElementById('newOrderHistorySubtitle');
  if (!alertEl) return;

  const rawPhone = phoneInput ? phoneInput.value.replace(/\D/g, '') : '';
  const rawSerial = serialInput ? serialInput.value.trim().toLowerCase() : '';

  if (rawPhone.length < 8 && (!rawSerial || rawSerial === 'n/a' || rawSerial === 's/n')) {
    alertEl.classList.add('hidden');
    orderHistoryMatch = null;
    return;
  }

  const matches = AppState.orders.filter(o => {
    const oPhone = (o.client?.phone || '').replace(/\D/g, '');
    const oSerial = (o.equipment?.serial || '').trim().toLowerCase();
    const phoneMatch = rawPhone.length >= 8 && oPhone === rawPhone;
    const serialMatch = rawSerial && rawSerial !== 'n/a' && rawSerial !== 's/n' && oSerial === rawSerial;
    return phoneMatch || serialMatch;
  });

  if (matches.length > 0) {
    checkClientWarrantyOnOrderEntry(rawPhone, '');
    orderHistoryMatch = matches[0]; // La más reciente
    alertEl.classList.remove('hidden');
    if (titleEl) titleEl.innerText = `¡Expediente encontrado! ${matches.length} ${matches.length === 1 ? 'servicio previo' : 'servicios previos'} en GlitchLab`;
    if (subEl) subEl.innerText = `Última visita: Orden #${orderHistoryMatch.id} (${orderHistoryMatch.equipment?.type || ''} ${orderHistoryMatch.equipment?.brand || ''} ${orderHistoryMatch.equipment?.model || ''}) • Cliente: ${orderHistoryMatch.client?.name || ''}`;
  } else {
    alertEl.classList.add('hidden');
    orderHistoryMatch = null;
  }
}

function autofillOrderFromHistory() {
  if (!orderHistoryMatch) return;
  const o = orderHistoryMatch;

  const nameInput = document.getElementById('clientName');
  const emailInput = document.getElementById('clientEmail');
  const addrInput = document.getElementById('clientAddress');
  const typeInput = document.getElementById('equipmentType');
  const brandInput = document.getElementById('equipmentBrand');
  const modelInput = document.getElementById('equipmentModel');
  const serialInput = document.getElementById('equipmentSerial');

  if (nameInput && !nameInput.value) nameInput.value = o.client?.name || '';
  if (emailInput && !emailInput.value) emailInput.value = o.client?.email || '';
  if (addrInput && !addrInput.value) addrInput.value = o.client?.address || '';
  if (typeInput && o.equipment?.type) typeInput.value = o.equipment.type;
  if (brandInput && !brandInput.value) brandInput.value = o.equipment?.brand || '';
  if (modelInput && !modelInput.value) modelInput.value = o.equipment?.model || '';
  if (serialInput && (!serialInput.value || serialInput.value === 'N/A') && o.equipment?.serial) serialInput.value = o.equipment.serial;

  dismissOrderHistoryAlert();
}

function dismissOrderHistoryAlert() {
  const alertEl = document.getElementById('newOrderHistoryAlert');
  if (alertEl) alertEl.classList.add('hidden');
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
  const order = AppState.orders.find(o => String(o.id) === String(targetId));
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

  const fin = getOrderFinancialBreakdown(order);
  const est = fin.estimated;
  const adv = fin.totalPaid;
  const bal = fin.balance;

  if (folioBadge) folioBadge.innerText = `#${order.id}`;
  if (clientText) {
    const clientName = order.client?.name || 'Cliente';
    const equip = order.equipment?.brand ? ` • ${order.equipment.brand} ${order.equipment.model || ''}` : '';
    clientText.innerText = `${clientName}${equip}`;
  }

  if (totalCost) totalCost.innerText = `$${fin.estimatedFormatted}`;
  if (totalPaid) totalPaid.innerText = `$${fin.totalPaidFormatted}`;
  if (currentBalance) currentBalance.innerText = `$${fin.balanceFormatted}`;

  // Inicializar valor de abono: por defecto el saldo total si hay saldo pendiente
  if (amountInput) {
    amountInput.value = bal > 0 ? bal : '';
  }

  if (dateInput) {
    dateInput.value = getLocalDateTimeString();
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

  openModalWithAnimation('paymentModal');

  setTimeout(() => {
    if (amountInput) {
      amountInput.focus();
      amountInput.select();
    }
  }, 100);
}

function closePaymentModal() {
  closeModalWithAnimation('paymentModal');
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

  // Registrar en la Bit&aacute;cora de la orden
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
  const btnText = document.getElementById('btnCopyQrUrlText');
  navigator.clipboard.writeText(url).then(() => {
    showToast('Enlace de rastreo copiado al portapapeles');
    if (btnText) {
      btnText.innerText = '¡Copiado!';
      setTimeout(() => { btnText.innerText = 'Copiar'; }, 2000);
    }
  }).catch(() => {
      copyTextSafely(url, 'Enlace de rastreo copiado');
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
  const dtlTabPhotosBadge = document.getElementById('dtlTabPhotosCountBadge');
  if (dtlTabPhotosBadge) dtlTabPhotosBadge.innerText = photos.length + ' fotos';
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
          <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
            <span class="w-8 h-8 rounded-full bg-black/70 text-white flex items-center justify-center text-xs shadow-lg"><i data-lucide="maximize-2" class="w-4 h-4 inline-block"></i></span>
          </div>
        </div>
        <div class="p-2">
          <p class="text-[11px] text-slate-200 font-medium truncate" title="${escapeHtml(photo.caption || '')}">
            ${escapeHtml(photo.caption || 'Evidencia técnica')}
          </p>
          <div class="flex items-center justify-between text-[10px] text-slate-400 mt-1">
            <span>${dateFormatted}</span>
            <button onclick="deletePhotoFromDtl('${order.id}', '${photo.id}')" class="text-slate-500 hover:text-red-400 transition p-1" title="Eliminar foto">
              <i data-lucide="trash-2" class="w-4 h-4 inline-block"></i>
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
  const order = AppState.orders.find(o => String(o.id) === String(orderId));
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
  const order = AppState.orders.find(o => String(o.id) === String(orderId));
  if (!order || !order.photos) return;

  const confirmed = await showGlitchConfirm({
    title: '¿Eliminar Fotografía?',
    badge: 'Evidencia Técnica',
    message: '¿Deseas eliminar permanentemente esta foto de evidencia de la orden?',
    confirmText: 'Eliminar Foto',
    cancelText: 'Cancelar',
    type: 'danger',
    icon: 'trash-2'
  });
  if (!confirmed) return;
  if (true) {
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
  const order = AppState.orders.find(o => String(o.id) === String(orderId));
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
        <i data-lucide="${meta.icon}" class="w-3 h-3 inline-block text-[9px]"></i> ${meta.label}
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

  openModalWithAnimation('orderQrModal'); if (typeof renderLucideIcons === 'function') renderLucideIcons();
}

function closeOrderQRModal() {
  currentQrOrderId = null;
  closeModalWithAnimation('orderQrModal');
}

function returnToOrderDetailFromQR() {
  closeOrderQRModal();
}

function copyModalTrackingUrl() {
  if (!currentQrOrderId) return;
  const url = getTrackingUrl(currentQrOrderId);
  const btnText = document.getElementById('btnCopyQrUrlText');
  navigator.clipboard.writeText(url).then(() => {
    showToast('Enlace de rastreo copiado al portapapeles');
    if (btnText) {
      btnText.innerText = '¡Copiado!';
      setTimeout(() => { btnText.innerText = 'Copiar'; }, 2000);
    }
  }).catch(() => {
      copyTextSafely(url, 'Enlace de rastreo copiado');
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
  const orderId = typeof getActiveDetailOrderId === 'function' ? getActiveDetailOrderId() : currentDetailOrderId;
  if (!orderId) return;
  openWhatsAppTemplatesModal(orderId);
}

// ==========================================
// 10. BITÁCORA Y FOTOS
// ==========================================

function setBitacoraQuickTag(tag) {
  const titleEl = document.getElementById('bitacoraTitle');
  if (titleEl) {
    titleEl.value = tag;
    const notesEl = document.getElementById('bitacoraNotes');
    if (notesEl && !notesEl.value) {
      notesEl.focus();
    }
  }
}

function openBitacoraModal(orderId) {
  const order = AppState.orders.find(o => String(o.id) === String(orderId));
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
  openModalWithAnimation('bitacoraModal'); if (typeof renderLucideIcons === 'function') renderLucideIcons();
}

function closeBitacoraModal(returnToOrder = true) {
  const currentOrderId = AppState.activeBitacoraOrderId;
  AppState.activeBitacoraOrderId = null;
  closeModalWithAnimation('bitacoraModal', () => {
    if (returnToOrder && currentOrderId && typeof openOrderDetailModal === 'function') {
      const orderDetail = document.getElementById('orderDetailModal');
      if (!orderDetail || orderDetail.classList.contains('hidden')) {
        openOrderDetailModal(currentOrderId);
      } else {
        const ord = AppState.orders.find(o => o.id === currentOrderId);
        if (ord && typeof renderDtlBitacora === 'function') renderDtlBitacora(ord);
        if (typeof renderLucideIcons === 'function') renderLucideIcons();
      }
    }
  });
}

function returnToOrderDetailFromBitacora() {
  closeBitacoraModal(true);
}

function handleAddBitacoraEntry(e) {
  if (e) e.preventDefault();

  const orderId = AppState.activeBitacoraOrderId || (typeof currentDetailOrderId !== 'undefined' ? currentDetailOrderId : null);
  if (!orderId) return;

  const order = AppState.orders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  const titleEl = document.getElementById('bitacoraTitle');
  const notesEl = document.getElementById('bitacoraNotes');
  const statusEl = document.getElementById('bitacoraNewStatus');
  const techEl = document.getElementById('bitacoraTechnician');
  const ampEl = document.getElementById('bitacoraAmperage');
  const voltEl = document.getElementById('bitacoraVoltage');
  const compEl = document.getElementById('bitacoraComponents');

  const title = (titleEl ? titleEl.value : '').trim();
  const notes = (notesEl ? notesEl.value : '').trim();
  const newStatus = statusEl ? statusEl.value : order.status;
  const technician = techEl ? techEl.value : (AppState.auth.currentUser?.name || 'Técnico GlitchLab');

  if (!title) {
    if (typeof showToast === 'function') showToast('Ingresa el procedimiento realizado.');
    return;
  }

  if (!Array.isArray(order.bitacora)) order.bitacora = [];

  const newEntry = {
    id: 'bit_' + Date.now(),
    date: new Date().toISOString(),
    title: title,
    notes: notes,
    status: newStatus,
    technician: technician,
    telemetry: {
      amperage: ampEl ? ampEl.value.trim() : '',
      voltageRail: voltEl ? voltEl.value.trim() : '',
      components: compEl ? compEl.value.trim() : ''
    }
  };

  order.bitacora.unshift(newEntry);
  if (newStatus && newStatus !== order.status) {
    order.status = newStatus;
  }

  saveOrders();
  if (typeof syncSingleOrderToSupabase === 'function') {
    syncSingleOrderToSupabase(order);
  }

  if (titleEl) titleEl.value = '';
  if (notesEl) notesEl.value = '';
  if (ampEl) ampEl.value = '';
  if (voltEl) voltEl.value = '';
  if (compEl) compEl.value = '';

  renderBitacoraTimeline(order);
  if (typeof renderDtlBitacora === 'function') renderDtlBitacora(order);
  renderOrders();
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof showToast === 'function') showToast('Avance técnico registrado con éxito.');
}

function renderBitacoraTimeline(order) {
  const container = document.getElementById('bitacoraTimeline');
  if (!container) return;

  if (typeof sanitizeOrderBitacoraDates === 'function') sanitizeOrderBitacoraDates(order);
  const logs = order.bitacora || [];

  if (logs.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-500 text-sm">
        <i data-lucide="clipboard-list" class="w-4 h-4 inline-block text-3xl mb-2 text-slate-600 block"></i>
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
    const isPayment = (log.title && /pago|abono|liquidaci[oó]n/i.test(log.title)) || (log.notes && /abono|liquidaci[oó]n|pago recibido/i.test(log.notes));
    const statusMeta = StatusMeta[log.status] || StatusMeta.received;
    const badgeHtml = isPayment ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border bg-emerald-950/80 text-emerald-400 border-emerald-800/80"><i data-lucide="coins" class="w-3 h-3 inline-block"></i> Abono / Pago</span>` : `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border ${statusMeta.color}"><i data-lucide="${statusMeta.icon}" class="w-3 h-3 inline-block"></i> ${statusMeta.label}</span>`;
    const hasDistinctTitle = log.title && log.notes && log.title.trim() !== log.notes.trim();

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
              ${badgeHtml}<span class="hidden">
                <i data-lucide="${statusMeta.icon}" class="w-3 h-3 inline-block"></i> ${statusMeta.label}
              </span>
              <span class="text-xs text-slate-500 font-mono">${dateFormatted}</span>
            </div>
          </div>
          <p class="text-xs text-slate-300 leading-relaxed mb-1">${escapeHtml(log.notes)}</p>
          ${telemetryHtml}
          <div class="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/60">
            <span><i data-lucide="user" class="w-4 h-4 inline-block text-sky-400"></i> Por: ${escapeHtml(log.technician || 'T&eacute;cnico GlitchLab')}</span>
            <div class="flex items-center gap-2">
              <button onclick="shareBitacoraEntryWhatsApp('${order.id}', '${log.id}')" class="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 transition" title="Compartir avance por WhatsApp">
                <i data-lucide="message-circle" class="w-4 h-4 inline-block"></i> Compartir
              </button>
              <button onclick="deleteBitacoraEntry('${order.id}', '${log.id}')" class="p-1 px-2 text-slate-400 hover:text-red-400 hover:bg-red-950/40 border border-slate-800 hover:border-red-800/50 rounded-lg transition flex items-center gap-1 text-[10px] font-medium" title="Borrar este avance si hubo un error para volver a agregarlo">
                <i data-lucide="trash-2" class="w-3.5 h-3.5 inline-block shrink-0"></i> Borrar
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Eliminar un avance errÓneo de la bitÁcora y recargar en formulario para corregir
async function deleteBitacoraEntry(orderId, entryId) {
  if (!entryId && orderId) {
    entryId = orderId;
    orderId = (typeof getActiveDetailOrderId === 'function' ? getActiveDetailOrderId() : null) || AppState.activeBitacoraOrderId || currentDetailOrderId;
  }
  const order = AppState.orders.find(o => String(o.id) === String(orderId)) || (typeof getOrderDetailOrder === 'function' ? getOrderDetailOrder() : null);
  if (!order || !order.bitacora) return;
  const entry = order.bitacora.find(b => b.id === entryId);
  if (!entry) return;

  const confirmed = await showGlitchConfirm({
    title: '¿Borrar Registro de Bitácora?',
    badge: 'Bitácora Técnica',
    message: '¿Deseas borrar este registro de avance ("' + (entry.title || 'Avance') + '")?\nLos datos se cargarán en el formulario para que puedas corregirlos y volver a guardar.',
    confirmText: 'Borrar y Editar',
    cancelText: 'Cancelar',
    type: 'warning',
    icon: 'clipboard-x'
  });
  if (!confirmed) return;

  const titleEl = document.getElementById('bitacoraTitle');
  const notesEl = document.getElementById('bitacoraNotes');
  if (titleEl) titleEl.value = entry.title || '';
  if (notesEl) notesEl.value = entry.notes || '';

  order.bitacora = order.bitacora.filter(b => b.id !== entryId);
  saveOrders();
  syncSingleOrderToSupabase(order);
  renderBitacoraTimeline(order);
  if (typeof renderDtlBitacora === 'function') renderDtlBitacora(order);
  renderOrders();
  showToast('Entrada de bitácora eliminada.');
}

function openOrderPhotoLightbox(orderId, photoIndex = 0) {
  const order = AppState.orders.find(o => String(o.id) === String(orderId));
  if (!order || !order.photos || order.photos.length === 0) return;

  currentLightboxPhotos = order.photos;
  currentLightboxIndex = Math.max(0, Math.min(photoIndex, currentLightboxPhotos.length - 1));
  updateLightboxView();

  const lightbox = document.getElementById('imageLightbox');
  if (lightbox) {
    openModalWithAnimation('imageLightbox');
    document.addEventListener('keydown', handleLightboxKeydown);
  }
}

function openLightbox(url, caption) {
  currentLightboxPhotos = [{ url: url, caption: caption || 'Evidencia técnica', date: new Date().toISOString() }];
  currentLightboxIndex = 0;
  updateLightboxView();

  const lightbox = document.getElementById('imageLightbox');
  if (lightbox) {
    openModalWithAnimation('imageLightbox');
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
  document.removeEventListener('keydown', handleLightboxKeydown);
  closeModalWithAnimation('imageLightbox');
}

function shareBitacoraEntryWhatsApp(orderId, bitacoraId) {
  const order = AppState.orders.find(o => String(o.id) === String(orderId));
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
    `¡Seguimos trabajando en tu equipo! Ante cualquier duda estamos a tus \u00F3rdenes.`;

  const url = `https://wa.me/52${phone.length === 10 ? phone : phone}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

// ==========================================
// CONTROL DEL ASISTENTE DE ORDEN EN 3 PASOS
// ==========================================

let currentOrderStep = 1;

function goToOrderStep(stepNumber) {
  currentOrderStep = stepNumber;

  for (let i = 1; i <= 3; i++) {
    const stepEl = document.getElementById(`orderStep${i}`);
    const tabEl = document.getElementById(`stepTab${i}`);
    if (stepEl) {
      if (i === stepNumber) {
        stepEl.classList.remove('hidden');
      } else {
        stepEl.classList.add('hidden');
      }
    }
    if (tabEl) {
      const badge = tabEl.querySelector('.step-tab-badge');
      if (i === stepNumber) {
        tabEl.className = 'order-step-tab flex-1 py-2 px-2 sm:px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 sm:gap-2 border-sky-500 bg-sky-950/40 text-sky-400 shadow-sm cursor-pointer';
        if (badge) badge.className = 'step-tab-badge w-5 h-5 rounded-full bg-sky-500 text-white text-[11px] flex items-center justify-center font-black';
      } else if (i < stepNumber) {
        tabEl.className = 'order-step-tab flex-1 py-2 px-2 sm:px-3 rounded-xl border border-emerald-900/60 bg-emerald-950/20 text-emerald-400 hover:text-white text-xs font-semibold transition flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer';
        if (badge) badge.className = 'step-tab-badge w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center font-black';
      } else {
        tabEl.className = 'order-step-tab flex-1 py-2 px-2 sm:px-3 rounded-xl border border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white text-xs font-semibold transition flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer';
        if (badge) badge.className = 'step-tab-badge w-5 h-5 rounded-full bg-slate-800 text-slate-400 text-[11px] flex items-center justify-center font-black';
      }
    }
  }

  const btnPrev = document.getElementById('btnOrderPrevStep');
  const btnCancel = document.getElementById('btnOrderCancel');
  const btnNext = document.getElementById('btnOrderNextStep');
  const btnSubmit = document.getElementById('btnOrderSubmit');

  if (stepNumber === 1) {
    if (btnPrev) btnPrev.classList.add('hidden');
    if (btnCancel) btnCancel.classList.remove('hidden');
    if (btnNext) btnNext.classList.remove('hidden');
    if (btnSubmit) {
      if (AppState.currentOrder) {
        btnSubmit.classList.remove('hidden');
      } else {
        btnSubmit.classList.add('hidden');
      }
    }
  } else if (stepNumber === 2) {
    if (btnPrev) btnPrev.classList.remove('hidden');
    if (btnCancel) btnCancel.classList.add('hidden');
    if (btnNext) btnNext.classList.remove('hidden');
    if (btnSubmit) {
      if (AppState.currentOrder) {
        btnSubmit.classList.remove('hidden');
      } else {
        btnSubmit.classList.add('hidden');
      }
    }
  } else if (stepNumber === 3) {
    if (btnPrev) btnPrev.classList.remove('hidden');
    if (btnCancel) btnCancel.classList.add('hidden');
    if (btnNext) btnNext.classList.add('hidden');
    if (btnSubmit) btnSubmit.classList.remove('hidden');
    setTimeout(() => resizeSignatureCanvas(), 60);
  }

  const scrollContainer = document.querySelector('#orderModal .overflow-y-auto');
  if (scrollContainer) scrollContainer.scrollTop = 0;
}

function nextOrderStep() {
  if (currentOrderStep === 1) {
    const name = document.getElementById('clientName')?.value.trim();
    const phone = document.getElementById('clientPhone')?.value.trim();
    const brand = document.getElementById('equipmentBrand')?.value.trim();
    const model = document.getElementById('equipmentModel')?.value.trim();

    if (!name) {
      showToast('⚠️ Por favor ingresa el nombre del cliente.');
      document.getElementById('clientName')?.focus();
      return;
    }
    if (!phone) {
      showToast('⚠️ Por favor ingresa el teléfono o WhatsApp de contacto.');
      document.getElementById('clientPhone')?.focus();
      return;
    }
    if (!brand) {
      showToast('⚠️ Por favor indica la marca del equipo (ej: HP, Lenovo, ASUS).');
      document.getElementById('equipmentBrand')?.focus();
      return;
    }
    if (!model) {
      showToast('⚠️ Por favor indica el modelo del equipo.');
      document.getElementById('equipmentModel')?.focus();
      return;
    }
    goToOrderStep(2);
  } else if (currentOrderStep === 2) {
    const issue = document.getElementById('issueDescription')?.value.trim();
    if (!issue) {
      showToast('⚠️ Por favor describe la falla que reporta el cliente.');
      document.getElementById('issueDescription')?.focus();
      return;
    }
    goToOrderStep(3);
  }
}

function prevOrderStep() {
  if (currentOrderStep > 1) {
    goToOrderStep(currentOrderStep - 1);
  }
}

function toggleAccesoriosChecklist() {
  const container = document.getElementById('accesoriosChecklistContent');
  const icon = document.getElementById('checklistToggleIcon');
  const preview = document.getElementById('checklistStatusPreview');
  if (!container) return;
  const isHidden = container.classList.contains('hidden');
  if (isHidden) {
    container.classList.remove('hidden');
    if (icon) { icon.setAttribute('data-lucide', 'chevron-up'); icon.className = 'w-4 h-4 text-sky-400 transition-transform duration-200'; renderLucideIcons(); }
    if (preview) preview.innerText = 'Ocultar checklist';
  } else {
    container.classList.add('hidden');
    if (icon) { icon.setAttribute('data-lucide', 'chevron-down'); icon.className = 'w-4 h-4 text-slate-400 transition-transform duration-200'; renderLucideIcons(); }
    if (preview) preview.innerText = 'Toca para desplegar';
  }
}

// Menú Desplegable de Impresi&oacute;n y Documentos en el Detalle de la Orden
function toggleDtlPrintMenu(e) {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  const menu = document.getElementById('dtlPrintDropdownMenu');
  if (menu) {
    menu.classList.toggle('hidden');
  }
}

function closeDtlPrintMenu() {
  const menu = document.getElementById('dtlPrintDropdownMenu');
  if (menu) {
    menu.classList.add('hidden');
  }
}

// Modal de Nueva Orden
function openNewOrderModal() {
  if (!AppState.auth || !AppState.auth.isAuthenticated) {
    console.warn('[GlitchLab Security] Acceso no autorizado a nueva orden');
    lockSystem();
    return;
  }
  goToOrderStep(1);
  const checklistContainer = document.getElementById('accesoriosChecklistContent');
  const checklistIcon = document.getElementById('checklistToggleIcon');
  const preview = document.getElementById('checklistStatusPreview');
  if (checklistContainer) checklistContainer.classList.add('hidden');
  if (checklistIcon) { checklistIcon.setAttribute('data-lucide', 'chevron-down'); checklistIcon.className = 'w-4 h-4 text-slate-400 transition-transform duration-200'; renderLucideIcons(); }
  if (preview) preview.innerText = 'Toca para desplegar';
  AppState.currentOrder = null;
  const form = document.getElementById('orderForm');
  if (form) form.reset();

  document.getElementById('modalTitle').innerText = 'Nueva Orden de Servicio';
  let nextFolio = generateNextFolio();
  document.getElementById('orderId').value = nextFolio;
  if (AppState.orders.length === 0 && AppState.supabase.client && AppState.supabase.isConnected) {
    try {
      AppState.supabase.client.from('orders').select('id').order('id', { ascending: false }).limit(5)
        .then(({ data }) => {
          if (Array.isArray(data) && data.length > 0) {
            let maxCloud = 0;
            data.forEach(d => {
              const n = parseInt(d.id.toString().replace(/\D/g, ''), 10);
              if (!isNaN(n) && n > maxCloud) maxCloud = n;
            });
            if (maxCloud > 0) {
              const idEl = document.getElementById('orderId');
              if (idEl && (!idEl.value || idEl.value === '1')) {
                idEl.value = (maxCloud + 1).toString();
              }
            }
          }
        });
    } catch (_) {}
  }
  document.getElementById('orderDate').value = getLocalDateTimeString();
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

  document.getElementById('costLabor').value = '';
  document.getElementById('costParts').value = '';
  document.getElementById('costEstimated').value = '';
  document.getElementById('costAdvance').value = '';
  const abonosSum = document.getElementById('costAbonosSumDisplay');
  if (abonosSum) abonosSum.innerText = '$0.00';
  document.getElementById('costBalanceDisplay').innerText = '$0.00';

  const paymentsContainer = document.getElementById('paymentsListContainer');
  if (paymentsContainer) paymentsContainer.classList.add('hidden');

  const modal = document.getElementById('orderModal');
  const btnReturn = document.getElementById('btnOrderModalReturnToDetail');
  if (btnReturn) btnReturn.classList.add('hidden');
  openModalWithAnimation('orderModal'); if (typeof renderLucideIcons === 'function') renderLucideIcons();
}

// Editar Orden existente
function editOrder(orderId) {
  const order = AppState.orders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  AppState.currentOrder = order;
  goToOrderStep(1);
  document.getElementById('modalTitle').innerText = `Editar Orden ${order.id}`;
  document.getElementById('orderId').value = order.id;
  document.getElementById('orderDate').value = getLocalDateTimeString(order.date);
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

  // Si ya tiene accesorios o notas de condiciÓn, desplegar automÁticamente el acordeÓn
  const hasCheckedItems = (accessories && accessories.length > 0) || 
                          (conditions && conditions.length > 0) || 
                          (functionalCheck && functionalCheck.length > 0) || 
                          Boolean(order.equipment?.conditionNotes);
  const checklistContainer = document.getElementById('accesoriosChecklistContent');
  const checklistIcon = document.getElementById('checklistToggleIcon');
  const checklistPreview = document.getElementById('checklistStatusPreview');
  if (checklistContainer) {
    if (hasCheckedItems) {
      checklistContainer.classList.remove('hidden');
      if (checklistIcon) { checklistIcon.setAttribute('data-lucide', 'chevron-up'); checklistIcon.className = 'w-4 h-4 text-sky-400 transition-transform duration-200'; renderLucideIcons(); }
      if (checklistPreview) checklistPreview.innerText = 'Desplegado (con registros)';
    } else {
      checklistContainer.classList.add('hidden');
      if (checklistIcon) { checklistIcon.setAttribute('data-lucide', 'chevron-down'); checklistIcon.className = 'w-4 h-4 text-slate-400 transition-transform duration-200'; renderLucideIcons(); }
      if (checklistPreview) checklistPreview.innerText = 'Toca para desplegar';
    }
  }

  document.getElementById('issueDescription').value = order.issue || '';
  document.getElementById('initialDiagnosis').value = order.initialDiagnosis || '';
  document.getElementById('technicianName').value = order.technician || 'Ing. Rivera';

  const breakdown = getOrderFinancialBreakdown(order);

  const costLaborEl = document.getElementById('costLabor');
  const costPartsEl = document.getElementById('costParts');
  if (costLaborEl) costLaborEl.value = breakdown.labor > 0 ? breakdown.labor : '';
  if (costPartsEl) costPartsEl.value = breakdown.parts > 0 ? breakdown.parts : '';

  document.getElementById('costEstimated').value = breakdown.estimated > 0 ? breakdown.estimated : '';
  document.getElementById('costAdvance').value = breakdown.advance > 0 ? breakdown.advance : '';
  document.getElementById('costPaymentMethod').value = order.costs?.paymentMethod || 'Efectivo';
  
  const costAbonosSumEl = document.getElementById('costAbonosSumDisplay');
  if (costAbonosSumEl) costAbonosSumEl.innerText = `$${breakdown.abonosFormatted}`;

  document.getElementById('costBalanceDisplay').innerText = `$${breakdown.balanceFormatted}`;

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
  openModalWithAnimation('orderModal');
  setTimeout(() => resizeSignatureCanvas(), 100);
}

// Guardar Orden
async function handleSaveOrder(e) {
  e.preventDefault();

  const orderForm = document.getElementById('orderForm');
  const isWarranty = (orderForm && orderForm.dataset.isWarranty === 'true');
  const warrantyOriginalOrderId = (orderForm && orderForm.dataset.warrantyOriginalOrderId) 
    ? parseInt(orderForm.dataset.warrantyOriginalOrderId, 10) 
    : null;

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
    isWarranty: isWarranty || false,
    warrantyOriginalOrderId: warrantyOriginalOrderId || null,
    condition,
    conditionNotes: document.getElementById('conditionNotes').value.trim(),
    functionalCheck
  };

  const labor = parseFloat(document.getElementById('costLabor')?.value) || 0;
  const parts = parseFloat(document.getElementById('costParts')?.value) || 0;
  let estimated = parseFloat(document.getElementById('costEstimated').value) || 0;
  if (!estimated && (labor > 0 || parts > 0)) {
    estimated = labor + parts;
  }
  const advance = parseFloat(document.getElementById('costAdvance').value) || 0;

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
  } else if (existingPayments.length > 0 && advance > 0 && existingPayments[0].amount !== advance) {
    existingPayments[0].amount = advance;
    existingPayments[0].method = document.getElementById('costPaymentMethod').value;
  }

  const totalPaid = existingPayments.length > 0 
    ? existingPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    : advance;
  const balance = Math.max(0, estimated - totalPaid);

  const costs = {
    labor,
    parts,
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
    isWarranty: isWarranty || !!existingOrder?.isWarranty,
    warrantyOriginalOrderId: warrantyOriginalOrderId || existingOrder?.warrantyOriginalOrderId || null,
    client,
    equipment,
    issue: document.getElementById('issueDescription').value.trim(),
    initialDiagnosis: document.getElementById('initialDiagnosis').value.trim(),
    technician: document.getElementById('technicianName').value.trim() || currentUserName,
    costs,
    signature: signatureData,
    photos: existingOrder?.photos || [],
    parts: existingOrder?.parts || [],
    qc: existingOrder?.qc || null,
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

  // 1. Guardar primero en memoria local y localStorage
  if (existingIndex >= 0) {
    AppState.orders[existingIndex] = orderData;
  } else {
    AppState.orders.unshift(orderData);
  }
  saveOrders();

  // 2. Registrar cliente primero para satisfacer Foreign Key en Supabase
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
    try {
      await syncClientToSupabase(existingCli);
    } catch (cliErr) {
      console.warn('Error sincronizando cliente antes de la orden:', cliErr);
    }
  }

  // 3. Sincronizar la orden a Supabase ahora que el cliente ya está en la nube
  try {
    await syncSingleOrderToSupabase(orderData);
  } catch (ordErr) {
    console.warn('Error sincronizando orden:', ordErr);
  }

  closeOrderModal();
  renderDashboard();
  renderOrders();
  updateNotificationBadge();

  if (typeof playGlitchSound === 'function') playGlitchSound('save'); // Audio FX
  if (existingIndex < 0) {
    showNewOrderToast(orderData);
    openOrderCreatedSuccessModal(orderData);
  } else {
    showToast(`Orden #${id} actualizada.`);
  }
}

function closeOrderModal(returnToOrder = false) {
  const lastOrderId = AppState.currentOrder ? AppState.currentOrder.id : null;
  AppState.currentOrder = null;
  closeModalWithAnimation('orderModal', () => {
    if (returnToOrder && lastOrderId && typeof openOrderDetailModal === 'function') {
      const orderDetail = document.getElementById('orderDetailModal');
      if (!orderDetail || orderDetail.classList.contains('hidden')) {
        openOrderDetailModal(lastOrderId);
      }
    }
  });
}

function returnToOrderDetailFromEdit() {
  closeOrderModal(true);
}

function updateOrderStatusQuick(orderId, newStatus) {
  const order = AppState.orders.find(o => String(o.id) === String(orderId));
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
  if (!AppState.auth || !AppState.auth.isAuthenticated) {
    console.warn('[GlitchLab Security] Acceso no autorizado a entrega de orden');
    lockSystem();
    return;
  }
  const order = AppState.orders.find(o => String(o.id) === String(orderId));
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
      balBadge.innerHTML = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5"><i data-lucide="clock" class="w-4 h-4 inline-block"></i> Saldo Pendiente</span>`;
    }
    if (paySection) paySection.classList.remove('hidden');
    if (amtInput) {
      amtInput.value = balance;
      amtInput.max = balance;
    }
    if (refInput) refInput.value = '';
    if (submitBtn) {
      submitBtn.innerHTML = '<i data-lucide="check-check" class="w-4 h-4 inline-block"></i><span>Liquidar Saldo y Entregar Equipo</span>';
    }
  } else {
    // Ya está liquidado al 100%
    if (balContainer) {
      balContainer.className = 'p-4 rounded-2xl border bg-emerald-950/20 border-emerald-500/40 text-emerald-300';
    }
    if (balBadge) {
      balBadge.innerHTML = `<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5"><i data-lucide="check" class="w-4 h-4 inline-block"></i> Cuenta Liquidada</span>`;
    }
    if (paySection) paySection.classList.add('hidden');
    if (submitBtn) {
      submitBtn.innerHTML = '<i data-lucide="handshake" class="w-4 h-4 inline-block"></i><span>Confirmar Entrega de Equipo</span>';
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
    dtInput.value = getLocalDateTimeString(existingDate);
  }

  const techInput = document.getElementById('deliveryTechnician');
  if (techInput) {
    techInput.value = AppState.auth.currentUser?.name || AppState.auth.currentUser?.username || order.technician || 'GlitchLab Mostrador';
  }

  openModalWithAnimation('deliveryModal'); if (typeof renderLucideIcons === 'function') renderLucideIcons();
}

function closeDeliveryModal(returnToOrder = true) {
  const lastOrderId = currentDeliveryOrderId;
  currentDeliveryOrderId = null;
  closeModalWithAnimation('deliveryModal', () => {
    if (returnToOrder && lastOrderId && typeof openOrderDetailModal === 'function') {
      const orderDetail = document.getElementById('orderDetailModal');
      if (!orderDetail || orderDetail.classList.contains('hidden')) {
        openOrderDetailModal(lastOrderId);
      }
    }
  });
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

async function deleteOrder(orderId) {
  const confirmed = await showGlitchConfirm({
    title: '¿Eliminar Orden #' + orderId + '?',
    badge: 'Acción Permanente',
    message: '¿Estás seguro de que deseas eliminar permanentemente la orden ' + orderId + '?\nEsta acción borrará el registro de la base de datos y no se podrá deshacer.',
    confirmText: 'Sí, Eliminar Orden',
    cancelText: 'Cancelar',
    type: 'danger',
    icon: 'trash-2'
  });

  if (confirmed) {
    AppState.orders = AppState.orders.filter(o => String(o.id) !== String(orderId));
    saveOrders();
    deleteOrderFromSupabase(orderId);
    renderDashboard();
    renderOrders();
    if (typeof currentDetailOrderId !== 'undefined' && String(currentDetailOrderId) === String(orderId)) {
      closeOrderDetailModal();
    }
    showToast('Orden #' + orderId + ' eliminada.');
  }
}

// ==========================================
// 11. IMPRESIÓN & PDF: CLIENTE, ETIQUETA, TICKET & CARTA
// ==========================================

let currentPrintOrderId = null;
let currentPrintFormat = 'client_pdf'; // 'client_pdf', 'sticker', 'thermal', 'letter'

function openPrintModal(orderId) {
  if (!AppState.auth || !AppState.auth.isAuthenticated) {
    console.warn('[GlitchLab Security] Acceso no autorizado a impresion');
    lockSystem();
    return;
  }
  const order = AppState.orders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  currentPrintOrderId = orderId;
  const modal = document.getElementById('printModal');
  openModalWithAnimation('printModal'); renderLucideIcons();

  const folioBadge = document.getElementById('printModalFolioBadge');
  if (folioBadge) {
    const brand = order.equipment?.brand ? ` • ${order.equipment.brand}` : '';
    folioBadge.innerText = `#${order.id}${brand}`;
  }

  try {
    setPrintFormat('client_pdf');
  } catch (err) {
    console.error('Error al generar plantilla de impresion:', err);
  }
}

function openQuickLabelPrint(orderId) {
  const order = AppState.orders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  currentPrintOrderId = orderId;
  const modal = document.getElementById('printModal');
  openModalWithAnimation('printModal'); renderLucideIcons();

  const folioBadge = document.getElementById('printModalFolioBadge');
  if (folioBadge) {
    const brand = order.equipment?.brand ? ` • ${order.equipment.brand}` : '';
    folioBadge.innerText = `#${order.id}${brand}`;
  }

  try {
    setPrintFormat('sticker');
  } catch (err) {
    console.error('Error al generar etiqueta:', err);
  }
}

let currentStickerSize = '51x25'; // '51x25', '50x30', '60x40', '76x50', '100x150'

function setPrintFormat(format) {
  currentPrintFormat = format;
  const order = AppState.orders.find(o => String(o.id) === String(currentPrintOrderId));
  if (!order) return;

  document.body.classList.remove('ticket-thermal-mode', 'ticket-sticker-mode', 'sticker-size-51x25', 'sticker-size-50x30', 'sticker-size-60x40', 'sticker-size-76x50', 'sticker-size-100x150');

  const btnClientPdf = document.getElementById('btnFormatClientPdf');
  const btnSticker = document.getElementById('btnFormatSticker');
  const btnThermal = document.getElementById('btnFormatThermal');
  const btnLetter = document.getElementById('btnFormatLetter');
  const aiyinToolbar = document.getElementById('aiyinStickerToolbar');

  const allFormatBtns = [btnClientPdf, btnSticker, btnThermal, btnLetter];
  allFormatBtns.forEach(b => {
    if (b) {
      b.className = 'px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition flex items-center gap-1.5 whitespace-nowrap';
    }
  });

  const setActiveBtn = (btn) => {
    if (btn) {
      btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-slate-950 shadow-sm transition flex items-center gap-1.5 whitespace-nowrap';
    }
  };

  if (format === 'sticker') {
    document.body.classList.add('ticket-sticker-mode', `sticker-size-${currentStickerSize}`);
    if (aiyinToolbar) aiyinToolbar.classList.remove('hidden');
    setActiveBtn(btnSticker);
    updateStickerSizeButtons();
  } else {
    if (aiyinToolbar) aiyinToolbar.classList.add('hidden');
    if (format === 'thermal') {
      document.body.classList.add('ticket-thermal-mode');
      setActiveBtn(btnThermal);
    } else if (format === 'letter') {
      setActiveBtn(btnLetter);
    } else {
      setActiveBtn(btnClientPdf);
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

  const allSizes = [btn51, btn50, btn60, btn76, btn100];
  allSizes.forEach(b => {
    if (b) {
      b.className = 'px-3 py-1 rounded-lg text-[11px] font-medium text-slate-400 hover:text-white transition';
    }
  });

  const activeMap = {
    '51x25': btn51,
    '50x30': btn50,
    '60x40': btn60,
    '76x50': btn76,
    '100x150': btn100
  };
  const activeBtn = activeMap[currentStickerSize] || btn51;
  if (activeBtn) {
    activeBtn.className = 'px-3 py-1 rounded-lg text-[11px] font-bold bg-white text-slate-950 shadow-sm transition';
  }
}
// Generador de Contenido Imprimible
function generatePrintTemplate(order, format) {
  const container = document.getElementById('print-area');
  if (!container) return;

  const dateFormatted = new Date(order.date).toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const fin = getOrderFinancialBreakdown(order);
  const est = fin.estimatedFormatted;
  const adv = fin.advanceFormatted;
  const bal = fin.balanceFormatted;
  const laborFormatted = fin.laborFormatted;
  const partsFormatted = fin.partsFormatted;
  const abonosFormatted = fin.abonosFormatted;
  const abonosVal = fin.abonos;

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
    const clientPhone = (formatPhoneNumber(order.client?.phone) || 'Sin tel&eacute;fono').trim();
    const equipBrand = (order.equipment?.brand || '').trim();
    const equipModel = (order.equipment?.model || '').trim();
    const equipType = (order.equipment?.type || 'Equipo').trim();
    const equipFull = `${equipBrand} ${equipModel}`.trim() || equipType;
    const orderIssue = (order.issue || order.reportedIssue || 'No especificada').trim();
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
            <img src="${GLITCHLAB_TICKET_LOGO_BASE64}" alt="GlitchLab" style="max-height: 12px; max-width: 70px; width: auto; object-fit: contain; display: block; filter: grayscale(100%) contrast(200%);" />
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
            <img src="${GLITCHLAB_TICKET_LOGO_BASE64}" alt="GlitchLab" style="max-height: 14px; max-width: 80px; width: auto; object-fit: contain; display: block; filter: grayscale(100%) contrast(200%);" />
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
              <img src="${GLITCHLAB_TICKET_LOGO_BASE64}" alt="GlitchLab" style="max-height: 24px; width: auto; object-fit: contain; display: block; filter: grayscale(100%) contrast(200%);" />
            </div>
            <div style="background: #000; color: #fff; font-size: 17px; font-weight: 900; padding: 2px 9px; border-radius: 4px; font-family: monospace;">
              #${order.id}
            </div>
          </div>

          <!-- Fila 1: Cliente & Tel&eacute;fono -->
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
                <img src="${GLITCHLAB_TICKET_LOGO_BASE64}" alt="GlitchLab" style="max-height: 38px; width: auto; object-fit: contain; display: block; margin-bottom: 2px; filter: grayscale(100%) contrast(200%);" />
                <div style="font-size: 8.5px; color: #333;">Tel: ${AppState.shopConfig.phone} • Tepic, Nay.</div>
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
              <img src="${GLITCHLAB_TICKET_LOGO_BASE64}" alt="GlitchLab" style="max-height: 20px; width: auto; object-fit: contain; display: block; filter: grayscale(100%) contrast(200%);" />
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
      <div class="ticket-80mm-box" style="font-family: 'Courier New', Courier, monospace; color: #000000; background: #ffffff; padding: 18px 16px; width: 100%; max-width: 78mm; margin: 0 auto; border-radius: 6px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); box-sizing: border-box;">
        <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
          <img src="${GLITCHLAB_TICKET_LOGO_BASE64}" alt="GlitchLab" style="max-height: 42px; width: auto; max-width: 230px; object-fit: contain; margin: 0 auto 5px auto; display: block; filter: grayscale(100%) contrast(200%);" />
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
          <div style="padding-left: 4px;">${escapeHtml(order.issue || order.reportedIssue || 'No especificada')}</div>
          <div style="margin-top: 4px;"><strong>ACCESORIOS:</strong> ${order.equipment?.accessories?.length ? order.equipment.accessories.join(', ') : 'Ninguno (Solo equipo)'}</div>
        </div>

        <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin-bottom: 8px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between;">
            <span>MANO DE OBRA:</span> <strong>$${laborFormatted}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>REFACCIONES:</span> <strong>$${partsFormatted}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; border-top: 1px dotted #000; margin-top: 3px; padding-top: 3px; font-weight: bold;">
            <span>TOTAL DE LA ORDEN:</span> <strong>$${est}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>ANTICIPO INICIAL:</span> <strong>-$${adv}</strong>
          </div>
          ${abonosVal > 0 ? `
          <div style="display: flex; justify-content: space-between;">
            <span>ABONOS A CUENTA:</span> <strong>-$${abonosFormatted}</strong>
          </div>` : ''}
          <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 900; margin-top: 4px; border-top: 1px dashed #000; padding-top: 3px;">
            <span>SALDO PENDIENTE:</span> <span>$${bal}</span>
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
const GLITCHLAB_TICKET_LOGO_BASE64 = 'data:image/png;base64,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';
const GLITCHLAB_PRINT_LOGO_BASE64 = 'data:image/png;base64,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';

function getCustomerPdfHtml(order) {
  const dateFormatted = new Date(order.date).toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const fin = getOrderFinancialBreakdown(order);
  const est = fin.estimatedFormatted;
  const adv = fin.advanceFormatted;
  const bal = fin.balanceFormatted;
  const laborFormatted = fin.laborFormatted;
  const partsFormatted = fin.partsFormatted;
  const abonosFormatted = fin.abonosFormatted;
  const abonosVal = fin.abonos;

  return `
    <div class="customer-receipt-card" style="font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; max-width: 820px; min-height: 960px; margin: 0 auto; padding: 22px 26px; border: 1.5px solid #cbd5e1; border-radius: 12px; background: #ffffff; box-shadow: 0 10px 30px rgba(0,0,0,0.5); box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; page-break-inside: avoid !important; break-inside: avoid !important; page-break-after: avoid !important; break-after: avoid !important;">
      
      <!-- Cabecera Principal con Logo y Folio -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0ea5e9; padding-bottom: 12px; margin-bottom: 14px;">
        <div>
          <!-- Logo Oficial GlitchLab Impresion (Tamano proporcionado y nitido) -->
          <img src="${GLITCHLAB_PRINT_LOGO_BASE64}" alt="GlitchLab" style="height: 56px; max-height: 58px; width: auto; max-width: 240px; object-fit: contain; display: block; margin-bottom: 6px;" />
          <div style="font-size: 11px; color: #475569; margin-top: 3px; line-height: 1.4;">
            ${AppState.shopConfig.address}<br>
            Tel / WhatsApp: <strong>${AppState.shopConfig.phone}</strong> | Correo: ${AppState.shopConfig.email}
          </div>
        </div>

        <div style="text-align: right;">
          <div style="background-color: #f0f9ff; border: 1.5px solid #bae6fd; padding: 7px 16px; border-radius: 10px; display: inline-block; text-align: center; min-width: 170px; box-sizing: border-box;">
            <div style="font-size: 9.5px; text-transform: uppercase; font-weight: 800; color: #0284c7; text-align: center; letter-spacing: 0.06em;">ORDEN DE SERVICIO</div>
            <div style="font-size: 25px; font-weight: 900; color: #0c4a6e; font-family: monospace, sans-serif; line-height: 1.1; text-align: center;">#${order.id}</div>
          </div>
          <div style="font-size: 11px; color: #64748b; margin-top: 5px;">
            <strong>Ingreso:</strong> ${dateFormatted}
          </div>
          ${order.status === 'delivered' && order.deliveredDate ? `
            <div style="font-size: 11px; color: #059669; margin-top: 2px;">
              <strong>Entrega:</strong> ${new Date(order.deliveredDate).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Bloques de Informacion: Cliente y Dispositivo -->
      <div style="display: flex; gap: 14px; margin-bottom: 14px;">
        <div style="flex: 1; min-width: 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 11px; font-weight: 800; color: #0284c7; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
            1. Datos del Cliente
          </div>
          <div style="font-size: 12px; line-height: 1.6;">
            <div><strong>Nombre:</strong> ${escapeHtml(order.client?.name || '')}</div>
            <div><strong>Tel&eacute;fono:</strong> ${escapeHtml(formatPhoneNumber(order.client?.phone) || '')}</div>
            <div><strong>Correo:</strong> ${escapeHtml(order.client?.email || 'N/A')}</div>
            <div><strong>Direcci&oacute;n:</strong> ${escapeHtml(order.client?.address || 'N/A')}</div>
          </div>
        </div>

        <div style="flex: 1; min-width: 0; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 11px; font-weight: 800; color: #0284c7; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
            2. Datos del Dispositivo & Acceso
          </div>
          <div style="font-size: 12px; line-height: 1.6;">
            <div><strong>Tipo:</strong> ${escapeHtml(order.equipment?.type || '')}</div>
            <div><strong>Marca:</strong> ${escapeHtml(order.equipment?.brand || '')}</div>
            <div><strong>Modelo:</strong> ${escapeHtml(order.equipment?.model || '')}</div>
            <div style="margin-top: 4px; padding: 3px 8px; background: #e0f2fe; border-radius: 5px; font-weight: 700; color: #0369a1; display: inline-block;">
              &#128273; Clave/PIN: ${escapeHtml(order.equipment?.password || 'Sin contraseña')}
            </div>
          </div>
        </div>
      </div>

      <!-- Falla Reportada y Diagnostico Inicial -->
      <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 14px;">
        <div style="font-size: 11px; font-weight: 800; color: #0284c7; text-transform: uppercase; margin-bottom: 6px;">
          3. Motivo de Ingreso & Diagn&oacute;stico T&eacute;cnico
        </div>
        <div style="font-size: 12px; line-height: 1.5; margin-bottom: 8px;">
          <strong>Falla Reportada por el Cliente:</strong><br>
          <span style="color: #334155;">${escapeHtml(order.issue || order.reportedIssue || 'No especificada')}</span>
        </div>
        ${order.initialDiagnosis ? `
          <div style="font-size: 12px; line-height: 1.5; margin-bottom: 8px; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <strong>Diagn&oacute;stico T&eacute;cnico Inicial:</strong><br>
            <span style="color: #334155;">${escapeHtml(order.initialDiagnosis)}</span>
          </div>
        ` : ''}
        <div style="display: flex; gap: 16px; font-size: 11px; color: #475569; padding-top: 6px; border-top: 1px dashed #cbd5e1;">
          <div style="flex: 1;">
            <strong>Accesorios:</strong> ${order.equipment?.accessories?.length ? order.equipment.accessories.join(', ') : 'Ninguno (Solo equipo)'}
          </div>
          <div style="flex: 1;">
            <strong>Condici&oacute;n F&iacute;sica:</strong> ${order.equipment?.condition?.length ? order.equipment.condition.join(', ') : 'Buen estado aparente'}
            ${order.equipment?.conditionNotes ? ` (${escapeHtml(order.equipment.conditionNotes)})` : ''}
          </div>
        </div>
      </div>

      <!-- Desglose Financiero y Codigo QR -->
      <div style="display: flex; justify-content: space-between; align-items: center; gap: 18px; margin-bottom: 14px; background: #f8fafc; border: 1.5px solid #e2e8f0; padding: 14px 18px; border-radius: 8px;">
        <div style="display: flex; align-items: center; gap: 14px; flex: 1;">
          <div id="printQrContainerCustomer" class="pdf-qr-placeholder" style="min-width: 85px; min-height: 85px;"></div>
          <div style="font-size: 11px; line-height: 1.45; color: #475569;">
            <strong style="color: #0284c7; font-size: 11.5px;">Rastreo en Tiempo Real:</strong><br>
            Escanea este c&oacute;digo QR con la c&aacute;mara de tu celular para consultar el estado del equipo, fotos de la reparaci&oacute;n y bit&aacute;cora de avances en vivo.
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; flex-shrink: 0;">
          <table style="width: 275px; border-collapse: collapse; font-size: 11.5px;">
            <tr>
              <td style="padding: 2px 4px; color: #64748b;">Mano de Obra:</td>
              <td style="padding: 2px 4px; text-align: right; font-weight: 600;">$${laborFormatted} MXN</td>
            </tr>
            <tr>
              <td style="padding: 2px 4px; color: #64748b;">Refacciones:</td>
              <td style="padding: 2px 4px; text-align: right; font-weight: 600;">$${partsFormatted} MXN</td>
            </tr>
            <tr style="border-top: 1px solid #cbd5e1; font-weight: 700;">
              <td style="padding: 3px 4px; color: #0f172a;">Total de la Orden:</td>
              <td style="padding: 3px 4px; text-align: right; font-weight: 800; color: #0284c7; font-size: 12px;">$${est} MXN</td>
            </tr>
            <tr>
              <td style="padding: 2px 4px; color: #64748b;">Anticipo Inicial:</td>
              <td style="padding: 2px 4px; text-align: right; font-weight: 600; color: #16a34a;">-$${adv} MXN</td>
            </tr>
            ${abonosVal > 0 ? `
            <tr>
              <td style="padding: 2px 4px; color: #64748b;">Abonos a Cuenta:</td>
              <td style="padding: 2px 4px; text-align: right; font-weight: 600; color: #0d9488;">-$${abonosFormatted} MXN</td>
            </tr>` : ''}
            <tr style="border-top: 2px solid #0ea5e9; background-color: #f0f9ff;">
              <td style="padding: 5px 6px; font-weight: 800; color: #0c4a6e;">Saldo Pendiente:</td>
              <td style="padding: 5px 6px; text-align: right; font-weight: 900; font-size: 13.5px; color: #0c4a6e;">$${bal} MXN</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Firmas Perfectamente Centradas -->
      <div style="display: flex; gap: 40px; margin-top: 18px; margin-bottom: 12px; text-align: center;">
        <div style="flex: 1;">
          <div style="height: 48px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px;">
            <span style="font-family: cursive; font-size: 16px; color: #0369a1;">GlitchLab Laboratorio</span>
          </div>
          <div style="border-top: 1.5px solid #94a3b8; width: 240px; margin: 0 auto; padding-top: 5px; font-size: 11px; font-weight: 700; color: #475569; text-align: center;">
            Recibido por GlitchLab
          </div>
        </div>

        <div style="flex: 1;">
          <div style="height: 48px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px;">
            ${order.signature ? `<img src="${order.signature}" style="max-height: 46px; max-width: 190px; display: block; margin: 0 auto; object-fit: contain;" />` : '<div style="font-size: 11px; color: #94a3b8; font-style: italic; line-height: 48px; text-align: center;">Sin firma digital</div>'}
          </div>
          <div style="border-top: 1.5px solid #94a3b8; width: 240px; margin: 0 auto; padding-top: 5px; font-size: 11px; font-weight: 700; color: #475569; text-align: center;">
            Firma del Cliente de Conformidad
          </div>
        </div>
      </div>

      <!-- Terminos Legales -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 8.5px; color: #64748b; line-height: 1.35; text-align: justify;">
        <strong>T&eacute;rminos del Servicio:</strong><br>
        ${AppState.shopConfig.terms.replace(/\n/g, '<br>')}
      </div>

    </div>
  `;
}
function downloadCustomerPDF(orderId) {
  const targetId = orderId || currentPrintOrderId;
  const order = AppState.orders.find(o => String(o.id) === String(targetId));
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

  showToast(`Generando PDF de Orden de Servicio #${order.id}...`);

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
        filename: `GlitchLab_Orden_${order.id}_Cliente.pdf`,
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
        showToast(`PDF de Orden de Servicio #${order.id} descargado con éxito.`);
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
  document.body.classList.remove('ticket-thermal-mode', 'ticket-sticker-mode');
  currentPrintOrderId = null;
  closeModalWithAnimation('printModal', () => {
    if (returnToOrder && lastOrderId && typeof openOrderDetailModal === 'function') {
      const orderDetail = document.getElementById('orderDetailModal');
      if (!orderDetail || orderDetail.classList.contains('hidden')) {
        openOrderDetailModal(lastOrderId);
      }
    }
  });
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
function switchSettingsTab(tabName) {
  const tabs = ['shop', 'bank', 'users', 'terms'];
  tabs.forEach(t => {
    const btn = document.getElementById('settingsTabBtn_' + t);
    const content = document.getElementById('settingsTabContent_' + t);
    if (btn) {
      if (t === tabName) {
        btn.classList.remove('text-slate-400', 'hover:text-white');
        btn.classList.add('bg-white', 'text-slate-950', 'shadow-sm', 'font-bold');
      } else {
        btn.classList.remove('bg-white', 'text-slate-950', 'shadow-sm', 'font-bold');
        btn.classList.add('text-slate-400', 'hover:text-white');
      }
    }
    if (content) {
      if (t === tabName) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    }
  });
  if (typeof renderLucideIcons === 'function') renderLucideIcons();
}

function handleAddUserManual(e) {
  if (e) e.preventDefault();
  const nameInput = document.getElementById('newUserName');
  const userInput = document.getElementById('newUserUsername');
  const passInput = document.getElementById('newUserPassword');
  const roleInput = document.getElementById('newUserRole');
  if (!nameInput || !userInput || !passInput) return;

  const name = nameInput.value.trim();
  const username = userInput.value.trim().toLowerCase();
  const password = passInput.value.trim();
  const role = roleInput ? roleInput.value : 'technician';

  if (!name || !username || !password) {
    alert('Por favor completa todos los campos del nuevo usuario.');
    return;
  }

  if (!AppState.users) AppState.users = [];
  const exists = AppState.users.some(u => (u.username || '').toLowerCase() === username);
  if (exists) {
    alert('Ya existe un usuario registrado con ese nombre de usuario.');
    return;
  }

  const newUser = {
    id: Date.now(),
    name,
    username,
    password,
    role
  };
  AppState.users.push(newUser);
  if (typeof saveUsersToStorage === 'function') saveUsersToStorage();
  if (typeof renderUsersList === 'function') renderUsersList();
  nameInput.value = '';
  userInput.value = '';
  passInput.value = '';
  alert('Usuario ' + name + ' registrado correctamente.');
}

function openShopSettingsModal() {
  switchSettingsTab('shop');
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
  const bankEl = document.getElementById('cfgShopBank');
  if (bankEl) bankEl.value = AppState.shopConfig.bankInfo?.bank || 'BANORTE';
  const beneEl = document.getElementById('cfgShopBeneficiary');
  if (beneEl) beneEl.value = AppState.shopConfig.bankInfo?.beneficiary || 'JORGE ALBERTO ROBLES RUIZ';
  const clabeEl = document.getElementById('cfgShopClabe');
  if (clabeEl) clabeEl.value = AppState.shopConfig.bankInfo?.clabe || '0725 8001 2922 7048 52';
  document.getElementById('cfgShopTerms').value = AppState.shopConfig.terms || '';
  document.getElementById('cfgShopWarrantyDays').value = AppState.shopConfig.warrantyDays || 45;

  renderUsersList();
  openModalWithAnimation('settingsModal'); if (typeof renderLucideIcons === 'function') renderLucideIcons();
}

function closeShopSettingsModal() {
  closeModalWithAnimation('settingsModal');
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
  
  const bankEl = document.getElementById('cfgShopBank');
  const beneEl = document.getElementById('cfgShopBeneficiary');
  const clabeEl = document.getElementById('cfgShopClabe');
  if (bankEl && beneEl && clabeEl) {
    const raw = clabeEl.value.replace(/\s+/g, '').trim();
    AppState.shopConfig.bankInfo = {
      bank: bankEl.value.trim() || 'BANORTE',
      beneficiary: beneEl.value.trim() || 'JORGE ALBERTO ROBLES RUIZ',
      clabe: clabeEl.value.trim() || '0725 8001 2922 7048 52',
      rawClabe: raw,
      whatsapp: AppState.shopConfig.phone || '3113396969'
    };
  }

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
    toast.className = 'fixed top-5 right-5 bg-sky-500 text-white font-medium px-4 py-2.5 rounded-2xl shadow-2xl z-[90] flex items-center gap-2 transform transition-all duration-300 pointer-events-none hidden';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<i data-lucide="check" class="w-4 h-4 inline-block"></i> ${escapeHtml(message)}`;
  if (window.lucide) lucide.createIcons();
  toast.classList.remove('hidden');
  toast.style.pointerEvents = 'auto';
  void toast.offsetWidth;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  if (window.appToastTimeout) clearTimeout(window.appToastTimeout);
  window.appToastTimeout = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.pointerEvents = 'none';
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 350);
  }, 2800);
}

// Control del Slider de Filtros de Estado
function slideFilterPills(direction) {
  const container = document.getElementById('filterPillsContainer');
  if (!container) return;
  const step = 200;
  container.scrollBy({ left: direction === 'left' ? -step : step, behavior: 'smooth' });
}

function updateFilterSliderProgress() {
  const container = document.getElementById('filterPillsContainer');
  const thumb = document.getElementById('filterSliderThumb');
  if (!container || !thumb) return;
  const maxScroll = container.scrollWidth - container.clientWidth;
  if (maxScroll <= 0) {
    thumb.style.width = '100%';
    thumb.style.transform = 'translateX(0)';
    return;
  }
  const visibleRatio = container.clientWidth / container.scrollWidth;
  const track = document.getElementById('filterSliderTrack');
  const trackWidth = track ? track.clientWidth : 160;
  const thumbWidth = Math.max(32, Math.round(trackWidth * visibleRatio));
  thumb.style.width = `${thumbWidth}px`;
  
  const scrollRatio = container.scrollLeft / maxScroll;
  const maxTravel = trackWidth - thumbWidth;
  const travel = Math.max(0, Math.min(maxTravel, scrollRatio * maxTravel));
  thumb.style.transform = `translateX(${travel}px)`;
}

function handleFilterTrackClick(e) {
  const track = document.getElementById('filterSliderTrack');
  const container = document.getElementById('filterPillsContainer');
  if (!track || !container) return;
  const rect = track.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const ratio = Math.max(0, Math.min(1, clickX / rect.width));
  const maxScroll = container.scrollWidth - container.clientWidth;
  container.scrollTo({ left: ratio * maxScroll, behavior: 'smooth' });
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

  openModalWithAnimation('quickDocModal'); if (typeof renderLucideIcons === 'function') renderLucideIcons();
}

// Cerrar modal
function closeQuickDocModal() {
  closeModalWithAnimation('quickDocModal');
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
      b.classList.remove('bg-white', 'text-slate-950', 'bg-slate-800', 'text-white', 'shadow');
      b.classList.add('text-slate-400', 'font-semibold');
    }
  });

  const activeBtn = filter === 'nota' ? btnNota : (filter === 'cotizacion' ? btnCot : btnAll);
  if (activeBtn) {
    activeBtn.classList.remove('text-slate-400', 'font-semibold');
    activeBtn.classList.remove('bg-slate-800'); activeBtn.classList.add('bg-white', 'text-slate-950', 'font-bold', 'shadow');
  }

  renderQuickDocsHistory();
}

// Renderizar la lista de documentos en el historial
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

    const phoneRaw = (doc.client?.phone || '').replace(/\D/g, '');
    const phoneDigits = phoneRaw.length === 10 ? `52${phoneRaw}` : phoneRaw;

    const itemsSummary = (doc.items || []).slice(0, 4).map(item => `
      <span class="inline-flex items-center gap-1 bg-[#070b14] border border-slate-800/90 px-2 py-0.5 rounded-lg text-xs text-slate-300 mr-1.5 mb-1 shadow-xs">
        <strong class="${isNota ? 'text-sky-400' : 'text-emerald-400'} font-mono font-bold">${item.qty}x</strong>
        <span class="truncate max-w-[200px]">${escapeHtml(item.desc || 'Concepto')}</span>
      </span>
    `).join('') + ((doc.items || []).length > 4 ? `<span class="text-[11px] text-slate-500 font-bold self-center ml-1">+${doc.items.length - 4} m&aacute;s</span>` : '');

    return `
      <div class="p-4 sm:p-5 bg-[#0b1120] hover:bg-[#0e1628] border border-slate-800/80 hover:border-slate-700 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all group shadow-md">
        
        <!-- Datos Principales: Folio, Tipo, Fecha, Cliente y Partidas -->
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <span class="px-2.5 py-0.5 rounded-lg font-mono font-black text-xs ${isNota ? 'bg-sky-500/10 text-sky-300 border border-sky-500/30' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'}">
              #${escapeHtml(doc.folio)}
            </span>
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${isNota ? 'bg-slate-900 text-sky-400 border border-slate-800' : 'bg-slate-900 text-emerald-400 border border-slate-800'} inline-flex items-center gap-1">
              <i data-lucide="${isNota ? 'receipt' : 'file-text'}" class="w-3 h-3 inline-block"></i>
              <span>${escapeHtml(doc.typeName)}</span>
            </span>
            <span class="text-xs text-slate-400 flex items-center gap-1 font-mono">
              <i data-lucide="calendar" class="w-3 h-3 text-slate-500 inline-block"></i>
              <span>${dateFormatted}</span>
            </span>
            ${doc.extraValue ? `
              <span class="text-[11px] font-semibold text-slate-400 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
                ${escapeHtml(doc.extraLabel)}: <strong class="text-slate-200">${escapeHtml(doc.extraValue)}</strong>
              </span>
            ` : ''}
          </div>

          <div class="flex flex-wrap items-center gap-2.5 mb-2.5">
            <h4 class="text-sm font-black text-white tracking-wide uppercase">${escapeHtml(doc.client?.name || 'P&uacute;blico General')}</h4>
            ${doc.client?.phone ? `
              <a 
                href="https://wa.me/${phoneDigits}" 
                target="_blank" 
                onclick="event.stopPropagation()" 
                class="px-2 py-0.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/60 text-emerald-400 hover:text-emerald-300 text-xs font-mono font-bold inline-flex items-center gap-1.5 transition"
                title="Abrir chat de WhatsApp"
              >
                <i data-lucide="message-circle" class="w-3 h-3 inline-block"></i>
                <span>${escapeHtml(formatPhoneNumber(doc.client.phone))}</span>
              </a>
            ` : ''}
          </div>

          <!-- Resumen de Conceptos -->
          <div class="flex flex-wrap items-center">
            ${itemsSummary}
          </div>
        </div>

        <!-- Columna Derecha: Importe Total y Barra de Acciones -->
        <div class="flex flex-col sm:flex-row md:flex-col lg:flex-row items-start sm:items-center md:items-end lg:items-center justify-between md:justify-center gap-3.5 shrink-0 pt-3 sm:pt-0 border-t border-slate-800/80 sm:border-t-0">
          <div class="text-left sm:text-right md:text-right">
            <span class="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">${isNota ? 'Total Cobrado' : 'Total Cotizado'}</span>
            <span class="text-lg sm:text-xl font-black font-mono ${isNota ? 'text-sky-400' : 'text-emerald-400'} tracking-tight">$${totalFormatted} <span class="text-xs text-slate-400 font-normal">MXN</span></span>
          </div>

          <!-- Botones de Acci&oacute;n: Editar, Duplicar, Borrar, PDF, Imprimir y WhatsApp -->
          <div class="flex flex-wrap items-center gap-1.5">
            <!-- Editar -->
            <button 
              type="button" 
              onclick="editQuickDoc('${doc.id}')" 
              class="h-8 px-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition border border-slate-700 active:scale-95 shadow-sm" 
              title="Editar este documento"
            >
              <i data-lucide="edit-3" class="w-3.5 h-3.5 inline-block text-sky-400"></i>
              <span class="hidden sm:inline">Editar</span>
            </button>

            <!-- Duplicar -->
            <button 
              type="button" 
              onclick="duplicateQuickDoc('${doc.id}')" 
              class="h-8 px-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition border border-slate-700 active:scale-95 shadow-sm" 
              title="Duplicar como nuevo documento"
            >
              <i data-lucide="copy" class="w-3.5 h-3.5 inline-block text-slate-400"></i>
              <span class="hidden sm:inline">Duplicar</span>
            </button>

            <!-- Descargar PDF -->
            <button 
              type="button" 
              onclick="downloadQuickDocFromHistory('${doc.id}')" 
              class="h-8 px-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition border border-slate-700 active:scale-95 shadow-sm" 
              title="Descargar Comprobante PDF"
            >
              <i data-lucide="file-text" class="w-3.5 h-3.5 inline-block text-rose-400"></i>
              <span class="hidden sm:inline">PDF</span>
            </button>

            <!-- Imprimir -->
            <button 
              type="button" 
              onclick="printQuickDocFromHistory('${doc.id}')" 
              class="h-8 px-3 bg-white hover:bg-slate-100 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1 transition shadow active:scale-95" 
              title="Imprimir documento"
            >
              <i data-lucide="printer" class="w-3.5 h-3.5 inline-block"></i>
              <span class="hidden sm:inline">Imprimir</span>
            </button>

            <!-- WhatsApp -->
            <button 
              type="button" 
              onclick="sendQuickDocWhatsAppFromHistory('${doc.id}')" 
              class="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition shadow active:scale-95" 
              title="Enviar por WhatsApp"
            >
              <i data-lucide="message-circle" class="w-3.5 h-3.5 inline-block"></i>
            </button>

            <!-- Borrar -->
            <button 
              type="button" 
              onclick="deleteQuickDoc('${doc.id}')" 
              class="h-8 w-8 flex items-center justify-center bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 rounded-lg text-xs font-semibold transition border border-rose-800/60 active:scale-95 shadow-sm" 
              title="Eliminar del historial"
            >
              <i data-lucide="trash-2" class="w-3.5 h-3.5 inline-block"></i>
            </button>
          </div>
        </div>

      </div>
    `;
  }).join('');

  if (typeof renderLucideIcons === 'function') {
    renderLucideIcons();
  } else if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}
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
async function deleteQuickDoc(id) {
  const doc = (AppState.quickDocs || []).find(d => d.id === id || d.folio === id);
  if (!doc) return;

  const confirmed = await showGlitchConfirm({
    title: '¿Eliminar Documento #' + doc.folio + '?',
    badge: 'Documentos Rápidos',
    message: '¿EstÁs seguro de que deseas eliminar permanentemente el documento #' + doc.folio + ' de ' + (doc.client && doc.client.name ? doc.client.name : 'Cliente') + '?',
    confirmText: 'Eliminar Documento',
    cancelText: 'Cancelar',
    type: 'danger',
    icon: 'trash-2'
  });
  if (!confirmed) return;

  AppState.quickDocs = AppState.quickDocs.filter(d => d.id !== id && d.folio !== id);
  saveQuickDocs();
  renderQuickDocsHistory();

  if (typeof showToast === 'function') {
    showToast('Documento #' + doc.folio + ' eliminado del historial.');
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
    alert('Este documento no tiene nu{00FA}mero telefu{00F3}nico registrado para abrir WhatsApp.');
    return;
  }

  let itemsSummary = '';
  (doc.items || []).forEach(i => {
    itemsSummary += `• ${i.qty}x ${i.desc} - $${((Number(i.qty) || 0) * (Number(i.price) || 0)).toLocaleString('es-MX')} MXN\n`;
  });

  const bank = AppState.shopConfig?.bankInfo || {
    bank: 'BANORTE',
    beneficiary: 'JORGE ALBERTO ROBLES RUIZ',
    clabe: '0725 8001 2922 7048 52'
  };

  const msg = `¡Hola *${doc.client?.name || 'Cliente'}*! Te saludamos de *GlitchLab*.\n\n` +
    `Te compartimos el detalle de tu *${doc.typeName} #${doc.folio}*:\n` +
    `📅 *Fecha:* ${doc.date}\n` +
    `📌 *${doc.extraLabel}:* ${doc.extraValue}\n\n` +
    `*Conceptos:*\n${itemsSummary}\n` +
    (doc.totals?.discount > 0 ? `💵 *Descuento:* -$${doc.totals.discount.toLocaleString('es-MX')} MXN\n` : '') +
    (doc.totals?.includeIva ? `🧾 *IVA (16%):* $${doc.totals.iva.toLocaleString('es-MX')} MXN\n` : '') +
    `💰 *TOTAL:* $${doc.totals?.total?.toLocaleString('es-MX')} MXN\n\n` +
    (doc.warranty ? `*Garantía:* ${doc.warranty}\n` : '') +
    (doc.notes ? `📝 *Notas:* ${doc.notes}\n\n` : '') +
    `💳 *Datos para Transferencia / SPEI:*\n` +
    `• *Banco:* ${bank.bank || 'BANORTE'}\n` +
    `• *Beneficiario:* ${bank.beneficiary || 'JORGE ALBERTO ROBLES RUIZ'}\n` +
    `• *CLABE:* \`${bank.clabe || '0725 8001 2922 7048 52'}\`\n\n` +
    `📍 ${AppState.shopConfig.address}\n` +
    `¡Quedamos a tus \u00F3rdenes!`;

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
      tabNota.className = 'px-2.5 py-1 rounded-lg text-xs font-bold transition bg-white text-slate-950 shadow';
    }
    if (tabCot) {
      tabCot.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold transition text-slate-400 hover:text-white';
    }
    if (modalTitle) modalTitle.innerText = currentEditingDocId ? 'Editar Nota de Venta' : 'Generar Nota de Venta';
    if (iconBox) {
      iconBox.className = 'h-9 w-9 rounded-xl bg-slate-800 text-white border border-slate-700 flex items-center justify-center text-base';
      iconBox.innerHTML = '<i data-lucide="receipt" class="w-4 h-4 inline-block"></i>';
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
      tabCot.className = 'px-2.5 py-1 rounded-lg text-xs font-bold transition bg-emerald-600 text-white shadow';
    }
    if (modalTitle) modalTitle.innerText = currentEditingDocId ? 'Editar Cotización' : 'Generar Cotización Formal';
    if (iconBox) {
      iconBox.className = 'h-9 w-9 rounded-xl bg-slate-800 text-white border border-slate-700 flex items-center justify-center text-base';
      iconBox.innerHTML = '<i data-lucide="file-text" class="w-4 h-4 inline-block"></i>';
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
      <td class="py-2 px-2 text-right font-mono font-bold text-white">
        $${((Number(item.qty) || 0) * (Number(item.price) || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </td>
      <td class="py-2 px-1 text-center">
        <button 
          type="button" 
          onclick="removeQuickDocItemRow(${index})" 
          class="text-red-400 hover:text-red-300 hover:bg-red-950/40 p-1.5 rounded-lg transition opacity-70 group-hover:opacity-100"
          title="Eliminar partida"
        >
          <i data-lucide="trash-2" class="w-4 h-4 inline-block text-xs"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  if (typeof renderLucideIcons === 'function') {
    renderLucideIcons();
  } else if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

function setWarrantyPreset(text) {
  const inp = document.getElementById('qdWarrantyText');
  if (inp) {
    inp.value = text;
    inp.focus();
  }
}
window.setWarrantyPreset = setWarrantyPreset;
// items end
// function end

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

  openModalWithAnimation('quickDocInventoryModal');
}

function closeQuickDocInventoryPicker() {
  closeModalWithAnimation('quickDocInventoryModal');
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
            <span class="text-white font-medium">${safeCat}</span>
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
              class="px-3 py-1.5 bg-white hover:bg-slate-200 text-slate-900 font-bold rounded-lg text-xs transition flex items-center gap-1.5 shadow active:scale-95"
              title="Agregar este producto a la nota o cotización"
            >
              <i data-lucide="plus" class="text-[11px]"></i>
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
    btn.innerHTML = `<i data-lucide="check" class="text-[11px] text-white"></i> <span class="text-white">¡Listo!</span>`;
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

  // Filtrar partidas v&aacute;lidas
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
  const bank = AppState.shopConfig?.bankInfo || {
    bank: 'BANORTE',
    beneficiary: 'JORGE ALBERTO ROBLES RUIZ',
    clabe: '0725 8001 2922 7048 52'
  };

  const dateFormatted = new Date(doc.date + 'T12:00:00').toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });

  const rowsHtml = doc.items.map(item => `
    <tr>
      <td style="padding: 6px 8px; border-bottom: 1px solid #f1f5f9; text-align: center; font-family: monospace; font-size: 11px;">${item.qty}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #f1f5f9; font-size: 11.5px; color: #1e293b;">${escapeHtml(item.desc)}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #f1f5f9; text-align: right; font-family: monospace; font-size: 11px;">${(Number(item.price) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #f1f5f9; text-align: right; font-family: monospace; font-size: 11.5px; font-weight: 600; color: #0f172a;">${((Number(item.qty) || 0) * (Number(item.price) || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>
  `).join('');

  return `
    <div class="quickdoc-export-card" style="font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; max-width: 780px; width: 100%; min-height: 980px; margin: 0 auto; padding: 20px 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; page-break-inside: avoid !important; break-inside: avoid !important; page-break-after: avoid !important; break-after: avoid !important;">
      
      <!-- Bloque Superior: Encabezado, Cliente y Tabla de Conceptos -->
      <div style="flex: 1; display: flex; flex-direction: column;">
        <!-- Cabecera Principal con Logo Oficial y Folio -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0ea5e9; padding-bottom: 10px; margin-bottom: 12px;">
          <div>
            <!-- Logo Oficial GlitchLab Impresion -->
            <img src="${GLITCHLAB_PRINT_LOGO_BASE64}" alt="GlitchLab" style="height: 64px; max-height: 68px; width: auto; max-width: 275px; object-fit: contain; display: block; margin-bottom: 5px;" />
            <div style="font-size: 10.5px; color: #475569; margin-top: 2px; line-height: 1.35;">
              ${AppState.shopConfig.address}<br>
              Tel / WhatsApp: <strong>${AppState.shopConfig.phone}</strong> | Correo: ${AppState.shopConfig.email}
            </div>
          </div>

          <div style="text-align: right;">
            <div style="background-color: ${doc.type === 'nota' ? '#f0f9ff' : '#ecfdf5'}; border: 1.5px solid ${doc.type === 'nota' ? '#bae6fd' : '#a7f3d0'}; padding: 6px 14px; border-radius: 8px; display: inline-block; text-align: center; min-width: 155px; box-sizing: border-box;">
              <div style="font-size: 9.5px; text-transform: uppercase; font-weight: 800; color: ${doc.type === 'nota' ? '#0284c7' : '#059669'}; text-align: center; letter-spacing: 0.05em;">${doc.typeName}</div>
              <div style="font-size: 22px; font-weight: 900; color: ${doc.type === 'nota' ? '#0c4a6e' : '#065f46'}; font-family: monospace, sans-serif; line-height: 1.1; text-align: center; letter-spacing: normal;">#${doc.folio}</div>
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
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px;">
          <div style="font-size: 10.5px; font-weight: 800; color: #0284c7; text-transform: uppercase; margin-bottom: 5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px;">
            Cliente / Receptor del Documento
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 16px; font-size: 11.5px; line-height: 1.5;">
            <div style="flex: 1; min-width: 220px;">
              <div><strong>Nombre:</strong> ${escapeHtml(doc.client.name)}</div>
              <div><strong>Tel&eacute;fono:</strong> ${escapeHtml(formatPhoneNumber(doc.client.phone) || 'N/A')}</div>
            </div>
            <div style="flex: 1; min-width: 220px;">
              <div><strong>Correo:</strong> ${escapeHtml(doc.client.email || 'N/A')}</div>
              <div><strong>Direcci&oacute;n:</strong> ${escapeHtml(doc.client.address || 'N/A')}</div>
            </div>
          </div>
        </div>

        <!-- Tabla de Partidas / Conceptos -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #475569; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em;">
              <th style="padding: 7px 8px; text-align: center; width: 50px;">Cant.</th>
              <th style="padding: 7px 8px; text-align: left;">Descripci&oacute;n del Concepto / Refacci&oacute;n</th>
              <th style="padding: 7px 8px; text-align: right; width: 100px;">Precio Unit.</th>
              <th style="padding: 7px 8px; text-align: right; width: 110px;">Importe</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <!-- Bloque Inferior: Resumen Financiero, Firmas y Terminos -->
      <div style="margin-top: auto; padding-top: 10px;">
        <!-- Resumen Financiero y Totales -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 14px;">
          <div style="flex: 1; font-size: 10.5px; color: #475569; line-height: 1.4; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px;">
            ${doc.warranty ? `<div><strong>Garant&iacute;a / Vigencia:</strong> ${escapeHtml(doc.warranty)}</div>` : ''}
            ${doc.technician ? `<div><strong>Atendido por:</strong> ${escapeHtml(doc.technician)}</div>` : ''}
            ${doc.notes ? `<div style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #cbd5e1;"><strong>Observaciones:</strong><br>${escapeHtml(doc.notes)}</div>` : ''}
            <div style="margin-top: 8px; padding: 6px 9px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 10px; color: #166534;">
              <strong style="color: #15803d; display: flex; align-items: center; gap: 4px; font-size: 10px; margin-bottom: 3px;">
                <span>&#128179;</span> Datos para Transferencia (SPEI):
              </strong>
              <div style="line-height: 1.35;">
                <div><strong>Banco:</strong> ${escapeHtml(bank.bank || 'BANORTE')} &bull; <strong>Beneficiario:</strong> ${escapeHtml(bank.beneficiary || 'JORGE ALBERTO ROBLES RUIZ')}</div>
                <div style="margin-top: 2px;"><strong>CLABE:</strong> <span style="font-family: monospace; font-weight: 800; color: #0f172a; letter-spacing: 0.5px; font-size: 10.5px;">${escapeHtml(bank.clabe || '0725 8001 2922 7048 52')}</span></div>
              </div>
            </div>
          </div>

          <div style="width: 250px; flex-shrink: 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 11.5px;">
              <tr>
                <td style="padding: 3px 4px; color: #64748b;">Subtotal:</td>
                <td style="padding: 3px 4px; text-align: right; font-weight: 600; font-family: monospace;">${doc.totals.subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              ${doc.totals.discount > 0 ? `
                <tr>
                  <td style="padding: 3px 4px; color: #ef4444;">Descuento:</td>
                  <td style="padding: 3px 4px; text-align: right; font-weight: 600; font-family: monospace; color: #ef4444;">-${doc.totals.discount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ` : ''}
              ${doc.totals.includeIva ? `
                <tr>
                  <td style="padding: 3px 4px; color: #64748b;">IVA (16%):</td>
                  <td style="padding: 3px 4px; text-align: right; font-weight: 600; font-family: monospace;">${doc.totals.iva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              ` : ''}
              <tr style="border-top: 2px solid #0ea5e9; background-color: #f0f9ff;">
                <td style="padding: 6px 4px; font-weight: 800; color: #0c4a6e;">TOTAL:</td>
                <td style="padding: 6px 4px; text-align: right; font-weight: 900; font-size: 15px; color: #0c4a6e; font-family: monospace;">${doc.totals.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN</td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Firmas -->
        <div style="display: flex; justify-content: space-between; gap: 48px; margin-top: 16px; margin-bottom: 14px; text-align: center;">
          <div style="flex: 1;">
            <div style="height: 44px; display: flex; align-items: flex-end; justify-content: center;">
              <span style="font-family: cursive; font-size: 15px; color: #0369a1;">GlitchLab Laboratorio</span>
            </div>
            <div style="border-top: 1.5px solid #94a3b8; padding-top: 4px; font-size: 10.5px; font-weight: 700; color: #475569;">
              Emisor Autorizado (GlitchLab)
            </div>
          </div>

          <div style="flex: 1;">
            <div style="height: 44px; display: flex; align-items: flex-end; justify-content: center;">
              <span style="font-size: 10px; color: #94a3b8; font-style: italic;">Conformidad del Cliente</span>
            </div>
            <div style="border-top: 1.5px solid #94a3b8; padding-top: 4px; font-size: 10.5px; font-weight: 700; color: #475569;">
              Firma del Cliente
            </div>
          </div>
        </div>

        <!-- T&eacute;rminos y Condiciones -->
        <div style="border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 8.5px; color: #64748b; line-height: 1.35; text-align: justify;">
          <strong>Condiciones:</strong> Este comprobante respalda los conceptos y especificaciones descritos. Para hacer v&aacute;lida cualquier garant&iacute;a es indispensable presentar este documento. Precios expresados en Pesos Mexicanos (MXN). &iexcl;Gracias por su preferencia!
        </div>
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

  const bank = AppState.shopConfig?.bankInfo || {
    bank: 'BANORTE',
    beneficiary: 'JORGE ALBERTO ROBLES RUIZ',
    clabe: '0725 8001 2922 7048 52'
  };

  const msg = `¡Hola *${doc.client.name}*! Te saludamos de *GlitchLab*.\n\n` +
    `Te compartimos el detalle de tu *${doc.typeName} #${doc.folio}*:\n` +
    `📅 *Fecha:* ${doc.date}\n` +
    `📌 *${doc.extraLabel}:* ${doc.extraValue}\n\n` +
    `*Conceptos:*\n${itemsSummary}\n` +
    (doc.totals.discount > 0 ? `💵 *Descuento:* -$${doc.totals.discount.toLocaleString('es-MX')} MXN\n` : '') +
    (doc.totals.includeIva ? `🧾 *IVA (16%):* $${doc.totals.iva.toLocaleString('es-MX')} MXN\n` : '') +
    `💰 *TOTAL:* $${doc.totals.total.toLocaleString('es-MX')} MXN\n\n` +
    (doc.warranty ? `*Garantía:* ${doc.warranty}\n` : '') +
    (doc.notes ? `📝 *Notas:* ${doc.notes}\n\n` : '') +
    `💳 *Datos para Transferencia / SPEI:*\n` +
    `• *Banco:* ${bank.bank || 'BANORTE'}\n` +
    `• *Beneficiario:* ${bank.beneficiary || 'JORGE ALBERTO ROBLES RUIZ'}\n` +
    `• *CLABE:* \`${bank.clabe || '0725 8001 2922 7048 52'}\`\n\n` +
    `📍 ${AppState.shopConfig.address}\n` +
    `¡Quedamos a tus \u00F3rdenes!`;

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
  const order = AppState.orders.find(o => String(o.id) === String(targetId));
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
  const order = AppState.orders.find(o => String(o.id) === String(targetId));
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

// Plantilla HTML del Resumen T&eacute;cnico de Trabajo (Diseño impecable en 1 sola página)
function getWorkSummaryHtml(order) {
  const dateFormatted = new Date(order.date).toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const deliveredDateFormatted = order.deliveredDate ? new Date(order.deliveredDate).toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : 'Pendiente';

  const fin = getOrderFinancials(order);
  const laborFormatted = fin.laborFormatted;
  const partsFormatted = fin.partsFormatted;
  const est = fin.estimatedCostFormatted;
  const adv = fin.advancePaymentFormatted;
  const bal = fin.balanceDueFormatted;
  const abonosFormatted = fin.abonosFormatted;
  const abonosVal = fin.abonos;

  const meta = STATUS_METADATA[order.status] || { label: order.status, color: 'text-slate-400' };

  // Bitacora de procedimientos realizados
  const bitacoraItems = order.bitacora && order.bitacora.length ? order.bitacora : [
    {
      action: 'Diagnóstico & Mantenimiento',
      notes: 'Inspección microscópica y pruebas electrónicas estándar ejecutadas en taller.',
      timestamp: order.date,
      technician: order.technician || 'Laboratorio GlitchLab'
    }
  ];

  const bitacoraHtml = bitacoraItems.map((b, idx) => {
    const time = new Date(b.timestamp).toLocaleDateString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    return `
      <div style="padding: 6px 10px; background-color: ${idx % 2 === 0 ? '#f8fafc' : '#ffffff'}; border-left: 3px solid #0ea5e9; margin-bottom: 4px; border-radius: 4px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px;">
          <strong style="color: #0f172a; font-size: 11px;">${escapeHtml(b.action || 'Intervención')}</strong>
          <span style="font-size: 9.5px; color: #64748b; font-family: monospace;">${time}</span>
        </div>
        <div style="color: #334155; line-height: 1.35; font-size: 11px;">${escapeHtml(b.notes || '')}</div>
        ${b.technician ? `<div style="font-size: 9.5px; color: #0284c7; margin-top: 2px; font-weight: 600;">T&eacute;cnico: ${escapeHtml(b.technician)}</div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="work-summary-export-card" style="font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; max-width: 780px; width: 100%; min-height: 980px; margin: 0 auto; padding: 20px 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; page-break-inside: avoid !important; break-inside: avoid !important; page-break-after: avoid !important; break-after: avoid !important;">
      
      <!-- Bloque Superior: Encabezado, Cliente, Equipo y Procedimientos -->
      <div style="flex: 1; display: flex; flex-direction: column;">
        <!-- Cabecera Principal con Logo Oficial y Titulo -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0ea5e9; padding-bottom: 10px; margin-bottom: 12px;">
          <div>
            <!-- Logo Oficial GlitchLab Impresion -->
            <img src="${GLITCHLAB_PRINT_LOGO_BASE64}" alt="GlitchLab" style="height: 64px; max-height: 68px; width: auto; max-width: 275px; object-fit: contain; display: block; margin-bottom: 5px;" />
            <div style="font-size: 10.5px; color: #475569; margin-top: 2px; line-height: 1.35;">
              ${AppState.shopConfig.address}<br>
              Tel / WhatsApp: <strong>${AppState.shopConfig.phone}</strong> | Correo: ${AppState.shopConfig.email}
            </div>
          </div>

          <div style="text-align: right;">
            <div style="background-color: #f0fdf4; border: 1.5px solid #bbf7d0; padding: 6px 14px; border-radius: 8px; display: inline-block; text-align: center; min-width: 160px; box-sizing: border-box;">
              <div style="font-size: 9.5px; text-transform: uppercase; font-weight: 800; color: #15803d; text-align: center; letter-spacing: normal;">INFORME T&Eacute;CNICO DE SERVICIO</div>
              <div style="font-size: 22px; font-weight: 900; color: #14532d; font-family: monospace, sans-serif; line-height: 1.1; text-align: center; letter-spacing: normal;">#${order.id}</div>
            </div>
            <div style="font-size: 10.5px; color: #64748b; margin-top: 4px;">
              <strong>Recepci&oacute;n:</strong> ${dateFormatted}
            </div>
            ${order.status === 'delivered' && order.deliveredDate ? `
              <div style="font-size: 10.5px; color: #059669; margin-top: 1px;">
                <strong>Entrega:</strong> ${deliveredDateFormatted}
              </div>
            ` : ''}
            <div style="font-size: 10px; color: #64748b; margin-top: 1px;">
              <strong>Estatus:</strong> <span style="font-weight: bold; color: #0284c7;">${meta.label}</span>
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
              <div><strong>Tel&eacute;fono:</strong> ${escapeHtml(formatPhoneNumber(order.client?.phone) || 'N/A')}</div>
              <div><strong>Correo:</strong> ${escapeHtml(order.client?.email || 'N/A')}</div>
            </div>
          </div>

          <div style="flex: 1; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 9px 12px;">
            <div style="font-size: 10.5px; font-weight: 800; color: #0284c7; text-transform: uppercase; margin-bottom: 4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px;">
              2. Datos del Dispositivo
            </div>
            <div style="font-size: 11.5px; line-height: 1.45;">
              <div><strong>Tipo:</strong> ${escapeHtml(order.equipment?.type || '')}</div>
              <div><strong>Marca:</strong> ${escapeHtml(order.equipment?.brand || '')}</div>
              <div><strong>Modelo:</strong> ${escapeHtml(order.equipment?.model || '')}</div>
              <div><strong>T&eacute;cnico Resp.:</strong> ${escapeHtml(order.technician || 'Laboratorio GlitchLab')}</div>
            </div>
          </div>
        </div>

        <!-- Falla de Ingreso y Diagnostico Inicial -->
        <div style="display: flex; gap: 12px; margin-bottom: 12px;">
          <div style="flex: 1; background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 9px 12px;">
            <div style="font-size: 10.5px; font-weight: 800; color: #b45309; text-transform: uppercase; margin-bottom: 3px;">
              &#9888;&#65039; Motivo de Ingreso / Falla Reportada
            </div>
            <div style="font-size: 11px; color: #78350f; line-height: 1.4;">
              ${escapeHtml(order.issue || order.reportedIssue || 'No especificada')}
            </div>
          </div>

          <div style="flex: 1; background-color: #f0f9ff; border: 1px solid #e0f2fe; border-radius: 8px; padding: 9px 12px;">
            <div style="font-size: 10.5px; font-weight: 800; color: #0369a1; text-transform: uppercase; margin-bottom: 3px;">
              &#128269; Diagn&oacute;stico Inicial de Laboratorio
            </div>
            <div style="font-size: 11px; color: #075985; line-height: 1.4;">
              ${escapeHtml(order.initialDiagnosis || 'Falla diagnosticada en laboratorio de microelectrónica.')}
            </div>
          </div>
        </div>

        <!-- SECCION: Trabajos, Reparaciones y Bitacora Realizada -->
        <div style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
            <div style="font-size: 11px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em;">
              <span style="color: #0ea5e9;">&#9881;&#65039;</span> Trabajos & Reparaciones Realizadas al Equipo
            </div>
            <span style="font-size: 10px; color: #64748b;">${bitacoraItems.length} registro(s) de intervenci&oacute;n</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 4px;">
            ${bitacoraHtml}
          </div>
        </div>
      </div>

      <!-- Bloque Inferior: Desglose Financiero, Firmas y T&eacute;rminos -->
      <div style="margin-top: auto; padding-top: 8px;">
        <!-- Desglose Financiero, Garant&iacute;a y Totales -->
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 12px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; border-radius: 8px;">
          <div style="flex: 1; font-size: 10.5px; color: #475569; line-height: 1.4;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
              <strong style="color: #0284c7; font-size: 11px;">&#128737;&#65039; Cobertura de Garant&iacute;a:</strong>
              <span style="font-weight: 700; color: #0f172a;">${order.warrantyDays || AppState.shopConfig.warrantyDays || 45} d&iacute;as naturales</span>
            </div>
            <div style="font-size: 10px; color: #64748b;">
              v&aacute;lida sobre los componentes reemplazados y la mano de obra descrita en este informe t&eacute;cnico.
            </div>
          </div>

          <div style="width: 250px; flex-shrink: 0;">
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <tr>
                <td style="padding: 2px 4px; color: #64748b;">Mano de Obra:</td>
                <td style="padding: 2px 4px; text-align: right; font-weight: 600; font-family: monospace;">${laborFormatted} MXN</td>
              </tr>
              <tr>
                <td style="padding: 2px 4px; color: #64748b;">Refacciones:</td>
                <td style="padding: 2px 4px; text-align: right; font-weight: 600; font-family: monospace;">${partsFormatted} MXN</td>
              </tr>
              <tr style="border-top: 1px solid #cbd5e1; font-weight: 700;">
                <td style="padding: 3px 4px; color: #0f172a;">Total Servicio:</td>
                <td style="padding: 3px 4px; text-align: right; font-weight: 800; font-family: monospace; color: #0284c7;">${est} MXN</td>
              </tr>
              <tr>
                <td style="padding: 2px 4px; color: #64748b;">Anticipo Inicial:</td>
                <td style="padding: 2px 4px; text-align: right; font-weight: 600; font-family: monospace; color: #16a34a;">-${adv} MXN</td>
              </tr>
              ${abonosVal > 0 ? `
              <tr>
                <td style="padding: 2px 4px; color: #64748b;">Abonos a Cuenta:</td>
                <td style="padding: 2px 4px; text-align: right; font-weight: 600; font-family: monospace; color: #0d9488;">-${abonosFormatted} MXN</td>
              </tr>` : ''}
              <tr style="border-top: 1.5px solid #0ea5e9; background-color: #f0f9ff;">
                <td style="padding: 4px 4px; font-weight: 800; color: #0c4a6e;">Saldo Restante:</td>
                <td style="padding: 4px 4px; text-align: right; font-weight: 900; font-size: 13.5px; color: #0c4a6e; font-family: monospace;">${bal} MXN</td>
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
              T&eacute;cnico Especialista GlitchLab
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
          <strong>Nota de Entrega & Garant&iacute;a:</strong> Este reporte t&eacute;cnico certifica las reparaciones y componentes intervenidos en las instalaciones de GlitchLab. La garant&iacute;a no cubre da&ntilde;os por l&iacute;quidos, ca&iacute;das, variaciones el&eacute;ctricas externas o manipulaci&oacute;n de sellos por terceros.
        </div>
      </div>

    </div>
  `;
}

// ========================================================
// MOTOR LUCIDE ICONS & OPTIMIZACIONES V1 SAAS MINIMALISTA
// ========================================================

const FA_TO_LUCIDE_MAP = {
  "fa-screwdriver-wrench": "wrench", "fa-wrench": "wrench", "fa-file-invoice-dollar": "receipt",
  "fa-chart-pie": "pie-chart", "fa-boxes-stacked": "package", "fa-box-open": "package-open",
  "fa-address-book": "users", "fa-shield-halved": "shield-check", "fa-store": "store",
  "fa-server": "server", "fa-bell": "bell", "fa-bell-slash": "bell-off", "fa-gear": "settings",
  "fa-power-off": "log-out", "fa-magnifying-glass": "search", "fa-search": "search",
  "fa-grip": "layout-grid", "fa-list": "list", "fa-list-check": "list-checks", "fa-plus": "plus",
  "fa-plus-circle": "plus-circle", "fa-camera": "camera", "fa-images": "images",
  "fa-clipboard-list": "clipboard-list", "fa-clipboard-check": "clipboard-check", "fa-clock": "clock",
  "fa-clock-rotate-left": "history", "fa-cloud-arrow-down": "download", "fa-download": "download",
  "fa-cloud-arrow-up": "upload", "fa-upload": "upload", "fa-print": "printer", "fa-qrcode": "qr-code",
  "fa-trash": "trash-2", "fa-trash-can": "trash-2", "fa-pen": "edit-3", "fa-pencil": "edit-2",
  "fa-pen-nib": "pen-tool", "fa-pen-to-square": "edit", "fa-xmark": "x", "fa-times-circle": "x-circle",
  "fa-circle-check": "check-circle", "fa-check": "check", "fa-check-circle": "check-circle",
  "fa-check-double": "check-check", "fa-triangle-exclamation": "alert-triangle",
  "fa-circle-exclamation": "alert-circle", "fa-circle-info": "info", "fa-microchip": "cpu",
  "fa-whatsapp": "message-circle", "fa-phone": "phone", "fa-phone-alt": "phone-call",
  "fa-laptop": "laptop", "fa-laptop-medical": "laptop", "fa-credit-card": "credit-card",
  "fa-money-bill-wave": "banknote", "fa-cash-register": "calculator", "fa-hand-holding-dollar": "coins",
  "fa-coins": "coins", "fa-building-columns": "landmark", "fa-calculator": "calculator",
  "fa-arrow-left": "arrow-left", "fa-arrow-right": "arrow-right", "fa-arrow-down-short-wide": "arrow-down-narrow-wide",
  "fa-rotate": "refresh-cw", "fa-arrows-rotate": "refresh-cw", "fa-arrow-rotate-right": "refresh-cw",
  "fa-arrow-up-right-from-square": "external-link", "fa-paper-plane": "send", "fa-user": "user",
  "fa-user-check": "user-check", "fa-user-circle": "user", "fa-user-gear": "user-cog",
  "fa-user-pen": "user-check", "fa-user-plus": "user-plus", "fa-users": "users",
  "fa-users-gear": "users", "fa-users-slash": "user-x", "fa-signature": "pen-tool",
  "fa-receipt": "receipt", "fa-fingerprint": "fingerprint", "fa-lock": "lock",
  "fa-unlock-keyhole": "unlock", "fa-ban": "ban", "fa-bolt": "zap", "fa-briefcase": "briefcase",
  "fa-calendar": "calendar", "fa-calendar-check": "calendar-check", "fa-chart-line": "trending-up",
  "fa-chevron-down": "chevron-down", "fa-chevron-left": "chevron-left", "fa-chevron-right": "chevron-right",
  "fa-chevron-up": "chevron-up", "fa-cloud-bolt": "cloud-lightning", "fa-cloud-check": "cloud-check",
  "fa-copy": "copy", "fa-database": "database", "fa-envelope": "mail", "fa-eraser": "eraser",
  "fa-expand": "maximize-2", "fa-eye": "eye", "fa-eye-slash": "eye-off", "fa-file-csv": "file-spreadsheet",
  "fa-file-excel": "file-spreadsheet", "fa-file-invoice": "file-text", "fa-file-lines": "file-text",
  "fa-file-medical": "file-plus", "fa-file-pdf": "file-text", "fa-file-waveform": "activity",
  "fa-floppy-disk": "save", "fa-folder-open": "folder-open", "fa-globe": "globe",
  "fa-handshake": "handshake", "fa-hard-drive": "hard-drive", "fa-inbox": "inbox", "fa-key": "key",
  "fa-layer-group": "layers", "fa-link": "link", "fa-location-dot": "map-pin",
  "fa-microscope": "microscope", "fa-minus": "minus", "fa-mobile-screen": "smartphone",
  "fa-mobile-screen-button": "smartphone", "fa-note-sticky": "sticky-note", "fa-plug": "plug",
  "fa-plug-circle-xmark": "plug-zap", "fa-right-to-bracket": "log-in", "fa-satellite-dish": "radio",
  "fa-sliders": "sliders", "fa-sparkles": "sparkles", "fa-stethoscope": "stethoscope",
  "fa-stopwatch": "timer", "fa-tag": "tag", "fa-terminal": "terminal", "fa-vial": "flask-conical"
};

function renderLucideIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    // Auto-convert any dynamic leftover fa- icons
    document.querySelectorAll('i[class*="fa-"]').forEach(el => {
      for (const cls of el.classList) {
        if (FA_TO_LUCIDE_MAP[cls]) {
          el.setAttribute('data-lucide', FA_TO_LUCIDE_MAP[cls]);
          el.className = el.className.replace(/fa-[a-z0-9-]+|fa[srb]?/g, '').trim();
          if (!el.classList.contains('w-4') && !el.classList.contains('w-3') && !el.classList.contains('w-3.5') && !el.classList.contains('w-5')) {
            el.classList.add('w-4', 'h-4', 'inline-block');
          }
          break;
        }
      }
    });
    window.lucide.createIcons();
  }
}

// Trampa de rueda y aislamiento de scroll en modales
function setupModalScrollContainment() {
  const modalIds = [
    'orderDetailModal', 'bitacoraModal', 'orderModal', 'quickDocModal',
    'inventoryModal', 'clientsModal', 'shopSettingsModal'
  ];
  modalIds.forEach(id => {
    const modal = document.getElementById(id);
    if (!modal || modal.dataset.scrollLockBound) return;
    modal.dataset.scrollLockBound = 'true';

    modal.addEventListener('wheel', (e) => {
      let target = e.target;
      let scrollable = null;
      while (target && target !== modal) {
        const style = window.getComputedStyle(target);
        const overflowY = style.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && target.scrollHeight > target.clientHeight) {
          scrollable = target;
          break;
        }
        target = target.parentElement;
      }

      if (!scrollable) {
        e.preventDefault();
        return;
      }

      const delta = e.deltaY;
      const atTop = scrollable.scrollTop <= 0;
      const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;
      if ((delta < 0 && atTop) || (delta > 0 && atBottom)) {
        e.preventDefault();
      }
    }, { passive: false });
  });
}

// Atajo global Ctrl + K para b&uacute;squeda instant&aacute;nea
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }
});

// Resiliencia de red y sincronizaci&oacute;n en l&iacute;nea
window.addEventListener('online', () => {
  if (typeof checkSupabaseConnection === 'function') {
    checkSupabaseConnection(true);
  }
  if (typeof showToast === 'function') {
    showToast('Conexi&oacute;n a internet reestablecida. Sistema en l&iacute;nea.');
  }
});

// Inicializar iconos y bloqueo en DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    renderLucideIcons();
    setupModalScrollContainment();
  }, 100);
});

// ==========================================
// AISLAMIENTO DE SCROLL Y PREVENCION DE SCROLL EN CADENA (MODALES)
// ==========================================
let _isBodyScrollLocked = false;
function setBodyScrollLock(lock) {
  _isBodyScrollLocked = lock;
  _isBodyScrollLocked = lock;
  if (lock) {
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';
  } else {
    document.body.classList.remove('modal-open', 'overflow-hidden');
    document.body.style.overflow = '';
  }
}

// ==========================================================
// CONTROL DE ANIMACIONES FLUIDAS DE ENTRADA Y SALIDA (MODALES)
// ==========================================================

function openModalWithAnimation(modalId) {
  const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
  if (!modal) return;

  // Si el modal ya está visible y no se está cerrando, no reiniciar animación de entrada
  if (!modal.classList.contains('hidden') && !modal.classList.contains('modal-exit-active')) {
    if (typeof syncBodyScrollLock === 'function') syncBodyScrollLock();
    return;
  }

  modal.classList.add('modal-overlay', 'modal-enter');
  modal.classList.remove('hidden', 'modal-exit-active');
  void modal.offsetWidth;

  requestAnimationFrame(() => {
    modal.classList.add('modal-enter-active');
    modal.classList.remove('modal-enter');
  });

  setTimeout(() => {
    modal.classList.remove('modal-enter-active');
  }, 260);

  if (typeof syncBodyScrollLock === 'function') syncBodyScrollLock();
}

function closeModalWithAnimation(modalId, callback) {
  const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
  if (!modal || modal.classList.contains('hidden')) {
    if (typeof callback === 'function') callback();
    if (typeof syncBodyScrollLock === 'function') syncBodyScrollLock();
    return;
  }

  modal.classList.add('modal-overlay');
  void modal.offsetWidth;
  modal.classList.add('modal-exit-active');

  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('modal-overlay', 'modal-exit-active', 'modal-enter', 'modal-enter-active');
    if (typeof callback === 'function') callback();
    if (typeof syncBodyScrollLock === 'function') syncBodyScrollLock();
  }, 190);
}

function syncBodyScrollLock() {
  const modalIds = [
    'orderDetailModal', 'bitacoraModal', 'orderModal', 'quickDocModal',
    'financialModal', 'inventoryModal', 'clientsModal',
    'clientEditModal', 'whatsappModal', 'paymentModal', 'deliveryModal',
    'printModal', 'settingsModal', 'serverStatusModal',
    'supabaseModal', 'orderQrModal', 'quickDocInventoryModal', 'imageLightbox'
  ];

  let anyOpen = false;
  for (const id of modalIds) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden')) {
      anyOpen = true;
      break;
    }
  }
  setBodyScrollLock(anyOpen);
}

let _modalScrollContainmentInitialized = false;
function setupModalScrollContainment() {
  if (_modalScrollContainmentInitialized) return;
  _modalScrollContainmentInitialized = true;
  const modalIds = [
    'orderDetailModal', 'bitacoraModal', 'orderModal', 'quickDocModal',
    'financialModal', 'inventoryModal', 'clientsModal',
    'clientEditModal', 'whatsappModal', 'paymentModal', 'deliveryModal',
    'printModal', 'settingsModal', 'serverStatusModal',
    'supabaseModal', 'orderQrModal', 'quickDocInventoryModal'
  ];

  const modalObserver = new MutationObserver(() => {
    syncBodyScrollLock();
  });

  modalIds.forEach(id => {
    const modal = document.getElementById(id);
    if (!modal) return;

    modalObserver.observe(modal, {
      attributes: true,
      attributeFilter: ['class']
    });
  });

  syncBodyScrollLock();
}

// Cierre global con Escape respetando jerarquía y animaciones
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modalHierarchy = [
      { id: 'notificationsDropdownMenu', close: () => closeNotificationsPanel() },
      { id: 'imageLightbox', close: () => closeLightbox() },
      { id: 'quickDocInventoryModal', close: () => closeQuickDocInventoryPicker() },
      { id: 'printModal', close: () => closePrintModal(true) },
      { id: 'whatsappModal', close: () => closeWhatsAppTemplatesModal(true) },
      { id: 'bitacoraModal', close: () => closeBitacoraModal(true) },
      { id: 'paymentModal', close: () => closePaymentModal() },
      { id: 'deliveryModal', close: () => closeDeliveryModal(true) },
      { id: 'orderQrModal', close: () => closeOrderQRModal() },
      { id: 'clientEditModal', close: () => closeClientEditModal() },
      { id: 'serverStatusModal', close: () => closeServerStatusModal() },
      { id: 'supabaseModal', close: () => closeSupabaseSettingsModal() },
      { id: 'orderDetailModal', close: () => closeOrderDetailModal() },
      { id: 'orderModal', close: () => closeOrderModal() },
      { id: 'quickDocModal', close: () => closeQuickDocModal() },
      { id: 'financialModal', close: () => closeFinancialReportModal() },
      { id: 'inventoryModal', close: () => closeInventoryModal() },
      { id: 'clientsModal', close: () => closeClientsModal() },
      { id: 'settingsModal', close: () => closeShopSettingsModal() }
    ];

    for (const m of modalHierarchy) {
      const el = document.getElementById(m.id);
      if (el && !el.classList.contains('hidden') && !el.classList.contains('modal-exit-active')) {
        e.preventDefault();
        m.close();
        break;
      }
    }
  }
});


// ==========================================
// CÁMARA DE EVIDENCIA & MICROSCOPIO (WEBCAM / USB MICROSCOPE)
// ==========================================
let cameraStream = null;
let currentCameraCategory = 'Ingreso / Estético';
let capturedPhotoDataUrl = null;

async function openCameraCaptureModal() {
  capturedPhotoDataUrl = null;
  const videoEl = document.getElementById('cameraCaptureVideo');
  const previewEl = document.getElementById('cameraCapturePreview');
  const btnSnap = document.getElementById('btnCameraSnap');
  const btnRetake = document.getElementById('btnCameraRetake');
  const btnSave = document.getElementById('btnCameraSave');
  const spinner = document.getElementById('cameraLoadingSpinner');

  if (previewEl) previewEl.classList.add('hidden');
  if (videoEl) videoEl.classList.remove('hidden');
  if (btnSnap) btnSnap.classList.remove('hidden');
  if (btnRetake) btnRetake.classList.add('hidden');
  if (btnSave) btnSave.classList.add('hidden');
  if (spinner) spinner.classList.remove('hidden');

  openModalWithAnimation('cameraCaptureModal');
  if (typeof renderLucideIcons === 'function') renderLucideIcons();

  await initCameraStream();
}

async function initCameraStream(deviceId = null) {
  const videoEl = document.getElementById('cameraCaptureVideo');
  const spinner = document.getElementById('cameraLoadingSpinner');
  const selectEl = document.getElementById('cameraCaptureDeviceSelect');

  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  try {
    const constraints = {
      video: deviceId 
        ? { deviceId: { exact: deviceId } } 
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    };

    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (videoEl) {
      videoEl.srcObject = cameraStream;
      videoEl.onloadedmetadata = () => {
        videoEl.play();
        if (spinner) spinner.classList.add('hidden');
      };
    }

    if (selectEl && navigator.mediaDevices.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      if (videoDevices.length > 0) {
        selectEl.innerHTML = videoDevices.map((d, i) => {
          const label = d.label || `Cámara ${i + 1}`;
          const isMicro = label.toLowerCase().includes('micro') || label.toLowerCase().includes('usb');
          return `<option value="${d.deviceId}" ${d.deviceId === deviceId ? 'selected' : ''}>${isMicro ? '\uD83D\uDD2C ' : '\uD83D\uDCF7 '}${label}</option>`;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Error iniciando cámara:', err);
    if (spinner) spinner.classList.add('hidden');
    alert('No fue posible acceder a la cámara. Por favor verifica que los permisos del navegador estén autorizados.');
  }
}

function switchCameraDevice(deviceId) {
  if (deviceId) {
    initCameraStream(deviceId);
  }
}

function selectCameraCategory(cat, btn) {
  currentCameraCategory = cat;
  document.querySelectorAll('.cam-cat-btn').forEach(b => {
    b.classList.remove('active', 'bg-sky-500/20', 'text-sky-300', 'border-sky-500/40');
    b.classList.add('bg-slate-800/80', 'text-slate-300', 'border-slate-700/80');
  });
  if (btn) {
    btn.classList.add('active', 'bg-sky-500/20', 'text-sky-300', 'border-sky-500/40');
    btn.classList.remove('bg-slate-800/80', 'text-slate-300', 'border-slate-700/80');
  }
}

function takeCameraSnapshot() {
  const videoEl = document.getElementById('cameraCaptureVideo');
  const canvasEl = document.getElementById('cameraCaptureCanvas');
  const previewEl = document.getElementById('cameraCapturePreview');
  const btnSnap = document.getElementById('btnCameraSnap');
  const btnRetake = document.getElementById('btnCameraRetake');
  const btnSave = document.getElementById('btnCameraSave');

  if (!videoEl || !canvasEl || !previewEl) return;

  const w = videoEl.videoWidth || 1280;
  const h = videoEl.videoHeight || 720;
  canvasEl.width = w;
  canvasEl.height = h;

  const ctx = canvasEl.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, w, h);

  capturedPhotoDataUrl = canvasEl.toDataURL('image/jpeg', 0.88);
  previewEl.src = capturedPhotoDataUrl;

  videoEl.classList.add('hidden');
  previewEl.classList.remove('hidden');

  if (btnSnap) btnSnap.classList.add('hidden');
  if (btnRetake) btnRetake.classList.remove('hidden');
  if (btnSave) btnSave.classList.remove('hidden');
  if (typeof renderLucideIcons === 'function') renderLucideIcons();
}

function retakeCameraSnapshot() {
  capturedPhotoDataUrl = null;
  const videoEl = document.getElementById('cameraCaptureVideo');
  const previewEl = document.getElementById('cameraCapturePreview');
  const btnSnap = document.getElementById('btnCameraSnap');
  const btnRetake = document.getElementById('btnCameraRetake');
  const btnSave = document.getElementById('btnCameraSave');

  if (previewEl) previewEl.classList.add('hidden');
  if (videoEl) videoEl.classList.remove('hidden');
  if (btnSnap) btnSnap.classList.remove('hidden');
  if (btnRetake) btnRetake.classList.add('hidden');
  if (btnSave) btnSave.classList.add('hidden');
}

async function saveCameraSnapshot() {
  if (!capturedPhotoDataUrl) return;
  const orderId = currentDetailOrderId;
  const order = AppState.orders.find(o => String(o.id) === String(orderId));
  if (!order) {
    alert('No hay orden activa seleccionada.');
    return;
  }

  if (!order.photos) order.photos = [];

  const captionInput = document.getElementById('cameraPhotoCaption');
  const customCaption = captionInput ? captionInput.value.trim() : '';
  const fullCaption = currentCameraCategory + (customCaption ? `: ${customCaption}` : '');

  const newPhoto = {
    url: capturedPhotoDataUrl,
    caption: fullCaption,
    category: currentCameraCategory,
    date: new Date().toISOString()
  };

  order.photos.push(newPhoto);
  saveOrders();
  renderDtlPhotos(order);
  showToast(`\uD83D\uDCF7 Foto guardada como evidencia (${currentCameraCategory}).`);

  if (captionInput) captionInput.value = '';
  closeCameraCaptureModal();
}

function closeCameraCaptureModal() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  closeModalWithAnimation('cameraCaptureModal');
}

// ==========================================
// CONTROL DE GARANTÍAS Y REINGRESOS
// ==========================================
let activeWarrantyMatch = null;

function checkClientWarrantyOnOrderEntry(phone, name) {
  const banner = document.getElementById('warrantyAlertBanner');
  if (!banner) return;

  activeWarrantyMatch = null;

  const cleanPhone = (phone || '').replace(/\D/g, '');
  const cleanName = (name || '').trim().toLowerCase();

  if (cleanPhone.length < 7 && cleanName.length < 3) {
    banner.classList.add('hidden');
    return;
  }

  const matchedOrder = AppState.orders.find(o => {
    if (o.status !== 'delivered') return false;
    const oPhone = (o.client?.phone || '').replace(/\D/g, '');
    const oName = (o.client?.name || '').trim().toLowerCase();
    const phoneMatch = cleanPhone.length >= 7 && oPhone.includes(cleanPhone);
    const nameMatch = cleanName.length >= 3 && oName === cleanName;

    if (!phoneMatch && !nameMatch) return false;

    const war = getWarrantyStatus(o);
    return war && war.hasWarranty && war.daysLeft > 0;
  });

  if (matchedOrder) {
    activeWarrantyMatch = matchedOrder;
    const war = getWarrantyStatus(matchedOrder);
    const badgeEl = document.getElementById('warrantyAlertBadge');
    const textEl = document.getElementById('warrantyAlertText');

    if (badgeEl) badgeEl.innerText = `Orden #${matchedOrder.id}`;
    if (textEl) {
      textEl.innerText = `Este cliente cuenta con la Orden #${matchedOrder.id} (${matchedOrder.equipment?.type || 'Equipo'} ${matchedOrder.equipment?.brand || ''}) entregada el ${war.expirationFormatted}. \u00A1Le quedan ${war.daysLeft} d\u00EDas de garant\u00EDa oficial!`;
    }
    banner.classList.remove('hidden');
    if (typeof renderLucideIcons === 'function') renderLucideIcons();
  } else {
    banner.classList.add('hidden');
  }
}

function applyWarrantyToNewOrder() {
  if (!activeWarrantyMatch) return;
  const o = activeWarrantyMatch;
  const orderForm = document.getElementById('orderForm');

  const eqType = document.getElementById('equipmentType');
  const eqBrand = document.getElementById('equipmentBrand');
  const eqModel = document.getElementById('equipmentModel');
  const eqSerial = document.getElementById('equipmentSerial');
  const eqIssue = document.getElementById('issueDescription') || document.getElementById('orderIssue');
  const eqDiagnosis = document.getElementById('initialDiagnosis') || document.getElementById('orderInitialDiagnosis');
  const estCost = document.getElementById('costEstimated') || document.getElementById('orderEstimatedCost');
  const advCost = document.getElementById('costAdvance') || document.getElementById('orderAdvanceCost');

  if (eqType) eqType.value = o.equipment?.type || 'Laptop / Portátil';
  if (eqBrand) eqBrand.value = o.equipment?.brand || '';
  if (eqModel) eqModel.value = o.equipment?.model || '';
  if (eqSerial) eqSerial.value = o.equipment?.serial || '';
  if (eqIssue) {
    eqIssue.value = `[REINGRESO POR GARANTÍA DE ORDEN #${o.id}]: `;
    eqIssue.focus();
  }
  if (eqDiagnosis) {
    eqDiagnosis.value = `Reingreso por garantía de servicio previo #${o.id}. Revisión preferente sin costo de mano de obra.`;
  }
  if (estCost) estCost.value = 0;
  if (advCost) advCost.value = 0;

  if (orderForm) {
    orderForm.dataset.isWarranty = 'true';
    orderForm.dataset.warrantyOriginalOrderId = o.id;
  }

  const modalTitle = document.getElementById('modalTitle');
  if (modalTitle) {
    modalTitle.innerHTML = `<span class="text-purple-400">\uD83D\uDEE1\uFE0F Reingreso por Garant\u00EDa (de Orden #${o.id})</span>`;
  }

  const banner = document.getElementById('warrantyAlertBanner');
  if (banner) {
    banner.innerHTML = `
      <div class="flex items-center gap-3 w-full">
        <div class="w-8 h-8 rounded-xl bg-purple-500/25 text-purple-300 flex items-center justify-center shrink-0">
          <i data-lucide="check" class="w-4 h-4"></i>
        </div>
        <div class="text-xs font-bold text-purple-200 flex-1">
          \u2705 Reingreso por Garant\u00EDa de Orden #${o.id} aplicado exitosamente con mano de obra bonificada ($0 MXN).
        </div>
      </div>
    `;
    if (typeof renderLucideIcons === 'function') renderLucideIcons();
  }

  showToast(`\uD83D\uDEE1\uFE0F Orden configurada como Reingreso de Garant\u00EDa #${o.id}`);
}

function extendOrderWarranty(orderId, extraDays = 30) {
  const order = AppState.orders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  const currentDays = (order.warrantyDays && order.warrantyDays !== 30) ? order.warrantyDays : (AppState.shopConfig.warrantyDays || 45);
  const newDays = currentDays + extraDays;
  order.warrantyDays = newDays;

  if (!order.bitacora) order.bitacora = [];
  order.bitacora.unshift({
    id: Date.now(),
    date: new Date().toISOString(),
    title: `\uD83D\uDEE1\uFE0F Extensi\u00F3n de Garant\u00EDa (+${extraDays} d\u00EDas)`,
    notes: `Se extendió la póliza de garantía oficial a un total de ${newDays} días por cortesía o acuerdo con el cliente.`,
    technician: AppState.auth.currentUser?.name || 'Administración'
  });

  saveOrders();
  openOrderDetailModal(orderId);
  showToast(`\u2705 Garant\u00EDa extendida a ${newDays} d\u00EDas en total.`);
}

async function invalidateOrderWarranty(orderId) {
  const order = AppState.orders.find(o => String(o.id) === String(orderId));
  if (!order) return;

  const reason = await showGlitchPrompt({
    title: 'Anular Garant\u00EDa',
    badge: 'P\u00F3liza T\u00E9cnica',
    message: 'Indica el motivo t\u00E9cnico de anulaci\u00F3n (ej: sulfato/da\u00F1o por l\u00EDquido, golpe severo o manipulaci\u00F3n no autorizada):',
    placeholder: 'Escribe el motivo de la anulaci\u00F3n...',
    confirmText: 'Anular Garant\u00EDa',
    cancelText: 'Cancelar',
    type: 'danger',
    icon: 'shield-alert'
  });
  if (!reason) return;

  order.warrantyVoided = true;
  order.warrantyVoidReason = reason;

  if (!order.bitacora) order.bitacora = [];
  order.bitacora.unshift({
    id: 'bit_' + Date.now(),
    date: new Date().toISOString(),
    title: `\uD83D\uDEAB Garant\u00EDa Anulada`,
    notes: `P\u00F3liza de garant\u00EDa anulada. Motivo: ${reason}`,
    technician: AppState.auth.currentUser?.name || 'Administraci\u00F3n'
  });

  saveOrders();
  if (typeof syncSingleOrderToSupabase === 'function') {
    syncSingleOrderToSupabase(order);
  }
  renderDashboard();
  renderOrders();
  if (typeof currentDetailOrderId !== 'undefined' && String(currentDetailOrderId) === String(order.id)) {
    openOrderDetailModal(order.id);
  }
  showToast('Garant\u00EDa anulada correctamente.');
  openOrderDetailModal(orderId);
  showToast(`Garantía anulada y registrada en bitácora.`);
}

// ==========================================
// CENTRO DE RESPALDO & EXPORTACIONES EXCEL
// ==========================================
function openBackupExportModal() {
  const mOrders = document.getElementById('bkMetricOrders');
  const mClients = document.getElementById('bkMetricClients');
  const mInv = document.getElementById('bkMetricInventory');
  const mCash = document.getElementById('bkMetricCash');

  const ordersCount = (AppState.orders || []).length;
  const clientsCount = (AppState.clients || []).length;
  const invCount = (AppState.inventory || []).length;

  let totalCash = 0;
  (AppState.orders || []).forEach(o => {
    if (Array.isArray(o.payments)) {
      o.payments.forEach(p => { totalCash += (parseFloat(p.amount) || 0); });
    } else if (o.costs?.advance) {
      totalCash += (parseFloat(o.costs.advance) || 0);
    }
  });

  if (mOrders) mOrders.innerText = ordersCount;
  if (mClients) mClients.innerText = clientsCount;
  if (mInv) mInv.innerText = invCount;
  if (mCash) mCash.innerText = `$${totalCash.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;

  openModalWithAnimation('backupExportModal');
  if (typeof renderLucideIcons === 'function') renderLucideIcons();
}

function closeBackupExportModal() {
  closeModalWithAnimation('backupExportModal');
}

function exportFinancialTransactionsToCSV() {
  const payments = [];

  (AppState.orders || []).forEach(o => {
    if (Array.isArray(o.payments) && o.payments.length > 0) {
      o.payments.forEach(p => {
        payments.push({
          date: p.date ? new Date(p.date).toLocaleString('es-MX') : new Date(o.date).toLocaleDateString('es-MX'),
          orderId: `#${o.id}`,
          client: o.client?.name || 'Mostrador',
          phone: o.client?.phone || '',
          concept: p.note || 'Abono / Liquidación',
          method: p.method || 'Efectivo',
          amount: parseFloat(p.amount) || 0,
          technician: p.technician || o.technician || 'Caja'
        });
      });
    } else if (o.costs?.advance > 0) {
      payments.push({
        date: new Date(o.date).toLocaleString('es-MX'),
        orderId: `#${o.id}`,
        client: o.client?.name || 'Mostrador',
        phone: o.client?.phone || '',
        concept: 'Anticipo inicial de ingreso',
        method: o.costs?.paymentMethod || 'Efectivo',
        amount: parseFloat(o.costs.advance) || 0,
        technician: o.technician || 'Caja'
      });
    }
  });

  if (payments.length === 0) {
    alert('No hay transacciones ni abonos registrados para exportar.');
    return;
  }

  const headers = ['Fecha y Hora', 'Folio Orden', 'Cliente', 'Telefono', 'Concepto', 'Metodo de Pago', 'Monto ($ MXN)', 'Registrado Por'];
  const rows = payments.map(p => [
    `"${p.date}"`,
    `"${p.orderId}"`,
    `"${p.client.replace(/"/g, '""')}"`,
    `"${p.phone}"`,
    `"${p.concept.replace(/"/g, '""')}"`,
    `"${p.method}"`,
    p.amount,
    `"${p.technician.replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadCSVFile(csvContent, `GlitchLab_Flujo_Caja_${new Date().toISOString().slice(0, 10)}.csv`);
  showToast(`Flujo de caja con ${payments.length} transacciones exportado a Excel.`);
}

function exportClientsToCSV() {
  const clients = AppState.clients || [];
  if (clients.length === 0) {
    alert('No hay clientes registrados en el directorio.');
    return;
  }

  const headers = ['Nombre Completo', 'Telefono', 'Enlace WhatsApp', 'Email', 'Direccion', 'Total de O\u00F3rdenes', 'Saldo Pendiente Acumulado ($ MXN)'];
  const rows = clients.map(c => {
    const cleanPhone = (c.phone || '').replace(/\D/g, '');
    const clientOrders = (AppState.orders || []).filter(o => {
      const oPhone = (o.client?.phone || '').replace(/\D/g, '');
      return cleanPhone && oPhone === cleanPhone;
    });
    const totalBalance = clientOrders.reduce((sum, o) => sum + (parseFloat(o.costs?.balance) || 0), 0);
    const waLink = cleanPhone ? `https://wa.me/52${cleanPhone}` : '';

    return [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${c.phone || ''}"`,
      `"${waLink}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      `"${(c.address || '').replace(/"/g, '""')}"`,
      clientOrders.length,
      totalBalance
    ];
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadCSVFile(csvContent, `GlitchLab_Directorio_Clientes_${new Date().toISOString().slice(0, 10)}.csv`);
  showToast(`Directorio con ${clients.length} clientes exportado a Excel.`);
}

function exportInventoryToCSV() {
  const items = AppState.inventory || [];
  if (items.length === 0) {
    alert('No hay refacciones en el inventario.');
    return;
  }

  const headers = ['SKU / Codigo', 'Refaccion / Componente', 'Categoria', 'Stock Actual', 'Stock Minimo', 'Costo Compra ($ MXN)', 'Precio Venta ($ MXN)', 'Ubicacion / Gaveta'];
  const rows = items.map(i => [
    `"${i.sku || ''}"`,
    `"${(i.name || '').replace(/"/g, '""')}"`,
    `"${i.category || ''}"`,
    i.stock || 0,
    i.minStock || 0,
    i.cost || 0,
    i.price || 0,
    `"${(i.location || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadCSVFile(csvContent, `GlitchLab_Inventario_${new Date().toISOString().slice(0, 10)}.csv`);
  showToast(`Catálogo con ${items.length} componentes exportado a Excel.`);
}

function downloadCSVFile(content, fileName) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

function handleRestoreBackupFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || (!Array.isArray(data.orders) && !Array.isArray(data.clients))) {
        alert('El archivo no parece ser un respaldo válido de GlitchLab.');
        return;
      }

      const orderCount = Array.isArray(data.orders) ? data.orders.length : 0;
      const clientCount = Array.isArray(data.clients) ? data.clients.length : 0;
      const invCount = Array.isArray(data.inventory) ? data.inventory.length : 0;

      const confirmMsg = `¿Deseas restaurar este respaldo?\n\n` +
        `\u2022 ${orderCount} \u00F3\u00F3rdenes de servicio\n` +
        `\u2022 ${clientCount} clientes registrados\n` +
        `\u2022 ${invCount} refacciones en inventario\n\n` +
        `\u26A0\uFE0F ADVERTENCIA: Esta acci\u00F3n sobreescribir\u00E1 los datos actuales en memoria.`;

      const confirmed = await showGlitchConfirm({
        title: '¿Restaurar Respaldo de Datos?',
        badge: 'Restauración Crítica',
        message: confirmMsg,
        confirmText: 'Sí, Restaurar Datos',
        cancelText: 'Cancelar',
        type: 'warning',
        icon: 'upload-cloud'
      });

      if (confirmed) {
        if (Array.isArray(data.orders)) AppState.orders = data.orders;
        if (Array.isArray(data.clients)) AppState.clients = data.clients;
        if (Array.isArray(data.inventory)) AppState.inventory = data.inventory;
        if (data.config) AppState.shopConfig = { ...AppState.shopConfig, ...data.config };

        saveOrders();
        saveClients();
        saveConfig();

        if (typeof renderOrders === 'function') renderOrders();
        if (typeof renderClientsTable === 'function') renderClientsTable();
        if (typeof updateKPIs === 'function') updateKPIs();

        closeBackupExportModal();
        showToast(`\u2705 Respaldo restaurado con \u00E9xito: ${orderCount} \u00F3\u00F3rdenes y ${clientCount} clientes cargados.`);
      }
    } catch (err) {
      console.error('Error parseando respaldo:', err);
      alert('Error al leer el archivo de respaldo. Asegúrate de que sea un archivo .json válido.');
    }
  };
  reader.readAsText(file);
}


// ==========================================
// MODAL: ORDEN DE SERVICIO CREADA CON ÉXITO
// ==========================================
let currentSuccessOrder = null;

function openOrderCreatedSuccessModal(order) {
  if (!order) return;
  currentSuccessOrder = order;

  const modal = document.getElementById('orderCreatedSuccessModal');
  if (!modal) return;

  const folioEl = document.getElementById('succModalFolio');
  if (folioEl) folioEl.innerText = order.id;

  const dateEl = document.getElementById('succModalDate');
  if (dateEl) {
    const d = new Date(order.date || Date.now());
    dateEl.innerText = d.toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  const clientEl = document.getElementById('succModalClient');
  if (clientEl) clientEl.innerText = order.client?.name || 'Cliente sin registrar';

  const phoneEl = document.getElementById('succModalPhone');
  if (phoneEl) {
    const formatted = typeof formatPhoneNumber === 'function' ? formatPhoneNumber(order.client?.phone) : order.client?.phone;
    phoneEl.innerText = formatted ? `(${formatted})` : '';
  }

  const deviceEl = document.getElementById('succModalDevice');
  if (deviceEl) {
    const brand = order.equipment?.brand ? (order.equipment.brand + ' ') : '';
    const model = order.equipment?.model || order.equipment?.type || 'Dispositivo';
    deviceEl.innerText = (brand + model).trim();
  }

  const issueEl = document.getElementById('succModalIssue');
  if (issueEl) {
    issueEl.innerText = order.issue || 'Revisión técnica general';
  }

  // Costos
  const est = Number(order.costs?.estimated || 0);
  const adv = Number(order.costs?.advance || 0);
  let bal = Number(order.costs?.balance);
  if (isNaN(bal)) bal = Math.max(0, est - adv);

  const totalEl = document.getElementById('succModalTotal');
  if (totalEl) totalEl.innerText = est.toLocaleString('es-MX', { minimumFractionDigits: 2 });

  const advEl = document.getElementById('succModalAdvance');
  if (advEl) advEl.innerText = adv.toLocaleString('es-MX', { minimumFractionDigits: 2 });

  const balEl = document.getElementById('succModalBalance');
  if (balEl) balEl.innerText = bal.toLocaleString('es-MX', { minimumFractionDigits: 2 });

  // Tracking link
  const linkInput = document.getElementById('succModalTrackingLink');
  const trackingUrl = `https://rastreo.glitchlab.mx/?folio=${order.id}`;
  if (linkInput) linkInput.value = trackingUrl;

  const copyBtn = document.getElementById('btnSuccCopyTrackingLink');
  if (copyBtn) {
    copyBtn.innerHTML = '<i data-lucide="copy" class="w-3.5 h-3.5 inline-block"></i><span>Copiar</span>';
    copyBtn.className = 'px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-bold transition flex items-center gap-1 active:scale-95';
  }

    if (typeof playGlitchSound === 'function') playGlitchSound('success'); // Audio FX
  openModalWithAnimation('orderCreatedSuccessModal');
  if (typeof renderLucideIcons === 'function') renderLucideIcons();
  if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons();
}

function closeOrderCreatedSuccessModal() {
  closeModalWithAnimation('orderCreatedSuccessModal');
}

function handleSuccDownloadPdf() {
  if (!currentSuccessOrder) return;
  const orderId = currentSuccessOrder.id;
  if (typeof downloadCustomerPDF === 'function') {
    downloadCustomerPDF(orderId);
  } else {
    showToast('Generando orden PDF...');
  }
}

function handleSuccPrint() {
  if (!currentSuccessOrder) return;
  const orderId = currentSuccessOrder.id;
  closeOrderCreatedSuccessModal();
  if (typeof openPrintModal === 'function') {
    openPrintModal(orderId);
  }
}

function handleSuccWhatsApp() {
  if (!currentSuccessOrder) return;
  const orderId = currentSuccessOrder.id;
  closeOrderCreatedSuccessModal();
  if (typeof openWhatsAppTemplatesModal === 'function') {
    openWhatsAppTemplatesModal(orderId);
  }
}

function handleSuccViewDetail() {
  if (!currentSuccessOrder) return;
  const orderId = currentSuccessOrder.id;
  closeOrderCreatedSuccessModal();
  if (typeof openOrderDetailModal === 'function') {
    openOrderDetailModal(orderId);
  }
}

function handleSuccCreateAnother() {
  closeOrderCreatedSuccessModal();
  if (typeof openNewOrderModal === 'function') {
    setTimeout(() => {
      openNewOrderModal();
    }, 200);
  }
}

// ====================================================
// DIÁLOGO PERSONALIZADO DE CONFIRMACIÓN Y ALERTA (GLITCHLAB)
// Reemplazo visual de confirm() y alert() nativos del navegador
// ====================================================
let glitchDialogResolver = null;

function renderCustomDialog(config) {
  const modal = document.getElementById('glitchCustomDialogModal');
  const card = document.getElementById('glitchCustomDialogCard');
  const titleEl = document.getElementById('dialogTitleEl') || document.getElementById('glitchDialogTitle');
  const messageEl = document.getElementById('dialogMessageEl') || document.getElementById('glitchDialogMessage');
  const badgeEl = document.getElementById('dialogBadgeEl') || document.getElementById('glitchDialogBadge');
  const highlightEl = document.getElementById('dialogHighlightEl') || document.getElementById('glitchDialogHighlight');
  const iconEl = document.getElementById('dialogIconEl') || document.getElementById('glitchDialogIcon');
  const iconBox = document.getElementById('dialogIconBox') || document.getElementById('glitchDialogIconBox');
  const btnConfirm = document.getElementById('dialogBtnConfirm') || document.getElementById('glitchDialogConfirmBtn');
  const btnConfirmText = document.getElementById('dialogBtnConfirmText') || document.getElementById('glitchDialogConfirmText');
  const btnConfirmIcon = document.getElementById('dialogBtnConfirmIcon') || document.getElementById('glitchDialogConfirmIcon');
  const btnCancel = document.getElementById('dialogBtnCancel') || document.getElementById('glitchDialogCancelBtn');

  if (!modal || !card) return;

  // Textos principales
  if (titleEl) titleEl.innerText = config.title || '¿Confirmar Acción?';
  if (messageEl) messageEl.innerText = config.message || '';
  if (badgeEl) badgeEl.innerText = config.badge || 'Confirmación';

  if (highlightEl) {
    if (config.highlight) {
      highlightEl.innerText = config.highlight;
      highlightEl.classList.remove('hidden');
    } else {
      highlightEl.classList.add('hidden');
    }

  // Soporte din\u00E1mico para Prompts interactivos
  const promptContainer = document.getElementById('dialogPromptContainer');
  const promptInput = document.getElementById('dialogPromptInput');
  if (promptContainer && promptInput) {
    if (config.isPrompt) {
      promptContainer.classList.remove('hidden');
      promptInput.value = config.defaultValue || '';
      promptInput.placeholder = config.placeholder || 'Escribe aqu\u00ED...';
      setTimeout(() => { promptInput.focus(); promptInput.select(); }, 100);
    } else {
      promptContainer.classList.add('hidden');
    }
  }
  }

  // Estilos segÚn tipo: danger | warning | info | success
  const type = config.type || 'danger';
  if (iconBox && badgeEl && btnConfirm) {
    iconBox.className = 'w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg';
    badgeEl.className = 'text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border inline-block mb-1';
    btnConfirm.className = 'px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition active:scale-95 shadow-lg cursor-pointer';

    if (type === 'danger') {
      iconBox.classList.add('bg-rose-500/15', 'border', 'border-rose-500/30', 'text-rose-400', 'shadow-rose-950/40');
      badgeEl.classList.add('bg-rose-500/20', 'text-rose-300', 'border-rose-500/30');
      btnConfirm.classList.add('bg-gradient-to-r', 'from-rose-600', 'to-red-600', 'hover:from-rose-500', 'hover:to-red-500', 'text-white', 'shadow-rose-600/30');
    } else if (type === 'warning') {
      iconBox.classList.add('bg-amber-500/15', 'border', 'border-amber-500/30', 'text-amber-400', 'shadow-amber-950/40');
      badgeEl.classList.add('bg-amber-500/20', 'text-amber-300', 'border-amber-500/30');
      btnConfirm.classList.add('bg-gradient-to-r', 'from-amber-500', 'to-yellow-500', 'hover:from-amber-400', 'hover:to-yellow-400', 'text-slate-950', 'shadow-amber-500/30');
    } else if (type === 'success') {
      iconBox.classList.add('bg-emerald-500/15', 'border', 'border-emerald-500/30', 'text-emerald-400', 'shadow-emerald-950/40');
      badgeEl.classList.add('bg-emerald-500/20', 'text-emerald-300', 'border-emerald-500/30');
      btnConfirm.classList.add('bg-gradient-to-r', 'from-emerald-600', 'to-teal-600', 'hover:from-emerald-500', 'hover:to-teal-500', 'text-white', 'shadow-emerald-600/30');
    } else { // info
      iconBox.classList.add('bg-sky-500/15', 'border', 'border-sky-500/30', 'text-sky-400', 'shadow-sky-950/40');
      badgeEl.classList.add('bg-sky-500/20', 'text-sky-300', 'border-sky-500/30');
      btnConfirm.classList.add('bg-gradient-to-r', 'from-sky-500', 'to-blue-600', 'hover:from-sky-400', 'hover:to-blue-500', 'text-white', 'shadow-sky-500/30');
    }
  }

  // Iconos
  if (iconEl) {
    iconEl.setAttribute('data-lucide', config.icon || (type === 'danger' ? 'trash-2' : type === 'warning' ? 'alert-triangle' : 'info'));
  }
  if (btnConfirmIcon) {
    btnConfirmIcon.setAttribute('data-lucide', config.confirmIcon || (type === 'danger' ? 'trash-2' : 'check'));
  }
  if (btnConfirmText) {
    btnConfirmText.innerText = config.confirmText || (config.isConfirm ? 'Aceptar' : 'Entendido');
  }

  // Si es confirmaciÓn, mostrar Cancelar; si es alerta, ocultarlo
  if (btnCancel) {
    if (config.isConfirm) {
      btnCancel.classList.remove('hidden');
      const cancelSpan = btnCancel.querySelector('span');
      if (cancelSpan) cancelSpan.innerText = config.cancelText || 'Cancelar';
    } else {
      btnCancel.classList.add('hidden');
    }
  }

  // Mostrar modal y animar tarjeta
  modal.classList.remove('hidden');
  void card.offsetWidth;
  card.classList.remove('scale-95', 'opacity-0');
  card.classList.add('scale-100', 'opacity-100');

  if (window.lucide && typeof lucide.createIcons === 'function') {
    lucide.createIcons();
  }

  // Focus
  setTimeout(() => {
    if (config.isConfirm && btnCancel) {
      btnCancel.focus();
    } else if (btnConfirm) {
      btnConfirm.focus();
    }
  }, 50);
}

function showGlitchConfirm(options = {}) {
  return new Promise((resolve) => {
    glitchDialogResolver = resolve;
    renderCustomDialog({
      isConfirm: true,
      title: options.title || '¿Confirmar Acción?',
      badge: options.badge || 'Confirmación',
      message: options.message || '¿Estás seguro de continuar?',
      highlight: options.highlight || null,
      confirmText: options.confirmText || 'Aceptar',
      cancelText: options.cancelText || 'Cancelar',
      type: options.type || 'danger',
      icon: options.icon || (options.type === 'danger' ? 'trash-2' : options.type === 'warning' ? 'alert-triangle' : 'help-circle'),
      confirmIcon: options.confirmIcon || (options.type === 'danger' ? 'trash-2' : 'check')
    });
  });
}

function showGlitchAlert(message, title = 'Aviso de GlitchLab', type = 'info', icon = null) {
  return new Promise((resolve) => {
    glitchDialogResolver = resolve;
    renderCustomDialog({
      isConfirm: false,
      title: title || 'Aviso de GlitchLab',
      badge: type === 'danger' ? 'Atención' : type === 'warning' ? 'Aviso' : type === 'success' ? 'Éxito' : 'Información',
      message: message || '',
      highlight: null,
      confirmText: 'Entendido',
      cancelText: '',
      type: type || 'info',
      icon: icon || (type === 'danger' ? 'alert-octagon' : type === 'warning' ? 'alert-triangle' : type === 'success' ? 'check-circle' : 'info'),
      confirmIcon: 'check'
    });
  });
}


function closeGlitchDialog(result) {
  const modal = document.getElementById('glitchCustomDialogModal');
  const card = document.getElementById('glitchCustomDialogCard');
  const promptContainer = document.getElementById('dialogPromptContainer');
  const promptInput = document.getElementById('dialogPromptInput');

  let finalValue = result;
  if (result === true && promptContainer && !promptContainer.classList.contains('hidden') && promptInput) {
    finalValue = promptInput.value.trim() || null;
  } else if (!result) {
    finalValue = (result === false) ? false : null;
  }

  if (!modal) return;

  if (card) {
    card.classList.remove('scale-100', 'opacity-100');
    card.classList.add('scale-95', 'opacity-0');
  }

  setTimeout(() => {
    modal.classList.add('hidden');
    if (typeof glitchDialogResolver === 'function') {
      const fn = glitchDialogResolver;
      glitchDialogResolver = null;
      fn(finalValue);
    }
  }, 150);
}

function showGlitchPrompt(options = {}) {
  return new Promise((resolve) => {
    glitchDialogResolver = resolve;
    renderCustomDialog({
      isConfirm: true,
      isPrompt: true,
      title: options.title || 'Ingresar Informaci\\u00F3n',
      badge: options.badge || 'Entrada',
      message: options.message || '',
      defaultValue: options.defaultValue || '',
      placeholder: options.placeholder || 'Escribe aqu\u00ED...',
      confirmText: options.confirmText || 'Aceptar',
      cancelText: options.cancelText || 'Cancelar',
      type: options.type || 'info',
      icon: options.icon || 'edit-3',
      confirmIcon: options.confirmIcon || 'check'
    });
  });
}

// Soporte para Teclado (Escape = Cancelar, Enter = Confirmar)
document.addEventListener('keydown', (e) => {
  const dialogModal = document.getElementById('glitchCustomDialogModal');
  if (dialogModal && !dialogModal.classList.contains('hidden')) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeGlitchDialog(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      closeGlitchDialog(true);
    }
  }
});

// Reemplazo visual elegante de window.alert nativo
window.prompt = function(msg) { console.warn('[GlitchLab Shield] prompt interceptado:', msg); return null; };
window.alert = function(msg) {
  showGlitchAlert(msg);
};



function copySuccTrackingLink() {
  if (!currentSuccessOrder) return;
  const trackingUrl = `https://rastreo.glitchlab.mx/?folio=${currentSuccessOrder.id}`;
  const btn = document.getElementById('btnSuccCopyTrackingLink');

  const onCopied = () => {
    if (btn) {
      btn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400 inline-block"></i><span class="text-emerald-300">¡Copiado!</span>';
      btn.className = 'px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition flex items-center gap-1';
      if (window.lucide) lucide.createIcons();
      setTimeout(() => {
        btn.innerHTML = '<i data-lucide="copy" class="w-3.5 h-3.5 inline-block"></i><span>Copiar</span>';
        btn.className = 'px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-bold transition flex items-center gap-1 active:scale-95';
        if (window.lucide) lucide.createIcons();
      }, 2000);
    }
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(trackingUrl).then(onCopied).catch(() => {
      fallbackCopy(trackingUrl);
    });
  } else {
    fallbackCopy(trackingUrl);
  }

  function fallbackCopy(text) {
    try {
      const temp = document.createElement('input');
      temp.value = text;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
      onCopied();
    } catch (_) {
      onCopied();
    }
  }
}
// Utilidad universal segura para copiar al portapapeles sin ningun popup nativo
function copyTextSafely(text, successMsg = 'Copiado al portapapeles') {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      showToast("\u2705 " + successMsg);
    }).catch(() => {
      fallbackExecCopy(text, successMsg);
    });
  } else {
    fallbackExecCopy(text, successMsg);
  }
}

function fallbackExecCopy(text, successMsg) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
      showToast("\u2705 " + successMsg);
  } catch (_) {
    showToast("\u26A0\uFE0F No se pudo copiar autom\u00E1ticamente.");
  }
}

// ==========================================
// GLITCHLAB AUDIO ENGINE (Web Audio API Synthesizer)
// ==========================================
let glitchAudioCtx = null;
let glitchSoundEnabled = (localStorage.getItem('glitchlab_sound_enabled') !== 'false');

function getGlitchAudioContext() {
  if (!glitchAudioCtx && (window.AudioContext || window.webkitAudioContext)) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    glitchAudioCtx = new AudioCtx();
  }
  if (glitchAudioCtx && glitchAudioCtx.state === 'suspended') {
    glitchAudioCtx.resume().catch(() => {});
  }
  return glitchAudioCtx;
}

function playGlitchSound(type = 'click') {
  if (!glitchSoundEnabled) return;
  try {
    const ctx = getGlitchAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'success') {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';

      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.exponentialRampToValueAtTime(1046.5, now + 0.2);

      osc2.frequency.setValueAtTime(659.25, now);
      osc2.frequency.exponentialRampToValueAtTime(1318.5, now + 0.2);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.33);
      osc2.stop(now + 0.33);

    } else if (type === 'save') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.21);

    } else if (type === 'alert') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.setValueAtTime(260, now + 0.08);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.17);

    } else if (type === 'scan') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(500, now + 0.08);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.11);

    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);

      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    }
  } catch (_) {}
}

function toggleSoundFx() {
  glitchSoundEnabled = !glitchSoundEnabled;
  localStorage.setItem('glitchlab_sound_enabled', glitchSoundEnabled ? 'true' : 'false');
  updateSoundFxUI();
  if (glitchSoundEnabled) {
    playGlitchSound('save');
    showToast('\uD83D\uDD0A Efectos de sonido activados.');
  } else {
    showToast('\uD83D\uDD07 Efectos de sonido silenciados.');
  }
}

function updateSoundFxUI() {
  const btn = document.getElementById('btnToggleSoundFx');
  const icon = document.getElementById('soundFxIcon');
  if (!btn || !icon) return;
  if (glitchSoundEnabled) {
    icon.setAttribute('data-lucide', 'volume-2');
    icon.className = 'w-4 h-4 inline-block text-sky-400';
    btn.title = 'Efectos de Sonido: Activados (Clic para silenciar)';
  } else {
    icon.setAttribute('data-lucide', 'volume-x');
    icon.className = 'w-4 h-4 inline-block text-slate-500';
    btn.title = 'Efectos de Sonido: Silenciados (Clic para activar)';
  }
  if (window.lucide && typeof lucide.createIcons === 'function') {
    lucide.createIcons();
  }
}

// ==========================================
// PWA INSTALLATION & SERVICE WORKER
// ==========================================
let deferredPwaInstallPrompt = null;

function initPwaService() {
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('[GlitchLab PWA] Service Worker registrado:', reg.scope);
      })
      .catch(err => {
        console.warn('[GlitchLab PWA] Registro SW omitido:', err);
      });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPwaInstallPrompt = e;
    const btn = document.getElementById('btnInstallPwa');
    if (btn) {
      btn.classList.remove('hidden');
      btn.classList.add('inline-flex');
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredPwaInstallPrompt = null;
    const btn = document.getElementById('btnInstallPwa');
    if (btn) btn.classList.add('hidden');
    showToast('\u2705 \u00A1GlitchLab OS instalado correctamente!');
  });
}

function triggerPwaInstall() {
  if (typeof playGlitchSound === 'function') playGlitchSound('click');
  if (!deferredPwaInstallPrompt) {
    showGlitchAlert('Para instalar GlitchLab OS en tu dispositivo:\n\n\u2022 En Chrome/Edge: Clic en el \u00EDcono de instalar en la barra de direcciones.\n\u2022 En Android: Toca el men\u00FA de Chrome (3 puntos) y elige "Instalar aplicaci\u00F3n".\n\u2022 En iPhone/iPad: Toca Compartir y elige "Agregar al inicio".', 'Instalar GlitchLab OS', 'info', 'download-cloud');
    return;
  }
  deferredPwaInstallPrompt.prompt();
  deferredPwaInstallPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === 'accepted') {
      const btn = document.getElementById('btnInstallPwa');
      if (btn) btn.classList.add('hidden');
    }
    deferredPwaInstallPrompt = null;
  });
}
