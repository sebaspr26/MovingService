# MovingService - ETG Moving Services

## Overview
App web tipo TMS para gestionar camiones de mudanza. Reemplaza hojas de Excel con una app que organiza datos por camion y ciclo, con escaneo de recibos via IA (Gemini Vision), calculo de millas truck via HERE Maps, lookup de brokers via FMCSA, gestion de documentos (RC/BOL/POD), generacion de invoices, envio de emails, modulo de compania (choferes, camiones, trailers, billing), y tema light/dark.

## Tech Stack
- **Frontend:** React 19 + Vite 8 + Tailwind CSS v4 (via @tailwindcss/vite plugin) + React Router
- **Backend:** Supabase (PostgreSQL + Auth + Storage)
- **IA/OCR:** Gemini 2.5 Flash via OpenRouter API (base64 image -> JSON estructurado)
- **Geolocation:** HERE Maps REST API (truck routing + geocoding)
- **FMCSA:** Federal Motor Carrier Safety Administration API (broker/carrier lookup by MC#/DOT#/name)
- **PDF Generation:** jsPDF + html2canvas (genera PDF para email), pdf.js v3.11 via CDN (renderiza PDFs como imagenes)
- **Email:** Resend API (envio de invoices con CC, adjuntos PDF)
- **Deploy:** Vercel (auto-deploy on push to main, serverless functions en /api)
- **URL:** moving-service-one.vercel.app

## Project Structure
```
src/
  components/
    Layout.jsx          - Sidebar (desktop) + header mobile. Company name/DBA dinamico desde Supabase (company_settings)
    Dashboard.jsx       - Grid de camiones con resumen por ciclo, CRUD trucks (con gastos recurrentes + DayPicker), quick-add, abrir ciclos, asignacion de chofer, auto-aplicacion de gastos recurrentes al abrir ciclo. Cache en memoria (30s TTL), queries paralelas con Promise.all
    TruckView.jsx       - Vista individual: ciclo nav, filtro semanas, summary cards, 4 tabs, CashBox. Queries por cycle_id FK (sub-filtro JS por semana)
    OrdersView.jsx      - Lista centralizada de ordenes (/orders): filter tabs (incl. Pagadas), drawer lateral, TONU modal con precio editable, rate/mi en tabla, filtros avanzados (truck/dispatcher/broker/fechas), cache en memoria (30s TTL), PAGE_SIZE=30
    OrderDetail.jsx     - Detalle/creacion de orden: 2-col layout, status bar, broker, stops con schedule_type (appointment/range), invoicing, commodities, route calc, docs, RC viewer con drag & drop, company info sidebar, ref# auto-generado, dispatcher requerido en nuevas ordenes
    OrderDocuments.jsx  - Panel de documentos (RC/BOL/POD): upload Supabase Storage + drag & drop, visor fullscreen con render progresivo de PDFs (pdf.js), tabs por tipo
    OrderInvoice.jsx    - Invoice unificado: factura + RC + POD. Cache en memoria, boton Regenerar. Email directo con CC y switches por destinatario. Logo desde Supabase Storage
    OrdersTable.jsx     - CRUD ordenes con paid toggle, discount toggle, badge TONU con rate real (TruckView)
    DatePicker.jsx      - Calendario custom en espanol, reemplaza inputs nativos de fecha
    DayPicker.jsx       - Selector de dia del mes (1-31) con dropdown portal (createPortal), posicion auto arriba/abajo. Usado en gastos recurrentes del truck modal
    DieselTable.jsx     - CRUD diesel con AddModal
    ExpensesTable.jsx   - CRUD gastos con 11 categorias + AddModal
    OwnerExpensesTable.jsx - CRUD gastos del propietario (trucks LIS). No afecta balance del ciclo. Misma estructura que ExpensesTable
    AccountingTable.jsx - Ledger debito/credito con 3 auto-rows (neto, diesel, gastos) + manuales
    AddModal.jsx        - Modal reutilizable con soporte scanner inline (image/PDF -> AI -> autofill)
    CashBox.jsx         - Cierre/reapertura de ciclo + dividendos por socio
    CompanyInfo.jsx     - Modulo compania: choferes, camiones, trailers, company info, billing (bill from + remit to + logo), company docs. Datos en Supabase (company_settings) en vez de localStorage
    Settings.jsx        - Configuracion: tema light/dark con cards de preview
    Toast.jsx           - Toast system (success/error/warning/info/confirm)
  lib/
    supabase.js         - Cliente Supabase singleton (VITE_ env vars)
    cycles.js           - Utilidades de ciclos (computeWeeks, open/close/reopen, getActive, getActiveCycleId, getAll). Previene ciclos duplicados abiertos
    orders.js           - Constantes y utilidades del modulo Orders (STATUS_CONFIG 8 estados, EQUIPMENT_TYPES, etc)
    here.js             - HERE Maps API: geocoding, truck routing (loaded miles + DH), polyline decode. Console warnings en errores
    fmcsa.js            - FMCSA API: lookupByMc, lookupByDot, searchByName (autocomplete brokers)
    gemini.js           - API OpenRouter -> Gemini 2.5 Flash, extrae RC completo (broker, stops, rate items, commodity)
    company.js          - CRUD company_settings en Supabase (getCompanySettings, updateCompanyInfo, updateBillingInfo, updateLogo, removeLogo, getLogoUrl). Cache en memoria
    theme.jsx           - ThemeProvider + useTheme hook. Persiste en localStorage. Aplica clase 'light' en html
  App.jsx               - Router: / = Dashboard, /truck/:id, /orders, /orders/:id, /company, /settings
  main.jsx              - Entry point (ThemeProvider + ToastProvider + App)
  index.css             - Tailwind import + light mode CSS variable overrides (grays invertidos, accent colors ajustados)
api/
  send-invoice.js       - Serverless function (Vercel): envia email via Resend con to, cc, adjunto PDF
public/
  logo-invoice.png      - Logo por defecto para invoices (override via Supabase Storage company-docs)
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
  011_company_info.sql     - Drivers, driver_documents, truck_documents, trailers, trailer_documents
  012_cycle_id.sql         - cycle_id FK en orders/diesel/def/expenses/accounting (desacopla de filtro por fechas)
  013_company_settings.sql - Tabla company_settings (company_info, billing_info, remit_info, logo_path como JSONB/text)
  013_unique_active_cycle.sql - Partial unique index: un solo ciclo abierto por truck
  014_stop_schedule.sql    - time_end y schedule_type en order_stops (appointment vs range)
  015_recurring_expenses.sql - Tabla recurring_expenses (gastos recurrentes por truck: description, amount, day_of_month)
  016_order_broker_email.sql - broker_email en orders (email contacto por orden, extraido del RC)
  017_lis_owner_expenses.sql - is_lis y owner_name en trucks + tabla owner_expenses para gastos propietario
```

## Database Tables (Supabase)
- `trucks` (id, name, number, discount_percent [default 13], is_lis [default false], owner_name)
- `orders` (id, truck_id [nullable], cycle_id [nullable FK→cycles], order_number, pu_date, pu_city, do_date, do_city, miles, rate, apply_discount, discount_percent, paid, period_start, period_end, status, broker_id, broker_email [email contacto por orden, del RC], equipment_type, load_type, dispatcher, invoice_notes, dead_miles, ref_number, driver_name, commodity, weight, special_instructions, driver_pay_total)
- `brokers` (id, type [broker/customer], name, mc_number, dot_number, ref_number, address, phone, email)
- `order_stops` (id, order_id FK CASCADE, type [pickup/delivery/stop], location_name, address, city, state, date, time, time_end, schedule_type [appointment/range], ref_number, sequence, notes)
- `order_documents` (id, order_id FK CASCADE, doc_type [RC/BOL/POD], file_name, file_path, file_size, mime_type)
- `driver_pay_items` (id, order_id FK CASCADE, pay_item, units_type, units, rate, total)
- `diesel` (id, truck_id, cycle_id [nullable FK→cycles], invoice_number, date, city, gallons, value, period_start, period_end)
- `def` (id, truck_id, cycle_id [nullable FK→cycles], invoice_number, date, city, gallons, value, period_start, period_end)
- `expenses` (id, truck_id, cycle_id [nullable FK→cycles], category, invoice_number, description, amount, date, period_start, period_end)
- `accounting` (id, truck_id, cycle_id [nullable FK→cycles], description, reference, date, debit, credit, period_start, period_end)
- `cycles` (id, truck_id, start_date, end_date, previous_balance, cuadre_caja, closed, closed_at)
- `partners` (id, truck_id, name, percentage, invested)
- `drivers` (id, name, phone, email, license_number, license_state, license_expiry, medical_card_expiry, truck_id FK nullable, status [active/inactive])
- `driver_documents` (id, driver_id FK CASCADE, doc_type [license/medical_card/other], label, file_name, file_path, file_size, mime_type)
- `truck_documents` (id, truck_id FK CASCADE, doc_type [license_plate/cab_card/truck_picture/vin_picture/other], label, file_name, file_path, file_size, mime_type)
- `trailers` (id, name, number, type, truck_id FK nullable, status [active/inactive])
- `trailer_documents` (id, trailer_id FK CASCADE, doc_type, label, file_name, file_path, file_size, mime_type)
- `recurring_expenses` (id, truck_id FK CASCADE, description, amount, day_of_month [1-31], active [default true], last_applied_month [text], created_at)
- `owner_expenses` (id, truck_id FK, cycle_id FK, category, invoice_number, description, amount, date, period_start, period_end, created_at) — gastos del propietario para trucks LIS, no afectan balance
- `company_settings` (id, company_info [jsonb], billing_info [jsonb], remit_info [jsonb], logo_path [text], created_at, updated_at) — single-row config

**Storage Buckets:** `order-docs` (public), `company-docs` (public)

All tables have RLS enabled with open policies (no auth yet).

## Key Business Logic

### Order Status Flow
8 estados: 6 secuenciales + 2 terminales:
1. **Reservada** (booked, azul) — orden creada sin camion asignado
2. **Asignada** (assigned, amarillo) — auto cuando se selecciona truck; revierte si se quita
3. **En Transito** (in_transit, naranja) — truck en camino
4. **Entregada** (delivered, cyan) — carga entregada, falta POD/factura
5. **Facturada** (invoiced, verde) — requiere POD subido. Habilita boton "Invoice". NO pone `paid=true`
6. **Pagado** (paid, violeta) — pago recibido. Este pone `paid=true`
7. **TONU** (tonu, rojo) — Truck Order Not Used, terminal. Modal con precio editable (default $150), apply_discount=false, paid=true. Badge muestra rate real. Boton "Reactivar" vuelve a booked
8. **Cancelada** (canceled, gris) — terminal. Boton "Reactivar" vuelve a booked

### Invoice Generation (OrderInvoice.jsx)
- Disponible cuando status = `invoiced` (boton verde "Invoice" en header)
- **Documento unificado**: Invoice + RC + POD en un solo PDF imprimible
- **Cache en memoria**: se genera una vez por orden, abre instantaneo las siguientes veces. Boton "Regenerar" para forzar recarga
- **Logo dinamico**: usa Supabase Storage (company_settings.logo_path). Fallback: `/logo-invoice.png`. Editable desde Compania > Billing
- **Bill From**: datos de Billing Information (Supabase company_settings.billing_info). Fallback: Company Name/DBA
- **Bill To**: broker de la orden (email del broker en DB)
- **Remit To**: datos de Remit To (Supabase company_settings.remit_info), solo si tiene datos
- **Ref # auto-generado**: al crear orden nueva, genera secuencial 00001, 00002... Editable por el usuario
- **Rate/mi**: calculo `rate / (miles + DH)` mostrado debajo del rate en la tabla de ordenes

### Email de Invoice (api/send-invoice.js)
- **Envio directo**: click "Enviar Email" → modal de confirmacion con switches
- **To (destinatario principal)**: email del Remit To (desde Billing Information)
- **CC**: email del Bill From + email del Bill To (broker de la orden)
- **Switches**: cada destinatario tiene toggle on/off. Por defecto todos habilitados. El usuario puede deshabilitar cualquiera antes de enviar
- **API**: Vercel serverless function → Resend API. Soporta `to`, `cc`, adjunto PDF base64
- **Requiere**: RESEND_KEY env var en Vercel

### LIS Trucks (Propietario Externo)
- Toggle LIS en truck modal (Dashboard). Cuando activo, requiere nombre del propietario
- Trucks LIS tienen tab adicional "Gastos Propietario" en TruckView
- Gastos del propietario se almacenan en `owner_expenses` (NO afectan balance/caja del ciclo)
- En tab Gastos, cada fila tiene boton "transferir a propietario" que mueve el registro de `expenses`/`diesel`/`def` a `owner_expenses`
- Al eliminar un truck, se eliminan tambien sus `owner_expenses`

### Recurring Expenses (Gastos Recurrentes)
- Se configuran por truck en el modal de crear/editar camion (Dashboard)
- Cada gasto tiene: descripcion, monto ($), dia del mes (1-31) via DayPicker
- Al abrir un nuevo ciclo, se auto-aplican como expenses si el dia ya paso en el mes actual
- Tracking via `last_applied_month` para evitar duplicados (ej: '2026-07')
- CRUD integrado en el truck modal con botones agregar/eliminar

### Drivers ↔ Trucks Connection
- Choferes se crean en Compania > Choferes (CRUD completo con documentos)
- Al crear/editar truck en Dashboard, dropdown "Chofer Asignado" (solo activos y disponibles)
- Relacion bidireccional: `drivers.truck_id` FK → trucks
- Dashboard muestra nombre del chofer asignado en cada truck card

### Company Info Module (/company)
- **Company Information**: datos generales (name, DBA, EIN, MC#, DOT#, address, contact). Se guarda en Supabase (company_settings). Company Name y DBA se reflejan en sidebar y invoice
- **Billing Information**: Bill From (datos facturacion), Remit To (destinatario pagos + email), Logo invoice (upload a Supabase Storage/preview/reset). Boton guardar arriba, deshabilitado sin cambios, toast warning a los 5s
- **Company Documents**: upload documentos generales (local, no conectado a DB aun)
- **Choferes**: CRUD con documentos (licencia, tarjeta medica, custom). Badges vencimiento. Asignacion a trucks
- **Camiones**: lista de trucks del Dashboard con documentos (license plate, cab card, truck picture, VIN picture, custom)
- **Trailers**: CRUD con tipo (Dry Van, Flatbed, Reefer, etc.), asignacion a truck, documentos custom

### Light/Dark Theme
- **ThemeProvider** en `lib/theme.jsx`: persiste en localStorage, aplica clase `light` en `<html>`
- **CSS overrides** en `index.css`: invierte paleta de grays de Tailwind v4 via CSS variables. Todos los componentes se adaptan automaticamente
- **Accent colors**: shade 400→600 (texto), 900→100 (badges), 700→300 (borders), 800→200 (accent borders), 300→700 (text on badges) en light mode
- **Configuracion** en `/settings`: dos cards de preview (Dark/Light) para seleccionar tema
- `text-white` se overridea a oscuro en light mode. Se preserva blanco en botones con bg solido (blue-600, red-600, etc.)

### Sidebar Layout
- Company Name y DBA dinamicos desde Supabase (company_settings, cargados al montar)
- Navegacion: Dashboard, Ordenes, Compania, Configuracion

### Toast System (Toast.jsx)
- ToastProvider wrappea la app en main.jsx. Hook: `useToast()`
- Tipos: `toast.success()`, `toast.error()`, `toast.warning()`, `toast.info()` — top-right, auto-dismiss 3.5s
- `toast.confirm(msg)` — dialogo modal personalizado. Retorna Promise<boolean>
- CERO `alert()` o `confirm()` nativos en toda la app

## Conventions
- UI en espanol (labels, buttons, messages)
- Dark theme default, light theme via CSS variable overrides
- Colores semanticos: green=facturada/income, red=TONU/debito, blue=reservada/balance, orange=en transito/diesel, yellow=asignada/pending, cyan=entregada/routing, violet=pagado, purple=scanner, gray=cancelada
- Currency: USD con `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`
- Datos de compania/billing almacenados en Supabase (tabla company_settings: company_info, billing_info, remit_info como JSONB + logo_path en Storage)
- Formularios con dirty state: boton guardar deshabilitado sin cambios, toast warning a los 5s con cambios pendientes
- Invoice cacheado en memoria por orderId, boton Regenerar para forzar recarga

## Environment Variables
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
VITE_HERE_API_KEY=xxx (HERE Maps - truck routing + geocoding)
VITE_OPENROUTER_KEY=xxx (OpenRouter - Gemini AI scanner)
VITE_FMCSA_KEY=xxx (FMCSA - broker/carrier lookup, solo funciona desde EEUU)
RESEND_KEY=xxx (Resend - envio de emails, configurado en Vercel env vars)
```

## Modules
- **Dashboard** (`/`) — Grid de camiones, resumen por ciclo, quick-add, CRUD trucks con asignacion de chofer y gastos recurrentes
- **TruckView** (`/truck/:id`) — Vista individual de camion: ciclo nav, semanas, tabs (orders, gastos, contabilidad), CashBox
- **Orders/Loads** (`/orders`, `/orders/:id`) — Modulo TMS completo: lista con filter tabs + drawer lateral, TONU con precio editable, rate/mi en tabla, ref# auto-generado, invoice con cache + email directo con CC y switches
- **Compania** (`/company`) — Company info, billing (bill from + remit to + logo), company docs, choferes (CRUD + docs), camiones (docs), trailers (CRUD + docs)
- **Configuracion** (`/settings`) — Tema light/dark

## Phases
- **Fase 1 (done):** Setup + Dashboard + CRUD tables + Vercel deploy
- **Fase 2 (done):** Scanner AI integrado en AddModal + pagina Scanner standalone + ciclos flexibles + search/pagination + CashBox con dividendos
- **Fase 2.5 (done):** Descuento por orden (discount_percent persistido en cada orden) + deteccion de duplicados
- **Fase 3 (done):** Modulo Orders/Loads completo — lista + detalle, 7 status, brokers con FMCSA, stops mejorados, invoicing + commodities, HERE truck routing, documentos RC/BOL/POD, scanner AI, invoice generation
- **Fase 3.5 (done):** Drawer lateral, TONU $150 auto, POD requerido para facturar, invoice unificado, broker auto-save, broker search hibrido, DH auto
- **Fase 4 (done):** Modulo Compania (choferes, camiones, trailers, company info, billing, docs), tema light/dark, configuracion, TONU precio editable, ref# auto-generado, rate/mi en tabla, invoice cache + regenerar, email con CC y switches, logo dinamico, sidebar dinamico, drivers conectados a trucks
- **Fase 4.5 (done):** Status "Pagado" (8vo estado, violeta), company settings migrado de localStorage a Supabase (company_settings table + lib/company.js), DatePicker custom, filtros avanzados en OrdersView (truck/dispatcher/broker/fechas), cache en memoria (Dashboard + OrdersView, 30s TTL), OrderDocuments drag & drop + visor fullscreen PDF progresivo, stops con schedule_type (appointment/range) + time_end, queries por cycle_id FK (TruckView/Dashboard), unique active cycle constraint, Dashboard queries paralelas (Promise.all), HERE Maps error logging, RC drag & drop en OrderDetail, dispatcher requerido en nuevas ordenes
- **Fase 4.6 (done):** Gastos recurrentes por truck (recurring_expenses table, CRUD en truck modal, auto-aplicacion al abrir ciclo), DayPicker component con portal dropdown, mejoras UX modal truck
- **Fase 4.7 (done):** Sistema LIS — trucks con propietario externo (is_lis + owner_name en trucks), tabla owner_expenses, tab "Gastos Propietario" condicional en TruckView, boton transferir gastos a propietario en ExpensesTab
- **Fase 5 (next):** Reports, Excel/PDF export, auth/usuarios

## Commands
```bash
npm run dev      # Local dev server
npm run build    # Production build
npm run preview  # Preview production build
```
