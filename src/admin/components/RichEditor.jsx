import { useEffect, useRef, useState } from 'react'
import { cleanHtml } from '../lib/richText.js'
import './rich-editor.css'

// A small word processor for a Support page section (Admin → Support →
// Support pages): type straight into the box and dress it up from the
// toolbar — bold, italic, underline, headings, size, colour, highlight,
// lists, alignment, links, a line, extra space. What it saves is HTML,
// cleaned (lib/richText.js) both here and again on the shop.
//
// The box keeps its own content while it's being typed in (so the cursor
// never jumps); a new value from outside — the section moved, or "Back to
// default" — is put in only while the box isn't being edited.

const COLOURS = ['#16160f', '#6b6b63', '#2a4dff', '#ff4426', '#1f8a4c', '#b7791f', '#7c3aed']
const MARKS = ['#fff3a3', '#d7e3ff', '#ffd9d2', '#d8f3e2', 'transparent']
const SIZES = [
  ['Small', '12px'],
  ['Normal', ''],
  ['Large', '17px'],
  ['Bigger', '21px'],
  ['Huge', '28px'],
]

function run(cmd, value = null) {
  document.execCommand('styleWithCSS', false, true)
  document.execCommand(cmd, false, value)
}

export default function RichEditor({ value, onChange, placeholder = 'Write here…' }) {
  const box = useRef(null)
  const [menu, setMenu] = useState('') // '' | 'colour' | 'mark' | 'size'
  const [state, setState] = useState({})

  // Put an outside value in, unless it's what's already there or the box
  // is being typed in.
  useEffect(() => {
    const el = box.current
    if (!el) return
    if (document.activeElement === el) return
    if (el.innerHTML !== (value || '')) el.innerHTML = value || ''
  }, [value])

  function changed() {
    const el = box.current
    if (!el) return
    const html = el.innerHTML
    // An emptied box can leave a lone <br>: that's no content at all.
    onChange(el.textContent.trim() || el.querySelector('hr, li') ? html : '')
  }

  // Which buttons light up for where the cursor is.
  function refresh() {
    try {
      setState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strike: document.queryCommandState('strikeThrough'),
        ul: document.queryCommandState('insertUnorderedList'),
        ol: document.queryCommandState('insertOrderedList'),
        block: String(document.queryCommandValue('formatBlock') || '').toLowerCase(),
        left: document.queryCommandState('justifyLeft'),
        center: document.queryCommandState('justifyCenter'),
        right: document.queryCommandState('justifyRight'),
        full: document.queryCommandState('justifyFull'),
      })
    } catch { /* not focused */ }
  }

  useEffect(() => {
    const on = () => { if (box.current?.contains(document.getSelection()?.anchorNode)) refresh() }
    document.addEventListener('selectionchange', on)
    return () => document.removeEventListener('selectionchange', on)
  }, [])

  // Toolbar buttons keep the selection in the box: pressing one mustn't
  // take the focus away from the words picked.
  const keep = (e) => e.preventDefault()
  function act(cmd, val) {
    box.current?.focus()
    run(cmd, val)
    changed()
    refresh()
  }

  function block(tag) {
    act('formatBlock', state.block === tag ? '<p>' : `<${tag}>`)
  }

  // Size: the browser only knows 1–7, so mark the words with 7 and turn
  // that into a real size.
  function size(px) {
    setMenu('')
    box.current?.focus()
    document.execCommand('styleWithCSS', false, false)
    document.execCommand('fontSize', false, '7')
    box.current?.querySelectorAll('font[size="7"]').forEach((f) => {
      const span = document.createElement('span')
      if (px) span.style.fontSize = px
      span.innerHTML = f.innerHTML
      f.replaceWith(span)
    })
    // Inner sizes set earlier would win over this one: let go of them.
    if (px === '') box.current?.querySelectorAll('span[style*="font-size"]:empty').forEach((s) => s.remove())
    changed()
  }

  function link() {
    const sel = document.getSelection()
    const had = sel && !sel.isCollapsed
    const url = window.prompt('Link to (https://…, /shop, mailto:… or tel:…)', 'https://')
    if (!url || url === 'https://') return
    box.current?.focus()
    if (had) run('createLink', url)
    else run('insertHTML', `<a href="${url.replace(/"/g, '&quot;')}">${url.replace(/</g, '&lt;')}</a>`)
    changed()
  }

  function space() {
    act('insertHTML', '<p><br></p>')
  }

  // Pasting from Word or a web page: kept to formatting this page can show.
  function paste(e) {
    const html = e.clipboardData?.getData('text/html')
    if (!html) return
    e.preventDefault()
    run('insertHTML', cleanHtml(html))
    changed()
  }

  const B = ({ on, title, onPress, children, wide }) => (
    <button
      type="button"
      className={`re-btn ${on ? 'on' : ''} ${wide ? 'wide' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={on || undefined}
      onMouseDown={keep}
      onClick={onPress}
    >
      {children}
    </button>
  )

  return (
    <div className="re">
      <div className="re-bar" role="toolbar" aria-label="Formatting">
        <span className="re-group">
          <B title="Paragraph" on={state.block === 'p' || state.block === 'div'} onPress={() => act('formatBlock', '<p>')} wide>Text</B>
          <B title="Heading" on={state.block === 'h2'} onPress={() => block('h2')} wide>H1</B>
          <B title="Sub-heading" on={state.block === 'h3'} onPress={() => block('h3')} wide>H2</B>
          <B title="Small heading" on={state.block === 'h4'} onPress={() => block('h4')} wide>H3</B>
        </span>
        <span className="re-group">
          <B title="Bold" on={state.bold} onPress={() => act('bold')}><b>B</b></B>
          <B title="Italic" on={state.italic} onPress={() => act('italic')}><i>I</i></B>
          <B title="Underline" on={state.underline} onPress={() => act('underline')}><u>U</u></B>
          <B title="Strikethrough" on={state.strike} onPress={() => act('strikeThrough')}><s>S</s></B>
        </span>
        <span className="re-group re-pop-wrap">
          <B title="Text size" on={menu === 'size'} onPress={() => setMenu(menu === 'size' ? '' : 'size')} wide>Size ▾</B>
          {menu === 'size' && (
            <span className="re-pop">
              {SIZES.map(([name, px]) => (
                <button key={name} type="button" className="re-pop-item" onMouseDown={keep} onClick={() => size(px)} style={px ? { fontSize: px } : undefined}>{name}</button>
              ))}
            </span>
          )}
          <B title="Text colour" on={menu === 'colour'} onPress={() => setMenu(menu === 'colour' ? '' : 'colour')}><span className="re-a">A</span></B>
          {menu === 'colour' && (
            <span className="re-pop re-swatches">
              {COLOURS.map((c) => (
                <button key={c} type="button" className="re-swatch" style={{ background: c }} aria-label={`Colour ${c}`} onMouseDown={keep} onClick={() => { setMenu(''); act('foreColor', c) }} />
              ))}
            </span>
          )}
          <B title="Highlight" on={menu === 'mark'} onPress={() => setMenu(menu === 'mark' ? '' : 'mark')}><span className="re-mark">ab</span></B>
          {menu === 'mark' && (
            <span className="re-pop re-swatches">
              {MARKS.map((c) => (
                <button key={c} type="button" className={`re-swatch ${c === 'transparent' ? 'none' : ''}`} style={{ background: c === 'transparent' ? '#fff' : c }} aria-label={c === 'transparent' ? 'No highlight' : `Highlight ${c}`} onMouseDown={keep} onClick={() => { setMenu(''); act('hiliteColor', c) }} />
              ))}
            </span>
          )}
        </span>
        <span className="re-group">
          <B title="Bullet list" on={state.ul} onPress={() => act('insertUnorderedList')}>••</B>
          <B title="Numbered list" on={state.ol} onPress={() => act('insertOrderedList')}>1.</B>
          <B title="Indent less" onPress={() => act('outdent')}>⇤</B>
          <B title="Indent more" onPress={() => act('indent')}>⇥</B>
        </span>
        <span className="re-group">
          <B title="Align left" on={state.left} onPress={() => act('justifyLeft')}>⯇</B>
          <B title="Centre" on={state.center} onPress={() => act('justifyCenter')}>≡</B>
          <B title="Align right" on={state.right} onPress={() => act('justifyRight')}>⯈</B>
          <B title="Justify" on={state.full} onPress={() => act('justifyFull')}>☰</B>
        </span>
        <span className="re-group">
          <B title="Quote" on={state.block === 'blockquote'} onPress={() => block('blockquote')}>❝</B>
          <B title="Link" onPress={link}>🔗</B>
          <B title="Remove link" onPress={() => act('unlink')}>⛓︎̸</B>
          <B title="A line across" onPress={() => act('insertHorizontalRule')}>―</B>
          <B title="Add space" onPress={space} wide>+ Space</B>
        </span>
        <span className="re-group">
          <B title="Clear formatting" onPress={() => { act('removeFormat'); act('formatBlock', '<p>') }} wide>Clear</B>
          <B title="Undo" onPress={() => act('undo')}>↶</B>
          <B title="Redo" onPress={() => act('redo')}>↷</B>
        </span>
      </div>
      <div
        ref={box}
        className="re-box rich-text"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        data-lenis-prevent
        onInput={changed}
        onPaste={paste}
        onKeyUp={refresh}
        onMouseUp={refresh}
        onFocus={() => setMenu('')}
      />
    </div>
  )
}
