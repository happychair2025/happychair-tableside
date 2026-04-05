import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import type {
  Venue,
  Asset,
  RequestCategory,
  SentimentScore,
  AllergenSeverity,
} from './types'

type Screen = 'loading' | 'error' | 'main' | 'allergen' | 'sentiment' | 'success' | 'happy' | 'okay' | 'sad' | 'resolve' | 'allergy' | 'alwait' | 'alack' | 'urgent'

type ButtonState = 'default' | 'pending' | 'accepted'

interface ServiceButtonState {
  state: ButtonState
  timestamp: number
}

function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [venue, setVenue] = useState<Venue | null>(null)
  // @ts-expect-error - asset will be used in production mode
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

  const [curVenue, setCurVenue] = useState('dining')
  const [buttonStates, setButtonStates] = useState<Record<string, ServiceButtonState>>({})
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, number>>({})

  const venueId = new URLSearchParams(window.location.search).get('venue')
  const assetId = new URLSearchParams(window.location.search).get('table')

  const VENUES: Record<string, {n:string,t:string,b:string[],ic:string[],q:string|null,f:string[]|null}> = {
    dining: {n:'Happy Bistro',t:'T1 · Dining Room',b:['Request Check','Refill Water','Get Server','Clear Plates'],ic:['ck','wa','be','cl'],q:"How's Everything?",f:["I'm Happy",'It Was Okay','Disappointed']},
    bar: {n:'The Copper Rail',t:'B4 · Main Bar',b:['Tab Please','Another Round','Call Bartender','Napkins'],ic:['tab','drink','user','napkin'],q:"How's Your Drink?",f:['Loved It','It Was Okay','Disappointed']},
    hotel: {n:'The Grand Hotel',t:'Room 304',b:['Room Service','Housekeeping','Concierge','Maintenance'],ic:['room','broom','conc','wrench'],q:"How's Your Stay?",f:['Excellent','It Was Okay','Disappointed']},
    pool: {n:'Azure Beach Club',t:'Lounger L12 · Pool',b:['Towel Service','Drink Order','Food Order','Call Attendant'],ic:['towel','drink','food','user'],q:'Enjoying Your Day?',f:['Loving It','It Was Okay','Disappointed']},
    stadium: {n:'City Arena',t:'Sec 114 · Row K · Seat 23',b:['Food Order','Drink Order','Assistance','Report Issue'],ic:['food','drink','user','flag'],q:null,f:null}
  }

  const go = (id: string) => setScreen(id as Screen)

  useEffect(() => {
    if (!venueId || !assetId) {
      setAppError('invalid_qr')
      setScreen('loading')
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
          setScreen('loading')
          setLoading(false)
          return
        }

        if (assetResult.error || !assetResult.data) {
          setAppError('asset_not_found')
          setScreen('loading')
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

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTimes(prev => {
        const next = { ...prev }
        Object.keys(buttonStates).forEach(key => {
          if (buttonStates[key].state === 'pending') {
            next[key] = Math.floor((Date.now() - buttonStates[key].timestamp) / 1000)
          }
        })
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [buttonStates])

  const updateButtonState = (key: string, state: ButtonState) => {
    setButtonStates(prev => ({
      ...prev,
      [key]: { state, timestamp: Date.now() }
    }))

    if (state === 'pending') {
      const acceptDelay = 3000 + Math.random() * 4000
      setTimeout(() => {
        setButtonStates(prev => {
          if (prev[key]?.state === 'pending') {
            return { ...prev, [key]: { state: 'accepted', timestamp: Date.now() } }
          }
          return prev
        })

        const completeDelay = 8000 + Math.random() * 7000
        setTimeout(() => {
          setButtonStates(prev => {
            const next = { ...prev }
            delete next[key]
            return next
          })
          setElapsedTimes(prev => {
            const next = { ...prev }
            delete next[key]
            return next
          })
        }, completeDelay)
      }, acceptDelay)
    }
  }

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
    updateButtonState('btn0', 'pending')
    if (!venueId || !assetId) return

    setSubmitError('')
    const { error } = await supabase.from('requests').insert({
      venue_id: venueId,
      asset_id: assetId,
      category: 'check_please',
      status: 'pending',
    })

    if (error) {
      setSubmitError('Failed to send request. Please try again.')
      return
    }
  }

  const handleRequestWater = async () => {
    if (isCoolingDown('water')) return
    startCooldown('water')
    updateButtonState('btn1', 'pending')
    if (!venueId || !assetId) return

    setSubmitError('')
    const { error } = await supabase.from('requests').insert({
      venue_id: venueId,
      asset_id: assetId,
      category: 'water',
      status: 'pending',
    })

    if (error) {
      setSubmitError('Failed to send request. Please try again.')
      return
    }
  }

  const handleRequestServer = async () => {
    if (isCoolingDown('server')) return
    startCooldown('server')
    updateButtonState('btn2', 'pending')
    if (!venueId || !assetId) return

    setSubmitError('')
    const { error } = await supabase.from('requests').insert({
      venue_id: venueId,
      asset_id: assetId,
      category: 'waiter',
      status: 'pending',
    })

    if (error) {
      setSubmitError('Failed to send request. Please try again.')
      return
    }
  }

  const handleRequestPlates = async () => {
    if (isCoolingDown('plates')) return
    startCooldown('plates')
    updateButtonState('btn3', 'pending')
    if (!venueId || !assetId) return

    setSubmitError('')
    const { error } = await supabase.from('requests').insert({
      venue_id: venueId,
      asset_id: assetId,
      category: 'clear',
      status: 'pending',
    })

    if (error) {
      setSubmitError('Failed to send request. Please try again.')
      return
    }
  }

  // @ts-expect-error - handleServiceRequest will be used in future phases
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

  if (loading) {
    return (
      <div style={{background:'#141d2b',border:'1px solid #1e2d3d',borderRadius:'20px',padding:'22px 16px 20px',width:'100%',display:'flex',flexDirection:'column',gap:'10px'}}>
        <div style={{width:'76px',height:'76px',borderRadius:'16px',background:'linear-gradient(90deg,#141d2b 0,#1a2535 40px,#141d2b 80px)',backgroundSize:'400px',animation:'shimmer 1.4s ease infinite',margin:'0 auto 6px'}} />
        <div style={{width:'140px',height:'18px',borderRadius:'6px',background:'linear-gradient(90deg,#141d2b 0,#1a2535 40px,#141d2b 80px)',backgroundSize:'400px',animation:'shimmer 1.4s ease infinite',margin:'0 auto'}} />
        <div style={{width:'100px',height:'12px',borderRadius:'4px',background:'linear-gradient(90deg,#141d2b 0,#1a2535 40px,#141d2b 80px)',backgroundSize:'400px',animation:'shimmer 1.4s ease infinite',margin:'0 auto 8px'}} />
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{height:'88px',borderRadius:'14px',background:'linear-gradient(90deg,#141d2b 0,#1a2535 40px,#141d2b 80px)',backgroundSize:'400px',animation:'shimmer 1.4s ease infinite'}} />
          ))}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginTop:'0px'}}>
          <div style={{height:'48px',borderRadius:'12px',background:'linear-gradient(90deg,#141d2b 0,#1a2535 40px,#141d2b 80px)',backgroundSize:'400px',animation:'shimmer 1.4s ease infinite'}} />
          <div style={{height:'48px',borderRadius:'12px',background:'linear-gradient(90deg,#141d2b 0,#1a2535 40px,#141d2b 80px)',backgroundSize:'400px',animation:'shimmer 1.4s ease infinite'}} />
        </div>
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

  const getIcon = (ic: string): React.ReactElement => {
    const icons: Record<string, React.ReactElement> = {
      ck: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
      wa: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>,
      be: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
      cl: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
      tab: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
      drink: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>,
      user: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
      napkin: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>,
      room: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
      broom: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M8 6h8"/><path d="M8 10h8"/><path d="M8 14h8"/></svg>,
      conc: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
      wrench: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
      towel: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
      food: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
      flag: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
    }
    return icons[ic] || icons.user
  }

  const renderServiceButton = (idx: number, label: string, ic: string, handler: () => void) => {
    const btnKey = `btn${idx}`
    const state = buttonStates[btnKey]?.state || 'default'
    const elapsed = elapsedTimes[btnKey] || 0

    const stateClass = state === 'pending' ? 'pending' : state === 'accepted' ? 'accepted' : ''

    let statusContent = null
    if (state === 'pending') {
      statusContent = (
        <>
          <div className="spinner" />
          Requested · {elapsed}s
        </>
      )
    } else if (state === 'accepted') {
      statusContent = (
        <>
          <div className="ck">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          Accepted · On the Way
        </>
      )
    }

    return (
      <button className={`sb ${stateClass}`} onClick={handler} disabled={state !== 'default'}>
        <div>{getIcon(ic)}</div>
        <span className="sb-l">{label}</span>
        {statusContent && <div className="sb-st">{statusContent}</div>}
      </button>
    )
  }

  if (screen === 'main') {
    const v = VENUES[curVenue]
    const handlers = [handleRequestCheck, handleRequestWater, handleRequestServer, handleRequestPlates]

    return (
      <>
        <div className="vsw">
          {[
            { id: 'dining', label: '🍽 Restaurant' },
            { id: 'bar', label: '🍺 Bar' },
            { id: 'hotel', label: '🏨 Hotel' },
            { id: 'pool', label: '🏊 Pool' },
            { id: 'stadium', label: '🏟 Stadium' }
          ].map(vt => (
            <button key={vt.id} className={`vb ${curVenue === vt.id ? 'on' : ''}`} onClick={() => setCurVenue(vt.id)}>
              {vt.label}
            </button>
          ))}
        </div>

        <div className="card">
          <div className="ci-wrap">
            <div className="ci" style={{background:'rgba(239,68,68,.06)',borderColor:'rgba(239,68,68,.35)'}} onClick={() => go('urgent')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 18a5 5 0 0 0-10 0"/>
                <line x1="12" y1="2" x2="12" y2="9"/>
                <path d="M4.93 4.93l4.24 4.24"/>
                <path d="M19.07 4.93l-4.24 4.24"/>
              </svg>
            </div>
          </div>

          <div className="vh">
            <div className="ib">{v.n.charAt(0)}</div>
            <div className="vn">{v.n}</div>
            <div className="vt">{v.t}</div>
          </div>

          <div className="bg">
            {v.b.map((label, i) => renderServiceButton(i, label, v.ic[i], handlers[i]))}
          </div>

          <div className="esc">
            <button className="eb" onClick={() => go('allergy')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              Food Allergy
            </button>
          </div>

          {v.q && v.f && (
            <div className="sent">
              <div className="sent-q">{v.q}</div>
              <div className="sr">
                <button className="fx pos" onClick={() => { submitSentiment(3); go('happy'); }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                  <span className="fx-t">{v.f[0]}</span>
                </button>
                <button className="fx neu" onClick={() => { submitSentiment(2); go('okay'); }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                  <span className="fx-t">{v.f[1]}</span>
                </button>
                <button className="fx neg" onClick={() => { submitSentiment(1); go('sad'); }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                  <span className="fx-t">{v.f[2]}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </>
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

  if (screen === 'happy') {
    return <div className="sc on"><div className="ob" style={{color:'var(--t1)'}}>Happy Screen — Phase 2</div></div>
  }

  if (screen === 'okay') {
    return <div className="sc on"><div className="ob" style={{color:'var(--t1)'}}>Okay Screen — Phase 2</div></div>
  }

  if (screen === 'sad') {
    return <div className="sc on"><div className="ob" style={{color:'var(--t1)'}}>Sad Screen — Phase 2</div></div>
  }

  if (screen === 'resolve') {
    return <div className="sc on"><div className="ob" style={{color:'var(--t1)'}}>Resolved Screen — Phase 2</div></div>
  }

  if (screen === 'allergy') {
    return <div className="sc on"><div className="ob" style={{color:'var(--t1)'}}>Allergy Screen — Phase 2</div></div>
  }

  if (screen === 'alwait') {
    return <div className="sc on"><div className="ob" style={{color:'var(--t1)'}}>Allergy Wait Screen — Phase 2</div></div>
  }

  if (screen === 'alack') {
    return <div className="sc on"><div className="ob" style={{color:'var(--t1)'}}>Profile Screen — Phase 2</div></div>
  }

  if (screen === 'urgent') {
    return <div className="sc on"><div className="ob" style={{color:'var(--t1)'}}>Urgent Screen — Phase 2</div></div>
  }

  return null
}

export default App
