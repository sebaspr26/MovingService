// Texts of the help (i) icons (components/InfoTip.jsx). Written for someone who has never
// used the app: what the thing is, and the steps to use it. To change a text, edit it here;
// to put one somewhere new: <InfoTip id="the.id" />.
//   title: short name · text: what it is · steps: how to use it · tip: extra note (gray)

export const HELP = {
  // ───────────── Dashboard ─────────────
  'dashboard.page': {
    title: 'Dashboard',
    text: 'Aquí ves todos tus camiones de un vistazo. Cada tarjeta es un camión con lo que ha pasado en su ciclo activo.',
    steps: [
      'Presiona una tarjeta para entrar al camión y ver sus órdenes, gastos y contabilidad.',
      'El Balance de la esquina es la suma del dinero de todos los camiones.',
      'Verde = va ganando, rojo = va en negativo.',
    ],
    tip: 'Un ciclo es un periodo de trabajo del camión (normalmente unas semanas). Al cerrarlo se reparte lo ganado.',
  },
  'dashboard.card': {
    title: 'Tarjeta del camión',
    text: 'Resume el ciclo abierto del camión: órdenes pagadas, gastos y el Balance (lo que tiene en caja).',
    steps: [
      'Presiona la tarjeta para ver el detalle del camión.',
      'Al pasar el mouse aparecen el lápiz (editar) y el bote (eliminar).',
      'Si el camión no tiene ciclo abierto, usa "+ Abrir Nuevo Ciclo".',
    ],
  },
  'dashboard.openCycle': {
    title: 'Abrir un ciclo nuevo',
    text: 'Empieza un nuevo periodo de trabajo para este camión. El balance con el que cerró el ciclo anterior pasa al nuevo.',
    steps: [
      'Elige la fecha de inicio.',
      'Presiona "Abrir". Si había órdenes sin pagar, te pregunta cuáles quieres traer al ciclo nuevo.',
      'Los gastos recurrentes del camión se aplican solos.',
    ],
    tip: 'Solo puede haber un ciclo abierto por camión.',
  },
  'dashboard.addTruck': {
    title: 'Agregar camión',
    text: 'Crea un camión nuevo con su nombre, número, tipo, chofer, descuento y socios.',
    steps: [
      'Llena los datos del camión (el tipo es obligatorio).',
      'Opcional: asigna chofer, descuento %, socios y gastos recurrentes.',
      'Guarda. Luego ábrele su primer ciclo.',
    ],
  },
  'dashboard.addOrder': {
    title: 'Orden rápida',
    text: 'Crea una orden nueva sin salir del Dashboard.',
    steps: [
      'Presiona "Orden" y se abre el formulario a un lado.',
      'Escribe el número, el broker, el rate y las paradas.',
      'Guarda. La orden aparece en la lista de Órdenes y en el camión.',
    ],
  },
  'dashboard.addExpense': {
    title: 'Agregar gasto o recibo',
    text: 'Registra un diesel, DEF, gasto o pago al chofer de cualquier camión, sin entrar al camión.',
    steps: [
      'Presiona "Gasto" y elige el camión.',
      'Toma una foto del recibo con "Escanear recibos" y la IA llena los datos.',
      'Revisa los datos y confirma.',
    ],
    tip: 'Puedes escanear varios recibos en una sola foto.',
  },

  // ───────────── Vista del camión ─────────────
  'truck.cycle': {
    title: 'Ciclo del camión',
    text: 'Todo lo que ves en el camión (órdenes, gastos, contabilidad) pertenece al ciclo seleccionado. Puedes moverte entre ciclos anteriores con las flechas.',
    tip: 'Un ciclo cerrado no se puede modificar. Si te equivocaste, el botón "Reabrir" de la caja lo vuelve a abrir.',
  },
  'truck.weeks': {
    title: 'Filtro por semanas',
    text: 'Divide el ciclo en semanas para ver solo las órdenes de una.',
    steps: [
      '"Todo el ciclo" muestra todas.',
      '"Sem 1, Sem 2…" muestra solo esa semana.',
      '"Ciclo Anterior" muestra las órdenes sin pagar que se trajeron del ciclo pasado.',
    ],
    tip: 'Este filtro solo cambia la tabla de Órdenes.',
  },
  'truck.summary': {
    title: 'Resumen del ciclo',
    text: 'Solo cuentan las órdenes marcadas como pagadas. El Neto es el rate menos el descuento. El Balance es lo que hay en caja: saldo anterior + neto − gastos.',
  },
  'truck.tabs': {
    bullets: true,
    title: 'Pestañas del camión',
    steps: [
      'Orders: las cargas de este camión en el ciclo.',
      'Gastos: diesel, DEF, pagos al chofer, lumpers y otros gastos.',
      'Contabilidad: libro de débitos y créditos; ahí ves de dónde sale el balance.',
      'Gastos Propietario: solo camiones de un propietario externo (LIS).',
    ],
  },
  'truck.addOrder': {
    title: 'Agregar orden al camión',
    text: 'Crea una orden de forma rápida para este camión. Para capturar todos los detalles (paradas, documentos, invoice) usa Órdenes > Nueva Orden.',
  },
  'truck.paid': {
    title: 'Marcar como pagada',
    text: 'Marca la orden como pagada cuando el broker ya te depositó. Solo las órdenes pagadas suman al balance del camión.',
    tip: 'Si la orden tiene un lumper sin pagar, te pregunta si ya se pagó.',
  },
  'truck.leaseDriver': {
    title: 'Pago al conductor (camión lease)',
    text: 'Marca esta casilla cuando ya le pagaste al conductor su parte de esta orden. Se descuenta del balance del camión según su porcentaje.',
    tip: 'Es independiente de "pagada": marcar la orden como pagada no descuenta al conductor.',
  },
  'truck.addExpense': {
    title: 'Agregar gasto',
    text: 'Registra un diesel, DEF, pago al chofer u otro gasto de este camión. Cada gasto resta del balance.',
    steps: [
      'Presiona "+ Agregar" y elige el tipo.',
      'Escanea el recibo (foto o PDF) o escribe los datos.',
      'Confirma. El gasto aparece en la tabla.',
    ],
  },
  'truck.accounting': {
    title: 'Contabilidad',
    text: 'Libro del ciclo: crédito = dinero que entra, débito = dinero que sale. Las filas automáticas (neto, diesel, gastos…) salen solas; con "+ Agregar Registro" añades movimientos manuales.',
  },
  'truck.cashbox': {
    title: 'Caja y cierre de ciclo',
    text: 'Aquí se cierra el ciclo y se reparte la ganancia entre los socios.',
    steps: [
      'Revisa el balance del ciclo.',
      '"Reporte preliminar" baja un PDF de cómo va el ciclo, sin cerrarlo.',
      '"Cerrar Ciclo": escribe cuánto dejas en caja para el siguiente. El resto se divide entre los socios por su %.',
    ],
    tip: 'Al cerrar, el reporte final se descarga solo.',
  },
  'truck.report': {
    title: 'Reporte del ciclo',
    text: 'Baja un PDF tipo estado de cuenta: todos los movimientos con saldo, las órdenes, el cierre de caja y el reparto a socios.',
  },

  // ───────────── Órdenes ─────────────
  'orders.page': {
    title: 'Órdenes / Cargas',
    text: 'Lista de todas las cargas de la empresa. Cada fila es una orden y su color indica en qué estado va.',
    steps: [
      'Presiona una fila para abrir la orden.',
      'Usa "Nueva Orden" para crear una.',
      'Busca o filtra para encontrar una orden específica.',
    ],
  },
  'orders.new': {
    title: 'Nueva Orden',
    text: 'Crea una carga. Puedes llenarla a mano o escanear el Rate Confirmation (RC) y que la IA lo llene.',
    steps: [
      'Presiona "Nueva Orden".',
      'Sube o escanea el RC, o escribe el número de orden, broker y rate.',
      'Agrega las paradas (recogida y entrega). Las millas se calculan solas.',
      'Presiona Guardar.',
    ],
    tip: 'El MC# del broker es obligatorio para guardar la orden.',
  },
  'orders.search': {
    title: 'Buscar',
    text: 'Busca por número de orden, referencia, ciudad o broker.',
    tip: 'Para varias órdenes a la vez separa los números con coma (123, 456) o con barra (123 | 456).',
  },
  'orders.filters': {
    title: 'Filtros',
    text: 'Reduce la lista por camión, dispatcher, broker o rango de fechas. Puedes escoger varios a la vez. "Limpiar" quita todos los filtros.',
  },
  'orders.status': {
    bullets: true,
    title: 'Estado de la orden',
    text: 'La sigla de la primera columna es el estado. Presiónala para cambiarlo.',
    steps: [
      'R = Reservada (sin camión) · A = Asignada (ya tiene camión)',
      'ET = En Tránsito · E = Entregada',
      'F = Facturada (necesita POD) · P = Pagada',
      'T = TONU (camión sin usar) · C = Cancelada',
    ],
    tip: 'Solo las órdenes en Pagada suman al balance del camión.',
  },
  'orders.payments': {
    title: 'Pago Disp. / Pago Cond.',
    text: 'Casillas para marcar que ya se le pagó al dispatcher o al conductor por esa carga. Se usan al hacer los pagos.',
  },

  // ───────────── Detalle de la orden ─────────────
  'order.scan': {
    title: 'Escanear Rate Confirmation',
    text: 'Sube la foto o el PDF del RC y la IA llena la orden: número, broker, rate, paradas y fechas.',
    steps: [
      'Presiona "Escanear" y elige el archivo.',
      'Espera unos segundos.',
      'Revisa lo que llenó y corrige lo que haga falta.',
    ],
    tip: 'Siempre revisa los datos antes de guardar: la IA puede equivocarse.',
  },
  'order.save': {
    title: 'Guardar',
    text: 'Guarda la orden con todo lo que escribiste. Mientras guarda ves una barra de progreso. No cierres la pantalla hasta que termine.',
  },
  'order.statusBar': {
    title: 'Estado de la orden',
    text: 'Avanza la carga paso a paso con el botón de la derecha: Reservada → Asignada → En Tránsito → Entregada → Facturada → Pagada.',
    steps: [
      'Asignada se pone sola al elegir camión.',
      'Facturada necesita que ya hayas subido el POD.',
      'TONU y Cancelada son finales; "Reactivar" las regresa a Reservada.',
    ],
  },
  'order.details': {
    title: 'Detalles de Orden',
    text: 'Datos principales: número de orden, camión, dispatcher, tipo de equipo, fechas y rate.',
    steps: [
      'El camión define a quién se le cobra y en qué ciclo cae.',
      'El Dispatcher es quien consiguió la carga.',
      'El rate es lo que paga el broker.',
    ],
  },
  'order.stops': {
    title: 'Paradas',
    text: 'Dónde se recoge y dónde se entrega la carga. Con las paradas se calculan las millas.',
    steps: [
      'Agrega al menos una recogida (pickup) y una entrega (delivery).',
      'El botón "Cita" / "Rango" cambia entre una hora exacta y una ventana de horas.',
      'Usa "Calcular Ruta" para obtener las millas con camión (HERE).',
    ],
    tip: 'DH (dead head) son las millas vacías desde la entrega anterior hasta esta recogida.',
  },
  'order.client': {
    title: 'Cliente / Broker',
    text: 'Quién contrata la carga. Busca el broker por nombre; si no existe, créalo.',
    steps: [
      'Escribe el nombre y elígelo de la lista.',
      'El MC# del broker es obligatorio; si falta se busca solo en FMCSA o lo escribes tú.',
      'El correo del broker se usa para enviarle la factura.',
    ],
  },
  'order.lumper': {
    title: 'Lumper',
    text: 'El lumper es el pago a quienes descargan la mercancía. Aquí registras cada recibo.',
    steps: [
      'Guarda primero la orden.',
      'Presiona agregar, sube la foto del recibo y la IA lee el monto.',
      'Si lo marcas "Pagado" ya no cuenta como gasto del camión.',
    ],
    tip: 'No cambia el rate de la orden. Sin pagar = gasto del camión; en el invoice se suma al total.',
  },
  'order.invoicing': {
    title: 'Invoicing',
    text: 'Los conceptos que se cobran en la factura: normalmente "Line Haul" con el rate. Puedes agregar cargos extra.',
    steps: [
      'Agrega una línea por cada cobro.',
      'El total de las líneas es lo que se factura.',
    ],
  },
  'order.commodities': {
    title: 'Commodities',
    text: 'Qué mercancía lleva la carga: descripción, peso y piezas. Sale en el invoice.',
  },
  'order.summary': {
    title: 'Resumen',
    text: 'Vista rápida del dinero de la orden: rate, descuento y neto, y las millas con rate por milla.',
    tip: 'El rate por milla = rate ÷ (millas cargadas + DH).',
  },
  'order.discount': {
    title: 'Descuento',
    text: 'Porcentaje que se le descuenta a la orden para sacar el neto del camión. Si lo desmarcas, la orden no lleva descuento.',
    tip: 'El % por defecto viene del camión.',
  },
  'order.route': {
    title: 'Ruta',
    text: 'Todas las paradas de la carga en orden, con las millas de cada tramo.',
  },
  'order.rc': {
    title: 'Rate Confirmation (RC)',
    text: 'El documento del broker con las condiciones de la carga. Se guarda con la orden.',
    steps: [
      'Arrastra el archivo aquí o presiona para elegirlo.',
      'Necesitas escribir el MC# del broker para poder subirlo.',
    ],
  },
  'order.docs': {
    title: 'Documentos (RC y POD)',
    text: 'RC = confirmación de la carga. POD = prueba de entrega firmada.',
    steps: [
      'Sube el RC al crear la carga.',
      'Cuando entreguen, sube el POD.',
      'Con el POD puedes pasar la orden a Facturada.',
    ],
    tip: 'Puedes arrastrar los archivos. El visor permite verlos en grande y descargarlos.',
  },
  'order.invoice': {
    title: 'Invoice',
    text: 'Genera la factura lista para enviar: factura + RC + POD en un solo PDF.',
    steps: [
      'Presiona "Invoice".',
      'Con los interruptores eliges qué secciones mostrar y a quién enviar.',
      'Imprime, descarga o envíala por correo con copia.',
    ],
    tip: 'Si cambias la orden después, presiona "Regenerar".',
  },
  'order.tonu': {
    title: 'TONU',
    text: 'Truck Order Not Used: el broker canceló y te paga algo por el camión que llegó. Escribe el monto y queda pagada.',
  },
  'order.delete': {
    title: 'Eliminar orden',
    text: 'Borra la orden para siempre y devuelve su dinero del balance si estaba pagada. No se puede deshacer.',
  },

  // ───────────── Recibos / gastos ─────────────
  'receipt.modal': {
    title: 'Agregar gasto',
    text: 'Aquí registras cualquier gasto del camión. Hay cuatro tipos: Diesel, DEF, Gasto (peajes, reparaciones…) y Pago Chofer.',
    steps: [
      'Escanea el recibo, o llena los datos a mano.',
      'Elige el tipo de cada línea.',
      'Confirma. Se resta del balance del camión.',
    ],
  },
  'receipt.scan': {
    title: 'Escanear recibos',
    text: 'Toma una foto o sube un PDF y la IA lee fecha, ciudad, galones y monto. Puedes tener varios recibos en una sola foto.',
    steps: [
      'Presiona el botón morado, o arrastra la foto encima.',
      'Revisa cada línea que detectó.',
      'Corrige lo que esté mal y confirma.',
    ],
    tip: 'La foto del recibo se guarda con el gasto y la puedes ver después.',
  },
  'receipt.types': {
    bullets: true,
    title: 'Tipos de gasto',
    steps: [
      'Diesel: combustible, con galones y valor.',
      'DEF: fluido del escape, con galones y valor.',
      'Gasto: cualquier otro (peajes, reparación, hospedaje…) con categoría.',
      'Pago Chofer: lo que se le paga al conductor.',
    ],
  },

  // ───────────── Pagos ─────────────
  'pagos.page': {
    title: 'Pagos',
    text: 'Aquí le pagas a dispatchers y conductores lo que ganaron por sus cargas, y ves el historial de pagos.',
  },
  'pagoDispatchers.page': {
    title: 'Pago Dispatchers',
    text: 'Calcula y registra lo que se le paga a cada dispatcher (comisión) por las órdenes que consiguió.',
    steps: [
      'Presiona un dispatcher.',
      '"Nuevo pago": selecciona las órdenes a pagar (solo salen las pagadas).',
      'Revisa el settlement (el documento del pago) y envíalo por correo.',
    ],
    tip: 'Una orden solo se puede pagar una vez.',
  },
  'pagoConductores.page': {
    title: 'Pago Conductores',
    text: 'Calcula y registra lo que se le paga a cada conductor según su modo de pago: monto fijo, porcentaje o por milla.',
    steps: [
      'Presiona un conductor.',
      '"Nuevo pago": selecciona las órdenes a pagar.',
      'Revisa el settlement y envíalo por correo.',
    ],
    tip: 'El modo de pago se configura en Perfiles.',
  },
  'payment.eligible': {
    title: 'Órdenes que se pueden pagar',
    text: 'Solo se pagan las órdenes ya cobradas (marcadas como pagadas). Las que no, salen bloqueadas con un candado en "Pendientes de pago".',
  },
  'payment.history': {
    title: 'Historial de pagos',
    text: 'Cada tarjeta es un pago hecho. Presiónala para ver las órdenes que incluyó, o abre el settlement completo.',
  },
  'payment.settlement': {
    title: 'Settlement',
    text: 'El documento del pago: lista las órdenes, el total y la comisión. Se manda en PDF por correo.',
    steps: [
      'Revisa la vista previa.',
      'Presiona "Regenerar" si cambiaste algo.',
      'Envíalo por correo al dispatcher o conductor.',
    ],
  },
  'paymentHistory.page': {
    title: 'Historial de Pagos',
    text: 'Aquí ves los pagos que te ha hecho la empresa. Presiona uno para ver sus órdenes, y baja el settlement en PDF.',
  },

  // ───────────── Conductores ─────────────
  'drivers.page': {
    title: 'Conductores',
    text: 'Los choferes de la empresa con su camión asignado y sus documentos (licencia, tarjeta médica).',
  },

  // ───────────── Compañía ─────────────
  'company.page': {
    title: 'Información de la Compañía',
    text: 'Los datos de tu empresa, que salen en las facturas y documentos.',
    steps: [
      'Información: nombre, MC#, DOT#, dirección.',
      'Facturación: Bill From, Remit To (a dónde te pagan) y el logo.',
      'Choferes y Camiones: documentos y vencimientos.',
    ],
    tip: 'Los botones Guardar se activan solo cuando cambias algo.',
  },
  'company.info': {
    title: 'Datos de la empresa',
    text: 'Nombre, DBA, EIN, MC#, DOT#, dirección y contacto. El nombre y el DBA aparecen en el menú lateral y en las facturas.',
  },
  'company.billing': {
    title: 'Facturación',
    text: 'Bill From = quién factura. Remit To = a dónde deben depositarle. Con el correo de Remit To se envían las facturas. El logo aparece en el invoice.',
  },
  'company.docs': {
    title: 'Documentos de la empresa',
    text: 'Guarda aquí los papeles generales de la empresa (seguro, permisos, contratos) para tenerlos a la mano. Puedes verlos, descargarlos o eliminarlos.',
  },
  'company.drivers': {
    title: 'Choferes',
    text: 'Registra cada chofer con licencia y tarjeta médica. Verás avisos cuando un documento esté por vencer.',
    steps: [
      'Presiona agregar chofer.',
      'Sube sus documentos.',
      'Asígnalo a un camión desde el Dashboard.',
    ],
  },
  'company.trucks': {
    title: 'Camiones',
    text: 'Documentos de cada camión: placas, cab card, fotos y VIN.',
  },

  // ───────────── Perfiles ─────────────
  'profiles.page': {
    title: 'Perfiles de usuario',
    text: 'Aquí das acceso a la app a tu equipo y decides qué puede hacer cada quien.',
    steps: [
      'Invitar: se le manda un correo para crear su contraseña.',
      'Presiona un usuario para editar sus permisos, camiones y comisión.',
      '"Reenviar" manda la invitación otra vez (puedes corregir el correo).',
    ],
    tip: 'Punto verde = activo, amarillo = invitación enviada, rojo = expirada.',
  },
  'profiles.permissions': {
    title: 'Permisos',
    text: 'Elige a qué módulos entra el usuario y qué puede hacer en cada uno. Al activar un módulo se activan todas sus opciones; luego puedes quitar las que no quieras.',
  },

  // ───────────── Mantenimiento ─────────────
  'maintenance.page': {
    title: 'Mantenimiento',
    text: 'Lleva la cuenta de las millas de cada camión para avisarte cuándo toca su mantenimiento.',
    steps: [
      'Abre un camión y configura cada cuántas millas toca servicio.',
      'La barra se pone amarilla cuando se acerca y roja cuando se pasó.',
      'Al hacerlo, presiona "Registrar mantenimiento hecho" y el contador vuelve a cero.',
    ],
    tip: 'Las millas se toman de las órdenes en tránsito, entregadas, facturadas o pagadas.',
  },
  'notifications.page': {
    title: 'Notificaciones',
    text: 'Avisos de mantenimiento de tus camiones. Los no leídos aparecen primero y en la campanita de arriba.',
  },

  // ───────────── Reportes ─────────────
  'reportes.page': {
    title: 'Reportes',
    text: 'Informes de la empresa: IFTA (impuesto de combustible por estado) y la Auditoría.',
  },
  'ifta.page': {
    title: 'IFTA',
    text: 'Reporte trimestral de millas y diesel por estado para el impuesto de combustible. Solo cuentan los camiones dry van marcados con IFTA.',
    steps: [
      'Elige el trimestre.',
      'Revisa las millas por estado y el diesel comprado.',
      'Descarga el Excel o el PDF para presentarlo.',
    ],
  },
  'audit.page': {
    title: 'Auditoría',
    text: 'Registro de todo lo que se hace en la app: quién, qué y cuándo. Sirve para saber quién cambió o borró algo.',
    tip: 'Las acciones sobre dinero muestran el balance antes y después.',
  },
  'stats.page': {
    title: 'Estadísticas',
    text: 'Mapa de conexiones de tus rutas (filtra por fecha y chofer), calculadora de precios basada en tu histórico y estadísticas por ciudad.',
  },

  // ───────────── Ajustes ─────────────
  'settings.page': {
    title: 'Configuración',
    text: 'Elige el color de la aplicación y, si eres administrador, activa módulos extra de la empresa como IFTA.',
  },

  // ───────────── Préstamos ─────────────
  'prestamos.page': {
    title: 'Préstamos',
    text: 'La caja de cada dispatcher y admin: lo que entra (sus pagos de comisión y sus abonos) menos lo que se le envía (envíos y préstamos). Si entró un pago de $500 y se le enviaron $100, en caja quedan $400.',
    steps: [
      'Ingresos: cada pago de comisión de Pago Dispatchers entra solo y muestra cuánto se envió y cuánto queda.',
      'Historial: cada movimiento y cómo quedó la caja después de él.',
      'Para pedir un envío o un préstamo, o avisar de un abono, habla con el super admin: él lo registra.',
    ],
    tip: 'Solo el super admin envía dinero, registra préstamos y abonos y ve la caja de todos.',
  },
}
