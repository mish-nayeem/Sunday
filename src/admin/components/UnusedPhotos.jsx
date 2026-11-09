import { useState } from 'react'
import { fetchUnused, deleteFiles } from '../lib/storageCleanup.js'

// Usage box → "Find unused photos": files in Storage that no product, slide,
// look, setting or order points to any more. Tick and delete; they go from
// Supabase Storage for good. Uploads from the last day are left alone (a
// form may not be saved yet).

const size = (b) => (b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`)
const isVideo = (name) => /\.(mp4|webm|mov)$/i.test(name)

export default function UnusedPhotos({ onDeleted }) {
  const [state, setState] = useState('idle') // idle | loading | ready | deleting
  const [files, setFiles] = useState([])
  const [picked, setPicked] = useState(new Set())
  const [note, setNote] = useState('')

  async function find() {
    setState('loading')
    setNote('')
    const { files: list, error } = await fetchUnused()
    if (error) {
      setState('idle')
      setNote(error === 'missing' ? 'Waiting for the database update (admin_storage_unused) — it goes out with this change.' : 'Couldn’t check right now. Try again in a moment.')
      return
    }
    setFiles(list)
    setPicked(new Set(list.map((f) => f.name)))
    setState('ready')
  }

  function toggle(name) {
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(name)) n.delete(name)
      else n.add(name)
      return n
    })
  }

  async function remove() {
    const names = [...picked]
    if (!names.length) return
    const bytes = files.filter((f) => picked.has(f.name)).reduce((a, f) => a + Number(f.bytes || 0), 0)
    if (!window.confirm(`Delete ${names.length} file${names.length === 1 ? '' : 's'} (${size(bytes)}) from Supabase Storage? This can’t be undone.`)) return
    setState('deleting')
    const { removed, error } = await deleteFiles(names)
    const left = files.filter((f) => !picked.has(f.name) || error)
    setFiles(error ? files : left)
    setPicked(new Set())
    setState('ready')
    setNote(error ? `Deleted ${removed}, then it stopped: ${error.message}` : `Deleted ${removed} file${removed === 1 ? '' : 's'} · ${size(bytes)} freed.`)
    if (removed) onDeleted?.()
  }

  // Link-preview copies (.share.jpg) ride along with their photo: the grid
  // shows one tile per photo, and ticking it picks both.
  const isShare = (n) => /\.share\.jpg$/i.test(n)
  const stem = (n) => n.replace(/(\.share)?\.[a-z0-9]+$/i, '')
  const groups = []
  const byStem = new Map()
  for (const f of files) {
    const k = stem(f.name)
    if (!byStem.has(k)) { byStem.set(k, { lead: f, all: [] }); groups.push(byStem.get(k)) }
    const g = byStem.get(k)
    g.all.push(f)
    if (isShare(g.lead.name) && !isShare(f.name)) g.lead = f
  }
  const total = files.reduce((a, f) => a + Number(f.bytes || 0), 0)
  const pickedBytes = files.filter((f) => picked.has(f.name)).reduce((a, f) => a + Number(f.bytes || 0), 0)

  function toggleGroup(g) {
    const on = g.all.every((f) => picked.has(f.name))
    setPicked((s) => {
      const n = new Set(s)
      g.all.forEach((f) => (on ? n.delete(f.name) : n.add(f.name)))
      return n
    })
  }

  return (
    <div className="up-wrap">
      <div className="ub-line">
        <span>Unused photos</span>
        {state === 'idle' || state === 'loading' ? (
          <button type="button" className="up-btn mono" disabled={state === 'loading'} onClick={find}>{state === 'loading' ? 'Checking…' : 'Find unused photos'}</button>
        ) : (
          <span className="mono">{files.length} file{files.length === 1 ? '' : 's'} · {size(total)}</span>
        )}
      </div>
      {note && <div className="ub-note mono">{note}</div>}

      {state !== 'idle' && state !== 'loading' && (
        files.length === 0 ? (
          <div className="ab-empty mono">Nothing unused — every file in Storage is in use.</div>
        ) : (
          <>
            <div className="up-bar mono">
              <button type="button" onClick={() => setPicked(picked.size === files.length ? new Set() : new Set(files.map((f) => f.name)))}>
                {picked.size === files.length ? 'Select none' : 'Select all'}
              </button>
              <button type="button" className="up-del" disabled={!picked.size || state === 'deleting'} onClick={remove}>
                {state === 'deleting' ? 'Deleting…' : `Delete selected · ${size(pickedBytes)}`}
              </button>
              <button type="button" onClick={find} disabled={state === 'deleting'}>Check again</button>
            </div>
            <ul className="up-grid">
              {groups.map((g) => {
                const on = g.all.every((f) => picked.has(f.name))
                const bytes = g.all.reduce((a, f) => a + Number(f.bytes || 0), 0)
                return (
                  <li key={g.lead.name} className={on ? 'on' : ''}>
                    <label>
                      <input type="checkbox" checked={on} onChange={() => toggleGroup(g)} />
                      {isVideo(g.lead.name) ? <video src={g.lead.url} muted preload="metadata" /> : <img src={g.lead.url} alt="" loading="lazy" />}
                      <span className="mono" title={g.lead.name}>{g.lead.name.split('/')[0]} · {size(bytes)}</span>
                    </label>
                    <a className="mono" href={g.lead.url} target="_blank" rel="noreferrer">open ↗</a>
                  </li>
                )
              })}
            </ul>
          </>
        )
      )}
    </div>
  )
}
