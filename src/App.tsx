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

  const venueId = new URLSearchParams(window.location.search).get('venue')
  const assetId = new URLSearchParams(window.location.search).get('table')

  useEffect(() => {
    if (!venueId || !assetId) {
      setAppError('invalid_qr')
      setScreen('loading')
      return
    }

    async function loadData() {
      try {
        const [venueResult, assetResult] = await Promise.all([
          supabase.from('venues').select('*').eq('id', venueId).maybeSingle(),
          supabase.from('assets').select('*').eq('id', assetId).maybeSingle(),
        ])

        if (venueResult.error || !venueResult.data) {
          setAppError('venue_not_found')
          setScreen('loading')
          return
        }

        if (assetResult.error || !assetResult.data) {
          setAppError('asset_not_found')
          setScreen('loading')
          return
        }

        setVenue(venueResult.data)
        setAsset(assetResult.data)
        setScreen('main')
      } catch (err) {
        console.error('Load error:', err)
        setErrorMessage('Something went wrong — please try again')
        setScreen('error')
      }
    }

    loadData()
  }, [venueId, assetId])

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

      if (error) {
        setSubmitError('Failed to send request. Please try again.')
        return
      }

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

    if (error) {
      setSubmitError('Failed to send request. Please try again.')
      return
    }

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

    if (error) {
      setSubmitError('Failed to send allergen alert. Please try again.')
      return
    }

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
        venue_id: venueId,
        asset_id: assetId,
        score: 3,
        google_review_prompted: true,
        manager_intervention_needed: false,
        notification_priority: null,
      })
    } else if (score === 2) {
      await supabase.from('sentiment_ratings').insert({
        venue_id: venueId,
        asset_id: assetId,
        score: 2,
        google_review_prompted: false,
        manager_intervention_needed: false,
        notification_priority: 'normal',
      })
    } else if (score === 1) {
      await supabase.from('sentiment_ratings').insert({
        venue_id: venueId,
        asset_id: assetId,
        score: 1,
        google_review_prompted: false,
        manager_intervention_needed: true,
        notification_priority: 'urgent',
      })
    }
  }

  const toggleAllergen = (allergen: string) => {
    setSelectedAllergens((prev) =>
      prev.includes(allergen)
        ? prev.filter((a) => a !== allergen)
        : [...prev, allergen]
    )
  }

  if (appError) {
    const messages: Record<string, {title: string, body: string}> = {
      invalid_qr: {
        title: 'Invalid QR Code',
        body: 'Please scan the QR code at your table again.'
      },
      venue_not_found: {
        title: 'Venue Not Found',
        body: 'We could not find this venue. Please alert your server.'
      },
      asset_not_found: {
        title: 'Table Not Found',
        body: 'Please scan the QR code at your table again or alert your server.'
      }
    }
    const msg = messages[appError] || messages.invalid_qr
    return (
      <div style={{background:'#141d2b',border:'1px solid #1e2d3d',borderRadius:'20px',padding:'32px 20px',textAlign:'center',display:'flex',flexDirection:'column',alignItems:'center',gap:'12px',margin:'20px 16px'}}>
        <div style={{fontSize:'32px'}}>⚠️</div>
        <div style={{color:'#e2e8f0',fontSize:'18px',fontWeight:'700'}}>{msg.title}</div>
        <div style={{color:'#94a3b8',fontSize:'14px',lineHeight:'1.5'}}>{msg.body}</div>
        <div style={{color:'#7b8fa8',fontSize:'12px',marginTop:'8px'}}>If this keeps happening please ask your server for help.</div>
      </div>
    )
  }

  if (screen === 'loading') {
    return (
      <div className="hc-card">
        <div className="hc-loading">Loading...</div>
      </div>
    )
  }

  if (screen === 'error') {
    return (
      <div className="hc-card">
        <div className="hc-error">{errorMessage}</div>
      </div>
    )
  }

  if (screen === 'main') {
    return (
      <div className="hc-card">
        {venue?.logo_url ? (
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '16px',
              background: '#1a2535',
              border: '1px solid #1e2d3d',
              margin: '0 auto 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px',
            }}
          >
            <img
              src={venue.logo_url}
              alt={venue.name}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          </div>
        ) : (
          <>
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '16px',
                background: '#22d3ee',
                margin: '0 auto 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px',
                fontWeight: '800',
                color: 'white',
              }}
            >
              {venue?.name?.charAt(0).toUpperCase()}
            </div>
            <h1 className="hc-venue-name">{venue?.name}</h1>
          </>
        )}

        <div className="hc-table-label">Table {asset?.label}</div>

        <button
          className="hc-btn hc-btn-primary"
          onClick={() => handleServiceRequest('check_please')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          Check Please
        </button>
        <button
          className="hc-btn hc-btn-primary"
          onClick={() => handleServiceRequest('water')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
          Water Refill
        </button>
        <button
          className="hc-btn hc-btn-primary"
          onClick={() => handleServiceRequest('waiter')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          Waiter Needed
        </button>
        <button
          className="hc-btn hc-btn-primary"
          onClick={() => handleServiceRequest('clear')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>
          Clear Table
        </button>

        <button
          className="hc-btn hc-btn-allergen"
          onClick={() => handleServiceRequest('allergen')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Allergen Alert
        </button>

        <button
          className="hc-btn hc-btn-danger"
          onClick={() => handleServiceRequest('critical')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          Emergency
        </button>

        {submitError && <div className="hc-error">{submitError}</div>}

        <div className="hc-sentiment-label">How was your experience?</div>
        <div className="hc-sentiment-row">
          <button
            className="hc-face hc-face-positive"
            onClick={() => submitSentiment(3)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </button>
          <button
            className="hc-face hc-face-neutral"
            onClick={() => submitSentiment(2)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 15h8"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </button>
          <button
            className="hc-face hc-face-negative"
            onClick={() => submitSentiment(1)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </button>
        </div>
      </div>
    )
  }

  if (screen === 'allergen') {
    const allergenOptions = [
      'Gluten',
      'Dairy',
      'Eggs',
      'Fish',
      'Shellfish',
      'Tree Nuts',
      'Peanuts',
      'Soy',
      'Sesame',
    ]

    return (
      <div className="hc-card">
        <button className="hc-back-btn" onClick={() => setScreen('main')}>
          ← Back
        </button>

        <h2 style={{fontSize: '20px', fontWeight: '700', marginBottom: '24px', color: '#e2e8f0'}}>
          Tell us about your allergies
        </h2>

        <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px'}}>
          {allergenOptions.map((allergen) => (
            <button
              key={allergen}
              className={`hc-chip ${selectedAllergens.includes(allergen) ? 'selected' : ''}`}
              onClick={() => toggleAllergen(allergen)}
            >
              {allergen}
            </button>
          ))}
        </div>

        <div style={{marginBottom: '24px'}}>
          <div style={{fontSize: '14px', fontWeight: '700', marginBottom: '12px', color: '#e2e8f0'}}>
            Severity:
          </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
            {(['mild', 'moderate', 'severe', 'anaphylactic'] as AllergenSeverity[]).map(
              (severity) => (
                <div
                  key={severity}
                  className={`hc-severity-option ${allergenSeverity === severity ? 'selected' : ''}`}
                  onClick={() => setAllergenSeverity(severity)}
                >
                  <input
                    type="radio"
                    name="severity"
                    value={severity}
                    checked={allergenSeverity === severity}
                    onChange={() => setAllergenSeverity(severity)}
                    style={{margin: 0}}
                  />
                  <span style={{fontSize: '14px'}}>
                    {severity.charAt(0).toUpperCase() + severity.slice(1)}
                  </span>
                </div>
              )
            )}
          </div>
        </div>

        <textarea
          className="hc-input"
          placeholder="Anything else we should know?"
          value={allergenNotes}
          onChange={(e) => setAllergenNotes(e.target.value)}
          rows={3}
        />

        <button
          className="hc-btn hc-btn-primary"
          onClick={handleAllergenSubmit}
          disabled={selectedAllergens.length === 0}
          style={selectedAllergens.length === 0 ? {opacity: 0.5, cursor: 'not-allowed'} : {}}
        >
          Send
        </button>

        {submitError && <div className="hc-error">{submitError}</div>}
      </div>
    )
  }

  if (screen === 'sentiment') {
    const s = sentimentScore
    if (s === null) return null

    const sentimentContent = {
      3: {
        message: "Glad you're enjoying it!",
        showReview: !!venue?.google_review_url,
      },
      2: {
        message: "Thank you — we'd love to do better.",
        showReview: false,
      },
      1: {
        message: "We're sorry — a manager will be right with you shortly.",
        showReview: false,
      },
    }[s]

    return (
      <div className="hc-card">
        <div style={{fontSize: '20px', fontWeight: '700', textAlign: 'center', marginBottom: '24px', color: '#e2e8f0'}}>
          {sentimentContent.message}
        </div>

        {sentimentContent.showReview && venue?.google_review_url && (
          <a
            href={venue.google_review_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hc-btn hc-btn-primary"
            style={{textDecoration: 'none', justifyContent: 'center'}}
          >
            Leave a Google Review
          </a>
        )}

        <button
          className="hc-btn hc-btn-ghost"
          onClick={() => {
            setSentimentScore(null)
            setScreen('main')
          }}
          style={{marginTop: '10px'}}
        >
          Done
        </button>
      </div>
    )
  }

  if (screen === 'success') {
    return (
      <div
        className="hc-card"
        onClick={() => setScreen('main')}
        style={{cursor: 'pointer'}}
      >
        <div className="hc-success-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div style={{fontSize: '20px', fontWeight: '700', textAlign: 'center', marginBottom: '8px', color: '#e2e8f0'}}>
          Your request has been sent
        </div>
        <div style={{fontSize: '16px', textAlign: 'center', color: '#94a3b8'}}>
          We'll be right with you
        </div>
      </div>
    )
  }

  return null
}

export default App
