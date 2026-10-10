import { getActiveCompanyId } from './company'

// Returns the per-company slice of user_metadata (permissions, allowed_trucks, dispatcher_rates)
// Falls back to legacy top-level fields for users not yet migrated.
export function getPerCompanyMeta(session) {
  const meta = session?.user?.user_metadata || {}
  const companyId = getActiveCompanyId()
  if (companyId && meta.company_settings?.[companyId]) {
    return meta.company_settings[companyId]
  }
  return {
    permissions: meta.permissions,
    allowed_trucks: meta.allowed_trucks,
    dispatcher_rates: meta.dispatcher_rates,
  }
}

export const MODULES = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: 'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z',
    subs: [
      { key: 'ver_truck_view', label: 'Ver estadísticas del camión (TruckView)' },
      { key: 'ver_camiones', label: 'Ver camiones', adminOnly: true },
      { key: 'crear_editar_camiones', label: 'Crear / editar camiones', adminOnly: true },
      { key: 'eliminar_camiones', label: 'Eliminar camiones', adminOnly: true },
      { key: 'ver_ciclos', label: 'Ver ciclos y balance', adminOnly: true },
      { key: 'gastos_recurrentes', label: 'Gastos recurrentes', adminOnly: true },
      { key: 'cashbox', label: 'Cierre de caja (CashBox)', adminOnly: true },
      { key: 'ver_gastos', label: 'Ver pestaña de gastos', driverOnly: true },
      { key: 'ver_contabilidad', label: 'Ver contabilidad', driverOnly: true },
      { key: 'ver_gastos_propietario', label: 'Ver gastos del propietario', driverOnly: true },
    ],
  },
  {
    key: 'orders',
    label: 'Ordenes',
    icon: 'M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12',
    subs: [
      { key: 'ver_lista', label: 'Ver lista de ordenes' },
      { key: 'ver_todas_ordenes', label: 'Ver todas las órdenes (no solo las propias)' },
      { key: 'crear_ordenes', label: 'Crear ordenes' },
      { key: 'editar_ordenes', label: 'Editar ordenes' },
      { key: 'documentos', label: 'Documentos (RC / POD)' },
      { key: 'invoice', label: 'Generar invoice' },
      { key: 'enviar_email', label: 'Enviar email de invoice' },
      { key: 'marcar_pagado', label: 'Marcar como pagado' },
      { key: 'eliminar_ordenes', label: 'Eliminar ordenes' },
      { key: 'tonu', label: 'TONU / Cancelar ordenes' },
    ],
  },
  {
    key: 'statistics',
    label: 'Estadísticas',
    icon: 'M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z',
    subs: [],
  },
  {
    key: 'company',
    label: 'Compañía',
    icon: 'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0',
    subs: [
      { key: 'choferes', label: 'Choferes' },
      { key: 'camiones_docs', label: 'Documentos de camiones' },
      { key: 'documentos_empresa', label: 'Documentos de empresa' },
    ],
  },
  {
    key: 'informacion',
    label: 'Información',
    icon: 'M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z',
    subs: [
      { key: 'empresa', label: 'Datos de la empresa' },
      { key: 'billing', label: 'Billing / Remit To / Logo' },
    ],
  },
  {
    key: 'pagos',
    label: 'Pagos',
    icon: 'M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z',
    subs: [
      { key: 'pago_dispatchers', label: 'Pago Dispatchers' },
      { key: 'pago_conductores', label: 'Pago Conductores' },
    ],
  },
  {
    key: 'reportes',
    label: 'Reportes',
    icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z',
    subs: [
      { key: 'ifta', label: 'IFTA (si la empresa lo tiene activo)' },
      { key: 'auditoria', label: 'Auditoría' },
    ],
  },
  {
    key: 'mantenimiento',
    label: 'Mantenimiento',
    icon: 'M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z',
    subs: [
      { key: 'configurar', label: 'Configurar y registrar mantenimientos' },
      { key: 'alertas', label: 'Recibir alertas (campanita)' },
    ],
  },
  {
    key: 'settings',
    label: 'Configuración',
    icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z',
    subs: [],
  },
  {
    key: 'conductores',
    label: 'Conductores',
    icon: 'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
    subs: [],
  },
]

// Modulos que se agregaron DESPUES de que los usuarios ya tenian permisos guardados.
// Mientras el usuario no tenga una decision guardada para ellos, vale lo que antes
// dependia solo del rol (asi nadie pierde ni gana acceso por sorpresa):
//   pagos: admins · reportes: solo super admin · mantenimiento: admins y choferes
const isDriverRole = role => role === 'driver' || role === 'driver_lease'
const LEGACY_ACCESS = {
  pagos: (role) => role === 'admin',
  reportes: () => false,
  mantenimiento: (role, sub) => role === 'admin' || (isDriverRole(role) && (!sub || sub === 'alertas')),
}

/** Acceso por rol de un modulo nuevo (y su sub) cuando no hay permisos guardados para el. */
export function legacyAccess(role, moduleKey, subKey = null) {
  return !!LEGACY_ACCESS[moduleKey]?.(role, subKey)
}

/** Entrada de permisos { enabled, ...subs } segun el rol, para sembrar el editor de Perfiles. */
export function legacyModuleDefaults(role, moduleKey) {
  if (!LEGACY_ACCESS[moduleKey]) return null
  const mod = MODULES.find(m => m.key === moduleKey)
  const entry = { enabled: legacyAccess(role, moduleKey) }
  for (const sub of mod?.subs || []) entry[sub.key] = legacyAccess(role, moduleKey, sub.key)
  return entry
}

// Permisos por defecto: todo desactivado (super admin debe conceder explícitamente)
export function defaultPermissions() {
  const perms = {}
  for (const mod of MODULES) {
    perms[mod.key] = { enabled: false }
    for (const sub of mod.subs) {
      perms[mod.key][sub.key] = false
    }
  }
  return perms
}

// Super admin siempre tiene todo
export function isSuperAdmin(session) {
  return session?.user?.user_metadata?.role === 'super_admin'
}

// Lista de módulos accesibles (excluye perfiles que es solo super_admin)
export function accessibleModules(session) {
  return MODULES.filter(m => canAccess(session, m.key))
}

// Chequea si un módulo está habilitado para el usuario actual
export function canAccess(session, moduleKey, subKey = null) {
  if (isSuperAdmin(session)) return true
  const role = session?.user?.user_metadata?.role
  // Drivers siempre tienen acceso a dashboard y orders (filtrado por su camion)
  if ((role === 'driver' || role === 'driver_lease') && !subKey) {
    if (moduleKey === 'dashboard' || moduleKey === 'orders') return true
  }
  // Dispatchers siempre tienen acceso a conductores (solo los suyos)
  if (role === 'dispatcher' && !subKey && moduleKey === 'conductores') return true
  // Los choferes ven el mantenimiento de su camion (y sus alertas) automaticamente
  if (isDriverRole(role) && moduleKey === 'mantenimiento') return legacyAccess(role, moduleKey, subKey)
  const perms = getPerCompanyMeta(session).permissions
  // Modulos nuevos sin decision guardada para el usuario: lo que daba su rol
  if (moduleKey in LEGACY_ACCESS && !perms?.[moduleKey]) return legacyAccess(role, moduleKey, subKey)
  // admins tienen acceso total salvo que tengan permisos explícitos configurados
  if (!perms && role === 'admin') return true
  if (!perms) return false // sin config = sin acceso (dispatcher/driver/etc)
  const mod = perms[moduleKey]
  if (!mod?.enabled) return false
  if (subKey) return mod[subKey] === true
  return true
}

// Solo super_admin puede eliminar — admins no pueden borrar nada
export function canDelete(session) {
  return session?.user?.user_metadata?.role === 'super_admin'
}

// Retorna array de truck IDs permitidos, o null si el usuario puede ver todos.
// Super admin → null (sin filtro). Otros → solo los asignados; si nunca se asignaron → [] (ninguno).
export function getAllowedTruckIds(session) {
  if (isSuperAdmin(session)) return null
  const ids = getPerCompanyMeta(session).allowed_trucks
  return Array.isArray(ids) ? ids : []
}
