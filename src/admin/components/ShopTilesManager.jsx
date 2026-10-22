import { useEffect, useMemo, useState } from 'react'
import { imgUrl } from '../lib/images.js'
import { fetchAllLooks } from '../lib/lookbook.js'
import { fetchSetting, saveSetting } from '../lib/siteSettings.js'
import InfoTip from './InfoTip.jsx'
import { IconX } from './Icons.jsx'
import './hero-manager.css'

export const SHOP_TILES_KEY = 'shop_tiles'
const MAX_TILES = 6

// Admin → Lookbook → Shop page tiles. Lookbook photos with a heading, shown
// big in the shop's grid after every 8 products so it doesn't read as one
// long run of products. None picked: the shop is a plain grid. Saved as
// site_settings 'shop_tiles': [{ look_id, image_url, drop, heading, focus }].
export default function ShopTilesManager() {
  const [tiles, setTiles] = useState([])
  const [looks, setLooks] = useState([])
  const [picking, setPicking] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    fetchSetting(SHOP_TILES_KEY).then(({ value }) => setTiles(Array.isArray(value) ? value : []))
    fetchAllLooks().then(({ looks }) => setLooks(looks.filter((l) => l.active)))
  }, [])

  async function save(next) {
    setTiles(next)
    const { error } = await saveSetting(SHOP_TILES_KEY, next)
    setNote(error ? "Couldn't save — try again." : 'Saved — live in the shop.')
  }

  const byDrop = useMemo(() => {
    const map = new Map()
    for (const l of looks) map.set(l.drop_name, [...(map.get(l.drop_name) || []), l])
    return [...map]
  }, [looks])

  const add = (l) => {
    save([...tiles, { look_id: l.id, image_url: l.image_url, drop: l.drop_name, heading: l.title || l.drop_name, focus: l.focus || null }])
    setPicking(false)
  }
  const move = (i, dir) => {
    const next = [...tiles]
    ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
    save(next)
  }

  return (
    <section className="hm-box wide st-box">
      <div className="hm-box-head">
        <span className="hm-box-title mono">SHOP PAGE TILES · {tiles.length}/{MAX_TILES}</span>
        <InfoTip>
          <p>Big lookbook photos in the <b>shop’s product grid</b>: one after every 8 products, in this order, each with your heading on it. They break up a long run of products and lead into the lookbook — tapping one opens that look with the products worn in it.</p>
          <p><b>+ Add a tile</b>, pick a lookbook photo, then type its heading (e.g. “The linen edit”). ↑ ↓ change the order; ✕ takes a tile off (the photo stays in the lookbook).</p>
          <p>No tiles: the shop is a plain product grid.</p>
        </InfoTip>
      </div>

      {tiles.length === 0 && <div className="empty mono">No tiles — the shop shows a plain grid.</div>}

      <div className="st-list">
        {tiles.map((t, i) => (
          <div className="st-tile" key={`${t.look_id}-${i}`}>
            <div className="st-img"><img src={imgUrl(t.image_url, { w: 300 })} alt="" style={{ objectPosition: t.focus || 'center' }} /></div>
            <div className="st-body">
              <span className="hm-flabel mono">AFTER {8 * (i + 1)} PRODUCTS · {t.drop}</span>
              <input
                className="st-heading"
                defaultValue={t.heading}
                maxLength={48}
                aria-label="Heading on the tile"
                onBlur={(e) => {
                  const heading = e.target.value.trim()
                  if (heading !== t.heading) save(tiles.map((x, j) => (j === i ? { ...x, heading } : x)))
                }}
              />
              <div className="hm-card-row mono">
                <span className="hm-move">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Earlier">↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === tiles.length - 1} aria-label="Later">↓</button>
                </span>
                <button type="button" className="hm-x" onClick={() => save(tiles.filter((_, j) => j !== i))} aria-label="Remove tile"><IconX width="13" height="13" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hm-actions">
        {tiles.length < MAX_TILES && (
          <button type="button" className="courier-btn mono" onClick={() => setPicking((v) => !v)} disabled={!looks.length}>
            {picking ? 'Cancel' : '+ Add a tile'}
          </button>
        )}
        {!looks.length && <span className="hm-note mono">Upload lookbook photos below first.</span>}
        {note && <span className="hm-note mono">{note}</span>}
      </div>

      {picking && (
        <div className="st-pick">
          {byDrop.map(([drop, ls]) => (
            <div key={drop}>
              <span className="hm-flabel mono">{drop}</span>
              <div className="st-pick-row">
                {ls.map((l) => (
                  <button type="button" key={l.id} onClick={() => add(l)} title={l.title || drop}>
                    <img src={imgUrl(l.image_url, { w: 160 })} alt="" style={{ objectPosition: l.focus || 'center' }} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
