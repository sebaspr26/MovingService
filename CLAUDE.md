# MovingService - ETG Moving Services

## Overview
App web tipo TMS para gestionar camiones de mudanza. Reemplaza hojas de Excel con una app que organiza datos por camion y ciclo, con escaneo de recibos via IA (Gemini Vision), calculo de millas truck via HERE Maps, lookup de brokers via FMCSA, gestion de documentos (RC/BOL/POD), generacion de invoices, envio de emails, modulo de compania (choferes, camiones, trailers, billing), tema light/dark, y sistema de usuarios con roles y permisos.

## Tech Stack
- **Frontend:** React 19 + Vite 8 + Tailwind CSS v4 (via @tailwindcss/vite plugin) + React Router
- **Backend:** Supabase (PostgreSQL + Auth + Storage)
- **IA/OCR:** Gemini 2.5 Flash via OpenRouter API (base64 image -> JSON estructurado)
- **Geolocation:** HERE Maps REST API (truck routing + geocoding)
- **FMCSA:** Federal Motor Carrier Safety Administration API (broker/carrier lookup by MC#/DOT#/name)
- **PDF Generation:** jsPDF + html2canvas (genera PDF para email), pdf.js v3.11 via CDN (renderiza PDFs como imagenes)
- **Email:** Resend API (envio de invoices con CC, adjuntos PDF + invitaciones de usuario)
- **Deploy:** Vercel (auto-deploy on push to main, serverless functions en /api)
- **URL:** etg-tms.com (alias de moving-service-one.vercel.app)

## Project Structure
```
src/
  components/
    Layout.jsx          - Sidebar (desktop) + header mobile. Company name/DBA dinamico desde Supabase. Avatar usuario abajo con tamaño animado (28px expandido / 36px colapsado)
    Dashboard.jsx       - Grid de camiones con resumen por ciclo, CRUD trucks (con gastos recurrentes + DayPicker), quick-add, abrir ciclos, asignacion de chofer, auto-aplicacion de gastos recurrentes al abrir ciclo. Cache en memoria (30s TTL), queries paralelas con Promise.all. Filtra trucks/ordenes por getAllowedTruckIds(session)
    TruckView.jsx       - Vista individual: ciclo nav, filtro semanas, summary cards, 4 tabs, CashBox. Queries por cycle_id FK (sub-filtro JS por semana)
    OrdersView.jsx      - Lista centralizada de ordenes (/orders): filter tabs (incl. Pagadas), drawer lateral, TONU modal con precio editable, rate/mi en tabla, filtros avanzados MultiSelect (truck/dispatcher/broker/fechas). Cache por usuario (30s TTL, separado por user ID para evitar contaminacion cross-user). Status con siglas (R/A/ET/E/F/P/T/C) + select overlay. Columna Dispatcher. PAGE_SIZE=30. Auto-migra dispatcher nombre→email al cargar. Filtra ordenes por rol: dispatchers solo ven sus ordenes (o todas si tienen permiso ver_todas_ordenes)
    OrderDetail.jsx     - Detalle/creacion de orden: 2-col layout, status bar, broker, stops con schedule_type (appointment/range), invoicing, commodities, route calc, docs, RC viewer con drag & drop, company info sidebar, ref# auto-generado, dispatcher requerido en nuevas ordenes. DispatcherAutocomplete fetches Auth users (admin/dispatcher/super_admin), muestra nombre pero guarda EMAIL en campo dispatcher
    OrderDocuments.jsx  - Panel de documentos (RC/BOL/POD): upload Supabase Storage + drag & drop, visor fullscreen con render progresivo de PDFs (pdf.js), tabs por tipo
    OrderInvoice.jsx    - Invoice unificado: factura + RC + POD. Cache en memoria, boton Regenerar. Email directo con CC y switches por destinatario. Logo desde Supabase Storage
    OrdersTable.jsx     - CRUD ordenes con paid toggle, discount toggle, badge TONU con rate real (TruckView)
    MultiSelect.jsx     - Componente multi-select custom con createPortal (z-index 9999). Dropdown fuera del DOM para evitar clipping. triggerRef + dropdownRef separados para evitar cierre al clickear opciones. Opciones con checkboxes naranja, botones Todos/Limpiar
    DatePicker.jsx      - Calendario custom en espanol, reemplaza inputs nativos de fecha
    DayPicker.jsx       - Selector de dia del mes (1-31) con dropdown portal (createPortal), posicion auto arriba/abajo. Usado en gastos recurrentes del truck modal
    DieselTable.jsx     - CRUD diesel con AddModal
    ExpensesTable.jsx   - CRUD gastos con 11 categorias + AddModal
    OwnerExpensesTable.jsx - CRUD gastos del propietario (trucks LIS). No afecta balance del ciclo. Misma estructura que ExpensesTable
    AccountingTable.jsx - Ledger debito/credito con 3 auto-rows (neto, diesel, gastos) + manuales
    AddModal.jsx        - Modal reutilizable con soporte scanner inline (image/PDF -> AI -> autofill)
    CashBox.jsx         - Cierre/reapertura de ciclo + dividendos por socio
    CompanyInfo.jsx     - Modulo compania: choferes, camiones, trailers, company info, billing (bill from + remit to + logo), company docs. Datos en Supabase (company_settings) en vez de localStorage
    Profiles.jsx        - Gestion de usuarios Auth agrupados por rol (Administradores/Dispatchers/Conductores). Muestra drivers DB sin cuenta y dispatchers legacy sin cuenta. Modal permisos 2 columnas: izquierda=modulos en grid 2col compacto, derecha=camiones+comision+empresas. Comision dispatcher con historial mensual. Auto-migra dispatcher nombre→email al cargar. Reenviar invitacion abre modal pre-llenado (permite corregir email); si email cambia elimina usuario viejo antes de crear nuevo
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
    permissions.js      - MODULES array, defaultPermissions(), isSuperAdmin(), canAccess(), getAllowedTruckIds(). getAllowedTruckIds retorna null (super_admin=sin filtro) o [] (sin trucks asignados = no ve nada) o array de IDs
    theme.jsx           - ThemeProvider + useTheme hook. Persiste en localStorage. Aplica clase 'light' en html
  App.jsx               - Router: / = Dashboard, /truck/:id, /orders, /orders/:id, /company, /settings, /profiles
  main.jsx              - Entry point (ThemeProvider + ToastProvider + App)
  index.css             - Tailwind import + light mode CSS variable overrides (grays invertidos, accent colors ajustados). Scrollbar naranja (#ea580c) en dark mode, azul claro en light mode
api/
  send-invoice.js       - Serverless function (Vercel): envia email via Resend con to, cc, adjunto PDF
  invite-user.js        - Serverless function (Vercel): gestiona usuarios Auth via supabaseAdmin. Acciones: create, invite, list, delete, resend, update_permissions, update_role, migrate_dispatchers. invite usa generateLink(type:'invite'), fallback a generateLink(type:'recovery') si email ya existe. update_permissions guarda permissions + allowed_companies + allowed_trucks + name + dispatcher_rates en user_metadata
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
  018_audit_log.sql          - Tabla audit_log para registrar acciones destructivas (delete truck, etc.)
```

## Database Tables (Supabase)
- `trucks` (id, name, number, discount_percent [default 13], is_lis [default false], owner_name)
- `orders` (id, truck_id [nullable], cycle_id [nullable FK→cycles], order_number, pu_date, pu_city, do_date, do_city, miles, rate, apply_discount, discount_percent, paid, period_start, period_end, status, broker_id, broker_email, equipment_type, load_type, dispatcher [almacena EMAIL del dispatcher, no nombre], invoice_notes, dead_miles, ref_number, driver_name, commodity, weight, special_instructions, driver_pay_total)
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
- `audit_log` (id, action, entity_type, entity_id, entity_name, user_agent, ip_address, extra_info [jsonb], created_at) — log de acciones destructivas

**Storage Buckets:** `order-docs` (public), `company-docs` (public)

All tables have RLS enabled with open policies (no auth yet).

## Auth / Usuarios (Supabase Auth + api/invite-user.js)

### Roles
- `super_admin` — acceso total, ve todo, no filtrado por trucks ni dispatcher
- `admin` — acceso casi total, ve todas las ordenes
- `dispatcher` — solo ve sus propias ordenes (filtro por email) salvo permiso `ver_todas_ordenes`
- `driver` / `driver_lease` — conductores

### user_metadata estructura
```json
{
  "name": "SEBASTIAN",
  "role": "dispatcher",
  "permissions": { "dashboard": { "enabled": true, "ver_camiones": true, ... }, ... },
  "allowed_trucks": ["uuid1", "uuid2"],
  "allowed_companies": ["uuid1"],
  "dispatcher_rates": [
    { "month": "2026-08", "pct": 4 },
    { "month": "2026-09", "pct": 5 }
  ]
}
```

### dispatcher_rates (comision mensual)
- Se guarda en `user_metadata.dispatcher_rates` como array `[{month: "YYYY-MM", pct: number}]`
- Al guardar permisos: si existe entrada para el mes actual se sobreescribe, sino se agrega nueva
- Los meses anteriores NUNCA se modifican — historial inmutable
- Se edita desde Profiles > modal permisos > columna derecha (solo visible para rol dispatcher)

### Dispatcher field en orders
- **Siempre almacena EMAIL**, nunca nombre en texto
- `DispatcherAutocomplete` en OrderDetail fetches Auth users (roles: super_admin/admin/dispatcher), muestra nombre en dropdown, guarda email
- Al cargar OrdersView se auto-migra nombre→email para ordenes legacy (si existe Auth user con ese nombre)
- `dispatcherName(email)` resuelve email→nombre para display en tabla y filtros
- Ordenes legacy con nombres sin Auth user coincidente quedan como estan

### Filtros de acceso por rol
- `getAllowedTruckIds(session)`: null=super_admin (sin filtro), []=sin trucks asignados (no ve nada), [ids]=solo esos trucks
- Dispatchers: `filteredOrders.filter(o => o.dispatcher === userEmail || o.dispatcher.toLowerCase() === userName)` — segundo caso cubre ordenes legacy no migradas
- Permiso `orders.ver_todas_ordenes === true` en user_metadata.permissions permite al dispatcher ver todas las ordenes

### Invitaciones
- **Nuevo usuario**: accion `invite` → generateLink(type:'invite'). Si email ya existe, fallback a generateLink(type:'recovery')
- **Reenviar**: boton en Profiles abre modal pre-llenado con datos del usuario para corregir email si hubo error
- **Al reenviar con email distinto**: elimina usuario viejo automaticamente antes de crear el nuevo
- **Activacion**: link redirige a https://www.etg-tms.com/set-password

### Profiles (/profiles) — solo super_admin
- Usuarios agrupados: Administradores / Dispatchers / Conductores
- Status: Activo (verde) / Solicitud enviada (amarillo, pulsante) / Expirado (rojo)
- Pendiente y Expirado muestran boton "Reenviar" que abre modal pre-llenado
- Usuarios sin cuenta: drivers de tabla `drivers` sin email en Auth, dispatchers de ordenes sin Auth user coincidente
- Auto-migra dispatcher nombre→email al cargar (fetchUsers)
- Modal permisos: 2 columnas, max-w-5xl, 90vh. Izq: modulos en grid 2col compacto. Der: comision+trucks+empresas

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

### Status en tabla OrdersView
- Badge con sigla: R=Reservada, A=Asignada, ET=En Transito, E=Entregada, F=Facturada, P=Pagado, T=TONU, C=Cancelada
- Select transparente overlay sobre el badge — click en badge abre dropdown nativo del select

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
- **Scrollbar**: dark mode = naranja (#ea580c), light mode = azul claro (#93c5fd)
- **Configuracion** en `/settings`: dos cards de preview (Dark/Light) para seleccionar tema
- `text-white` se overridea a oscuro en light mode. Se preserva blanco en botones con bg solido

### Sidebar Layout
- Company Name y DBA dinamicos desde Supabase (company_settings, cargados al montar)
- Avatar usuario abajo: 28px expandido / 36px colapsado, transicion animada
- Navegacion: Dashboard, Ordenes, Compania, Configuracion, Perfiles (solo super_admin)

### Toast System (Toast.jsx)
- ToastProvider wrappea la app en main.jsx. Hook: `useToast()`
- Tipos: `toast.success()`, `toast.error()`, `toast.warning()`, `toast.info()` — top-right, auto-dismiss 3.5s
- `toast.confirm(msg)` — dialogo modal personalizado. Retorna Promise<boolean>
- CERO `alert()` o `confirm()` nativos en toda la app

## Permissions System (lib/permissions.js)

### MODULES
Cada modulo tiene `key`, `label`, `icon` (SVG path), `subs[]`:
- `dashboard`: ver_camiones, crear_editar_camiones, eliminar_camiones, ver_ciclos, gastos_recurrentes, cashbox
- `orders`: ver_lista, **ver_todas_ordenes** (ver ordenes de todos no solo las propias), crear_ordenes, editar_ordenes, documentos, invoice, enviar_email, marcar_pagado, eliminar_ordenes, tonu
- `statistics`: (sin subs)
- `company`: choferes, camiones_docs, trailers, documentos_empresa
- `informacion`: empresa, billing
- `settings`: (sin subs)

### Funciones clave
- `isSuperAdmin(session)`: role === 'super_admin'
- `canAccess(session, moduleKey, subKey)`: super_admin siempre true; sin perms = todo visible (retrocompatible); chequea mod.enabled y sub !== false
- `getAllowedTruckIds(session)`: null=super_admin, []=nuevo usuario sin trucks (NO VE NADA), [ids]=trucks permitidos

## Conventions
- UI en espanol (labels, buttons, messages)
- Dark theme default, light theme via CSS variable overrides
- Colores semanticos: green=facturada/income, red=TONU/debito, blue=reservada/balance, orange=en transito/diesel, yellow=asignada/pending, cyan=entregada/routing, violet=pagado, purple=scanner, gray=cancelada
- Currency: USD con `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`
- Datos de compania/billing almacenados en Supabase (tabla company_settings: company_info, billing_info, remit_info como JSONB + logo_path en Storage)
- Formularios con dirty state: boton guardar deshabilitado sin cambios, toast warning a los 5s con cambios pendientes
- Invoice cacheado en memoria por orderId, boton Regenerar para forzar recarga
- **dispatcher en orders.dispatcher = siempre email, nunca nombre**

## Environment Variables
```
VITE_SUPABASE_URL=https://mxbtyvnfunoaqjupmmdy.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
VITE_HERE_API_KEY=xxx (HERE Maps - truck routing + geocoding)
VITE_OPENROUTER_KEY=xxx (OpenRouter - Gemini AI scanner)
VITE_FMCSA_KEY=xxx (FMCSA - broker/carrier lookup, solo funciona desde EEUU)
RESEND_KEY=xxx (Resend - envio de emails, configurado en Vercel env vars)
SUPABASE_SERVICE_ROLE_KEY=xxx (solo en Vercel, para api/invite-user.js)
```

## Modules
- **Dashboard** (`/`) — Grid de camiones, resumen por ciclo, quick-add, CRUD trucks con asignacion de chofer y gastos recurrentes
- **TruckView** (`/truck/:id`) — Vista individual de camion: ciclo nav, semanas, tabs (orders, gastos, contabilidad), CashBox
- **Orders/Loads** (`/orders`, `/orders/:id`) — Modulo TMS completo: lista con filter tabs + drawer lateral, TONU con precio editable, rate/mi en tabla, ref# auto-generado, invoice con cache + email directo con CC y switches. Filtros MultiSelect (truck/dispatcher/broker). Status siglas. Columna Dispatcher
- **Compania** (`/company`) — Company info, billing (bill from + remit to + logo), company docs, choferes (CRUD + docs), camiones (docs), trailers (CRUD + docs)
- **Configuracion** (`/settings`) — Tema light/dark
- **Perfiles** (`/profiles`) — Solo super_admin. Gestion de usuarios Auth: crear, invitar, reenviar, permisos, roles, camiones asignados, comision mensual dispatcher

## Phases
- **Fase 1 (done):** Setup + Dashboard + CRUD tables + Vercel deploy
- **Fase 2 (done):** Scanner AI integrado en AddModal + pagina Scanner standalone + ciclos flexibles + search/pagination + CashBox con dividendos
- **Fase 2.5 (done):** Descuento por orden (discount_percent persistido en cada orden) + deteccion de duplicados
- **Fase 3 (done):** Modulo Orders/Loads completo — lista + detalle, 7 status, brokers con FMCSA, stops mejorados, invoicing + commodities, HERE truck routing, documentos RC/BOL/POD, scanner AI, invoice generation
- **Fase 3.5 (done):** Drawer lateral, TONU $150 auto, POD requerido para facturar, invoice unificado, broker auto-save, broker search hibrido, DH auto
- **Fase 4 (done):** Modulo Compania (choferes, camiones, trailers, company info, billing, docs), tema light/dark, configuracion, TONU precio editable, ref# auto-generado, rate/mi en tabla, invoice cache + regenerar, email con CC y switches, logo dinamico, sidebar dinamico, drivers conectados a trucks
- **Fase 4.5 (done):** Status "Pagado" (8vo estado, violeta), company settings migrado de localStorage a Supabase, DatePicker custom, filtros avanzados en OrdersView, cache en memoria, OrderDocuments drag & drop + visor fullscreen PDF, stops con schedule_type + time_end, queries por cycle_id FK, unique active cycle constraint, Dashboard queries paralelas, RC drag & drop en OrderDetail, dispatcher requerido en nuevas ordenes
- **Fase 4.6 (done):** Gastos recurrentes por truck (recurring_expenses table, CRUD en truck modal, auto-aplicacion al abrir ciclo), DayPicker component con portal dropdown
- **Fase 4.7 (done):** Sistema LIS — trucks con propietario externo, tabla owner_expenses, tab "Gastos Propietario" en TruckView, boton transferir gastos a propietario
- **Fase 5 (done):** Auth y usuarios — Profiles page con roles/grupos, invitaciones por email (Resend), permisos granulares por modulo, asignacion de trucks por usuario, cache por usuario en OrdersView, dispatcher identificado por email, comision mensual con historial, filtros MultiSelect en ordenes, status siglas en tabla, scrollbar naranja, modal permisos 2 columnas rediseñado
- **Fase 6 (next):** Reports, Excel/PDF export, estadisticas por dispatcher/periodo

## Commands
```bash
npm run dev      # Local dev server
npm run build    # Production build
npm run preview  # Preview production build
```
