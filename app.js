/**
 * GlitchLab - Sistema de Gestión de Órdenes de Servicio
 * Especialistas en Microelectrónica & Computadoras
 * Módulo Multi-Usuarios con Roles (Admin, Técnico, Recepción)
 */

// Estado global de la aplicación
const AppState = {
  orders: [],
  currentOrder: null,
  activeBitacoraOrderId: null,
  filterStatus: 'all',
  searchQuery: '',
  auth: {
    isAuthenticated: false,
    currentUser: null,
    users: []
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
  loadOrders();
  setupSignaturePad();
  setupEventListeners();
  setupAuthListeners();
  checkInitialAuth();
});

// ==========================================
// MÓDULO MULTI-USUARIOS Y ROLES
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

  // Si no hay usuarios registrados, inicializar usuarios demo
  if (!AppState.auth.users || AppState.auth.users.length === 0) {
    AppState.auth.users = [
      {
        id: 'u_1',
        name: 'Administrador General',
        username: 'admin',
        password: 'glitchlab2026',
        role: 'admin'
      },
      {
        id: 'u_2',
        name: 'Ing. Rivera',
        username: 'rivera',
        password: '1234',
        role: 'technician'
      },
      {
        id: 'u_3',
        name: 'Recepción Mostrador',
        username: 'recepcion',
        password: '1234',
        role: 'reception'
      }
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

  // Toggle mostrar contraseña en login
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

  // Formulario para crear nuevo usuario
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

  // Buscar coincidencia en la lista de usuarios registrados
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
    showToast(`Bienvenido, ${matchedUser.name} (${RoleMeta[matchedUser.role]?.label || matchedUser.role}).`);
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

  // Prellenar nombre de técnico con el usuario activo
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

// Agregar nuevo usuario desde el panel de Ajustes
function handleCreateNewUser(e) {
  e.preventDefault();

  const name = document.getElementById('newUserName').value.trim();
  const username = document.getElementById('newUserUsername').value.trim().toLowerCase();
  const password = document.getElementById('newUserPassword').value.trim();
  const role = document.getElementById('newUserRole').value;

  if (username.length < 3) {
    alert('El nombre de usuario debe tener al menos 3 caracteres.');
    return;
  }

  if (password.length < 4) {
    alert('La contraseña debe tener al menos 4 caracteres.');
    return;
  }

  // Verificar si ya existe el nombre de usuario
  if (AppState.auth.users.some(u => u.username.toLowerCase() === username)) {
    alert(`El nombre de usuario "${username}" ya está registrado. Por favor elige otro.`);
    return;
  }

  const newUser = {
    id: 'u_' + Date.now(),
    name,
    username,
    password,
    role
  };

  AppState.auth.users.push(newUser);
  saveUsers();
  renderUsersList();

  document.getElementById('newUserName').value = '';
  document.getElementById('newUserUsername').value = '';
  document.getElementById('newUserPassword').value = '';

  showToast(`Usuario "${name}" creado exitosamente.`);
}

// Renderizar la lista de usuarios en el modal de Ajustes
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
        <td class="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
          ••••••••
        </td>
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
    alert('No puedes eliminar tu propio usuario mientras tienes la sesión iniciada.');
    return;
  }

  // Comprobar que quede al menos 1 admin
  const remainingAdmins = AppState.auth.users.filter(u => u.id !== userId && u.role === 'admin');
  if (user.role === 'admin' && remainingAdmins.length === 0) {
    alert('No puedes eliminar el único administrador del sistema.');
    return;
  }

  if (confirm(`¿Estás seguro de que deseas eliminar al usuario "${user.name}" (@${user.username})?`)) {
    AppState.auth.users = AppState.auth.users.filter(u => u.id !== userId);
    saveUsers();
    renderUsersList();
    showToast(`Usuario "${user.name}" eliminado.`);
  }
}

// ==========================================
// CONFIGURACIÓN Y PERSISTENCIA
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
}

// Demo data
function seedDemoOrders() {
  AppState.orders = [
    {
      id: 'GL-2026-0001',
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
      id: 'GL-2026-0002',
      date: new Date(Date.now() - 86400000 * 4).toISOString(),
      status: 'ready',
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
        balance: 1000,
        paymentMethod: 'Efectivo'
      },
      signature: null,
      photos: [],
      bitacora: [
        {
          id: 'bit_2_1',
          date: new Date(Date.now() - 86400000 * 4).toISOString(),
          title: 'Equipo recibido en laboratorio',
          notes: 'Ingreso al taller para pruebas de estabilidad y microelectrónica.',
          technician: 'Recepción Mostrador',
          status: 'received'
        },
        {
          id: 'bit_2_2',
          date: new Date(Date.now() - 86400000 * 2).toISOString(),
          title: 'Reprogramación SPI Flash (BIOS)',
          notes: 'Se desoldó la memoria SPI Flash y se reprogramó el firmware limpio con programador RT809H.',
          technician: 'Ing. Rivera',
          status: 'in_progress'
        },
        {
          id: 'bit_2_3',
          date: new Date(Date.now() - 86400000 * 0.5).toISOString(),
          title: 'Pruebas de estrés superadas',
          notes: 'Equipo corriendo FurMark y Cinebench por 4 horas sin caídas ni pantallas azules. Listo para entregar.',
          technician: 'Ing. Rivera',
          status: 'ready'
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

// Generador de Folios GL-YYYY-XXXX
function generateNextFolio() {
  const currentYear = new Date().getFullYear();
  const prefix = `GL-${currentYear}-`;
  
  let maxNum = 0;
  AppState.orders.forEach(order => {
    if (order.id && order.id.startsWith(prefix)) {
      const numPart = parseInt(order.id.replace(prefix, ''), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }
  });

  const nextNum = (maxNum + 1).toString().padStart(4, '0');
  return `${prefix}${nextNum}`;
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

  // Filtros de estado (Pills)
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

  // Cálculo de saldo
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

  // Tipo de contraseña
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

  // Toggle de visibilidad de contraseña de equipo
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

  // Guardar Orden
  const orderForm = document.getElementById('orderForm');
  if (orderForm) {
    orderForm.addEventListener('submit', handleSaveOrder);
  }

  // Limpiar Firma
  const btnClearSig = document.getElementById('btnClearSignature');
  if (btnClearSig) {
    btnClearSig.addEventListener('click', clearSignature);
  }

  // Fotos Input
  const photoFileInput = document.getElementById('photoFileInput');
  if (photoFileInput) {
    photoFileInput.addEventListener('change', handlePhotoUpload);
  }

  // Formulario Bitácora
  const bitacoraForm = document.getElementById('bitacoraForm');
  if (bitacoraForm) {
    bitacoraForm.addEventListener('submit', handleAddBitacoraEntry);
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
  received: { label: 'Recibido', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40', icon: 'fa-inbox' },
  diagnostic: { label: 'En Diagnóstico', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40', icon: 'fa-microchip' },
  in_progress: { label: 'En Reparación', color: 'bg-sky-500/20 text-sky-400 border-sky-500/40', icon: 'fa-screwdriver-wrench' },
  waiting_parts: { label: 'Espera de Repuesto', color: 'bg-orange-500/20 text-orange-400 border-orange-500/40', icon: 'fa-clock' },
  ready: { label: 'Listo para Entrega', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', icon: 'fa-circle-check' },
  delivered: { label: 'Entregado', color: 'bg-slate-500/20 text-slate-400 border-slate-500/40', icon: 'fa-handshake' },
  cancelled: { label: 'Cancelado', color: 'bg-red-500/20 text-red-400 border-red-500/40', icon: 'fa-ban' }
};

// Renderizar Tarjetas de Órdenes
function renderOrders() {
  const container = document.getElementById('ordersContainer');
  if (!container) return;

  let filtered = AppState.orders;

  if (AppState.filterStatus !== 'all') {
    filtered = filtered.filter(o => o.status === AppState.filterStatus);
  }

  if (AppState.searchQuery) {
    const q = AppState.searchQuery;
    filtered = filtered.filter(o => {
      const folio = (o.id || '').toLowerCase();
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

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full flex flex-col items-center justify-center p-12 text-slate-400 bg-slate-900/60 rounded-2xl border border-slate-800">
        <i class="fas fa-folder-open text-5xl mb-4 text-slate-600"></i>
        <p class="text-lg font-medium text-slate-300">No se encontraron órdenes de servicio</p>
        <p class="text-sm text-slate-500 mt-1">Crea una nueva orden o cambia los filtros de búsqueda.</p>
        <button onclick="openNewOrderModal()" class="mt-4 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-sm font-semibold transition flex items-center gap-2">
          <i class="fas fa-plus"></i> Crear Nueva Orden
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(order => {
    const meta = StatusMeta[order.status] || StatusMeta.received;
    const dateFormatted = new Date(order.date).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const balance = order.costs?.balance ?? 0;
    const est = order.costs?.estimated ?? 0;
    const photoCount = order.photos ? order.photos.length : 0;
    const logCount = order.bitacora ? order.bitacora.length : 0;

    let eqIcon = 'fa-laptop';
    const typeLower = (order.equipment?.type || '').toLowerCase();
    if (typeLower.includes('escritorio') || typeLower.includes('pc')) eqIcon = 'fa-desktop';
    else if (typeLower.includes('celular') || typeLower.includes('smartphone')) eqIcon = 'fa-mobile-screen';
    else if (typeLower.includes('tablet')) eqIcon = 'fa-tablet-screen-button';
    else if (typeLower.includes('consola')) eqIcon = 'fa-gamepad';
    else if (typeLower.includes('tarjeta') || typeLower.includes('motherboard')) eqIcon = 'fa-microchip';
    else if (typeLower.includes('monitor') || typeLower.includes('pantalla')) eqIcon = 'fa-tv';

    let passwordDisplay = '';
    if (order.equipment?.lockType === 'none') {
      passwordDisplay = '<span class="text-slate-500 text-xs italic">Sin contraseña</span>';
    } else if (order.equipment?.password) {
      passwordDisplay = `
        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800 text-xs font-mono text-sky-300 border border-slate-700">
          <i class="fas fa-key text-[10px] text-sky-400"></i> ${escapeHtml(order.equipment.password)}
        </span>
      `;
    }

    return `
      <div class="bg-slate-900 border border-slate-800 hover:border-sky-500/50 rounded-2xl p-5 transition-all duration-200 shadow-lg flex flex-col justify-between group">
        <div>
          <!-- Cabecera de la Tarjeta -->
          <div class="flex items-start justify-between gap-3 mb-3">
            <div>
              <div class="flex items-center gap-2">
                <span class="font-mono text-base font-bold text-sky-400">${order.id}</span>
                <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${meta.color}">
                  <i class="fas ${meta.icon}"></i> ${meta.label}
                </span>
              </div>
              <span class="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                <i class="far fa-calendar-alt text-[10px]"></i> ${dateFormatted}
              </span>
            </div>

            <!-- Menú de Acciones Rápidas -->
            <div class="flex items-center gap-1">
              <button onclick="openPrintModal('${order.id}')" title="Imprimir Comprobante" class="p-2 text-slate-400 hover:text-sky-400 hover:bg-slate-800 rounded-lg transition">
                <i class="fas fa-print"></i>
              </button>
              <button onclick="sendWhatsAppMessage('${order.id}')" title="Enviar WhatsApp al Cliente" class="p-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40 rounded-lg transition">
                <i class="fab fa-whatsapp"></i>
              </button>
              <button onclick="editOrder('${order.id}')" title="Editar Información" class="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition">
                <i class="fas fa-pen-to-square"></i>
              </button>
              <button onclick="deleteOrder('${order.id}')" title="Eliminar Orden" class="p-2 text-slate-500 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition">
                <i class="fas fa-trash-can"></i>
              </button>
            </div>
          </div>

          <!-- Cliente -->
          <div class="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 mb-3">
            <div class="flex items-center justify-between">
              <div class="font-medium text-slate-200 text-sm flex items-center gap-2">
                <i class="fas fa-user-circle text-slate-400"></i> ${escapeHtml(order.client?.name || 'Cliente sin nombre')}
              </div>
              <a href="tel:${order.client?.phone || ''}" class="text-xs text-sky-400 hover:underline flex items-center gap-1">
                <i class="fas fa-phone-volume text-[10px]"></i> ${order.client?.phone || 'Sin tel'}
              </a>
            </div>
          </div>

          <!-- Datos del Equipo y Contraseña -->
          <div class="space-y-2 text-sm text-slate-300 mb-4">
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-2 font-medium text-white">
                <i class="fas ${eqIcon} text-sky-400"></i> ${order.equipment?.type || 'Equipo'}: ${escapeHtml(order.equipment?.brand || '')} ${escapeHtml(order.equipment?.model || '')}
              </span>
            </div>

            <div class="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/60">
              <span class="flex items-center gap-1.5"><i class="fas fa-lock text-amber-400"></i> Acceso / Clave:</span>
              ${passwordDisplay}
            </div>

            <div class="text-xs bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/50 mt-2">
              <p class="text-slate-400 font-semibold mb-0.5 flex items-center gap-1">
                <i class="fas fa-triangle-exclamation text-amber-400 text-[10px]"></i> Falla reportada:
              </p>
              <p class="text-slate-300 line-clamp-2">${escapeHtml(order.issue || 'Sin descripción detallada')}</p>
            </div>
          </div>

          <!-- Botón Bitácora & Fotos -->
          <button 
            onclick="openBitacoraModal('${order.id}')" 
            class="w-full mb-3 py-2 px-3 bg-gradient-to-r from-slate-800 to-slate-800/80 hover:from-sky-950/60 hover:to-slate-800 border border-slate-700/80 hover:border-sky-500/50 text-slate-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-between transition group/btn"
          >
            <div class="flex items-center gap-2">
              <span class="h-6 w-6 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs">
                <i class="fas fa-clipboard-list"></i>
              </span>
              <span>Bitácora de Reparación</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-[11px] text-sky-300 flex items-center gap-1">
                <i class="fas fa-camera text-[10px]"></i> ${photoCount}
              </span>
              <span class="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-[11px] text-slate-300">
                ${logCount} avances
              </span>
              <i class="fas fa-chevron-right text-[10px] text-slate-500 group-hover/btn:translate-x-0.5 transition"></i>
            </div>
          </button>

        </div>

        <!-- Footer Tarjeta -->
        <div class="pt-3 border-t border-slate-800/80 flex items-center justify-between">
          <div>
            <div class="text-[11px] text-slate-400">Presupuesto / Saldo:</div>
            <div class="flex items-baseline gap-2">
              <span class="text-sm font-semibold text-white">$${est.toLocaleString('es-MX')}</span>
              ${balance > 0 ? `<span class="text-xs font-bold text-amber-400">Resta: $${balance.toLocaleString('es-MX')}</span>` : `<span class="text-xs text-emerald-400 font-bold">Liquidado</span>`}
            </div>
          </div>

          <select onchange="updateOrderStatusQuick('${order.id}', this.value)" class="bg-slate-800 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-sky-500 focus:outline-none">
            <option value="received" ${order.status === 'received' ? 'selected' : ''}>📥 Recibido</option>
            <option value="diagnostic" ${order.status === 'diagnostic' ? 'selected' : ''}>🔍 En Diagnóstico</option>
            <option value="in_progress" ${order.status === 'in_progress' ? 'selected' : ''}>⚙️ En Reparación</option>
            <option value="waiting_parts" ${order.status === 'waiting_parts' ? 'selected' : ''}>📦 Espera Repuesto</option>
            <option value="ready" ${order.status === 'ready' ? 'selected' : ''}>✅ Listo para Entrega</option>
            <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>🤝 Entregado</option>
            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>❌ Cancelado</option>
          </select>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// BITÁCORA Y FOTOS
// ==========================================

function openBitacoraModal(orderId) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  AppState.activeBitacoraOrderId = orderId;

  document.getElementById('bitacoraFolioBadge').innerText = order.id;
  document.getElementById('bitacoraEquipmentHeader').innerText = `${order.equipment.type} ${order.equipment.brand} ${order.equipment.model}`;
  document.getElementById('bitacoraClientHeader').innerText = order.client.name;
  document.getElementById('bitacoraNewStatus').value = order.status;

  // Prellenar técnico responsable con usuario activo
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
        <div class="bg-slate-900/90 border border-slate-800 p-4 rounded-xl shadow-md">
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
            <button onclick="shareBitacoraEntryWhatsApp('${order.id}', '${log.id}')" class="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 transition">
              <i class="fab fa-whatsapp"></i> Compartir avance
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
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
  }

  saveOrders();
  renderBitacoraTimeline(order);
  renderDashboard();
  renderOrders();

  document.getElementById('bitacoraTitle').value = '';
  document.getElementById('bitacoraNotes').value = '';
  showToast('Avance registrado en bitácora.');
}

function handlePhotoUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  const orderId = AppState.activeBitacoraOrderId;
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  if (!order.photos) order.photos = [];

  const captionPrompt = prompt('Descripción para estas fotos (ej: "Inspección bajo microscopio", "Medición de voltajes", "Reparación concluida"):', 'Evidencia técnica');
  const caption = captionPrompt || 'Evidencia de reparación';

  let processedCount = 0;

  Array.from(files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1000;
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

        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.75);

        order.photos.unshift({
          id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          url: compressedDataUrl,
          caption: caption,
          date: new Date().toISOString()
        });

        processedCount++;
        if (processedCount === files.length) {
          saveOrders();
          renderPhotoGallery(order);
          renderOrders();
          showToast(`${processedCount} foto(s) guardada(s) con éxito.`);
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  e.target.value = '';
}

function deletePhoto(orderId, photoId) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order || !order.photos) return;

  if (confirm('¿Eliminar esta foto de evidencia?')) {
    order.photos = order.photos.filter(p => p.id !== photoId);
    saveOrders();
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
  
  // Asignar técnico por defecto al usuario logueado
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
  document.getElementById('technicianName').value = order.technician || 'Ing. Especialista';

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
  renderDashboard();
  renderOrders();
  showToast(`Estado de orden ${orderId} actualizado.`);
}

function deleteOrder(orderId) {
  if (confirm(`¿Estás seguro de que deseas eliminar permanentemente la orden ${orderId}?`)) {
    AppState.orders = AppState.orders.filter(o => o.id !== orderId);
    saveOrders();
    renderDashboard();
    renderOrders();
    showToast(`Orden ${orderId} eliminada.`);
  }
}

function sendWhatsAppMessage(orderId) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  const phone = (order.client?.phone || '').replace(/\D/g, '');
  if (!phone) {
    alert('Esta orden no cuenta con número telefónico registrado para el cliente.');
    return;
  }

  const statusLabel = StatusMeta[order.status]?.label || order.status;
  const balance = order.costs?.balance || 0;
  
  const text = `¡Hola *${order.client.name}*! Te saludamos de *${AppState.shopConfig.name}* (${AppState.shopConfig.slogan}).\n\n` +
    `Te informamos sobre el estatus de tu equipo:\n` +
    `📌 *Folio:* ${order.id}\n` +
    `💻 *Equipo:* ${order.equipment.type} ${order.equipment.brand} ${order.equipment.model}\n` +
    `⚙️ *Estado Actual:* ${statusLabel}\n` +
    (balance > 0 ? `💰 *Saldo Pendiente:* $${balance.toLocaleString('es-MX')} MXN\n` : `💰 *Estado de Cuenta:* Liquidado / Sin saldo pendiente\n`) +
    `\nCualquier duda quedamos a tus órdenes por este medio o visítanos en nuestro laboratorio. ¡Gracias por tu confianza!`;

  const url = `https://wa.me/52${phone.length === 10 ? phone : phone}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

// Modal de Impresión
let currentPrintOrderId = null;
let currentPrintFormat = 'letter';

function openPrintModal(orderId) {
  const order = AppState.orders.find(o => o.id === orderId);
  if (!order) return;

  currentPrintOrderId = orderId;
  currentPrintFormat = 'letter';
  document.body.classList.remove('ticket-thermal-mode');

  generatePrintTemplate(order, currentPrintFormat);

  const modal = document.getElementById('printModal');
  modal.classList.remove('hidden');
}

function setPrintFormat(format) {
  currentPrintFormat = format;
  const order = AppState.orders.find(o => o.id === currentPrintOrderId);
  if (!order) return;

  const btnLetter = document.getElementById('btnFormatLetter');
  const btnThermal = document.getElementById('btnFormatThermal');

  if (format === 'thermal') {
    document.body.classList.add('ticket-thermal-mode');
    btnThermal.classList.add('bg-sky-500', 'text-white');
    btnThermal.classList.remove('bg-slate-800', 'text-slate-400');
    btnLetter.classList.remove('bg-sky-500', 'text-white');
    btnLetter.classList.add('bg-slate-800', 'text-slate-400');
  } else {
    document.body.classList.remove('ticket-thermal-mode');
    btnLetter.classList.add('bg-sky-500', 'text-white');
    btnLetter.classList.remove('bg-slate-800', 'text-slate-400');
    btnThermal.classList.remove('bg-sky-500', 'text-white');
    btnThermal.classList.add('bg-slate-800', 'text-slate-400');
  }

  generatePrintTemplate(order, format);
}

function generatePrintTemplate(order, format) {
  const container = document.getElementById('print-area');
  if (!container) return;

  const dateFormatted = new Date(order.date).toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const est = (order.costs?.estimated || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const adv = (order.costs?.advance || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  const bal = (order.costs?.balance || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });

  if (format === 'thermal') {
    container.innerHTML = `
      <div style="font-family: 'Courier New', Courier, monospace; color: #000; padding: 4px;">
        <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
          <h2 style="font-size: 16px; font-weight: bold; margin: 0;">${AppState.shopConfig.name}</h2>
          <div style="font-size: 11px;">${AppState.shopConfig.slogan}</div>
          <div style="font-size: 10px;">${AppState.shopConfig.address}</div>
          <div style="font-size: 10px;">Tel / WA: ${AppState.shopConfig.phone}</div>
        </div>

        <div style="text-align: center; margin-bottom: 8px;">
          <div style="font-size: 13px; font-weight: bold;">ORDEN DE SERVICIO</div>
          <div style="font-size: 16px; font-weight: 900;">${order.id}</div>
          <div style="font-size: 10px;">Fecha: ${dateFormatted}</div>
        </div>

        <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin-bottom: 8px; font-size: 11px;">
          <div><strong>CLIENTE:</strong> ${escapeHtml(order.client?.name)}</div>
          <div><strong>TEL:</strong> ${escapeHtml(order.client?.phone)}</div>
          <div><strong>EQUIPO:</strong> ${escapeHtml(order.equipment?.type)} ${escapeHtml(order.equipment?.brand)} ${escapeHtml(order.equipment?.model)}</div>
          <div><strong>SERIE:</strong> ${escapeHtml(order.equipment?.serial || 'S/N')}</div>
          ${order.equipment?.password ? `<div><strong>CLAVE/PIN:</strong> ${escapeHtml(order.equipment.password)}</div>` : ''}
        </div>

        <div style="font-size: 11px; margin-bottom: 8px;">
          <div><strong>FALLA REPORTADA:</strong></div>
          <div style="padding-left: 4px;">${escapeHtml(order.issue || 'No especificada')}</div>
          ${order.equipment?.accessories?.length ? `<div style="margin-top: 4px;"><strong>ACCESORIOS:</strong> ${order.equipment.accessories.join(', ')}</div>` : ''}
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

        <div style="text-align: center; margin-top: 15px; margin-bottom: 8px;">
          ${order.signature ? `
            <img src="${order.signature}" style="max-height: 45px; margin: 0 auto; display: block;" />
          ` : '<div style="height: 35px;"></div>'}
          <div style="border-top: 1px solid #000; width: 80%; margin: 2px auto 0; font-size: 10px;">
            FIRMA DE CONFORMIDAD
          </div>
        </div>

        <div style="font-size: 9px; text-align: justify; margin-top: 8px; line-height: 1.2;">
          ${AppState.shopConfig.terms.replace(/\n/g, '<br>')}
        </div>

        <div style="text-align: center; margin-top: 12px; font-size: 10px;">
          ¡Gracias por confiar en GlitchLab!
        </div>
      </div>
    `;
  } else {
    // FORMATO HOJA COMPLETA CARTA / A4
    container.innerHTML = `
      <div style="font-family: 'Segoe UI', Roboto, Helvetica, sans-serif; color: #1e293b; max-width: 800px; margin: 0 auto; padding: 24px; border: 1px solid #cbd5e1; border-radius: 8px;">
        
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0ea5e9; padding-bottom: 16px; margin-bottom: 20px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 26px; font-weight: 800; letter-spacing: 0.05em; color: #0f172a;">Glitch<span style="color: #0ea5e9;">Lab</span></span>
            </div>
            <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #0284c7; margin-top: 2px;">
              ${AppState.shopConfig.slogan}
            </div>
            <div style="font-size: 11px; color: #475569; margin-top: 6px; line-height: 1.4;">
              ${AppState.shopConfig.address}<br>
              Tel / WhatsApp: ${AppState.shopConfig.phone} | Correo: ${AppState.shopConfig.email}
            </div>
          </div>

          <div style="text-align: right;">
            <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; padding: 8px 16px; border-radius: 8px; display: inline-block;">
              <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #0284c7;">ORDEN DE SERVICIO</div>
              <div style="font-size: 22px; font-weight: 900; color: #0c4a6e; font-family: monospace;">${order.id}</div>
            </div>
            <div style="font-size: 12px; color: #64748b; margin-top: 6px;">
              <strong>Fecha:</strong> ${dateFormatted}
            </div>
            <div style="font-size: 12px; color: #64748b;">
              <strong>Técnico:</strong> ${escapeHtml(order.technician || 'GlitchLab Team')}
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px;">
            <div style="font-size: 12px; font-weight: 700; color: #0284c7; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
              Datos del Cliente
            </div>
            <div style="font-size: 13px; line-height: 1.6;">
              <div><strong>Nombre:</strong> ${escapeHtml(order.client?.name)}</div>
              <div><strong>Teléfono:</strong> ${escapeHtml(order.client?.phone)}</div>
              <div><strong>Email:</strong> ${escapeHtml(order.client?.email || 'N/A')}</div>
              <div><strong>Dirección:</strong> ${escapeHtml(order.client?.address || 'N/A')}</div>
            </div>
          </div>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px;">
            <div style="font-size: 12px; font-weight: 700; color: #0284c7; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
              Datos del Dispositivo & Acceso
            </div>
            <div style="font-size: 13px; line-height: 1.6;">
              <div><strong>Tipo:</strong> ${escapeHtml(order.equipment?.type)}</div>
              <div><strong>Marca / Modelo:</strong> ${escapeHtml(order.equipment?.brand)} ${escapeHtml(order.equipment?.model)}</div>
              <div><strong>No. Serie / IMEI:</strong> ${escapeHtml(order.equipment?.serial || 'Sin número')}</div>
              <div style="margin-top: 4px; padding: 4px 8px; background: #e0f2fe; border-radius: 4px; font-weight: bold; color: #0369a1; display: inline-block;">
                🔑 Contraseña/PIN: ${escapeHtml(order.equipment?.password || 'No requiere / Sin clave')}
              </div>
            </div>
          </div>
        </div>

        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: 700; color: #0284c7; text-transform: uppercase; margin-bottom: 8px;">
            Motivo de Ingreso & Diagnóstico
          </div>
          <div style="font-size: 13px; line-height: 1.5; margin-bottom: 10px;">
            <strong>Falla Reportada por el Cliente:</strong><br>
            <span style="color: #334155;">${escapeHtml(order.issue || 'No especificada')}</span>
          </div>
          ${order.initialDiagnosis ? `
            <div style="font-size: 13px; line-height: 1.5; margin-bottom: 10px; background: #f1f5f9; padding: 8px; border-radius: 6px;">
              <strong>Diagnóstico Técnico Inicial:</strong><br>
              <span style="color: #334155;">${escapeHtml(order.initialDiagnosis)}</span>
            </div>
          ` : ''}
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 12px; color: #475569; padding-top: 8px; border-top: 1px dashed #cbd5e1;">
            <div>
              <strong>Accesorios Recibidos:</strong> ${order.equipment?.accessories?.length ? order.equipment.accessories.join(', ') : 'Ninguno (Solo equipo)'}
            </div>
            <div>
              <strong>Condición Física:</strong> ${order.equipment?.condition?.length ? order.equipment.condition.join(', ') : 'Buen estado aparente'}
              ${order.equipment?.conditionNotes ? ` (${escapeHtml(order.equipment.conditionNotes)})` : ''}
            </div>
          </div>
        </div>

        ${order.bitacora && order.bitacora.length > 0 ? `
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
            <div style="font-size: 12px; font-weight: 700; color: #0284c7; text-transform: uppercase; margin-bottom: 8px;">
              Bitácora de Procedimientos Realizados
            </div>
            <div style="font-size: 11px; line-height: 1.5; color: #334155;">
              ${order.bitacora.map(b => `
                <div style="margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px dotted #cbd5e1;">
                  <strong>• ${new Date(b.date).toLocaleDateString('es-MX')} - ${escapeHtml(b.title)}:</strong> ${escapeHtml(b.notes)}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div style="display: flex; justify-content: flex-end; margin-bottom: 20px;">
          <table style="width: 280px; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 6px 12px; color: #64748b;">Costo Estimado:</td>
              <td style="padding: 6px 12px; text-align: right; font-weight: 600;">$${est} MXN</td>
            </tr>
            <tr>
              <td style="padding: 6px 12px; color: #64748b;">Anticipo Pagado:</td>
              <td style="padding: 6px 12px; text-align: right; font-weight: 600; color: #0284c7;">-$${adv} MXN</td>
            </tr>
            <tr style="border-top: 2px solid #0ea5e9; background-color: #f0f9ff;">
              <td style="padding: 8px 12px; font-weight: 700; color: #0c4a6e;">Saldo Restante:</td>
              <td style="padding: 8px 12px; text-align: right; font-weight: 900; font-size: 16px; color: #0c4a6e;">$${bal} MXN</td>
            </tr>
          </table>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 25px; margin-bottom: 20px; text-align: center;">
          <div>
            <div style="height: 60px; display: flex; align-items: flex-end; justify-content: center;">
              <span style="font-family: cursive; font-size: 18px; color: #0369a1;">GlitchLab Laboratorio</span>
            </div>
            <div style="border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 12px; font-weight: 600; color: #475569;">
              Recibido por GlitchLab
            </div>
          </div>

          <div>
            <div style="height: 60px; display: flex; align-items: flex-end; justify-content: center;">
              ${order.signature ? `<img src="${order.signature}" style="max-height: 55px; max-width: 180px;" />` : '<div style="font-size: 12px; color: #94a3b8; font-style: italic;">Sin firma digital</div>'}
            </div>
            <div style="border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 12px; font-weight: 600; color: #475569;">
              Firma del Cliente de Conformidad
            </div>
          </div>
        </div>

        <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 10px; color: #64748b; line-height: 1.4; text-align: justify;">
          <strong>Términos del Servicio:</strong><br>
          ${AppState.shopConfig.terms.replace(/\n/g, '<br>')}
        </div>

      </div>
    `;
  }
}

function triggerPrint() {
  window.print();
}

function closePrintModal() {
  const modal = document.getElementById('printModal');
  if (modal) modal.classList.add('hidden');
  document.body.classList.remove('ticket-thermal-mode');
}

// Configuración del Taller Modal
function openShopSettingsModal() {
  document.getElementById('cfgShopName').value = AppState.shopConfig.name;
  document.getElementById('cfgShopSlogan').value = AppState.shopConfig.slogan;
  document.getElementById('cfgShopPhone').value = AppState.shopConfig.phone;
  document.getElementById('cfgShopEmail').value = AppState.shopConfig.email;
  document.getElementById('cfgShopAddress').value = AppState.shopConfig.address;
  document.getElementById('cfgShopTerms').value = AppState.shopConfig.terms;

  // Renderizar la lista de usuarios en Ajustes
  renderUsersList();

  const modal = document.getElementById('settingsModal');
  modal.classList.remove('hidden');
}

function closeShopSettingsModal() {
  const modal = document.getElementById('settingsModal');
  if (modal) modal.classList.add('hidden');
}

function handleSaveShopSettings(e) {
  e.preventDefault();
  AppState.shopConfig.name = document.getElementById('cfgShopName').value.trim();
  AppState.shopConfig.slogan = document.getElementById('cfgShopSlogan').value.trim();
  AppState.shopConfig.phone = document.getElementById('cfgShopPhone').value.trim();
  AppState.shopConfig.email = document.getElementById('cfgShopEmail').value.trim();
  AppState.shopConfig.address = document.getElementById('cfgShopAddress').value.trim();
  AppState.shopConfig.terms = document.getElementById('cfgShopTerms').value.trim();

  saveConfig();
  closeShopSettingsModal();
  showToast('Configuración del taller guardada.');
}

// Exportar Respaldo JSON con Usuarios
function exportDataBackup() {
  const data = {
    version: '3.0',
    exportDate: new Date().toISOString(),
    config: AppState.shopConfig,
    users: AppState.auth.users,
    orders: AppState.orders
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GlitchLab_Respaldo_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Respaldo descargado con éxito.');
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
        if (data.config) {
          AppState.shopConfig = { ...AppState.shopConfig, ...data.config };
          saveConfig();
        }
        if (Array.isArray(data.users)) {
          AppState.auth.users = data.users;
          saveUsers();
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
