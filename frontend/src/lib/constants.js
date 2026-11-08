/** Shared metadata maps used by multiple components */

export const CATEGORY_META = {
  pothole:     { label: 'Pothole',      icon: '🕳️', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  garbage:     { label: 'Garbage Dump', icon: '🗑️', color: 'bg-green-100  text-green-800  border-green-200'  },
  flooding:    { label: 'Flooding',     icon: '🌊', color: 'bg-blue-100   text-blue-800   border-blue-200'   },
  road_damage: { label: 'Road Damage',  icon: '🚧', color: 'bg-red-100    text-red-800    border-red-200'    },
  other:       { label: 'Other',        icon: '📍', color: 'bg-gray-100   text-gray-700   border-gray-200'   },
}

export const SEVERITY_META = {
  low:      { label: 'Low',      dot: 'bg-green-500',  badge: 'bg-green-50  text-green-700  border-green-200'  },
  medium:   { label: 'Medium',   dot: 'bg-amber-500',  badge: 'bg-amber-50  text-amber-700  border-amber-200'  },
  high:     { label: 'High',     dot: 'bg-red-500',    badge: 'bg-red-50    text-red-700    border-red-200'    },
  critical: { label: 'Critical', dot: 'bg-purple-600', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
}

export const STATUS_META = {
  pending:           { label: 'Pending',           color: 'bg-gray-100   text-gray-600   border-gray-200'   },
  classified:        { label: 'Classified',        color: 'bg-sky-100    text-sky-700    border-sky-200'    },
  dispatched:        { label: 'Dispatched',        color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  awaiting_approval: { label: 'Awaiting Approval', color: 'bg-amber-100  text-amber-700  border-amber-200'  },
  in_progress:       { label: 'In Progress',       color: 'bg-blue-100   text-blue-700   border-blue-200'   },
  resolved:          { label: 'Resolved',          color: 'bg-green-100  text-green-700  border-green-200'  },
  rejected:          { label: 'Rejected',          color: 'bg-red-100    text-red-700    border-red-200'    },
}

export const CATEGORIES = Object.entries(CATEGORY_META).map(([v, m]) => ({ value: v, label: m.label }))
export const SEVERITIES = Object.entries(SEVERITY_META).map(([v, m]) => ({ value: v, label: m.label }))
export const STATUSES   = Object.entries(STATUS_META).map(([v, m])   => ({ value: v, label: m.label }))
