/**
 * PhotoUpload — drag-and-drop / click-to-browse photo uploader.
 * Props:
 *   file     : File | null
 *   onChange : (file: File | null) => void
 *   error    : string | null
 */
import { useRef, useState, useCallback } from 'react'

const MAX_MB = 5
const ACCEPT  = 'image/jpeg,image/png,image/webp'
const ACCEPT_EXT = ['jpg', 'jpeg', 'png', 'webp']

function validateFile(file) {
  if (!file) return null
  const ext = file.name.split('.').pop().toLowerCase()
  if (!ACCEPT_EXT.includes(ext)) return 'Only JPEG, PNG or WebP images are accepted.'
  if (file.size > MAX_MB * 1024 * 1024) return `Photo must be smaller than ${MAX_MB} MB.`
  return null
}

export default function PhotoUpload({ file, onChange, error: externalError }) {
  const inputRef   = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [preview,  setPreview]  = useState(null)
  const [localErr, setLocalErr] = useState(null)

  const error = localErr ?? externalError

  const handleFile = useCallback((f) => {
    if (!f) return
    const err = validateFile(f)
    if (err) { setLocalErr(err); return }
    setLocalErr(null)
    setPreview(URL.createObjectURL(f))
    onChange(f)
  }, [onChange])

  const onInputChange = (e) => handleFile(e.target.files?.[0])

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }

  const onRemove = () => {
    onChange(null)
    setPreview(null)
    setLocalErr(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Photo <span className="text-gray-400 font-normal">(optional — JPEG / PNG / WebP, max 5 MB)</span>
      </label>

      {preview ? (
        /* Preview state */
        <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
          <img
            src={preview}
            alt="Issue preview"
            className="w-full object-cover"
            style={{ maxHeight: '280px' }}
          />
          <button
            type="button"
            onClick={onRemove}
            className="absolute top-2 right-2 bg-white/90 hover:bg-white rounded-full p-1.5 shadow text-gray-600 hover:text-red-600 transition-colors"
            aria-label="Remove photo"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="px-3 py-2 text-xs text-gray-500 bg-white border-t border-gray-100">
            {file?.name} &mdash; {(file?.size / 1024 / 1024).toFixed(2)} MB
          </div>
        </div>
      ) : (
        /* Drop zone */
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`
            flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
            py-10 px-6 cursor-pointer transition-all duration-150
            ${dragging
              ? 'border-civic-500 bg-civic-50'
              : 'border-gray-300 bg-gray-50 hover:border-civic-400 hover:bg-civic-50/50'}
          `}
        >
          <div className="w-12 h-12 rounded-full bg-civic-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-civic-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">
              Drop your photo here, or <span className="text-civic-600">browse</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">JPEG · PNG · WebP · up to 5 MB</p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={onInputChange}
      />

      {error && (
        <p role="alert" className="text-sm text-red-600 flex items-center gap-1">
          <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  )
}
