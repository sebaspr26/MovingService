import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getAllCompanies, getCompanySettings, getActiveCompanyId, setActiveCompanyId } from '../lib/company'

const CompanyContext = createContext(null)

export function CompanyProvider({ children }) {
  const [companies, setCompanies] = useState([])
  const [activeCompany, setActiveCompany] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [all, active] = await Promise.all([
      getAllCompanies(),
      getCompanySettings(),
    ])
    setCompanies(all)
    setActiveCompany(active)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function switchCompany(id) {
    setActiveCompanyId(id)
    const company = await getCompanySettings(id)
    setActiveCompany(company)
    // Reload page to refresh all filtered data
    window.location.href = '/'
  }

  return (
    <CompanyContext.Provider value={{ companies, activeCompany, activeCompanyId: getActiveCompanyId(), loading, refresh, switchCompany }}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompany() {
  return useContext(CompanyContext)
}
