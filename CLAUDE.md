# MovingService - ETG Moving Services

## Overview
App web para gestionar camiones de mudanza. Reemplaza hojas de Excel con una app que organiza datos por camion y ciclo, con escaneo de recibos via IA (Gemini Vision a traves de OpenRouter).

## Tech Stack
- **Frontend:** React 19 + Vite 8 + Tailwind CSS (via @tailwindcss/vite plugin) + React Router
- **Backend:** Supabase (PostgreSQL + Auth + Storage)
- **IA/OCR:** Gemini 2.5 Flash via OpenRouter API (base64 image -> JSON estructurado)
- **Deploy:** Vercel (auto-deploy on push to main)
- **URL:** moving-service-one.vercel.app

## Project Structure
```
src/
  components/
    Layout.jsx          - Sidebar (desktop) + header mobile con back button
    Dashboard.jsx       - Grid de camiones con resumen por ciclo, CRUD trucks, quick-add, abrir ciclos
    TruckView.jsx       - Vista individual: ciclo nav, filtro semanas, summary cards, 4 tabs, CashBox
    OrdersTable.jsx     - CRUD ordenes con paid toggle, discount toggle, modal propio
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
    gemini.js           - API OpenRouter -> Gemini 2.5 Flash, extrae order/diesel/expense de imagen
  App.jsx               - Router: / = Dashboard, /truck/:id = TruckView
  main.jsx              - Entry point
  index.css             - Tailwind import
supabase/
  schema.sql            - Schema base (trucks, orders, diesel, expenses, accounting)
  002_partners_cashbox.sql - Partners + cashbox (legacy)
  003_truck_discount.sql   - discount_percent en trucks
  004_cycles.sql           - Tabla cycles + date en accounting
  005_fix_cycles.sql       - Reset cycles con data correcta
```

## Database Tables (Supabase)
- `trucks` (id, name, number, discount_percent [default 13])
- `orders` (id, truck_id, order_number, pu_date, pu_city, do_date, do_city, miles, rate, apply_discount, paid, period_start, period_end)
- `diesel` (id, truck_id, invoice_number, date, city, gallons, value, period_start, period_end)
- `expenses` (id, truck_id, category, invoice_number, description, amount, date, period_start, period_end)
- `accounting` (id, truck_id, description, reference, date, debit, credit, period_start, period_end)
- `cycles` (id, truck_id, start_date, end_date, previous_balance, cuadre_caja, closed, closed_at)
- `partners` (id, truck_id, name, percentage, invested)
- `cashbox` (legacy - migrado a cycles, no se usa)

All tables have RLS enabled with open policies (no auth yet).

## Key Business Logic

### Ciclos (cycles.js)
- Reemplazan periodos mensuales fijos. Un ciclo es un rango abierto (start_date -> end_date nullable).
- `computeWeeks()` divide el ciclo en semanas Lunes-Domingo. Semana 1 va de start_date al primer domingo.
- Ciclo activo: `closed = false`, `end_date = null`. Solo uno activo por camion.
- Cierre: guarda `cuadre_caja` (dinero dejado en caja) y `end_date`. El `cuadre_caja` se convierte en `previous_balance` del siguiente ciclo.
- Reabrir: limpia `end_date`, `closed_at`, pone `closed = false`.

### Descuentos (por orden)
- Cada camion tiene `discount_percent` (default 13%).
- Cada orden tiene `apply_discount` (boolean). El neto se calcula: `rate * (1 - discount/100)`.
- Dashboard y TruckView calculan el income sumando solo ordenes pagadas, respetando `apply_discount` por orden.

### Contabilidad (AccountingTable)
- 3 filas auto-generadas (no persistidas): Ingreso Neto, Total Diesel, Total Gastos. Marcadas con badge "Auto".
- Filas manuales para ajustes adicionales de debito/credito.
- Balance = totalCredito - totalDebito (auto + manual).

### Scanner (gemini.js + AddModal)
- Usa OpenRouter como gateway -> modelo `google/gemini-2.5-flash`.
- Acepta imagenes y PDF. Extrae tipo (order/diesel/expense) + datos estructurados.
- Mutex global para prevenir llamadas duplicadas (StrictMode / double-click).
- Retry silencioso en HTTP 503. Mensajes de error en espanol.
- AddModal integra scan inline: boton de scan -> AI analiza -> autofill campos -> usuario revisa -> confirma.

### CashBox (cierre de ciclo)
- 3 estados: default (boton cerrar), formulario de cierre (fecha + dejar en caja + preview dividendos), cerrado (resumen + reabrir).
- `ganancia = previous_balance + (credito - debito)`. `repartido = ganancia - cuadre_caja`.
- Dividendos: `repartido * (partner.percentage / 100)` por socio.

## Conventions
- UI en espanol (labels, buttons, messages)
- Dark theme: gray-950 bg, gray-900 cards, gray-800 inputs/rows
- Colores semanticos: green=credito/income, red=debito/expense, blue=balance, orange=diesel/discount, yellow=pending/caja
- Currency: USD con `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`
- Todas las tablas: PAGE_SIZE=5, expandible, search toggle, readOnly en ciclos cerrados
- Fetch pattern: `useEffect([truckId, period])` -> fetch, `onDataChange` callback al padre
- Skeleton loading con pulse animation
- Version actual: v1.1 - Fase 2 (sidebar footer)

## Expense Categories
Mantenimiento, Seguro, Peajes, Reparacion, Llantas, Lavado, Parqueo, Multas, Comida, DEF, Otros

## Environment Variables
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
```

## Phases
- **Fase 1 (done):** Setup + Dashboard + CRUD tables + Vercel deploy
- **Fase 2 (done):** Scanner AI integrado en AddModal + pagina Scanner standalone + ciclos flexibles + search/pagination + CashBox con dividendos
- **Fase 3 (next):** Reports, Excel/PDF export, auth/usuarios

## Commands
```bash
npm run dev      # Local dev server
npm run build    # Production build
npm run preview  # Preview production build
```
