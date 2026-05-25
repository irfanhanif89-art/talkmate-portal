'use client'

// Sessions 36-37 — photo capture for the driver job screen.
//
// Mobile-first. Uses a native <input type="file" capture="environment">
// which opens the OS camera on iOS/Android (no MediaStream API
// permission dance, no shutter UI to maintain). Each picked photo is
// compressed client-side via browser-image-compression before upload
// so a 5MB iPhone shot becomes ~300KB — critical on cellular.

import { useState } from 'react'
import imageCompression from 'browser-image-compression'

const BRAND = {
  orange: '#E8622A',
  navy: '#061322',
  grey: '#6b7280',
  blue: '#1565C0',
}

export interface PhotoCaptureProps {
  jobId: string
  photoType: 'pickup' | 'delivery' | 'damage'
  existingPhotos: { id: string; photo_url: string; caption: string | null }[]
  // Called when a photo finishes uploading so the parent can refresh
  // its photo count and gate buttons.
  onUploaded: () => void
}

export function PhotoCapture({
  jobId,
  photoType,
  existingPhotos,
  onUploaded,
}: PhotoCaptureProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const compressed = await imageCompression(file, {
          maxSizeMB: 1,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          fileType: 'image/jpeg',
        })
        const form = new FormData()
        form.append('file', compressed, compressed.name)
        form.append('photo_type', photoType)
        const res = await fetch(`/api/driver/jobs/${jobId}/photos`, {
          method: 'POST',
          body: form,
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? 'Upload failed')
        }
      }
      onUploaded()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 16px',
            background: BRAND.blue,
            color: '#fff',
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 600,
            cursor: uploading ? 'wait' : 'pointer',
            opacity: uploading ? 0.7 : 1,
            fontFamily: 'inherit',
          }}
        >
          <span aria-hidden>📷</span>
          {uploading ? 'Uploading…' : 'Take photo'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            disabled={uploading}
            onChange={e => handleFiles(e.target.files)}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
          />
        </label>
        <span style={{ fontSize: 13, color: BRAND.grey }}>
          {existingPhotos.length} captured
        </span>
      </div>

      {error && (
        <div style={{
          background: '#fee2e2',
          color: '#991b1b',
          border: '1px solid #fecaca',
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 13,
          marginBottom: 10,
        }}>{error}</div>
      )}

      {existingPhotos.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 4,
        }}>
          {existingPhotos.map(p => (
            <img
              key={p.id}
              src={p.photo_url}
              alt={p.caption ?? 'job photo'}
              style={{
                width: 88,
                height: 88,
                objectFit: 'cover',
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
