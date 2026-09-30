# GlitchLab • Sistema de Gestión de Órdenes & Bitácora de Microelectrónica
**Especialistas en Microelectrónica & Reparación de Laptops**  
*Inspirado en la identidad oficial de [glitchlab.mx](https://glitchlab.mx/)*

Sistema web moderno, rápido y sin dependencias externas, diseñado específicamente para talleres y laboratorios de microelectrónica, reparación de placas base/laptops a nivel componente, PCs, consolas y dispositivos móviles.

---

## 🔐 Acceso & Seguridad Inicial

Para proteger la información de tus clientes y equipos contra accesos no autorizados, el sistema cuenta con control de inicio de sesión:

- **Usuario:** `admin`
- **Contraseña inicial:** `glitchlab2026`

> 💡 **Nota:** Puedes cambiar tu usuario y contraseña en cualquier momento dentro de **Ajustes del Taller (ícono de deslizadores) > Seguridad & Contraseña de Acceso**.

---

## 🚀 ¿Cómo abrir el sistema?

No requiere instalar Node.js ni Python. Solo necesitas abrir el archivo `index.html` en tu navegador:

1. Ve a la carpeta del proyecto:
   `C:\Users\Rivera\.gemini\antigravity\scratch\glitchlab-ordenes`
2. Haz doble clic en `index.html`.
3. Inicia sesión con tus credenciales.

---

## ⚡ Características Principales

### 1. 📋 Órdenes de Servicio Especializadas
- **Folio Único Automático**: Formato secuencial oficial (ej. `GL-2026-0001`).
- **Datos del Cliente**: Nombre, teléfono con enlace directo a WhatsApp y llamada, correo y dirección.
- **Datos del Equipo**: Tipo (Laptop, PC, Tarjeta Madre/Motherboard, Consola, Celular, etc.), marca, modelo y serie/IMEI.
- **🔐 Seguridad del Dispositivo**: Apartado para guardar contraseña alfanumérica, PIN numérico o patrón de desbloqueo, con botón para ocultar/mostrar.
- **🧰 Checklist de Recepción & Estado Físico**: Cargador original, cables, batería, golpes, fisuras, humedad previa, etc.
- **✍️ Firma Digital del Cliente**: Pad táctil interactivo en pantalla donde el cliente firma de conformidad.

### 2. 📝 Bitácora Técnica de Procesos & 📸 Evidencia Fotográfica
- **Historial Cronológico de Procedimientos**: Registra paso a paso cada avance técnico (mediciones de voltajes en bobinas, detección de cortos con cámara térmica, reemplazo de integrados/MOSFETs, reprogramación de BIOS, pruebas de estrés).
- **Subida de Fotos**: Carga fotos directamente desde el equipo o con la cámara de tu celular/tablet. Las imágenes se optimizan y comprimen automáticamente sin saturar la memoria.
- **Visor Lightbox en Alta Resolución**: Inspecciona fotos de microscopio y placas a pantalla completa.
- **💬 Compartir Avance por WhatsApp**: Notifica al cliente de un avance específico en 1 clic.

### 3. 🖨️ Impresión Dual de Comprobantes
- **Hoja Membretada (Carta / A4)**: Con logotipo oficial de GlitchLab, pulso de microelectrónica, desglose financiero, firma del cliente, bitácora de trabajos y términos de garantía.
- **Ticket Térmico (80mm)**: Formato compacto para impresoras POS de punto de venta.

### 4. 💾 Respaldos & Configuración
- Almacenamiento local persistente (`localStorage`).
- Exportar e importar copias de seguridad en formato `.json`.
- Configuración de datos de GlitchLab, teléfonos y cláusulas de garantía.
