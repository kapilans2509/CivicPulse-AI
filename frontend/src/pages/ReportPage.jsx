/**
 * ReportPage — multi-step civic issue reporting form.
 *
 * Steps:
 *   0 — Issue Details  (title, category hint, description)
 *   1 — Location       (Leaflet map + geolocation + manual fallback)
 *   2 — Photo          (drag-and-drop uploader, optional)
 *   3 — Review         (summary before submit)
 *
 * On success the page replaces itself with IssueConfirmationCard.
 */
import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import StepIndicator        from '../components/report/StepIndicator'
import LocationPicker       from '../components/report/LocationPicker'
import PhotoUpload          from '../components/report/PhotoUpload'
import IssueConfirmationCard from '../components/report/IssueConfirmationCard'
import { issuesApi }        from '../api/issues'

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = ['Details', 'Location', 'Photo', 'Review']

const ISSUE_TYPES = [
  { value: 'pothole',     label: 'Pothole',       icon: '🕳️', hint: 'Describe size, depth and road name' },
  { value: 'garbage',     label: 'Garbage Dump',  icon: '🗑️', hint: 'Describe volume, location and hazard' },
  { value: 'flooding',    label: 'Flooding',       icon: '🌊', hint: 'Describe water level and affected area' },
  { value: 'road_damage', label: 'Road Damage',    icon: '🚧', hint: 'Describe the damage extent and road name' },
  { value: 'other',       label: 'Other Issue',    icon: '📍', hint: 'Describe the civic issue in detail' },
]

const INITIAL_FORM = {
  typeHint:    '',          // client-side UX hint — not sent to backend
  title:       '',
  description: '',
  latitude:    null,
  longitude:   null,
  address:     null,
  photo:       null,
}

// ─── Field validation ─────────────────────────────────────────────────────────

function validateStep(step, form) {
  const errs = {}

  if (step === 0) {
    if (!form.typeHint)
      errs.typeHint = 'Please select an issue type.'
    if (!form.title.trim() || form.title.trim().length < 5)
      errs.title = 'Title must be at least 5 characters.'
    if (form.title.trim().length > 255)
      errs.title = 'Title must be 255 characters or fewer.'
    if (!form.description.trim() || form.description.trim().length < 10)
      errs.description = 'Description must be at least 10 characters.'
    if (form.description.trim().length > 2000)
      errs.description = 'Description must be 2 000 characters or fewer.'
  }

  if (step === 1) {
    if (form.latitude === null || form.longitude === null)
      errs.location = 'Please select a location on the map.'
  }

  // Step 2 (photo) is optional — no required validation
  return errs
}

// ─── Sub-step components ──────────────────────────────────────────────────────

function FieldError({ msg }) {
  if (!msg) return null
  return (
    <p role="alert" className="mt-1 text-sm text-red-600 flex items-center gap-1">
      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      {msg}
    </p>
  )
}

function StepDetails({ form, setForm, errors }) {
  const selectedType = ISSUE_TYPES.find((t) => t.value === form.typeHint)

  return (
    <div className="space-y-6">
      {/* Issue type picker */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Issue type <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {ISSUE_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setForm((f) => ({ ...f, typeHint: t.value }))}
              className={`
                flex items-center gap-2 px-3 py-3 rounded-xl border-2 text-left transition-all
                ${form.typeHint === t.value
                  ? 'border-civic-600 bg-civic-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'}
              `}
            >
              <span className="text-2xl leading-none">{t.icon}</span>
              <span className={`text-sm font-medium ${form.typeHint === t.value ? 'text-civic-800' : 'text-gray-700'}`}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
        <FieldError msg={errors.typeHint} />
      </div>

      {/* Title */}
      <div>
        <label htmlFor="issue-title" className="block text-sm font-medium text-gray-700 mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          id="issue-title"
          type="text"
          maxLength={255}
          placeholder={selectedType ? `e.g. ${selectedType.label} on Indiranagar 100 Ft Road` : 'Brief title for the issue'}
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className={`w-full border rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400
            focus:outline-none focus:ring-2 focus:ring-civic-500 focus:border-transparent transition
            ${errors.title ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'}`}
        />
        <div className="flex justify-between mt-1">
          <FieldError msg={errors.title} />
          <span className="text-xs text-gray-400 ml-auto">{form.title.length}/255</span>
        </div>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="issue-desc" className="block text-sm font-medium text-gray-700 mb-1">
          Description <span className="text-red-500">*</span>
        </label>
        {selectedType && (
          <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-civic-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Hint: {selectedType.hint}
          </p>
        )}
        <textarea
          id="issue-desc"
          rows={5}
          maxLength={2000}
          placeholder="Provide as much detail as possible — helps our AI classify and prioritise accurately"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className={`w-full border rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 resize-none
            focus:outline-none focus:ring-2 focus:ring-civic-500 focus:border-transparent transition
            ${errors.description ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'}`}
        />
        <div className="flex justify-between mt-1">
          <FieldError msg={errors.description} />
          <span className="text-xs text-gray-400 ml-auto">{form.description.length}/2000</span>
        </div>
      </div>
    </div>
  )
}

function StepReview({ form }) {
  const type = ISSUE_TYPES.find((t) => t.value === form.typeHint)

  const rows = [
    { label: 'Issue type',   value: type ? `${type.icon} ${type.label}` : '—' },
    { label: 'Title',        value: form.title },
    { label: 'Description',  value: form.description },
    { label: 'Coordinates',  value: form.latitude !== null ? `${form.latitude.toFixed(5)}, ${form.longitude.toFixed(5)}` : '—' },
    { label: 'Address',      value: form.address ?? 'Not resolved' },
    { label: 'Photo',        value: form.photo ? form.photo.name : 'No photo attached' },
  ]

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Please review your report before submitting. The AI agents will classify, prioritise and route it automatically.
      </p>
      <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex gap-4 px-4 py-3">
            <span className="text-xs font-medium text-gray-500 w-28 flex-shrink-0 pt-0.5">{label}</span>
            <span className="text-sm text-gray-900 break-words min-w-0">{value}</span>
          </div>
        ))}
      </div>
      {form.photo && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Attached photo preview</p>
          <img
            src={URL.createObjectURL(form.photo)}
            alt="Preview"
            className="rounded-xl border border-gray-200 w-full object-cover"
            style={{ maxHeight: '200px' }}
          />
        </div>
      )}
    </div>
  )
}

// ─── Main ReportPage ──────────────────────────────────────────────────────────

export default function ReportPage() {
  const [step,        setStep]        = useState(0)
  const [form,        setForm]        = useState(INITIAL_FORM)
  const [errors,      setErrors]      = useState({})
  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [submitted,   setSubmitted]   = useState(null) // IssueRead on success

  /* ── Navigation ── */

  const next = () => {
    const errs = validateStep(step, form)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    setStep((s) => s + 1)
  }

  const back = () => {
    setErrors({})
    setStep((s) => s - 1)
  }

  /* ── Location callback ── */

  const onLocationChange = useCallback(({ lat, lng, address }) => {
    setForm((f) => ({ ...f, latitude: lat, longitude: lng, address: address ?? f.address }))
  }, [])

  /* ── Submit ── */

  const submit = async () => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await issuesApi.create(
        {
          title:       form.title,
          description: form.description,
          latitude:    form.latitude,
          longitude:   form.longitude,
          address:     form.address,
        },
        form.photo,
      )
      setSubmitted(res.data)
    } catch (err) {
      setSubmitError(err.message ?? 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  /* ── Success state ── */

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <IssueConfirmationCard issue={submitted} />
        <div className="flex gap-3">
          <button
            onClick={() => {
              setSubmitted(null)
              setStep(0)
              setForm(INITIAL_FORM)
              setErrors({})
            }}
            className="flex-1 sm:flex-none px-5 py-2.5 bg-civic-600 text-white rounded-xl text-sm font-medium hover:bg-civic-700 transition-colors"
          >
            Report another issue
          </button>
          <Link
            to="/dashboard"
            className="flex-1 sm:flex-none px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors text-center"
          >
            View dashboard
          </Link>
        </div>
      </div>
    )
  }

  /* ── Multi-step form ── */

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Report a Civic Issue</h1>
        <p className="text-gray-500 text-sm mt-1">
          Your report will be automatically classified and routed to the correct BBMP department by our AI agents.
        </p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden">
        {/* Step header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <StepIndicator steps={STEPS} current={step} />
        </div>

        {/* Step body */}
        <div className="px-6 py-6">
          {step === 0 && (
            <StepDetails form={form} setForm={setForm} errors={errors} />
          )}
          {step === 1 && (
            <LocationPicker
              lat={form.latitude}
              lng={form.longitude}
              onChange={onLocationChange}
              error={errors.location ?? null}
            />
          )}
          {step === 2 && (
            <PhotoUpload
              file={form.photo}
              onChange={(f) => setForm((prev) => ({ ...prev, photo: f }))}
              error={null}
            />
          )}
          {step === 3 && <StepReview form={form} />}
        </div>

        {/* Navigation footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={back}
            disabled={step === 0}
            className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-xl
              hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Back
          </button>

          <div className="flex items-center gap-3">
            {submitError && (
              <p role="alert" className="text-sm text-red-600 max-w-xs text-right">{submitError}</p>
            )}

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                className="px-5 py-2 text-sm font-semibold text-white bg-civic-600 rounded-xl
                  hover:bg-civic-700 active:scale-95 transition-all"
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-2 text-sm font-semibold text-white bg-civic-600 rounded-xl
                  hover:bg-civic-700 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Submitting…
                  </>
                ) : (
                  'Submit Report'
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Step counter */}
      <p className="text-center text-xs text-gray-400 mt-4">
        Step {step + 1} of {STEPS.length}
      </p>
    </div>
  )
}
