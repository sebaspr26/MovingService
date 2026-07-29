import StatisticsMap from './StatisticsMap'
import RateCalculator from './RateCalculator'
import CityStats from './CityStats'

export default function Statistics() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Estad&iacute;sticas</h1>
        <p className="text-sm text-gray-500 mt-1">Mapa de rutas y calculadora de precios</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map - 2/3 */}
        <div className="lg:col-span-2 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">Mapa de Conexiones</h2>
            <p className="text-xs text-gray-500 mt-0.5">Filtra por fecha y chofer</p>
          </div>
          <div className="p-5">
            <StatisticsMap />
          </div>
        </div>

        {/* Calculator + City Stats - 1/3 */}
        <div className="space-y-6">
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden h-fit">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">Calculadora de Precios</h2>
              <p className="text-xs text-gray-500 mt-0.5">Basada en el historico</p>
            </div>
            <div className="p-5">
              <RateCalculator />
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white">Ciudades Frecuentes</h2>
              <p className="text-xs text-gray-500 mt-0.5">Recogidas y entregas por ciudad</p>
            </div>
            <div className="p-5">
              <CityStats />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
