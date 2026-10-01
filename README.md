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

### 1. 🔢 Secuencia de Órdenes Puramente Numérica
- **Folio Numérico Consecutivo**: Formato limpio y profesional (`#1001`, `#1002`, `#1003`...).

### 2. 🎨 Diseño Minimalista Dark SaaS
- **Navegación por Pestañas Pill**: Accesos directos a *Servicios*, *Finanzas*, *Inventario* y *Garantías*.
- **Selector de Vista**: Alterna entre vista de **Tarjetas en Cuadrícula** (estilo minimalist SaaS con citas de fallas en mayúsculas) y vista de **Lista / Tabla**.
- **Barra de Búsqueda Rápida**: Busca instantáneamente por número `#1001`, cliente, equipo o falla.

### 3. 📄 Generación y Descarga de PDF para el Cliente
- **Descarga Directa en PDF**: Botón que compila al vuelo un archivo PDF oficial vectorial (`GlitchLab_Comprobante_1001_Cliente.pdf`) con los datos del cliente, equipo, diagnóstico, desglose de costos, firma y código QR de seguimiento.
- **Impresión Directa**: Compatible con hojas Carta / A4.

### 4. 🏷️ Etiqueta / Sticker para Chasis del Equipo
- Formato especial para impresoras térmicas adhesivas de **50mm a 60mm**:
  1. **Número de Orden** (destacado en grande y legible)
  2. **Modelo del Equipo** (marca y modelo completo)
  3. **Falla Reportada**
  4. **Si Incluye Accesorios** (*INCLUYE ACCESORIOS: Cargador original, Funda* o *INCLUYE ACCESORIOS: Ninguno*)
  - Incluye además nombre, teléfono y código QR para rastreo inmediato.

### 5. 🔍 Portal de Seguimiento para Clientes
- Los clientes pueden escanear el QR de su etiqueta o comprobante para ver en vivo el estatus, fotos de la reparación y bitácora técnica sin necesidad de ingresar al sistema administrativo.

### 6. 💬 Plantillas Rápidas de WhatsApp
- 5 mensajes preconfigurados (Recepción, Presupuesto listo, Avance técnico, Equipo listo y Garantía/Reseña en Google).

### 7. 📦 Inventario & 💵 Corte de Caja (Excel)
- Control de refacciones (MOSFETs, ICs de carga, pastas térmicas, pantallas) con alerta de stock mínimo.
- Reporte financiero diario/mensual y exportación completa a Excel (.CSV).
