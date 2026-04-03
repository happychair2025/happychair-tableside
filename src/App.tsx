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
          <div style={styles.logoContainer}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path
                d="M24 4C19 4 15 8 15 13C15 18 19 22 24 22C24 22 24 35 24 44C24 35 24 22 24 22C29 22 33 18 33 13C33 8 29 4 24 4Z"
                fill="#22d3ee"
              />
            </svg>
          </div>

          <h1 style={styles.venueName}>{venue?.name}</h1>
          <div style={styles.tableLabel}>Table {asset?.label}</div>

          <div style={styles.buttonGroup}>
            <button
              style={styles.serviceButton}
              onClick={() => handleServiceRequest('check_please')}
            >
              Check Please
            </button>
            <button
              style={styles.serviceButton}
              onClick={() => handleServiceRequest('water')}
            >
              Water Refill
            </button>
            <button
              style={styles.serviceButton}
              onClick={() => handleServiceRequest('waiter')}
            >
              Waiter Needed
            </button>
            <button
              style={styles.serviceButton}
              onClick={() => handleServiceRequest('clear')}
            >
              Clear Table
            </button>
          </div>

          <button
            style={styles.allergenButton}
            onClick={() => handleServiceRequest('allergen')}
          >
            Allergen Alert
          </button>

          <button
            style={styles.emergencyButton}
            onClick={() => handleServiceRequest('critical')}
          >
            Emergency
          </button>

          {submitError && <div style={styles.errorText}>{submitError}</div>}

          <div style={styles.sentimentContainer}>
            <button
              style={{ ...styles.sentimentButton, ...styles.sentimentGreen }}
              onClick={() => handleSentimentClick(3)}
            >
              😊
            </button>
            <button
              style={{ ...styles.sentimentButton, ...styles.sentimentAmber }}
              onClick={() => handleSentimentClick(2)}
            >
              😐
            </button>
            <button
              style={{ ...styles.sentimentButton, ...styles.sentimentRed }}
              onClick={() => handleSentimentClick(1)}
            >
              😞
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
        message: "Glad you're enjoying it! 🎉",
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
    borderRadius: '12px',
    padding: '24px',
    color: '#e2e8f0',
  },
  logoContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  venueName: {
    fontSize: '24px',
    fontWeight: '600',
    textAlign: 'center',
    margin: '0 0 8px 0',
    color: '#e2e8f0',
  },
  tableLabel: {
    fontSize: '16px',
    textAlign: 'center',
    color: '#94a3b8',
    marginBottom: '32px',
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '16px',
  },
  serviceButton: {
    width: '100%',
    minHeight: '52px',
    backgroundColor: '#22d3ee',
    color: '#0d1117',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  allergenButton: {
    width: '100%',
    minHeight: '52px',
    backgroundColor: '#f59e0b',
    color: '#0d1117',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    marginBottom: '12px',
  },
  emergencyButton: {
    width: '100%',
    minHeight: '52px',
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    marginBottom: '32px',
  },
  sentimentContainer: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    marginTop: '32px',
  },
  sentimentButton: {
    width: '64px',
    height: '64px',
    border: 'none',
    borderRadius: '50%',
    fontSize: '32px',
    cursor: 'pointer',
    transition: 'transform 0.2s',
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
    fontWeight: '600',
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
    backgroundColor: '#1f2937',
    color: '#94a3b8',
    border: '2px solid transparent',
    borderRadius: '20px',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  chipSelected: {
    backgroundColor: '#22d3ee',
    color: '#0d1117',
    borderColor: '#22d3ee',
    fontWeight: '600',
  },
  severityContainer: {
    marginBottom: '24px',
  },
  severityLabel: {
    fontSize: '14px',
    fontWeight: '600',
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
    backgroundColor: '#1f2937',
    color: '#e2e8f0',
    border: '1px solid #374151',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'inherit',
    resize: 'vertical',
    marginBottom: '24px',
  },
  submitButton: {
    width: '100%',
    minHeight: '52px',
    backgroundColor: '#22d3ee',
    color: '#0d1117',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  submitButtonDisabled: {
    backgroundColor: '#374151',
    color: '#6b7280',
    cursor: 'not-allowed',
  },
  sentimentMessage: {
    fontSize: '20px',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: '24px',
    color: '#e2e8f0',
  },
  reviewButton: {
    display: 'block',
    width: '100%',
    minHeight: '52px',
    backgroundColor: '#22d3ee',
    color: '#0d1117',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    textDecoration: 'none',
    textAlign: 'center',
    lineHeight: '52px',
    marginBottom: '12px',
  },
  doneButton: {
    width: '100%',
    minHeight: '52px',
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
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
    fontWeight: '600',
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
