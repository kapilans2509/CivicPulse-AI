import { useState } from 'react'
import { IssueContext } from './issueContext'

export function IssueProvider({ children }) {
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  return (
    <IssueContext.Provider value={{ issues, setIssues, loading, setLoading, error, setError }}>
      {children}
    </IssueContext.Provider>
  )
}
