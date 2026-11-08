/**
 * StepIndicator — horizontal progress stepper for the multi-step report form.
 * Props:
 *   steps   : string[]  — step labels
 *   current : number    — 0-based active step index
 */
export default function StepIndicator({ steps, current }) {
  return (
    <nav aria-label="Report progress" className="w-full">
      <ol className="flex items-center">
        {steps.map((label, idx) => {
          const done    = idx < current
          const active  = idx === current
          const future  = idx > current

          return (
            <li key={label} className="flex-1 flex items-center">
              {/* Circle + label */}
              <div className="flex flex-col items-center gap-1 min-w-0">
                <div
                  className={`
                    w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold
                    border-2 transition-all duration-200
                    ${done   ? 'bg-civic-600 border-civic-600 text-white' : ''}
                    ${active ? 'bg-white border-civic-600 text-civic-700 shadow-md' : ''}
                    ${future ? 'bg-white border-gray-300 text-gray-400' : ''}
                  `}
                >
                  {done ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>
                <span
                  className={`text-xs font-medium hidden sm:block
                    ${active ? 'text-civic-700' : done ? 'text-civic-600' : 'text-gray-400'}
                  `}
                >
                  {label}
                </span>
              </div>

              {/* Connector line (not after last step) */}
              {idx < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 rounded transition-colors duration-200 ${done ? 'bg-civic-600' : 'bg-gray-200'}`} />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
