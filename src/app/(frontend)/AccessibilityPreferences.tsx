'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type TextSize = 'standard' | 'larger' | 'largest'
type ReadingState = 'idle' | 'reading' | 'paused'
const preferenceKey = 'tickwatch-accessibility-v1'
const textOptions: { value: TextSize; label: string; percentage: string }[] = [
  { value: 'standard', label: 'Standard', percentage: '100%' },
  { value: 'larger', label: 'Larger', percentage: '112.5%' },
  { value: 'largest', label: 'Largest', percentage: '125%' },
]
const PreferencesContext = createContext<{
  textSize: TextSize; setTextSize: (value: TextSize) => void
  highContrast: boolean; setHighContrast: (value: boolean) => void
  supported: boolean; reading: ReadingState; speechMessage: string; storageAvailable: boolean
  read: () => void; pause: () => void; resume: () => void; stop: () => void; reset: () => void
} | null>(null)

function usePreferences() {
  const preferences = useContext(PreferencesContext)
  if (!preferences) throw new Error('Accessibility preferences require their provider.')
  return preferences
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [textSize, setTextSize] = useState<TextSize>('standard')
  const [highContrast, setHighContrast] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [supported, setSupported] = useState(false)
  const [reading, setReading] = useState<ReadingState>('idle')
  const [speechMessage, setSpeechMessage] = useState('')
  const session = useRef(0)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    window.speechSynthesis?.getVoices() // Start loading voices before the first click.
    setSupported(typeof window.speechSynthesis?.speak === 'function' && typeof window.SpeechSynthesisUtterance === 'function')
    try {
      let saved: { textSize?: TextSize; highContrast?: boolean } | null = null
      const raw = localStorage.getItem(preferenceKey)
      try { saved = JSON.parse(raw || 'null') } catch { /* Ignore a malformed saved preference. */ }
      const savedSize = saved?.textSize
      if (savedSize && textOptions.some(option => option.value === savedSize)) setTextSize(savedSize)
      if (typeof saved?.highContrast === 'boolean') setHighContrast(saved.highContrast)
    } catch { setStorageAvailable(false) }
    setHydrated(true)
    return () => {
      session.current++
      if (utteranceRef.current) window.speechSynthesis?.cancel()
      delete document.documentElement.dataset.textSize
      delete document.documentElement.dataset.contrast
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    document.documentElement.dataset.textSize = textSize
    document.documentElement.dataset.contrast = highContrast ? 'high' : 'standard'
    try { localStorage.setItem(preferenceKey, JSON.stringify({ textSize, highContrast })) }
    catch { setStorageAvailable(false) }
  }, [textSize, highContrast, hydrated])

  const stop = useCallback(() => {
    session.current++
    if (utteranceRef.current) window.speechSynthesis?.cancel()
    utteranceRef.current = null
    setReading('idle')
    setSpeechMessage('Reading stopped.')
  }, [])

  async function read() {
    if (!supported) return
    const guide = document.querySelector('[data-educational-guide]')
    const content = guide ? [...guide.querySelectorAll('h2,h3,p,li')]
      .filter(element => !element.closest('[data-speech-controls]'))
      .map(element => element.textContent?.trim()).filter(Boolean).join(' ') : ''
    if (!content) { setSpeechMessage('The educational guide is not available to read yet.'); return }
    stop()
    if (window.speechSynthesis.paused) window.speechSynthesis.resume()
    const token = session.current
    let voices = window.speechSynthesis.getVoices()
    if (!voices.length) {
      setReading('reading'); setSpeechMessage('Loading the reading voice…')
      await new Promise<void>(resolve => {
        const finish = () => {
          clearTimeout(timer)
          window.speechSynthesis.removeEventListener('voiceschanged', finish)
          resolve()
        }
        const timer = setTimeout(finish, 1200)
        window.speechSynthesis.addEventListener('voiceschanged', finish)
      })
      if (token !== session.current) return
      voices = window.speechSynthesis.getVoices()
    }
    const britishVoices = voices.filter(voice => voice.lang.replace('_', '-').toLowerCase() === 'en-gb')
    // The Web Speech API has no gender metadata; recognise named UK female voices.
    const preferredNames = [/Google UK English Female/i, /Sonia/i, /Libby/i, /Serena/i, /Kate/i, /Hazel/i, /Stephanie/i, /female/i]
    const preferredVoice = preferredNames.map(pattern => britishVoices.find(voice => pattern.test(voice.name))).find(Boolean)
    const voice = preferredVoice ?? britishVoices[0] ?? voices.find(voice => /^en[-_]/i.test(voice.lang))
    const readingMessage = preferredVoice
      ? `Reading with ${preferredVoice.name}.`
      : 'Reading with an available voice. A UK female voice is not available on this device.'
    // Short utterances avoid long-read cutoffs in browser speech engines.
    const chunks: string[] = []
    let chunk = ''
    for (const word of content.split(/\s+/)) {
      if (chunk.length + word.length > 220) { chunks.push(chunk); chunk = '' }
      chunk += `${chunk ? ' ' : ''}${word}`
    }
    if (chunk) chunks.push(chunk)
    const speak = (index: number) => {
      if (token !== session.current) return
      if (index >= chunks.length) {
        utteranceRef.current = null
        setReading('idle'); setSpeechMessage('Finished reading the educational guide.')
        return
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index])
      utterance.lang = 'en-GB'
      if (voice) utterance.voice = voice
      utterance.rate = 0.95
      utterance.pitch = 1
      utterance.onstart = () => {
        if (token === session.current) { setReading('reading'); setSpeechMessage(readingMessage) }
      }
      utterance.onend = () => speak(index + 1)
      utterance.onerror = () => {
        if (token === session.current) {
          session.current++; utteranceRef.current = null
          setReading('idle'); setSpeechMessage('Read-aloud could not continue. Please try again or use the written guide.')
        }
      }
      utteranceRef.current = utterance
      try { window.speechSynthesis.speak(utterance) }
      catch {
        session.current++; utteranceRef.current = null
        setReading('idle'); setSpeechMessage('Read-aloud is unavailable. Please use the written guide.')
      }
    }
    setReading('reading'); setSpeechMessage('Starting the educational guide…')
    speak(0)
  }
  function pause() {
    if (reading !== 'reading') return
    window.speechSynthesis.pause(); setReading('paused'); setSpeechMessage('Reading paused.')
  }
  function resume() {
    if (reading !== 'paused') return
    window.speechSynthesis.resume(); setReading('reading'); setSpeechMessage('Reading the educational guide.')
  }
  function reset() {
    setTextSize('standard'); setHighContrast(false); stop()
  }

  return <PreferencesContext.Provider value={{ textSize, setTextSize, highContrast, setHighContrast, storageAvailable, supported, reading, speechMessage, read, pause, resume, stop, reset }}>{children}</PreferencesContext.Provider>
}

export function GuideReadAloud({ inPanel = false }: { inPanel?: boolean }) {
  const { supported, reading, speechMessage, read, pause, resume, stop } = usePreferences()
  return <div data-speech-controls className={inPanel ? '' : 'mt-6'}>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Educational guide audio">
      {reading === 'idle' ? <button type="button" className="min-h-11 rounded-lg border border-[#3b5146] px-4 py-2 text-sm font-semibold hover:bg-[#243a31] disabled:opacity-60" disabled={!supported} onClick={read}>Read guide aloud</button> : <>
        <button type="button" className="min-h-11 rounded-lg border border-[#3b5146] px-4 py-2 text-sm font-semibold hover:bg-[#243a31]" onClick={reading === 'paused' ? resume : pause}>{reading === 'paused' ? 'Resume reading' : 'Pause reading'}</button>
        <button type="button" className="min-h-11 rounded-lg border border-[#3b5146] px-4 py-2 text-sm font-semibold hover:bg-[#243a31]" onClick={stop}>Stop reading</button>
      </>}
    </div>
    <p role="status" aria-live="polite" className="mt-2 text-sm text-[#bccac3]">{!supported ? 'Read-aloud is unavailable in this browser. The written guide is available below.' : speechMessage || 'Listen to the guide'}</p>
  </div>
}

export function AccessibilityPanel() {
  const preferences = usePreferences()
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const close = () => {
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }
  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { dialog?.close() }
  }, [open])

  return <>
    <button ref={triggerRef} type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#a8b5aa] px-3 py-2 text-xs font-semibold text-[#92d9b5] hover:bg-[#243a31] sm:px-4 sm:text-sm">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="4" r="2"/><path d="m4 9 8 2 8-2M12 11v5m0 0-4 6m4-6 4 6"/></svg>Accessibility
    </button>
    {open && createPortal(<dialog ref={dialogRef} aria-labelledby="accessibility-title" aria-describedby="accessibility-description" onCancel={event => { event.preventDefault(); close() }} onKeyDown={event => {
      if (event.key !== 'Tab') return
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),a[href],[tabindex="0"]')].filter(element => element.getClientRects().length > 0)
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }} className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[540px] overflow-y-auto rounded-2xl border border-[#30443c] bg-[#172420] p-5 text-[#f5f8f6] shadow-2xl backdrop:bg-[#0f1d159e] backdrop:backdrop-blur-sm sm:p-7">
      <div className="flex items-start justify-between gap-4"><h2 id="accessibility-title" className="text-2xl font-semibold tracking-[-.04em]">Accessibility preferences</h2><button type="button" className="close shrink-0" aria-label="Close accessibility preferences" onClick={close}>×</button></div>
      <p id="accessibility-description" className="my-4 text-sm text-[#bccac3]">Adjust TickWatch to suit you. Display preferences are saved in this browser.</p>
      <fieldset className="border-t border-[#30443c] py-5"><legend className="px-1 text-base font-semibold">Text size</legend><div className="grid grid-cols-3 gap-2">
        {textOptions.map(option => <button type="button" key={option.value} aria-pressed={preferences.textSize === option.value} onClick={() => preferences.setTextSize(option.value)} className={`min-h-16 rounded-xl border px-2 py-3 text-sm ${preferences.textSize === option.value ? 'border-[#92d9b5] bg-[#243a31] font-bold text-[#92d9b5]' : 'border-[#30443c] bg-[#172420] text-[#bccac3]'}`}><span className="block">{option.label}</span><span className="mt-1 block text-xs">{option.percentage}</span></button>)}
      </div></fieldset>
      <div className="border-t border-[#30443c] py-5"><label className="flex cursor-pointer items-center justify-between gap-4 text-base font-semibold"><span>High contrast<span className="mt-1 block text-sm font-normal text-[#bccac3]">Stronger text, borders and focus indicators.</span></span><input type="checkbox" role="switch" checked={preferences.highContrast} onChange={event => preferences.setHighContrast(event.target.checked)} className="h-6 w-6 shrink-0 accent-[#92d9b5]"/></label></div>
      <section className="border-t border-[#30443c] py-5" aria-labelledby="read-aloud-title"><h3 id="read-aloud-title" className="mb-3 text-base font-semibold">Read-aloud educational guide</h3><GuideReadAloud inPanel/></section>
      {!preferences.storageAvailable && <p role="status" className="mb-4 text-sm">Browser storage is unavailable. Your display preferences apply for this visit.</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-[#30443c] pt-5"><button type="button" className="min-h-11 rounded-lg border border-[#3b5146] px-4 py-2 text-sm font-semibold hover:bg-[#243a31]" onClick={preferences.reset}>Reset preferences</button><button type="button" className="min-h-11 rounded-lg bg-[#92d9b5] px-5 py-2.5 text-sm font-semibold text-[#172420]" onClick={close}>Done</button></div>
    </dialog>, document.body)}
  </>
}
