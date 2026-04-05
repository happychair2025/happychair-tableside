import { useEffect, useState, useRef } from 'react'
import { supabase } from './lib/supabase'
import type {
  Venue,
  Asset,
  RequestCategory,
  SentimentScore,
  AllergenSeverity,
} from './types'

const ALLERGEN_DB = [
  {n:'Milk',c:'Major 9'},{n:'Eggs',c:'Major 9'},{n:'Fish',c:'Major 9'},{n:'Shellfish',c:'Major 9'},
  {n:'Tree Nuts',c:'Major 9'},{n:'Peanuts',c:'Major 9'},{n:'Wheat',c:'Major 9'},{n:'Soy',c:'Major 9'},
  {n:'Sesame',c:'Major 9'},{n:'Salmon',c:'Fish'},{n:'Tuna',c:'Fish'},{n:'Cod',c:'Fish'},
  {n:'Shrimp',c:'Shellfish'},{n:'Crab',c:'Shellfish'},{n:'Lobster',c:'Shellfish'},
  {n:'Almonds',c:'Tree Nut'},{n:'Cashews',c:'Tree Nut'},{n:'Walnuts',c:'Tree Nut'},
  {n:'Pecans',c:'Tree Nut'},{n:'Pistachios',c:'Tree Nut'},{n:'Hazelnuts',c:'Tree Nut'},
  {n:'Butter',c:'Dairy'},{n:'Cream',c:'Dairy'},{n:'Cheese',c:'Dairy'},{n:'Yogurt',c:'Dairy'},
  {n:'Whey',c:'Dairy'},{n:'Casein',c:'Dairy'},{n:'Gluten',c:'Grain'},{n:'Barley',c:'Grain'},
  {n:'Rye',c:'Grain'},{n:'Oats',c:'Grain'},{n:'Corn',c:'Grain'},{n:'Mustard',c:'Spice'},
  {n:'Celery',c:'Vegetable'},{n:'Garlic',c:'Vegetable'},{n:'Onion',c:'Vegetable'},
  {n:'Tomato',c:'Vegetable'},{n:'Mushroom',c:'Vegetable'},{n:'Soy Sauce',c:'Sauce'},
  {n:'Fish Sauce',c:'Sauce'},{n:'Oyster Sauce',c:'Sauce'},{n:'Sulfites',c:'Additive'},
  {n:'MSG',c:'Additive'},{n:'Gelatin',c:'Meat'},{n:'Honey',c:'Other'},{n:'Alcohol',c:'Other'},
]

const PRESET_ALLERGENS = ['Milk','Eggs','Fish','Shellfish','Tree Nuts','Peanuts','Wheat','Soy','Sesame']

const SEVERITY_OPTIONS = [
  {v:'unsure',l:'Not Sure',d:"I'm not certain",c:'#94a3b8',dots:'—'},
  {v:'discomfort',l:'Causes Discomfort',d:'Mild reaction',c:'#22d3ee',dots:'●'},
  {v:'severe',l:'Severe Reaction',d:'Serious response',c:'#f59e0b',dots:'● ●'},
  {v:'anaphylaxis',l:'Anaphylaxis Risk',d:'Life-threatening',c:'#ef4444',dots:'● ● ●'},
]

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
  // @ts-expect-error - submitError will be used in future phases
  const [submitError, setSubmitError] = useState('')
  const [appError, setAppError] = useState<string | null>(null)

  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([])
  // @ts-expect-error - setAllergenSeverity will be used in future phases
  const [allergenSeverity, setAllergenSeverity] = useState<AllergenSeverity>('mild')
  const [allergenNotes, setAllergenNotes] = useState('')
  const [cooldowns, setCooldowns] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  const [decl, setDecl] = useState<Array<{name:string,risk:string,xc:boolean}>>([])
  const [curAllergen, setCurAllergen] = useState<string|null>(null)
  const [curRisk, setCurRisk] = useState<string|null>(null)
  const [curXC, setCurXC] = useState(false)
  const [allergenSearch, setAllergenSearch] = useState('')
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [allergyNotes, setAllergyNotes] = useState('')
  const [shakeSubmit, setShakeSubmit] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  const [curVenue, setCurVenue] = useState('dining')
  const [buttonStates, setButtonStates] = useState<Record<string, ServiceButtonState>>({})
  const [elapsedTimes, setElapsedTimes] = useState<Record<string, number>>({})
  const [okayNote, setOkayNote] = useState('')
  const [sadNote, setSadNote] = useState('')
  const [okayFeedback, setOkayFeedback] = useState<{sent:boolean,submitTime:Date|null,ackTime:Date|null,resolveTime:Date|null}>({sent:false,submitTime:null,ackTime:null,resolveTime:null})
  const [sadFeedback, setSadFeedback] = useState<{sent:boolean,submitTime:Date|null,ackTime:Date|null,resolveTime:Date|null}>({sent:false,submitTime:null,ackTime:null,resolveTime:null})

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  // @ts-expect-error - handleAllergenSubmit will be used in future phases
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

  // @ts-expect-error - toggleAllergen will be used in future phases
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

  const Face = ({type, size}: {type:'ok'|'warn'|'danger', size:number}) => {
    const colors = {ok:'#10b981', warn:'#f59e0b', danger:'#ef4444'}
    const mouths = {
      ok: <path d="M8 14s1.5 2 4 2 4-2 4-2"/>,
      warn: <line x1="8" y1="15" x2="16" y2="15"/>,
      danger: <path d="M16 16s-1.5-2-4-2-4 2-4 2"/>
    }
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke={colors[type]} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        {mouths[type]}
        <line x1="9" y1="9" x2="9.01" y2="9"/>
        <line x1="15" y1="9" x2="15.01" y2="9"/>
      </svg>
    )
  }

  const handleOkaySend = () => {
    const now = new Date()
    setOkayFeedback({sent:true, submitTime:now, ackTime:null, resolveTime:null})

    const ackDelay = 3000 + Math.random() * 4000
    setTimeout(() => {
      setOkayFeedback(prev => ({...prev, ackTime: new Date()}))

      const resolveDelay = 8000 + Math.random() * 7000
      setTimeout(() => {
        setOkayFeedback(prev => ({...prev, resolveTime: new Date()}))
        setTimeout(() => go('resolve'), 2000)
      }, resolveDelay)
    }, ackDelay)
  }

  const handleSadSend = () => {
    const now = new Date()
    setSadFeedback({sent:true, submitTime:now, ackTime:null, resolveTime:null})

    const ackDelay = 3000 + Math.random() * 4000
    setTimeout(() => {
      setSadFeedback(prev => ({...prev, ackTime: new Date()}))

      const resolveDelay = 8000 + Math.random() * 7000
      setTimeout(() => {
        setSadFeedback(prev => ({...prev, resolveTime: new Date()}))
        setTimeout(() => go('resolve'), 2000)
      }, resolveDelay)
    }, ackDelay)
  }

  const formatTime = (date: Date | null) => {
    if (!date) return '—'
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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
    return (
      <div className="sc" style={{position:'relative'}}>
        <div className="close-x" onClick={() => go('main')}>
          <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
        <div className="ob">
          <div className="of" style={{filter:'drop-shadow(0 0 24px rgba(16,185,129,.35))'}}>
            <Face type="ok" size={56} />
          </div>
          <div className="ot" style={{color:'var(--ok)'}}>Glad You're Enjoying It</div>
          <div className="os">A quick review helps other guests and supports our team.</div>
          <div className="ac" style={{textAlign:'center'}}>
            <button className="ac-btn" style={{background:'var(--ok)',color:'var(--bg)',padding:'14px',width:'100%',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:700,cursor:'pointer'}}>
              ⭐⭐⭐⭐⭐ Leave a Review
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'okay') {
    return (
      <div className="sc" style={{position:'relative'}}>
        <div className="close-x" onClick={() => go('main')}>
          <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
        <div className="ob">
          <div className="of" style={{filter:'drop-shadow(0 0 24px rgba(245,158,11,.35))'}}>
            <Face type="warn" size={56} />
          </div>
          <div className="ot" style={{color:'var(--warn)'}}>We Can Make This Better</div>
          <div className="os">{okayFeedback.sent ? 'A server has been notified.' : 'A server is coming by to help.'}</div>

          {!okayFeedback.sent ? (
            <div className="fc">
              <div className="fc-t">What Can We Fix Right Now?</div>
              <div className="fc-s">Share a quick note so we can help faster.</div>
              <textarea
                className="fc-ta"
                placeholder="What can we improve?"
                value={okayNote}
                onChange={(e) => setOkayNote(e.target.value)}
                rows={4}
                style={{borderColor:'var(--b)',focusBorderColor:'var(--warn)'} as React.CSSProperties}
              />
              <button
                className="fc-btn"
                style={{background:'var(--warn)',color:'var(--bg)'}}
                onClick={handleOkaySend}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                Send to Server
              </button>
            </div>
          ) : (
            <div className="fc">
              <div style={{textAlign:'center',marginBottom:'16px'}}>
                <div style={{width:'48px',height:'48px',borderRadius:'50%',background:'var(--warn)',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
              </div>
              <div className="fc-t">Sent to Your Server</div>
              <div className="fc-s">Your server has been notified.</div>

              <div className="tt">
                <div className="tt-r">
                  <div className="tt-dot" style={{background:'var(--ok)'}} />
                  <div className="tt-l">Submitted</div>
                  <div className="tt-v">{formatTime(okayFeedback.submitTime)}</div>
                </div>
                <div className="tt-r">
                  <div className={`tt-dot ${!okayFeedback.ackTime ? 'pulse' : ''}`} style={{background:okayFeedback.ackTime ? 'var(--ok)' : 'var(--warn)'}} />
                  <div className="tt-l">Server Acknowledged</div>
                  <div className="tt-v">{okayFeedback.ackTime ? formatTime(okayFeedback.ackTime) : 'waiting…'}</div>
                </div>
                <div className="tt-r">
                  <div className="tt-dot" style={{background:okayFeedback.resolveTime ? 'var(--ok)' : '#4b5563'}} />
                  <div className="tt-l">Resolved</div>
                  <div className="tt-v">{formatTime(okayFeedback.resolveTime)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (screen === 'sad') {
    return (
      <div className="sc" style={{position:'relative'}}>
        <div className="close-x" onClick={() => go('main')}>
          <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
        <div className="ob">
          <div className="of" style={{filter:'drop-shadow(0 0 24px rgba(239,68,68,.35))'}}>
            <Face type="danger" size={56} />
          </div>
          <div className="ot" style={{color:'var(--danger)'}}>We're Sorry. Let's Make This Right.</div>
          <div className="os">{sadFeedback.sent ? 'A manager has been notified.' : 'A manager is on the way now.'}</div>

          {!sadFeedback.sent ? (
            <div className="fc">
              <div className="fc-t">Tell Us What Happened</div>
              <div className="fc-s">This helps us resolve it quickly.</div>
              <textarea
                className="fc-ta"
                placeholder="What went wrong?"
                value={sadNote}
                onChange={(e) => setSadNote(e.target.value)}
                rows={4}
                style={{borderColor:'var(--b)',focusBorderColor:'var(--danger)'} as React.CSSProperties}
              />
              <button
                className="fc-btn"
                style={{background:'var(--danger)',color:'var(--bg)'}}
                onClick={handleSadSend}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                Send to Manager
              </button>
            </div>
          ) : (
            <div className="fc">
              <div style={{textAlign:'center',marginBottom:'16px'}}>
                <div style={{width:'48px',height:'48px',borderRadius:'50%',background:'var(--danger)',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
              </div>
              <div className="fc-t">Sent to Manager</div>
              <div className="fc-s">A manager has been notified.</div>

              <div className="tt">
                <div className="tt-r">
                  <div className="tt-dot" style={{background:'var(--ok)'}} />
                  <div className="tt-l">Submitted</div>
                  <div className="tt-v">{formatTime(sadFeedback.submitTime)}</div>
                </div>
                <div className="tt-r">
                  <div className={`tt-dot ${!sadFeedback.ackTime ? 'pulse' : ''}`} style={{background:sadFeedback.ackTime ? 'var(--ok)' : 'var(--warn)'}} />
                  <div className="tt-l">Manager Acknowledged</div>
                  <div className="tt-v">{sadFeedback.ackTime ? formatTime(sadFeedback.ackTime) : 'waiting…'}</div>
                </div>
                <div className="tt-r">
                  <div className="tt-dot" style={{background:sadFeedback.resolveTime ? 'var(--ok)' : '#4b5563'}} />
                  <div className="tt-l">Resolved</div>
                  <div className="tt-v">{formatTime(sadFeedback.resolveTime)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (screen === 'resolve') {
    return (
      <div className="sc" style={{position:'relative'}}>
        <div className="close-x" onClick={() => go('main')}>
          <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
        <div className="ob">
          <div className="of" style={{filter:'drop-shadow(0 0 24px rgba(34,211,238,.35))'}}>
            <Face type="ok" size={56} />
          </div>
          <div className="ot" style={{color:'var(--cyan)'}}>Did We Make It Right?</div>
          <div className="os">We hope your experience improved.</div>
          <div className="rbtns">
            <button
              className="rbtn"
              style={{background:'var(--cyan)',color:'var(--bg)',border:'none'}}
              onClick={() => go('happy')}
            >
              Yes, All Good
            </button>
            <button
              className="rbtn"
              style={{background:'transparent',color:'var(--t1)',border:'1px solid var(--b)'}}
              onClick={() => go('main')}
            >
              Not Yet
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'allergy') {
    const filteredResults = allergenSearch.length > 0
      ? ALLERGEN_DB.filter(a => a.n.toLowerCase().includes(allergenSearch.toLowerCase())).slice(0, 6)
      : []
    const exactMatch = ALLERGEN_DB.some(a => a.n.toLowerCase() === allergenSearch.toLowerCase())

    const handleAddAllergen = () => {
      if (!curAllergen || !curRisk) return
      setDecl(prev => [...prev, { name: curAllergen, risk: curRisk, xc: curXC }])
      setCurAllergen(null)
      setCurRisk(null)
      setCurXC(false)
    }

    const handleRemoveAllergen = (index: number) => {
      setDecl(prev => prev.filter((_, i) => i !== index))
    }

    const handleSelectPreset = (allergen: string) => {
      const alreadyAdded = decl.some(d => d.name === allergen)
      if (alreadyAdded) return
      setCurAllergen(allergen)
      setCurRisk(null)
      setCurXC(false)
    }

    const handleSearchSelect = (name: string) => {
      setCurAllergen(name)
      setCurRisk(null)
      setCurXC(false)
      setAllergenSearch('')
      setShowSearchResults(false)
    }

    const handleAddCustom = () => {
      if (allergenSearch.trim()) {
        setCurAllergen(allergenSearch.trim())
        setCurRisk(null)
        setCurXC(false)
        setAllergenSearch('')
        setShowSearchResults(false)
      }
    }

    const handleNotifyStaff = () => {
      if (decl.length === 0) {
        setShakeSubmit(true)
        setShowHint(true)
        setTimeout(() => setShakeSubmit(false), 500)
        setTimeout(() => setShowHint(false), 3000)
        return
      }
      go('alwait')
    }

    const getSeverityStyle = (risk: string) => {
      const opt = SEVERITY_OPTIONS.find(s => s.v === risk)
      if (!opt) return {}
      return {
        background: opt.c + '20',
        border: `1px solid ${opt.c}`,
        color: opt.c
      }
    }

    return (
      <div className="sc" style={{position:'relative'}}>
        <div className="close-x" onClick={() => go('main')}>
          <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
        <div className="scr" style={{paddingTop:'14px'}}>
          <div style={{textAlign:'center',marginBottom:'6px'}}>
            <div style={{width:'56px',height:'56px',background:'rgba(245,158,11,.08)',border:'2px solid #f59e0b',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
            </div>
            <div className="pt" style={{justifyContent:'center'}}>Tell Us About Your Allergies</div>
          </div>
          <div className="ps">Select any allergies or add your own.</div>

          {decl.length > 0 && (
            <div className="dl" style={{margin:'0 18px 16px'}}>
              <div className="sec">Your Allergies</div>
              {decl.map((d, i) => {
                const opt = SEVERITY_OPTIONS.find(s => s.v === d.risk)
                return (
                  <div className="di" key={i}>
                    <div className="di-n">{d.name}</div>
                    <div className="di-b" style={getSeverityStyle(d.risk)}>{opt?.l || d.risk}</div>
                    {d.xc && <div className="di-xc">Cross-Contact</div>}
                    <button className="di-rm" onClick={() => handleRemoveAllergen(i)}>✕</button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="sec">Search Allergies</div>
          <div className="srw" ref={searchRef}>
            <div className="sri">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </div>
            <input
              className="srb"
              placeholder="Search — butter, fish stock, gluten..."
              value={allergenSearch}
              onChange={(e) => {
                setAllergenSearch(e.target.value)
                setShowSearchResults(true)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && allergenSearch.trim()) {
                  handleAddCustom()
                }
              }}
            />
            {showSearchResults && allergenSearch.length > 0 && (
              <div className="srl open">
                {filteredResults.map((item, idx) => (
                  <div key={idx} className="srl-i" onClick={() => handleSearchSelect(item.n)}>
                    <div className="srl-n">{item.n}</div>
                    <div className="srl-c">{item.c}</div>
                  </div>
                ))}
                {!exactMatch && allergenSearch.trim() && (
                  <div className="srl-new" onClick={handleAddCustom}>
                    + Add "{allergenSearch}" as custom
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="sec">Select Common Allergies</div>
          <div className="chips">
            {PRESET_ALLERGENS.map(p => {
              const alreadyAdded = decl.some(d => d.name === p)
              const isSelected = curAllergen === p
              return (
                <button
                  key={p}
                  className={`chip ${alreadyAdded ? 'added' : isSelected ? 'on' : ''}`}
                  onClick={() => handleSelectPreset(p)}
                >
                  {p}{alreadyAdded ? ' ✓' : ''}
                </button>
              )
            })}
          </div>

          {curAllergen && (
            <div className="cfg">
              <div className="cfg-t">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                {curAllergen}
              </div>
              <div className="cfg-s">How Serious Is It? <span style={{fontWeight:500,textTransform:'none',fontSize:'11px',color:'var(--t2)'}}>(Select One)</span></div>
              <div className="rg">
                {SEVERITY_OPTIONS.map(r => (
                  <div
                    key={r.v}
                    className={`rk ${curRisk === r.v ? 'on' : ''}`}
                    data-v={r.v}
                    onClick={() => setCurRisk(r.v)}
                  >
                    <div style={{position:'absolute',left:0,top:0,bottom:0,width:'3px',background:r.c,borderRadius:'10px 0 0 10px'}} />
                    <div className="rk-n">{r.l}</div>
                    <div className="rk-d">{r.d}</div>
                    <div style={{color:r.c,fontSize:'10px',marginTop:'4px'}}>{r.dots}</div>
                  </div>
                ))}
              </div>
              <div className={`ccr ${curXC ? 'on' : ''}`} onClick={() => setCurXC(!curXC)}>
                <div className="cck">
                  {curXC && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>
                <div>
                  <div style={{fontSize:'13px',fontWeight:700,color:'var(--t1)'}}>Avoid Cross-Contact</div>
                  <div style={{fontSize:'12px',color:'var(--t2)',marginTop:'2px'}}>Separate surfaces, utensils, and prep.</div>
                </div>
              </div>
              <div style={{display:'flex',justifyContent:'flex-end'}}>
                <button className="cfg-a" disabled={!curRisk} onClick={handleAddAllergen}>
                  Add
                </button>
              </div>
            </div>
          )}

          <div className="sec">What Else Should We Know?</div>
          <textarea
            className="nta"
            placeholder="Example: severe if exposed to shared fryer oil, no cheese garnish."
            value={allergyNotes}
            onChange={(e) => setAllergyNotes(e.target.value)}
          />

          <button
            className="sbtn"
            onClick={handleNotifyStaff}
            style={shakeSubmit ? {animation: 'shake 0.5s'} : {}}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            Notify Staff
          </button>
          {showHint && <div className="hint">Please add at least one allergy</div>}
        </div>
      </div>
    )
  }

  if (screen === 'alwait') {
    return (
      <div className="sc" style={{position:'relative'}}>
        <div className="close-x" onClick={() => go('main')}>
          <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
        <div className="ob">
          <div className="wi">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
          </div>
          <div className="ot" style={{color:'#f59e0b'}}>
            {decl.length === 1 ? 'Allergy Sent' : 'Allergies Sent'}
          </div>
          <div className="os">Your server has been notified.</div>
          <div style={{display:'flex',alignItems:'center',gap:'10px',color:'var(--t1)',fontSize:'14px',fontWeight:500,marginTop:'20px'}}>
            <div className="spinner" /> Waiting for confirmation...
          </div>
          <button onClick={() => go('alack')} style={{marginTop:'20px',padding:'10px 20px',background:'none',border:'1px solid var(--b)',borderRadius:'10px',color:'var(--t1)',fontSize:'13px',cursor:'pointer'}}>
            Demo: simulate acknowledgment →
          </button>
        </div>
      </div>
    )
  }

  if (screen === 'alack') {
    return (
      <div className="sc" style={{position:'relative'}}>
        <div className="close-x" onClick={() => go('main')}>
          <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>
        <div className="ob">
          <div style={{width:'68px',height:'68px',background:'rgba(245,158,11,.08)',border:'2px solid #f59e0b',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:'18px',boxShadow:'0 0 30px rgba(245,158,11,.2)'}}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              <polyline points="20 6 9 17 4 12" stroke="#f59e0b" strokeWidth="1.5" style={{transform:'translate(2px, 2px)'}}/>
            </svg>
          </div>
          <div className="ot" style={{color:'#f59e0b'}}>You're All Set</div>
          <div className="os">Your server and kitchen have been notified.</div>

          <div style={{width:'60px',height:'1px',background:'var(--b)',margin:'28px 0'}} />

          <div style={{background:'var(--s1)',border:'1px solid var(--b)',borderRadius:'18px',padding:'28px 24px',maxWidth:'320px',width:'100%'}}>
            <div style={{textAlign:'center',marginBottom:'8px'}}>
              <svg width="140" height="40" viewBox="0 0 140 40" fill="none">
                <circle cx="20" cy="20" r="18" fill="#22d3ee" fillOpacity="0.12"/>
                <path d="M12 20h8m0 0v-8m0 8v8" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M45 15v10m0-10h-6v10h6m0-10h6m-6 5h4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M62 20c0-2.76 2.24-5 5-5s5 2.24 5 5-2.24 5-5 5-5-2.24-5-5z" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M77 15c2.76 0 5 2.24 5 5s-2.24 5-5 5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M90 15v10m0-5h6m-6 0c0-2.76 2.24-5 5-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M105 15v10m0-8.5c2.76 0 5 2.24 5 5v3.5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{color:'#f59e0b',fontSize:'15px',fontWeight:600,marginBottom:'18px',textAlign:'center'}}>
              Your allergy details, anywhere.
            </div>
            <div style={{color:'var(--t1)',fontSize:'14px',lineHeight:1.6,maxWidth:'260px',margin:'0 auto 24px',fontWeight:500,textAlign:'center'}}>
              One tap to share at any venue.<br/>You're always in control.
            </div>
            <button className="pb" style={{width:'100%'}}>Create Free Profile</button>
          </div>
        </div>
      </div>
    )
  }

  if (screen === 'urgent') {
    return <div className="sc on"><div className="ob" style={{color:'var(--t1)'}}>Urgent Screen — Phase 2</div></div>
  }

  return null
}

export default App
