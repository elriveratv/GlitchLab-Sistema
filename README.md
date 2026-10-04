# GlitchLab ⚡ Sistema de Gestión y Control de Taller
**Especialistas en Microelectrónica, Reparación de Laptops y Hardware**

Sistema web moderno, rápido y autónomo para la recepción, diagnóstico, bitácora técnica, control de garantías, inventario y entrega de equipos en laboratorios de reparación de tecnología.

---

## 🚀 Características Principales

* **Recepción Rápida de Equipos:** Folio numérico secuencial (`#1`, `#2`, `#3`...), captura de cliente, WhatsApp, datos de equipo, número de serie/IMEI y contraseñas/patrón de desbloqueo.
* **Inspección Física y Check-in:** Registro de daños estéticos previos, cargador/accesorios entregados y firma digital del cliente en canvas.
* **Control de Garantías:** Seguimiento de periodos de garantía (30, 60 o 90 días) con etiquetas de vigencia.
* **Bitácora Técnica en Vivo:** Registro de avances con telemetría de microelectrónica (amperaje, líneas de voltaje, componentes reemplazados).
* **Galería Fotográfica:** Carga y sincronización de fotografías del estado del equipo y diagnóstico.
* **Impresión Profesional de Tickets:** Compatible con impresora térmica **Aiyin AE-240BT** (tickets de 80mm y etiquetas adhesivas) y formato A4 para cliente y taller.
* **Control Financiero:** Gestión de anticipos, saldos pendientes, costo de refacciones y mano de obra.
* **Sincronización en la Nube:** Conexión en tiempo real con **Supabase Cloud** para respaldos continuos.
* **Acceso Directo al Rastreo:** Enlace integrado al portal público de clientes (`https://rastreo.glitchlab.mx`).

---

## 📂 Estructura de Archivos

```
glitchlab-sistema/
├── index.html          # Interfaz gráfica principal del sistema
├── app.js              # Lógica del sistema, Supabase, firmas, bitácoras y cálculos
├── styles.css          # Estilos personalizados, diseño responsive y reglas de impresión
├── favicon.svg         # Icono oficial de GlitchLab
├── .htaccess           # Configuración para servidores web Apache
├── .gitignore          # Filtro de archivos para Git
├── branding/           # Logotipos oficiales en PNG y PDF
└── README.md           # Documentación del proyecto
```

---

## 💻 Uso Local

1. Clona o descarga este repositorio:
   ```bash
   git clone https://github.com/TU-USUARIO/glitchlab-sistema.git
   ```
2. Abre el archivo `index.html` en cualquier navegador web moderno (Google Chrome, Microsoft Edge, Firefox, Brave, Safari).
3. ¡Listo! El sistema funciona de inmediato sin necesidad de instalar Node.js ni servidores locales.

---

## 🌐 Despliegue en la Nube

Puedes alojar este sistema en:
* **Hostinger / cPanel / Apache:** Sube los archivos a la carpeta `public_html`.
* **Vercel / Netlify:** Sube este repositorio directamente conectándolo con tu cuenta de GitHub.
* **GitHub Pages:** Habilita GitHub Pages en la pestaña *Settings > Pages* de tu repositorio.

---

© 2026 GlitchLab. Todos los derechos reservados.
