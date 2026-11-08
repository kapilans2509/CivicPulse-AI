import { useContext } from 'react'
import { IssueContext } from './issueContext'

export function useIssues() {
  const ctx = useContext(IssueContext)
  if (!ctx) throw new Error('useIssues must be used within IssueProvider')
  return ctx
}
