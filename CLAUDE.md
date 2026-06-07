# MovingService - ETG Moving Services

## Overview
App web para gestionar camiones de mudanza. Reemplaza hojas de Excel con una app que organiza datos por camion y semana, con escaneo de recibos via IA (futuro).

## Tech Stack
- **Frontend:** React 19 + Vite 8 + Tailwind CSS (via @tailwindcss/vite plugin) + React Router
- **Backend:** Supabase (PostgreSQL + Auth + Storage)
- **IA/OCR:** Google AI Studio / Gemini Vision API (Fase 2)
- **Deploy:** Vercel (auto-deploy on push to main)
- **URL:** moving-service-one.vercel.app

## Project Structure
```
src/
  components/
    Layout.jsx          - Sidebar layout, dark theme, responsive
    Dashboard.jsx       - Lista de camiones con resumen semanal
    TruckView.jsx       - Vista individual con 4 tabs + panel caja/dividendos
    OrdersTable.jsx     - CRUD ordenes/cargas
    DieselTable.jsx     - CRUD diesel
    ExpensesTable.jsx   - CRUD gastos (con categorias)
    AccountingTable.jsx - CRUD contabilidad (debito/credito)
    AddModal.jsx        - Modal reutilizable para agregar/editar registros
  lib/
    supabase.js         - Cliente Supabase (usa VITE_ env vars)
    cycles.js           - Funciones utilitarias para ciclos (computeWeeks, open/close/reopen)
  App.jsx               - Router: / = Dashboard, /truck/:id = TruckView
  main.jsx              - Entry point
  index.css             - Tailwind import
supabase/
  schema.sql            - SQL para crear tablas y politicas RLS
```

## Database Tables (Supabase)
- `trucks` (id, name, number, discount_percent)
- `orders` (id, truck_id, order_number, pu_date, pu_city, do_date, do_city, miles, rate, period_start, period_end)
- `diesel` (id, truck_id, invoice_number, date, city, gallons, value, period_start, period_end)
- `expenses` (id, truck_id, category, invoice_number, description, amount, date, period_start, period_end)
- `accounting` (id, truck_id, description, reference, date, debit, credit, period_start, period_end)
- `cycles` (id, truck_id, start_date, end_date, previous_balance, cuadre_caja, closed, closed_at)
- `partners` (id, truck_id, name, percentage, invested)
- `cashbox` (legacy — migrated to cycles)

All tables have RLS enabled with open policies (no auth yet).

## Environment Variables
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
```

## Conventions
- UI in Spanish (labels, buttons, messages)
- Dark theme (gray-950 bg, gray-900 cards)
- Period filtering: flexible cycles with dynamic weeks (Sunday-Saturday)
- Currency: USD formatted with Intl.NumberFormat
- All CRUD tables follow same pattern: fetch on mount + period change, save with period_start/period_end, edit/delete inline

## Phases
- **Fase 1 (done):** Setup + Dashboard + CRUD tables + Vercel deploy
- **Fase 2 (next):** Scanner - upload image -> Gemini Vision API -> extract data -> pre-fill form
- **Fase 3 (later):** Reports, Excel/PDF export, dividend calculations

## Commands
```bash
npm run dev      # Local dev server
npm run build    # Production build
npm run preview  # Preview production build
```
