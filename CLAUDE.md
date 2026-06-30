# MovingService - ETG Moving Services

## Overview
App web tipo TMS para gestionar camiones de mudanza. Reemplaza hojas de Excel con una app que organiza datos por camion y ciclo, con escaneo de recibos via IA (Gemini Vision), calculo de millas truck via HERE Maps, lookup de brokers via FMCSA, gestion de documentos (RC/BOL/POD), y generacion de invoices.

## Tech Stack
- **Frontend:** React 19 + Vite 8 + Tailwind CSS (via @tailwindcss/vite plugin) + React Router
- **Backend:** Supabase (PostgreSQL + Auth + Storage)
- **IA/OCR:** Gemini 2.5 Flash via OpenRouter API (base64 image -> JSON estructurado)
- **Geolocation:** HERE Maps REST API (truck routing + geocoding)
- **FMCSA:** Federal Motor Carrier Safety Administration API (broker/carrier lookup by MC#/DOT#/name)
- **PDF Rendering:** pdf.js v3.11 via CDN (renderiza PDFs como imagenes para invoices)
- **Deploy:** Vercel (auto-deploy on push to main)
- **URL:** moving-service-one.vercel.app

## Project Structure
```
src/
  components/
    Layout.jsx          - Sidebar (desktop) + header mobile con back button
    Dashboard.jsx       - Grid de camiones con resumen por ciclo, CRUD trucks, quick-add, abrir ciclos
    TruckView.jsx       - Vista individual: ciclo nav, filtro semanas, summary cards, 4 tabs, CashBox
    OrdersView.jsx      - Lista centralizada de ordenes (/orders): filter tabs, drawer lateral para detalle
    OrderDetail.jsx     - Detalle/creacion de orden: 2-col layout, status bar, broker, stops, invoicing, commodities, route calc, docs, RC viewer. Soporta modo drawer (props) y modo pagina (useParams)
    OrderDocuments.jsx  - Panel de documentos (RC/BOL/POD): upload Supabase Storage, preview inline, tabs por tipo
    OrderInvoice.jsx    - Invoice unificado: factura + RC + POD renderizados como imagenes (pdf.js CDN). Imprimible como un solo PDF
    OrdersTable.jsx     - CRUD ordenes con paid toggle, discount toggle, modal propio, badge TONU +$150 (TruckView)
    DieselTable.jsx     - CRUD diesel con AddModal
    ExpensesTable.jsx   - CRUD gastos con 11 categorias + AddModal
    AccountingTable.jsx - Ledger debito/credito con 3 auto-rows (neto, diesel, gastos) + manuales
    AddModal.jsx        - Modal reutilizable con soporte scanner inline (image/PDF -> AI -> autofill)
    CashBox.jsx         - Cierre/reapertura de ciclo + dividendos por socio
    PartnersPanel.jsx   - CRUD socios (no usado actualmente, dividendos movidos a CashBox)
    Scanner.jsx         - Pagina completa de scanner (drag-drop, AI, review, save)
    ScanButton.jsx      - Boton de scan inline (posiblemente obsoleto, reemplazado por AddModal)
  lib/
    supabase.js         - Cliente Supabase singleton (VITE_ env vars)
    cycles.js           - Utilidades de ciclos (computeWeeks, open/close/reopen, getActive, getAll)
    orders.js           - Constantes y utilidades del modulo Orders (STATUS_CONFIG 7 estados, EQUIPMENT_TYPES, etc)
    here.js             - HERE Maps API: geocoding, truck routing (loaded miles + DH), polyline decode
    fmcsa.js            - FMCSA API: lookupByMc, lookupByDot, searchByName (autocomplete brokers)
    gemini.js           - API OpenRouter -> Gemini 2.5 Flash, extrae RC completo (broker, stops, rate items, commodity)
  App.jsx               - Router: / = Dashboard, /truck/:id = TruckView, /orders = OrdersView, /orders/:id = OrderDetail
  main.jsx              - Entry point
  index.css             - Tailwind import
public/
  logo-invoice.png      - Logo ETG Moving Services para invoices
supabase/
  schema.sql            - Schema base (trucks, orders, diesel, expenses, accounting)
  002_partners_cashbox.sql - Partners + cashbox (legacy)
  003_truck_discount.sql   - discount_percent en trucks
  004_cycles.sql           - Tabla cycles + date en accounting
  005_fix_cycles.sql       - Reset cycles con data correcta
  006_order_discount.sql   - discount_percent en orders (por orden individual)
  007_orders_module.sql    - Brokers, order_stops, status/equipment/load_type en orders
  008_order_documents.sql  - order_documents table + order-docs storage bucket
  009_order_status_invoiced.sql - Status 'invoiced' + truck_id nullable
  010_driver_pay_enhanced_stops.sql - Enhanced stops (location_name, ref_number) + commodity/weight/special_instructions en orders
```

## Database Tables (Supabase)
- `trucks` (id, name, number, discount_percent [default 13])
- `orders` (id, truck_id [nullable], order_number, pu_date, pu_city, do_date, do_city, miles, rate, apply_discount, discount_percent, paid, period_start, period_end, status, broker_id, equipment_type, load_type, dispatcher, invoice_notes, dead_miles, ref_number, driver_name, commodity, weight, special_instructions, driver_pay_total)
- `brokers` (id, type [broker/customer], name, mc_number, dot_number, ref_number, address, phone, email)
- `order_stops` (id, order_id FK CASCADE, type [pickup/delivery/stop], location_name, address, city, state, date, time, ref_number, sequence, notes)
- `order_documents` (id, order_id FK CASCADE, doc_type [RC/BOL/POD], file_name, file_path, file_size, mime_type)
- `driver_pay_items` (id, order_id FK CASCADE, pay_item, units_type, units, rate, total)
- `diesel` (id, truck_id, invoice_number, date, city, gallons, value, period_start, period_end)
- `expenses` (id, truck_id, category, invoice_number, description, amount, date, period_start, period_end)
- `accounting` (id, truck_id, description, reference, date, debit, credit, period_start, period_end)
- `cycles` (id, truck_id, start_date, end_date, previous_balance, cuadre_caja, closed, closed_at)
- `partners` (id, truck_id, name, percentage, invested)

**Storage Buckets:** `order-docs` (public) — RC, BOL, POD files organized by order_id

All tables have RLS enabled with open policies (no auth yet).

## Key Business Logic

### Order Status Flow
7 estados: 5 secuenciales + 2 terminales:
1. **Reservada** (booked, azul) — orden creada sin camion asignado
2. **Asignada** (assigned, amarillo) — auto cuando se selecciona truck; revierte si se quita
3. **En Transito** (in_transit, naranja) — truck en camino
4. **Entregada** (delivered, cyan) — carga entregada, falta POD/factura
5. **Facturada** (invoiced, verde) — requiere POD subido. Solo este pone `paid=true`. Habilita boton "Invoice" para generar factura
6. **TONU** (tonu, rojo) — Truck Order Not Used, terminal. Auto-setea rate=$150, apply_discount=false, paid=true. Confirmacion via toast.confirm. Badge "+$150" en status bar y tabla. Boton "Reactivar" vuelve a booked
7. **Cancelada** (canceled, gris) — orden cancelada, terminal. Boton "Reactivar" vuelve a booked

- `truck_id` es nullable: ordenes sin camion quedan en "Reservada"
- Status editable desde la lista de ordenes (dropdown inline) y desde el detalle (barra de progreso + botones TONU/Cancelar)
- **POD requerido para facturar**: al intentar pasar a "Facturada" sin POD, muestra panel naranja para subir POD. Una vez subido, avanza automaticamente a facturada

### Order Detail Drawer (OrdersView)
- Click en una orden abre un **drawer lateral** (slide-in desde la derecha, 300ms ease-out) en vez de navegar a otra pagina
- OrderDetail soporta modo drawer (props: orderId, onClose, onSaved) y modo pagina (useParams via /orders/:id)
- Backdrop transparente (sin blur) para que el cliente siga viendo la lista de ordenes
- Al guardar/eliminar, se cierra el drawer y refresca la lista automaticamente
- "Nueva Orden" tambien abre en drawer

### RC Scanner (gemini.js — extraccion completa de Rate Confirmation)
- Al subir un RC (panel derecho o boton Escanear), Gemini extrae y auto-llena:
  - **Broker**: nombre, contacto, telefono, email, MC# — **se guarda automaticamente** en tabla brokers si no existe (sin necesidad de presionar "Crear")
  - **Orden**: order #, ref #, rate, equipment type
  - **Stops**: todas las paradas con location name, direccion, ciudad, estado, fecha, hora
  - **Invoicing**: line items del rate breakdown (linehaul, fuel, etc.)
  - **Commodities**: nombre + peso
  - **Special instructions**
- Toast info "Leyendo RC..." + success + warning "Presiona Guardar"
- Dirty state: confirma antes de salir sin guardar

### Invoice Generation (OrderInvoice.jsx)
- Disponible cuando status = `invoiced` (boton verde "Invoice" en header)
- **Documento unificado**: Invoice + RC + POD en un solo PDF imprimible
- PDFs adjuntos se renderizan como imagenes via pdf.js v3.11 (CDN, no npm — evita incompatibilidades de bundler)
- Imagenes adjuntas se convierten a data URLs para evitar CORS en ventana de impresion
- Cada seccion en su propia pagina (page-break-before)
- Espera a que todas las imagenes carguen antes de abrir dialogo de impresion
- **Bill From**: datos de Billing Information (localStorage `billing_info`). Fallback: Company Name/DBA
- **Bill To**: broker de la orden
- **Remit To**: datos de Remit To (localStorage `remit_info`), solo si tiene datos
- **Email**: To = Remit To email, CC = Bill From email + Bill To email (broker)
- **TODO**: El email de Bill To (broker) usa `sapr262004@gmail.com` como fallback temporal cuando el broker no tiene email. Cambiar esto cuando se implemente email real del broker o configuracion de email por defecto

### Broker Search (OrderDetail)
- **Busqueda hibrida**: primero busca en brokers locales (DB, instantaneo), luego FMCSA en background
- Con 2+ caracteres: resultados instantaneos de brokers guardados (badge azul "Guardado")
- Con 3+ caracteres: busca FMCSA en paralelo (debounce 600ms), merge sin duplicados
- Click en broker local: selecciona directo sin crear nuevo
- Click en broker FMCSA: llena formulario de creacion
- FMCSA es lento/poco confiable — brokers locales garantizan respuesta rapida

### Dead Head (DH) — Calculo automatico
- Se calcula automaticamente al **seleccionar un truck** en el dropdown (ademas de al presionar "Calcular Ruta")
- Funcion `calculateDH(truckId)` extraida como funcion independiente reutilizable
- Busca la ultima orden entregada del mismo truck (por do_date) y calcula ruta HERE Maps desde su do_city hasta el primer pickup de la orden actual
- Si no hay orden anterior, no calcula DH (queda en 0)

### Truck Routing (here.js)
- HERE Maps REST API con `transportMode=truck` (respeta restricciones de camiones: puentes, rutas prohibidas, peso)
- **Loaded Miles**: calculo automatico entre stops (pickup → delivery) al clickear "Calcular Ruta"
- **Dead Head (DH)**: calculo automatico (ver seccion DH arriba)
- Geocoding: convierte direcciones/ciudades a coordenadas lat/lng

### FMCSA Integration (fmcsa.js)
- Autocomplete de brokers al crear uno nuevo: escribe nombre, MC# o DOT# → busca en FMCSA federal database
- Dropdown con sugerencias: nombre, MC#, DOT#, ciudad, badge Authorized/Not Authorized
- Click en sugerencia → auto-llena todos los campos del broker
- API solo funciona desde EEUU (requests desde el browser del cliente o Vercel)

### Order Documents (OrderDocuments.jsx + Supabase Storage)
- 3 tipos: RC (Rate Confirmation), BOL (Bill of Lading), POD (Proof of Delivery)
- Upload a Supabase Storage bucket `order-docs`, metadata en tabla `order_documents`
- Preview inline: imagenes directo, PDFs en iframe
- Visor fullscreen con boton de ojito
- Para ordenes nuevas: RC upload en panel derecho auto-lanza scanner AI
- Para ordenes existentes: panel con tabs RC/BOL/POD, upload, preview, delete

### OrderDetail Sections
- **Detalles de Orden**: order #, ref #, truck, dispatcher, equipment type, load type, rate, discount, miles, DH, notes
- **Paradas**: location name, direccion, ciudad, estado, fecha, hora, ref#, notas. Boton "Calcular Ruta" (HERE)
- **Invoicing**: invoice note + tabla line items (pay item, units type, qty, rate, total). Auto-llenado desde RC
- **Commodities**: tabla (name, qty, type, dimensions, weight). Total en lbs. Auto-llenado desde RC
- Sidebar derecha: resumen (rate, neto, RPM), broker con busqueda hibrida (local + FMCSA), ruta preview, documentos/RC

### Ciclos (cycles.js)
- Reemplazan periodos mensuales fijos. Un ciclo es un rango abierto (start_date -> end_date nullable).
- `computeWeeks()` divide el ciclo en semanas Lunes-Domingo. Semana 1 va de start_date al primer domingo.
- Ciclo activo: `closed = false`, `end_date = null`. Solo uno activo por camion.
- Cierre: guarda `cuadre_caja` (dinero dejado en caja) y `end_date`. El `cuadre_caja` se convierte en `previous_balance` del siguiente ciclo.

### Descuentos (por orden)
- Cada camion tiene `discount_percent` (default 13%) como valor base para nuevas ordenes.
- Cada orden tiene `apply_discount` (boolean) y `discount_percent` (numeric, se guarda al crear la orden).
- El neto se calcula: `rate * (1 - order.discount_percent/100)`. Cambiar el % del truck NO afecta ordenes existentes.

### Contabilidad (AccountingTable)
- 3 filas auto-generadas (no persistidas): Ingreso Neto, Total Diesel, Total Gastos. Marcadas con badge "Auto".
- Filas manuales para ajustes adicionales de debito/credito.
- Balance = totalCredito - totalDebito (auto + manual).

### Toast System (Toast.jsx)
- ToastProvider wrappea la app en main.jsx. Hook: `useToast()`.
- Tipos: `toast.success()`, `toast.error()`, `toast.warning()`, `toast.info()` — top-right, auto-dismiss 3.5s, slide-in animation.
- `toast.confirm(msg)` — dialogo modal personalizado (reemplaza `confirm()` nativo). Retorna Promise<boolean>.
- `friendlyError(msg)` — traduce errores de Supabase/PostgreSQL a mensajes claros en espanol.
- CERO `alert()` o `confirm()` nativos en toda la app. Todo usa el toast system.

## Conventions
- UI en espanol (labels, buttons, messages)
- Dark theme: gray-950 bg, gray-900 cards, gray-800 inputs/rows
- Colores semanticos: green=facturada/income, red=TONU/debito, blue=reservada/balance, orange=en transito/diesel, yellow=asignada/pending, cyan=entregada/routing, purple=scanner, gray=cancelada
- Currency: USD con `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`
- Todas las tablas: PAGE_SIZE=5 (TruckView) o PAGE_SIZE=10 (OrdersView), expandible, search toggle, readOnly en ciclos cerrados
- Fetch pattern: `useEffect([truckId, period])` -> fetch, `onDataChange` callback al padre
- Skeleton loading con pulse animation
- Todos los formularios: validacion frontend + toast warning antes de DB, toast success/error despues
- Scanner inline disponible en TODOS los modales de agregar
- OrderDetail: layout 2 columnas en desktop, 1 columna en mobile (responsive)
- Dirty state tracking: confirma antes de salir sin guardar
- Invoice: documento unificado (factura + RC + POD) imprimible como un solo PDF
- Animaciones: drawer slide-in 300ms, search expand 300ms, transitions en botones/hover
- Version actual: v1.3.1 - Fase 3.5 (sidebar footer)

## Expense Categories
Mantenimiento, Seguro, Peajes, Reparacion, Llantas, Lavado, Parqueo, Multas, Comida, DEF, Otros

## Environment Variables
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
VITE_HERE_API_KEY=xxx (HERE Maps - truck routing + geocoding)
VITE_OPENROUTER_KEY=xxx (OpenRouter - Gemini AI scanner)
VITE_FMCSA_KEY=xxx (FMCSA - broker/carrier lookup, solo funciona desde EEUU)
```

## Modules
- **Dashboard** (`/`) — Grid de camiones, resumen por ciclo, quick-add, CRUD trucks, abrir ciclos
- **TruckView** (`/truck/:id`) — Vista individual de camion: ciclo nav, semanas, tabs (orders, gastos, contabilidad), CashBox
- **Orders/Loads** (`/orders`, `/orders/:id`) — Modulo TMS completo: lista con filter tabs + drawer lateral para detalle, broker search hibrido (local + FMCSA), stops mejorados, invoicing line items, commodities, route calc (HERE truck routing), DH auto al seleccionar truck, documentos RC/BOL/POD, scanner AI que auto-llena todo y guarda broker automaticamente, POD requerido para facturar, TONU con $150 auto, invoice unificado (factura + RC + POD en un solo PDF)

## Phases
- **Fase 1 (done):** Setup + Dashboard + CRUD tables + Vercel deploy
- **Fase 2 (done):** Scanner AI integrado en AddModal + pagina Scanner standalone + ciclos flexibles + search/pagination + CashBox con dividendos
- **Fase 2.5 (done):** Descuento por orden (discount_percent persistido en cada orden) + deteccion de duplicados
- **Fase 3 (done):** Modulo Orders/Loads completo — lista + detalle, 7 status (5 flow + TONU/canceled), brokers con FMCSA autocomplete, stops mejorados (location name, ref#), invoicing + commodities, HERE truck routing (loaded miles + DH), documentos RC/BOL/POD con Supabase Storage, scanner AI que extrae RC completo, invoice generation, responsive mobile
- **Fase 3.5 (done):** Drawer lateral para ordenes (sin navegacion), TONU $150 auto, POD requerido para facturar, invoice unificado (factura+RC+POD en un PDF via pdf.js), broker auto-save desde RC scanner, broker search hibrido (local+FMCSA), DH auto al seleccionar truck, UI cleanup (eliminar revenue chart, status pills duplicados, animacion search)
- **Fase 4 (next):** Reports, Excel/PDF export, auth/usuarios

## Commands
```bash
npm run dev      # Local dev server
npm run build    # Production build
npm run preview  # Preview production build
```
