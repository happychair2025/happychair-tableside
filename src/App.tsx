import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import type {
  Venue,
  Asset,
  RequestCategory,
  SentimentScore,
  AllergenSeverity,
} from './types'

type Screen = 'loading' | 'error' | 'main' | 'allergen' | 'sentiment' | 'success'

function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [venue, setVenue] = useState<Venue | null>(null)
  const [asset, setAsset] = useState<Asset | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [sentimentScore, setSentimentScore] = useState<SentimentScore | null>(null)
  const [submitError, setSubmitError] = useState('')
  const [appError, setAppError] = useState<string | null>(null)

  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([])
  const [allergenSeverity, setAllergenSeverity] = useState<AllergenSeverity>('mild')
  const [allergenNotes, setAllergenNotes] = useState('')
  const [cooldowns, setCooldowns] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  const venueId = new URLSearchParams(window.location.search).get('venue')
  const assetId = new URLSearchParams(window.location.search).get('table')

  useEffect(() => {
    if (!venueId || !assetId) {
      setAppError('invalid_qr')
      setLoading(false)
      return
    }

    async function loadData() {
      setLoading(true)
      try {
        const [venueResult, assetResult] = await Promise.all([
          supabase.from('venues').select('*').eq('id', venueId).maybeSingle(),
          supabase.from('assets').select('*').eq('id', assetId).maybeSingle(),
        ])

        if (venueResult.error || !venueResult.data) {
          setAppError('venue_not_found')
          setLoading(false)
          return
        }

        if (assetResult.error || !assetResult.data) {
          setAppError('asset_not_found')
          setLoading(false)
          return
        }

        setVenue(venueResult.data)
        setAsset(assetResult.data)
        setScreen('main')
        setLoading(false)
      } catch (err) {
        console.error('Load error:', err)
        setErrorMessage('Something went wrong — please try again')
        setScreen('error')
        setLoading(false)
      }
    }

    loadData()
  }, [venueId, assetId])

  const isCoolingDown = (key: string) => !!cooldowns[key]

  const startCooldown = (key: string) => {
    setCooldowns(prev => ({ ...prev, [key]: true }))
    setTimeout(() => {
      setCooldowns(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }, 3000)
  }

  const handleRequestCheck = async () => {
    if (isCoolingDown('check')) return
    startCooldown('check')
    if (!venueId || !assetId) return
    setSubmitError('')
    const { error } = await supabase.from('requests').insert({
      venue_id: venueId,
      asset_id: assetId,
      category: 'check_please',
      status: 'pending',
    })
    if (error) { setSubmitError('Failed to send request. Please try again.'); return }
    setScreen('success')
    setTimeout(() => setScreen('main'), 3000)
  }

  const handleRequestWater = async () => {
    if (isCoolingDown('water')) return
    startCooldown('water')
    if (!venueId || !assetId) return
    setSubmitError('')
    const { error } = await supabase.from('requests').insert({
      venue_id: venueId,
      asset_id: assetId,
      category: 'water',
      status: 'pending',
    })
    if (error) { setSubmitError('Failed to send request. Please try again.'); return }
    setScreen('success')
    setTimeout(() => setScreen('main'), 3000)
  }

  const handleRequestServer = async () => {
    if (isCoolingDown('server')) return
    startCooldown('server')
    if (!venueId || !assetId) return
    setSubmitError('')
    const { error } = await supabase.from('requests').insert({
      venue_id: venueId,
      asset_id: assetId,
      category: 'waiter',
      status: 'pending',
    })
    if (error) { setSubmitError('Failed to send request. Please try again.'); return }
    setScreen('success')
    setTimeout(() => setScreen('main'), 3000)
  }

  const handleRequestPlates = async () => {
    if (isCoolingDown('plates')) return
    startCooldown('plates')
    if (!venueId || !assetId) return
    setSubmitError('')
    const { error } = await supabase.from('requests').insert({
      venue_id: venueId,
      asset_id: assetId,
      category: 'clear',
      status: 'pending',
    })
    if (error) { setSubmitError('Failed to send request. Please try again.'); return }
    setScreen('success')
    setTimeout(() => setScreen('main'), 3000)
  }

  const handleServiceRequest = async (category: RequestCategory) => {
    if (!venueId || !assetId) return

    if (category === 'allergen') {
      setScreen('allergen')
      return
    }

    if (category === 'critical') {
      setSubmitError('')
      const { error } = await supabase.from('requests').insert({
        venue_id: venueId,
        asset_id: assetId,
        category: 'critical',
        status: 'pending',
      })
      if (error) { setSubmitError('Failed to send request. Please try again.'); return }
      setScreen('success')
      setTimeout(() => setScreen('main'), 3000)
      return
    }

    setSubmitError('')
    const { error } = await supabase.from('requests').insert({
      venue_id: venueId,
      asset_id: assetId,
      category,
      status: 'pending',
    })
    if (error) { setSubmitError('Failed to send request. Please try again.'); return }
    setScreen('success')
    setTimeout(() => setScreen('main'), 3000)
  }

  const handleAllergenSubmit = async () => {
    if (!venueId || !assetId || selectedAllergens.length === 0) return
    setSubmitError('')
    const guestSessionId = crypto.randomUUID()
    const { error } = await supabase.from('allergen_declarations').insert({
      venue_id: venueId,
      asset_id: assetId,
      allergens: selectedAllergens,
      severity: allergenSeverity,
      notes: allergenNotes || undefined,
      guest_session_id: guestSessionId,
      status: 'pending',
    })
    if (error) { setSubmitError('Failed to send allergen alert. Please try again.'); return }
    setSelectedAllergens([])
    setAllergenNotes('')
    setScreen('success')
    setTimeout(() => setScreen('main'), 3000)
  }

  const submitSentiment = async (score: SentimentScore) => {
    if (!venueId || !assetId) return
    setSentimentScore(score)
    setScreen('sentiment')
    if (score === 3) {
      await supabase.from('sentiment_ratings').insert({
        venue_id: venueId, asset_id: assetId, score: 3,
        google_review_prompted: true, manager_intervention_needed: false, notification_priority: null,
      })
    } else if (score === 2) {
      await supabase.from('sentiment_ratings').insert({
        venue_id: venueId, asset_id: assetId, score: 2,
        google_review_prompted: false, manager_intervention_needed: false, notification_priority: 'normal',
      })
    } else if (score === 1) {
      await supabase.from('sentiment_ratings').insert({
        venue_id: venueId, asset_id: assetId, score: 1,
        google_review_prompted: false, manager_intervention_needed: true, notification_priority: 'urgent',
      })
    }
  }

  const toggleAllergen = (allergen: string) => {
    setSelectedAllergens((prev) =>
      prev.includes(allergen) ? prev.filter((a) => a !== allergen) : [...prev, allergen]
    )
  }

  // ── ERROR ──────────────────────────────────────────────────────────
  if (appError) {
    const messages: Record<string, { title: string; body: string }> = {
      invalid_qr:      { title: 'Invalid QR Code',  body: 'Please scan the QR code at your table again.' },
      venue_not_found: { title: 'Venue Not Found',   body: 'We could not find this venue. Please alert your server.' },
      asset_not_found: { title: 'Table Not Found',   body: 'Please scan the QR code at your table again or alert your server.' },
    }
    const msg = messages[appError] || messages.invalid_qr
    return (
      <div className="hc-card" style={{ textAlign: 'center', gap: '12px', padding: '32px 20px' }}>
        <div style={{ fontSize: '32px' }}>⚠️</div>
        <div style={{ color: '#e2e8f0', fontSize: '18px', fontWeight: '700' }}>{msg.title}</div>
        <div style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.5' }}>{msg.body}</div>
        <div style={{ color: '#7b8fa8', fontSize: '12px' }}>If this keeps happening please ask your server for help.</div>
      </div>
    )
  }

  // ── SKELETON ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="hc-card" style={{ padding: '22px 16px 20px', gap: '10px' }}>
        <div className="sk" style={{ width: '76px', height: '76px', borderRadius: '16px', margin: '0 auto 6px' }} />
        <div className="sk" style={{ width: '140px', height: '18px', borderRadius: '6px', margin: '0 auto' }} />
        <div className="sk" style={{ width: '100px', height: '12px', borderRadius: '4px', margin: '0 auto 8px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {[1,2,3,4].map(i => <div key={i} className="sk" style={{ height: '88px', borderRadius: '14px' }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div className="sk" style={{ height: '48px', borderRadius: '12px' }} />
          <div className="sk" style={{ height: '48px', borderRadius: '12px' }} />
        </div>
      </div>
    )
  }

  if (screen === 'error') {
    return (
      <div className="hc-card" style={{ padding: '32px 20px', textAlign: 'center' }}>
        <div style={{ color: '#e2e8f0' }}>{errorMessage}</div>
      </div>
    )
  }

  // ── MAIN ───────────────────────────────────────────────────────────
  if (screen === 'main') {
    return (
      <div className="hc-card">
        <div className="card-top">
          {venue?.logo_url ? (
            <div style={{ width: '76px', height: '76px', borderRadius: '16px', background: '#1a2535', border: '1px solid #1e2d3d', margin: '0 auto 5px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}>
              <img src={venue.logo_url} alt={venue.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
          ) : (
            <div className="initials-box">{venue?.name?.charAt(0).toUpperCase()}</div>
          )}

          <div className="venue-name">{venue?.name}</div>
          <div className="table-id">Table {asset?.label}</div>

          <div className="btn-grid">
            <button className="svc-btn" onClick={handleRequestCheck} style={isCoolingDown('check') ? { opacity: 0.6, pointerEvents: 'none' } : {}}>
              <div className="svc-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
              <span className="svc-label">Request Check</span>
            </button>

            <button className="svc-btn" onClick={handleRequestWater} style={isCoolingDown('water') ? { opacity: 0.6, pointerEvents: 'none' } : {}}>
              <div className="svc-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
              </div>
              <span className="svc-label">Refill Water</span>
            </button>

            <button className="svc-btn" onClick={handleRequestServer} style={isCoolingDown('server') ? { opacity: 0.6, pointerEvents: 'none' } : {}}>
              <div className="bell-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
              </div>
              <span className="svc-label">Call Server</span>
            </button>

            <button className="svc-btn" onClick={handleRequestPlates} style={isCoolingDown('plates') ? { opacity: 0.6, pointerEvents: 'none' } : {}}>
              <div className="svc-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>
              </div>
              <span className="svc-label">Clear Plates</span>
            </button>
          </div>

          <div className="action-row">
            <button className="food-allergy-btn" onClick={() => handleServiceRequest('allergen')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Food Allergies
            </button>
            <button className="get-help-btn" onClick={() => handleServiceRequest('critical')}>
              <div className="hand-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/>
                  <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/>
                  <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/>
                  <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
                </svg>
              </div>
              Get Help
            </button>
          </div>

          {submitError && (
            <div style={{ color: '#fca5a5', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', borderRadius: '8px', padding: '10px 13px', fontSize: '12px', textAlign: 'center' }}>
              {submitError}
            </div>
          )}
        </div>

        <div className="card-sentiment">
          <div className="fb-prompt">How's everything?</div>
          <div className="fb-row">
            <button className="fb-box pos" onClick={() => submitSentiment(3)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              <span className="fb-text">I'm Happy</span>
            </button>
            <button className="fb-box neu" onClick={() => submitSentiment(2)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              <span className="fb-text">It was okay</span>
            </button>
            <button className="fb-box neg" onClick={() => submitSentiment(1)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              <span className="fb-text">Disappointed</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── ALLERGEN ───────────────────────────────────────────────────────
  if (screen === 'allergen') {
    const allergenOptions = ['Gluten','Dairy','Eggs','Fish','Shellfish','Tree Nuts','Peanuts','Soy','Sesame']
    return (
      <div className="hc-card">
        <div className="card-top">
          <button className="back-btn" onClick={() => setScreen('main')}>← Back</button>
          <div style={{ color: '#e2e8f0', fontSize: '17px', fontWeight: '700', marginBottom: '4px' }}>Food Allergy Declaration</div>
          <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '16px' }}>Select everything that applies</div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginBottom: '20px' }}>
            {allergenOptions.map((allergen) => (
              <button
                key={allergen}
                onClick={() => toggleAllergen(allergen)}
                style={{
                  padding: '7px 13px', borderRadius: '99px', fontFamily: 'inherit',
                  border: selectedAllergens.includes(allergen) ? '1px solid rgba(245,158,11,.45)' : '1px solid #1e2d3d',
                  background: selectedAllergens.includes(allergen) ? 'rgba(245,158,11,.12)' : 'transparent',
                  color: selectedAllergens.includes(allergen) ? '#f59e0b' : '#94a3b8',
                  fontSize: '12px', fontWeight: '500', cursor: 'pointer', transition: 'all .15s',
                }}
              >
                {allergen}
              </button>
            ))}
          </div>

          <div style={{ color: '#94a3b8', fontSize: '11px', fontWeight: '600', letterSpacing: '.08em', marginBottom: '8px' }}>SEVERITY</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '20px' }}>
            {(['mild','moderate','severe','anaphylactic'] as AllergenSeverity[]).map((severity) => (
              <div key={severity} onClick={() => setAllergenSeverity(severity)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                  borderRadius: '10px', cursor: 'pointer', transition: 'all .15s', fontSize: '13px',
                  border: allergenSeverity === severity ? '1px solid rgba(245,158,11,.3)' : '1px solid #1e2d3d',
                  background: allergenSeverity === severity ? 'rgba(245,158,11,.07)' : 'transparent',
                  color: allergenSeverity === severity ? '#f59e0b' : '#94a3b8',
                }}
              >
                <input type="radio" name="severity" checked={allergenSeverity === severity} onChange={() => setAllergenSeverity(severity)} style={{ margin: 0 }} />
                {severity.charAt(0).toUpperCase() + severity.slice(1)}
              </div>
            ))}
          </div>

          <textarea
            placeholder="Anything else we should know?"
            value={allergenNotes}
            onChange={(e) => setAllergenNotes(e.target.value)}
            rows={3}
            style={{ width: '100%', background: '#0f1923', border: '1px solid #1e2d3d', borderRadius: '10px', padding: '10px 12px', color: '#e2e8f0', fontSize: '12px', fontFamily: 'inherit', resize: 'none', outline: 'none', marginBottom: '16px' }}
          />

          <button
            className="food-allergy-btn"
            onClick={handleAllergenSubmit}
            disabled={selectedAllergens.length === 0}
            style={{ width: '100%', justifyContent: 'center', height: '48px', opacity: selectedAllergens.length === 0 ? 0.5 : 1, cursor: selectedAllergens.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            Send Allergy Alert
          </button>

          {submitError && (
            <div style={{ color: '#fca5a5', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', borderRadius: '8px', padding: '10px 13px', fontSize: '12px', textAlign: 'center', marginTop: '8px' }}>
              {submitError}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── SENTIMENT OUTCOME ──────────────────────────────────────────────
  if (screen === 'sentiment') {
    const s = sentimentScore
    if (s === null) return null
    const configs = {
      3: {
        ringStyle: { background: 'rgba(16,185,129,.1)', border: '2px solid #10b981', boxShadow: '0 0 28px rgba(16,185,129,.18)' },
        icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
        title: "We're Happy you're Happy!",
        body: "Your kind words make our team's day.",
        showReview: true,
      },
      2: {
        ringStyle: { background: 'rgba(245,158,11,.1)', border: '2px solid #f59e0b' },
        icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
        title: "Thank you — we'd love to do better.",
        body: 'Your feedback helps us improve.',
        showReview: false,
      },
      1: {
        ringStyle: { background: 'rgba(239,68,68,.1)', border: '2px solid #ef4444', boxShadow: '0 0 24px rgba(239,68,68,.15)' },
        icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
        title: "We're sorry to hear that.",
        body: 'A manager will be right with you.',
        showReview: false,
      },
    }
    const cfg = configs[s]
    return (
      <div className="hc-card">
        <div className="card-top">
          <div className="outcome-wrap">
            <div className="outcome-ring" style={cfg.ringStyle}>{cfg.icon}</div>
            <div style={{ color: '#e2e8f0', fontSize: '18px', fontWeight: '700', textAlign: 'center' }}>{cfg.title}</div>
            <div style={{ color: '#94a3b8', fontSize: '13px', lineHeight: '1.5', textAlign: 'center' }}>{cfg.body}</div>
            {cfg.showReview && venue?.google_review_url && (
              <div className="review-box">
                <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: '600' }}>Mind sharing on Google?</div>
                <div style={{ color: '#94a3b8', fontSize: '12px' }}>It helps other guests find us.</div>
                <a href={venue.google_review_url} target="_blank" rel="noopener noreferrer" className="review-cta">⭐ Leave a Google Review</a>
              </div>
            )}
            <button className="done-btn" onClick={() => { setSentimentScore(null); setScreen('main') }}>Done</button>
          </div>
        </div>
      </div>
    )
  }

  // ── SUCCESS ────────────────────────────────────────────────────────
  if (screen === 'success') {
    return (
      <div className="hc-card" onClick={() => setScreen('main')} style={{ cursor: 'pointer' }}>
        <div className="card-top">
          <div className="outcome-wrap">
            <div className="outcome-ring" style={{ background: 'rgba(16,185,129,.1)', border: '2px solid #10b981', boxShadow: '0 0 28px rgba(16,185,129,.18)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <div style={{ color: '#e2e8f0', fontSize: '18px', fontWeight: '700', textAlign: 'center' }}>Your request has been sent</div>
            <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center' }}>We'll be right with you</div>
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default App
