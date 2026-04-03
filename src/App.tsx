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

  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([])
  const [allergenSeverity, setAllergenSeverity] = useState<AllergenSeverity>('mild')
  const [allergenNotes, setAllergenNotes] = useState('')

  const venueId = new URLSearchParams(window.location.search).get('venue')
  const assetId = new URLSearchParams(window.location.search).get('table')

  useEffect(() => {
    if (!venueId || !assetId) {
      setErrorMessage('Invalid QR code — please scan again')
      setScreen('error')
      return
    }

    async function loadData() {
      try {
        const [venueResult, assetResult] = await Promise.all([
          supabase.from('venues').select('*').eq('id', venueId).maybeSingle(),
          supabase.from('assets').select('*').eq('id', assetId).maybeSingle(),
        ])

        if (venueResult.error) throw venueResult.error
        if (assetResult.error) throw assetResult.error
        if (!venueResult.data || !assetResult.data) {
          throw new Error('Venue or table not found')
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

  const handleSentimentClick = (score: SentimentScore) => {
    setSentimentScore(score)
    setScreen('sentiment')
  }

  const handleSentimentSubmit = async () => {
    if (!venueId || !assetId || !sentimentScore) return

    const googleReviewPrompted = sentimentScore === 3
    const managerInterventionNeeded = sentimentScore === 1

    await supabase.from('sentiment_ratings').insert({
      venue_id: venueId,
      asset_id: assetId,
      score: sentimentScore,
      google_review_prompted: googleReviewPrompted,
      manager_intervention_needed: managerInterventionNeeded,
    })
  }

  const toggleAllergen = (allergen: string) => {
    setSelectedAllergens((prev) =>
      prev.includes(allergen)
        ? prev.filter((a) => a !== allergen)
        : [...prev, allergen]
    )
  }

  if (screen === 'loading') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.loadingText}>Loading...</div>
        </div>
      </div>
    )
  }

  if (screen === 'error') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.errorText}>{errorMessage}</div>
        </div>
      </div>
    )
  }

  if (screen === 'main') {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          {venue?.logo_url ? (
            <img
              src={venue.logo_url}
              alt={venue.name}
              style={{height: '64px', objectFit: 'contain', marginBottom: '16px', display: 'block', margin: '0 auto 16px'}}
            />
          ) : (
            <h1 style={styles.venueName}>{venue?.name}</h1>
          )}

          {venue?.logo_url && <h1 style={styles.venueName}>{venue?.name}</h1>}
          <div style={styles.tableLabel}>Table {asset?.label}</div>

          <div style={styles.buttonGroup}>
            <button
              style={styles.serviceButton}
              onClick={() => handleServiceRequest('check_please')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Check Please
            </button>
            <button
              style={styles.serviceButton}
              onClick={() => handleServiceRequest('water')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
              Water Refill
            </button>
            <button
              style={styles.serviceButton}
              onClick={() => handleServiceRequest('waiter')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              Waiter Needed
            </button>
            <button
              style={styles.serviceButton}
              onClick={() => handleServiceRequest('clear')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>
              Clear Table
            </button>
          </div>

          <button
            style={styles.allergenButton}
            onClick={() => handleServiceRequest('allergen')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Allergen Alert
          </button>

          <button
            style={styles.emergencyButton}
            onClick={() => handleServiceRequest('critical')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Emergency
          </button>

          {submitError && <div style={styles.errorText}>{submitError}</div>}

          <div style={styles.sentimentLabel}>How was your experience?</div>
          <div style={styles.sentimentContainer}>
            <button
              style={{ ...styles.sentimentButton, ...styles.sentimentGreen }}
              onClick={() => handleSentimentClick(3)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            </button>
            <button
              style={{ ...styles.sentimentButton, ...styles.sentimentAmber }}
              onClick={() => handleSentimentClick(2)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 15h8"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            </button>
            <button
              style={{ ...styles.sentimentButton, ...styles.sentimentRed }}
              onClick={() => handleSentimentClick(1)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
            </button>
          </div>
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
      <div style={styles.container}>
        <div style={styles.card}>
          <button style={styles.backButton} onClick={() => setScreen('main')}>
            ← Back
          </button>

          <h2 style={styles.screenTitle}>Tell us about your allergies</h2>

          <div style={styles.allergenChips}>
            {allergenOptions.map((allergen) => (
              <button
                key={allergen}
                style={{
                  ...styles.chip,
                  ...(selectedAllergens.includes(allergen) ? styles.chipSelected : {}),
                }}
                onClick={() => toggleAllergen(allergen)}
              >
                {allergen}
              </button>
            ))}
          </div>

          <div style={styles.severityContainer}>
            <div style={styles.severityLabel}>Severity:</div>
            <div style={styles.severityOptions}>
              {(['mild', 'moderate', 'severe', 'anaphylactic'] as AllergenSeverity[]).map(
                (severity) => (
                  <label key={severity} style={styles.radioLabel}>
                    <input
                      type="radio"
                      name="severity"
                      value={severity}
                      checked={allergenSeverity === severity}
                      onChange={() => setAllergenSeverity(severity)}
                      style={styles.radioInput}
                    />
                    <span style={styles.radioText}>
                      {severity.charAt(0).toUpperCase() + severity.slice(1)}
                    </span>
                  </label>
                )
              )}
            </div>
          </div>

          <textarea
            style={styles.textarea}
            placeholder="Anything else we should know?"
            value={allergenNotes}
            onChange={(e) => setAllergenNotes(e.target.value)}
            rows={3}
          />

          <button
            style={{
              ...styles.submitButton,
              ...(selectedAllergens.length === 0 ? styles.submitButtonDisabled : {}),
            }}
            onClick={handleAllergenSubmit}
            disabled={selectedAllergens.length === 0}
          >
            Send
          </button>

          {submitError && <div style={styles.errorText}>{submitError}</div>}
        </div>
      </div>
    )
  }

  if (screen === 'sentiment' && sentimentScore) {
    useEffect(() => {
      handleSentimentSubmit()
    }, [])

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
    }[sentimentScore]

    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.sentimentMessage}>{sentimentContent.message}</div>

          {sentimentContent.showReview && venue?.google_review_url && (
            <a
              href={venue.google_review_url}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.reviewButton}
            >
              Leave a Google Review
            </a>
          )}

          <button
            style={styles.doneButton}
            onClick={() => {
              setSentimentScore(null)
              setScreen('main')
            }}
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  if (screen === 'success') {
    return (
      <div
        style={styles.container}
        onClick={() => setScreen('main')}
      >
        <div style={styles.card}>
          <div style={styles.successIcon}>✓</div>
          <div style={styles.successTitle}>Your request has been sent</div>
          <div style={styles.successSubtitle}>We'll be right with you</div>
        </div>
      </div>
    )
  }

  return null
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#0d1117',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    backgroundColor: '#141d2b',
    border: '1px solid #1e2d3d',
    borderRadius: '16px',
    padding: '28px 20px',
    color: '#e2e8f0',
  },
  logoContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  venueName: {
    fontSize: '22px',
    fontWeight: '700',
    textAlign: 'center',
    margin: '0 0 4px 0',
    color: '#e2e8f0',
  },
  tableLabel: {
    fontSize: '14px',
    textAlign: 'center',
    color: '#94a3b8',
    marginBottom: '24px',
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginBottom: '10px',
  },
  serviceButton: {
    width: '100%',
    height: '56px',
    backgroundColor: '#22d3ee',
    color: '#0d1117',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 20px',
  },
  allergenButton: {
    width: '100%',
    height: '56px',
    backgroundColor: '#f59e0b',
    color: '#0d1117',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 20px',
    marginBottom: '10px',
  },
  emergencyButton: {
    width: '100%',
    height: '56px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '0 20px',
    marginBottom: '24px',
  },
  sentimentLabel: {
    fontSize: '13px',
    textAlign: 'center',
    color: '#94a3b8',
    marginBottom: '12px',
  },
  sentimentContainer: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
  },
  sentimentButton: {
    width: '64px',
    height: '64px',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
  },
  sentimentGreen: {
    backgroundColor: '#10b981',
  },
  sentimentAmber: {
    backgroundColor: '#f59e0b',
  },
  sentimentRed: {
    backgroundColor: '#ef4444',
  },
  backButton: {
    backgroundColor: 'transparent',
    color: '#22d3ee',
    border: 'none',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '8px 0',
    marginBottom: '16px',
  },
  screenTitle: {
    fontSize: '20px',
    fontWeight: '700',
    marginBottom: '24px',
    color: '#e2e8f0',
  },
  allergenChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '24px',
  },
  chip: {
    padding: '8px 16px',
    backgroundColor: '#141d2b',
    color: '#94a3b8',
    border: '1px solid #1e2d3d',
    borderRadius: '20px',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  chipSelected: {
    backgroundColor: '#22d3ee',
    color: '#0d1117',
    borderColor: '#22d3ee',
    fontWeight: '700',
  },
  severityContainer: {
    marginBottom: '24px',
  },
  severityLabel: {
    fontSize: '14px',
    fontWeight: '700',
    marginBottom: '12px',
    color: '#e2e8f0',
  },
  severityOptions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    color: '#e2e8f0',
  },
  radioInput: {
    marginRight: '8px',
    cursor: 'pointer',
  },
  radioText: {
    fontSize: '14px',
  },
  textarea: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#141d2b',
    color: '#e2e8f0',
    border: '1px solid #1e2d3d',
    borderRadius: '10px',
    fontSize: '14px',
    fontFamily: 'inherit',
    resize: 'vertical',
    marginBottom: '24px',
  },
  submitButton: {
    width: '100%',
    height: '56px',
    backgroundColor: '#22d3ee',
    color: '#0d1117',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  submitButtonDisabled: {
    backgroundColor: '#1e2d3d',
    color: '#94a3b8',
    cursor: 'not-allowed',
  },
  sentimentMessage: {
    fontSize: '20px',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: '24px',
    color: '#e2e8f0',
  },
  reviewButton: {
    display: 'block',
    width: '100%',
    height: '56px',
    backgroundColor: '#22d3ee',
    color: '#0d1117',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '700',
    textDecoration: 'none',
    textAlign: 'center',
    lineHeight: '56px',
    marginBottom: '10px',
  },
  doneButton: {
    width: '100%',
    height: '56px',
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  successIcon: {
    fontSize: '64px',
    textAlign: 'center',
    color: '#10b981',
    marginBottom: '16px',
  },
  successTitle: {
    fontSize: '20px',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: '8px',
    color: '#e2e8f0',
  },
  successSubtitle: {
    fontSize: '16px',
    textAlign: 'center',
    color: '#94a3b8',
  },
  loadingText: {
    fontSize: '18px',
    textAlign: 'center',
    color: '#94a3b8',
  },
  errorText: {
    fontSize: '16px',
    textAlign: 'center',
    color: '#ef4444',
    marginTop: '16px',
  },
}

export default App
