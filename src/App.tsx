import { useEffect, useState, useRef } from 'react'
import { supabase } from './lib/supabase'
import type {
  Venue,
  Asset,
  SentimentScore,
} from './types'

// ══════════════════════════════════════════════════════════════
// ALLERGEN DATABASE
// ══════════════════════════════════════════════════════════════
const ALLERGEN_DB = [
  {n:'Milk',c:'Major 9'},{n:'Eggs',c:'Major 9'},{n:'Fish',c:'Major 9'},{n:'Shellfish',c:'Major 9'},
  {n:'Tree Nuts',c:'Major 9'},{n:'Peanuts',c:'Major 9'},{n:'Wheat',c:'Major 9'},{n:'Soy',c:'Major 9'},
  {n:'Sesame',c:'Major 9'},{n:'Salmon',c:'Fish'},{n:'Tuna',c:'Fish'},{n:'Cod',c:'Fish'},
  {n:'Shrimp',c:'Shellfish'},{n:'Crab',c:'Shellfish'},{n:'Lobster',c:'Shellfish'},{n:'Clams',c:'Shellfish'},
  {n:'Almonds',c:'Tree Nut'},{n:'Cashews',c:'Tree Nut'},{n:'Walnuts',c:'Tree Nut'},
  {n:'Pecans',c:'Tree Nut'},{n:'Pistachios',c:'Tree Nut'},{n:'Hazelnuts',c:'Tree Nut'},
  {n:'Butter',c:'Dairy'},{n:'Cream',c:'Dairy'},{n:'Cheese',c:'Dairy'},{n:'Yogurt',c:'Dairy'},
  {n:'Whey',c:'Dairy'},{n:'Casein',c:'Dairy'},{n:'Gluten',c:'Grain'},{n:'Barley',c:'Grain'},
  {n:'Rye',c:'Grain'},{n:'Oats',c:'Grain'},{n:'Corn',c:'Grain'},{n:'Mustard',c:'Spice'},
  {n:'Celery',c:'Vegetable'},{n:'Garlic',c:'Vegetable'},{n:'Onion',c:'Vegetable'},
  {n:'Tomato',c:'Vegetable'},{n:'Mushroom',c:'Vegetable'},{n:'Soy Sauce',c:'Sauce'},
  {n:'Fish Sauce',c:'Sauce'},{n:'Sulfites',c:'Additive'},{n:'MSG',c:'Additive'},
  {n:'Gelatin',c:'Meat'},{n:'Honey',c:'Other'},{n:'Alcohol',c:'Other'},
];
const PRESETS = ['Milk','Eggs','Fish','Shellfish','Tree Nuts','Peanuts','Wheat','Soy','Sesame'];
const SEV = [
  {v:'unsure',l:'Not Sure',d:"I'm not certain",c:'#94a3b8',dots:'—'},
  {v:'discomfort',l:'Causes Discomfort',d:'Mild reaction',c:'#22d3ee',dots:'●'},
  {v:'severe',l:'Severe Reaction',d:'Serious response',c:'#f59e0b',dots:'● ●'},
  {v:'anaphylaxis',l:'Anaphylaxis Risk',d:'Life-threatening',c:'#ef4444',dots:'● ● ●'},
];
// Ascending risk order, derived from SEV so the two can never drift apart.
// A declaration carries ONE severity, but the guest sets a risk PER allergen — the
// row must therefore carry the highest risk declared, not the first one entered.
const SEV_RANK: Record<string, number> = SEV.reduce(
  (acc, s, i) => { acc[s.v] = i; return acc },
  {} as Record<string, number>
);
// Highest-risk value among the declared allergens. Returns null when the list is
// empty or every risk is unrecognised — callers must treat null as "do not submit"
// rather than substituting a default, because no safe default exists for severity.
function maxSeverity(risks: string[]): string | null {
  let best: string | null = null;
  for (const r of risks) {
    if (!(r in SEV_RANK)) continue;
    if (best === null || SEV_RANK[r] > SEV_RANK[best]) best = r;
  }
  return best;
}
const SEV_COLORS: Record<string,string> = {unsure:'#94a3b8',discomfort:'#22d3ee',severe:'#f59e0b',anaphylaxis:'#ef4444'};
const SEV_BGS: Record<string,string> = {unsure:'rgba(148,163,184,.1)',discomfort:'rgba(34,211,238,.1)',severe:'rgba(245,158,11,.1)',anaphylaxis:'rgba(239,68,68,.1)'};

// ══════════════════════════════════════════════════════════════
// SVG COMPONENTS
// ══════════════════════════════════════════════════════════════
const Face = ({type,size}:{type:'ok'|'warn'|'danger',size:number}) => {
  const c = {ok:'#10b981',warn:'#f59e0b',danger:'#ef4444'}[type];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      {type==='ok' && <path d="M8 14s1.5 2 4 2 4-2 4-2"/>}
      {type==='warn' && <line x1="8" y1="15" x2="16" y2="15"/>}
      {type==='danger' && <path d="M16 16s-1.5-2-4-2-4 2-4 2"/>}
      <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
    </svg>
  );
};

const ShieldIcon = ({size=20,color='#f59e0b'}:{size?:number,color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const ShieldCheck = ({size=28,color='#f59e0b'}:{size?:number,color?:string}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <polyline points="9 12 11 14 15 10"/>
  </svg>
);

const CloseX = ({onClick}:{onClick:()=>void}) => (
  <div className="close-x" onClick={onClick}>
    <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  </div>
);

const HandIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2"/>
    <path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/>
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>
  </svg>
);

// Service button icons
const SvcIcons: Record<string, JSX.Element> = {
  ck: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  wa: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>,
  be: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  cl: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>,
};

// ══════════════════════════════════════════════════════════════
// APP
// ══════════════════════════════════════════════════════════════
type Screen = 'loading'|'error'|'main'|'happy'|'okay'|'sad'|'resolve'|'allergy'|'alwait'|'alack'|'urgent'|'success'

function App() {
  // ── CORE STATE ──
  const [screen, setScreen] = useState<Screen>('loading')
  const [venue, setVenue] = useState<Venue | null>(null)
  const [asset, setAsset] = useState<Asset | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [submitError, setSubmitError] = useState('')
  // Snapshot of what was ACTUALLY accepted by the database, captured at the moment the
  // INSERT succeeds. The receipt screen echoes this rather than re-reading `decl`, so the
  // guest is shown what Happy Chair holds, not what happens to be in the form afterwards.
  const [receipt, setReceipt] = useState<{id:string,allergens:string[],severity:string}|null>(null)
  // Timestamp of a DATABASE-PERSISTED kitchen_ack_at. Null means only "venue review has not
  // yet been proven" — never an error, and never a reason to retract the proven receipt.
  const [reviewedAt, setReviewedAt] = useState<string|null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sentimentRowId, setSentimentRowId] = useState<string | null>(null)
  const [notesSubmitting, setNotesSubmitting] = useState(false)
  const [appError, setAppError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string|null>(null)

  // ── SERVICE BUTTON STATE ──
  const [btnStates, setBtnStates] = useState<Record<number,{status:string,at:number}>>({})

  // ── SENTIMENT STATE ──
  const [okayNote, setOkayNote] = useState('')
  const [sadNote, setSadNote] = useState('')
  const [feedbackSent, setFeedbackSent] = useState<{type:string,submitTime:Date,ackTime:Date|null,resolveTime:Date|null}|null>(null)

  // ── ALLERGY STATE ──
  const [decl, setDecl] = useState<Array<{name:string,risk:string,xc:boolean}>>([])
  const [curAllergen, setCurAllergen] = useState<string|null>(null)
  const [curRisk, setCurRisk] = useState<string|null>(null)
  const [curXC, setCurXC] = useState(false)
  const [allergenSearch, setAllergenSearch] = useState('')
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [allergenNotes, setAllergenNotes] = useState('')
  const [submitHint, setSubmitHint] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // ── URGENT STATE ──
  const [holdProgress, setHoldProgress] = useState(0)
  const [holdPhase, setHoldPhase] = useState(0)
  const holdRAF = useRef<number|null>(null)

  // ── SPLASH STATE ──
  const [showSplash, setShowSplash] = useState(true)
  const [appVisible, setAppVisible] = useState(false)

  const params = new URLSearchParams(window.location.search)
  const venueId = params.get('venue') || params.get('v')
  const tableParam = params.get('table') || params.get('t') || params.get('asset')
  const [assetId, setAssetId] = useState<string | null>(tableParam)
  const [resolvedVenueId, setResolvedVenueId] = useState<string | null>(venueId)

  const go = (id: Screen) => {
    setScreen(id)
    setSubmitError('')
    // Reset sentiment session state on return to main so each new sentiment
    // attempt starts clean (no stale row id, no leftover note text).
    if (id === 'main') {
      setSentimentRowId(null)
      setFeedbackSent(null)
      setOkayNote('')
      setSadNote('')
    }
  }

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2400)
  }

  // ── SPLASH TIMER ──
  useEffect(() => {
    const t1 = setTimeout(() => { setShowSplash(false); setAppVisible(true) }, 2600)
    return () => clearTimeout(t1)
  }, [])

  // ── CLICK OUTSIDE SEARCH ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchResults(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ══════════════════════════════════════════════════════════════
  // SUPABASE DATA LOADING — PRESERVED EXACTLY
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!tableParam) {
      setAppError('invalid_qr')
      setLoading(false)
      return
    }
    async function loadData() {
      setLoading(true)
      try {
        // Try lookup by UUID first, then by label within this venue
        const tp = tableParam as string // guarded by early return above
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tp)
        let resolvedVenueId = venueId
        if (!resolvedVenueId && isUuid) {
          const { data: assetForVenue } = await supabase.from('assets').select('venue_id').eq('id', tp).maybeSingle()
          if (assetForVenue?.venue_id) resolvedVenueId = assetForVenue.venue_id
        }
        if (!resolvedVenueId) { setAppError('venue_not_found'); setLoading(false); return }
        setResolvedVenueId(resolvedVenueId)
        // select('id,name') — exactly the two columns used: id for this filter, name
        // for the header. Previously select('*'), which pulled all 47 venue columns
        // (tenant_id, owner_user_id, stripe_customer_id, plan_status, address, phone…)
        // to an unauthenticated client that renders none of them. Narrowing here is
        // what allows anon to be restricted to (id, name) at the grant level — under
        // column-scoped grants Postgres denies a select('*') outright rather than
        // returning the permitted subset, so this must ship BEFORE that grant applies.
        const venueResult = await supabase.from('venues').select('id,name').eq('id', resolvedVenueId).maybeSingle()
        if (venueResult.error || !venueResult.data) { setAppError('venue_not_found'); setLoading(false); return }
        setVenue(venueResult.data)
        let assetResult
        if (isUuid) {
          assetResult = await supabase.from('assets').select('*').eq('id', tp).maybeSingle()
        }
        if (!assetResult?.data) {
          assetResult = await supabase.from('assets').select('*').eq('venue_id', resolvedVenueId).eq('label', tp).maybeSingle()
        }
        if (!assetResult?.data) {
          // Try case-insensitive label match
          assetResult = await supabase.from('assets').select('*').eq('venue_id', resolvedVenueId).ilike('label', tp).maybeSingle()
        }
        if (!assetResult?.data) { setAppError('asset_not_found'); setLoading(false); return }

        setAssetId(assetResult.data.id)
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
  }, [venueId, tableParam])

  // ══════════════════════════════════════════════════════════════
  // SUPABASE HANDLERS — PRESERVED EXACTLY
  // ══════════════════════════════════════════════════════════════
  const handleRequestCheck = async () => {
    if (!resolvedVenueId || !assetId) return
    setSubmitError('')
    const { error } = await supabase.from('requests').insert({
      venue_id: resolvedVenueId, asset_id: assetId, category: 'check_please', status: 'pending',
    })
    if (error) { setSubmitError('Failed to send request. Please try again.'); return }
  }

  const handleRequestWater = async () => {
    if (!resolvedVenueId || !assetId) return
    setSubmitError('')
    const { error } = await supabase.from('requests').insert({
      venue_id: resolvedVenueId, asset_id: assetId, category: 'water', status: 'pending',
    })
    if (error) { setSubmitError('Failed to send request. Please try again.'); return }
  }

  const handleRequestServer = async () => {
    if (!resolvedVenueId || !assetId) return
    setSubmitError('')
    const { error } = await supabase.from('requests').insert({
      venue_id: resolvedVenueId, asset_id: assetId, category: 'waiter', status: 'pending',
    })
    if (error) { setSubmitError('Failed to send request. Please try again.'); return }
  }

  const handleRequestPlates = async () => {
    if (!resolvedVenueId || !assetId) return
    setSubmitError('')
    const { error } = await supabase.from('requests').insert({
      venue_id: resolvedVenueId, asset_id: assetId, category: 'clear', status: 'pending',
    })
    if (error) { setSubmitError('Failed to send request. Please try again.'); return }
  }

  const handleAllergenSubmit = async () => {
    if (!resolvedVenueId || !assetId || decl.length === 0) {
      // Previously a silent `return` that still navigated the guest to a success screen.
      setSubmitError("We couldn't confirm your allergy declaration was received. Please tell your server about the allergy directly.")
      return null
    }
    setSubmitError('')
    const guestSessionId = crypto.randomUUID()
    // Severity is the HIGHEST risk declared, not the first entered. Previously this
    // read decl[0]?.risk: a guest declaring lactose (discomfort) then peanut
    // (anaphylaxis) wrote 'discomfort'. The kitchen board gates its anaphylaxis
    // chime and its lockout screen on this exact field, so the escalation silently
    // did not fire — a row was written, it looked correct, and nothing downstream
    // knew it was wrong.
    const severity = maxSeverity(decl.map(d => d.risk))
    // No safe default exists for severity, so refuse to submit rather than guess.
    // The prior `|| 'unknown'` was not a valid value either — the DB CHECK allows
    // only {unsure, discomfort, severe, anaphylaxis}, so it would have failed as an
    // opaque 23514 after the guest thought they had sent it.
    if (!severity) { setSubmitError('Please set a risk level for each allergy.'); return null }
    // .select('id').single() so the declaration can be re-read by id afterwards. anon holds
    // both the INSERT and SELECT grant, and the select policy qual
    // (created_at >= now() - 36h) is satisfied by a row created moments ago.
    const { data: row, error } = await supabase.from('allergen_declarations').insert({
      venue_id: resolvedVenueId, asset_id: assetId,
      allergens: decl.map(d => d.name),
      severity,
      // Collected per allergen and shown back to the guest as a "Cross-Contact"
      // badge, but never persisted until now. some() is the safe reading: if the
      // guest flagged cross-contact on ANY allergen, the declaration carries it.
      cross_contact: decl.some(d => d.xc),
      notes: allergenNotes || undefined,
      guest_session_id: guestSessionId,
      status: 'pending',
    }).select('id').single()
    // A failed declaration must fail toward a human. "Try again" alone leaves a guest with
    // an allergy believing the restaurant has something it does not.
    if (error) {
      setSubmitError("We couldn't confirm your allergy declaration was received. Please tell your server about the allergy directly.")
      return null
    }
    // Only the database accepting the row establishes receipt. Returned so the caller can
    // gate navigation on it — see trySubmit.
    return { id: row.id as string, allergens: decl.map(d => d.name), severity }
  }

  const submitSentiment = async (score: SentimentScore) => {
    if (!resolvedVenueId || !assetId || submitting) return
    setSubmitting(true)
    setSubmitError('')
    const payload = score === 3
      ? { venue_id: resolvedVenueId, asset_id: assetId, score, google_review_prompted: true, manager_intervention_needed: false, notification_priority: null }
      : score === 2
      ? { venue_id: resolvedVenueId, asset_id: assetId, score, google_review_prompted: false, manager_intervention_needed: false, notification_priority: 'normal' }
      : { venue_id: resolvedVenueId, asset_id: assetId, score, google_review_prompted: false, manager_intervention_needed: true, notification_priority: 'urgent' }
    // .select('id').single() so we can UPDATE this row later with optional notes.
    const { data, error } = await supabase
      .from('sentiment_ratings')
      .insert(payload)
      .select('id')
      .single()
    if (error || !data) {
      console.error('[tableside] sentiment submit failed:', error)
      setSubmitError("Couldn't send feedback — try again.")
      setSubmitting(false)
      return
    }
    // Reset any leftover note state from a prior sentiment session before
    // capturing the new row id.
    setOkayNote('')
    setSadNote('')
    setFeedbackSent(null)
    setSentimentRowId(data.id)
    setSubmitting(false)
    go(score === 3 ? 'happy' : score === 2 ? 'okay' : 'sad')
  }

  // Returns true on success so the caller can gate the success toast/navigation.
  // The hold mechanism in the urgent surface acts as the in-flight guard, so no
  // submitting flag is needed here.
  const handleUrgentSubmit = async (): Promise<boolean> => {
    if (!resolvedVenueId || !assetId) return false
    const { error } = await supabase.from('requests').insert({
      venue_id: resolvedVenueId, asset_id: assetId, category: 'critical', status: 'pending',
    })
    if (error) {
      console.error('[tableside] urgent submit failed:', error)
      setSubmitError("Couldn't reach staff — please wave for help.")
      return false
    }
    return true
  }

  // ══════════════════════════════════════════════════════════════
  // SERVICE BUTTON TAP + UBER STATES
  // ══════════════════════════════════════════════════════════════
  const svcHandlers = [handleRequestCheck, handleRequestWater, handleRequestServer, handleRequestPlates]
  const svcLabels = ['Request Check', 'Refill Water', 'Get Server', 'Clear Plates']
  const svcIcons = ['ck', 'wa', 'be', 'cl']

  const handleSvcTap = async (idx: number) => {
    if (btnStates[idx]) return
    setBtnStates(p => ({...p, [idx]: {status:'pending', at:Date.now()}}))
    await svcHandlers[idx]()
    showToast(`${svcLabels[idx]} requested`)
    // Simulate accept (3-7s)
    setTimeout(() => {
      setBtnStates(p => ({...p, [idx]: {status:'accepted', at:p[idx]?.at || Date.now()}}))
    }, 3000 + Math.random() * 4000)
    // Simulate complete (8-15s)
    setTimeout(() => {
      setBtnStates(p => { const n = {...p}; delete n[idx]; return n })
    }, 8000 + Math.random() * 7000)
  }

  // ── BUTTON TIMER ──
  const [, setTick] = useState(0)
  useEffect(() => {
    const hasPending = Object.values(btnStates).some(b => b.status === 'pending')
    if (!hasPending) return
    const iv = setInterval(() => setTick(t => t+1), 1000)
    return () => clearInterval(iv)
  }, [btnStates])

  const fmtTime = (ms: number) => {
    const sec = Math.floor((Date.now() - ms) / 1000)
    return sec < 60 ? `${sec}s` : `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`
  }

  // ══════════════════════════════════════════════════════════════
  // SENTIMENT FEEDBACK
  // ══════════════════════════════════════════════════════════════
  // Persists the note to the existing sentiment_ratings row created at sentiment
  // tap. The previous version simulated ack/resolve via setTimeout and never
  // wrote to Supabase — the textarea content was silently discarded. Real
  // ack/resolve signals don't exist on this table; the timeline below honestly
  // displays "waiting…" / "—" for those states.
  const sendFeedback = async (type: 'okay'|'sad') => {
    if (!sentimentRowId || notesSubmitting) return
    const noteText = (type === 'okay' ? okayNote : sadNote).trim()
    if (!noteText) return
    setNotesSubmitting(true)
    setSubmitError('')
    const { error } = await supabase
      .from('sentiment_ratings')
      .update({ notes: noteText })
      .eq('id', sentimentRowId)
    if (error) {
      console.error('[tableside] notes update failed:', error)
      setSubmitError("Couldn't send your message — try again.")
      setNotesSubmitting(false)
      // Textarea text intentionally preserved so the guest can retry without retyping.
      return
    }
    setNotesSubmitting(false)
    setFeedbackSent({ type, submitTime: new Date(), ackTime: null, resolveTime: null })
  }

  const fmtClock = (d: Date) => d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})

  // ══════════════════════════════════════════════════════════════
  // ALLERGY HELPERS
  // ══════════════════════════════════════════════════════════════
  const selectAllergen = (name: string) => {
    if (decl.some(d => d.name === name)) return
    setCurAllergen(name); setCurRisk(null); setCurXC(false)
  }

  const addToDecl = () => {
    if (!curAllergen || !curRisk) return
    setDecl(prev => [...prev, {name: curAllergen!, risk: curRisk!, xc: curXC}])
    setCurAllergen(null); setCurRisk(null); setCurXC(false)
    showToast('Added to declaration ✓')
  }

  const removeDecl = (idx: number) => setDecl(prev => prev.filter((_,i) => i !== idx))

  const searchResults = allergenSearch.length > 0
    ? ALLERGEN_DB.filter(a => a.n.toLowerCase().includes(allergenSearch.toLowerCase()) && !decl.some(d => d.name === a.n)).slice(0, 6)
    : []

  // VENUE-REVIEW POLL. One declaration row, one guest-facing state.
  //
  // Deliberately a poll and NOT a realtime subscription. A subscription would satisfy only
  // the case where the acknowledgement happens while the guest is watching; it would still
  // need a read for an acknowledgement that landed BEFORE the guest got here, and another
  // for one missed during a drop — two mechanisms doing one job, plus channel lifecycle and
  // reconnect handling this app has never had. The leading immediate read below covers all
  // three cases with a single code path.
  //
  // Bounded by the screen: it runs only while the receipt is on screen and stops the moment
  // review is proven. Leaving the screen clears it; returning re-runs the immediate read, so
  // an acknowledgement that landed in between is picked up at once.
  //
  // A failed read is swallowed. Receipt is already proven and must not be retracted because
  // a later read failed, and a missing kitchen_ack_at is not an error — see AC-5.
  useEffect(() => {
    if (screen !== 'alwait' || !receipt || reviewedAt) return
    let cancelled = false
    const check = async () => {
      const { data, error } = await supabase
        .from('allergen_declarations').select('kitchen_ack_at').eq('id', receipt.id).maybeSingle()
      if (cancelled || error || !data) return
      if (data.kitchen_ack_at) setReviewedAt(data.kitchen_ack_at as string)
    }
    check()
    const t = setInterval(check, 5000)
    return () => { cancelled = true; clearInterval(t) }
  }, [screen, receipt, reviewedAt])

  const trySubmit = async () => {
    if (decl.length === 0) { setSubmitHint(true); setTimeout(() => setSubmitHint(false), 3000); return }
    if (submitting) return
    // The receipt screen is reachable ONLY through a successful INSERT. Previously this
    // called handleAllergenSubmit() without awaiting it and then navigated
    // unconditionally, so the guest saw a confirmation before — and regardless of —
    // whether the declaration was ever stored, and the failure message rendered on a
    // screen they had already left.
    setSubmitting(true)
    const result = await handleAllergenSubmit()
    setSubmitting(false)
    if (!result) return          // stay put; submitError is rendered on this screen
    setReviewedAt(null)
    setReceipt(result)
    go('alwait')
  }

  // ══════════════════════════════════════════════════════════════
  // URGENT HOLD
  // ══════════════════════════════════════════════════════════════
  const startHold = () => {
    const start = Date.now()
    setHoldPhase(0)
    const tick = () => {
      const p = Math.min((Date.now() - start) / 3000, 1)
      setHoldProgress(p)
      if (p >= 0.5 && holdPhase < 2) setHoldPhase(2)
      else if (p >= 0.15 && holdPhase < 1) setHoldPhase(1)
      if (p >= 1) {
        setHoldPhase(3)
        // Gate the success toast on the actual insert succeeding — without this
        // the guest sees "Help is on the way" even when the row never lands.
        handleUrgentSubmit().then(ok => {
          setTimeout(() => {
            go('main')
            if (ok) showToast('Help is on the way — staff alerted')
            // On failure submitError is already set; it renders on the main screen.
          }, 1200)
        })
        return
      }
      holdRAF.current = requestAnimationFrame(tick)
    }
    holdRAF.current = requestAnimationFrame(tick)
  }

  const endHold = () => {
    if (holdRAF.current) cancelAnimationFrame(holdRAF.current)
    setHoldProgress(0); setHoldPhase(0)
  }

  // ══════════════════════════════════════════════════════════════
  // ERROR SCREENS
  // ══════════════════════════════════════════════════════════════
  if (appError) {
    const msgs: Record<string,{title:string,body:string}> = {
      invalid_qr: {title:'Invalid QR Code', body:'Please scan the QR code at your table again.'},
      venue_not_found: {title:'Venue Not Found', body:'We could not find this venue. Please alert your server.'},
      asset_not_found: {title:'Table Not Found', body:'Please scan the QR code at your table again or alert your server.'},
    }
    const m = msgs[appError] || msgs.invalid_qr
    return (
      <div className="card" style={{textAlign:'center',padding:'40px 24px'}}>
        <div style={{fontSize:'32px',marginBottom:'12px'}}>⚠️</div>
        <div className="ot">{m.title}</div>
        <div className="os">{m.body}</div>
      </div>
    )
  }

  if (loading || screen === 'loading') {
    return (
      <div className="card" style={{padding:'22px 16px 20px'}}>
        <div className="sk" style={{width:'76px',height:'76px',borderRadius:'16px',margin:'0 auto 6px'}}/>
        <div className="sk" style={{width:'140px',height:'18px',borderRadius:'6px',margin:'0 auto'}}/>
        <div className="sk" style={{width:'100px',height:'12px',borderRadius:'4px',margin:'0 auto 8px'}}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>
          {[1,2,3,4].map(i => <div key={i} className="sk" style={{height:'88px',borderRadius:'14px'}}/>)}
        </div>
      </div>
    )
  }

  if (screen === 'error') {
    return <div className="card" style={{padding:'32px 20px',textAlign:'center'}}><div style={{color:'var(--t1)'}}>{errorMessage}</div></div>
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <>
      {/* SPLASH */}
      {showSplash && (
        <div id="splash" style={{position:'fixed',inset:0,zIndex:9999,background:'#0d1117',display:'flex',alignItems:'center',justifyContent:'center',transition:'opacity .7s,transform .7s',...(!showSplash?{opacity:0,transform:'scale(1.08)',pointerEvents:'none' as const}:{})}}>
          <svg width="90" height="112" viewBox="0 0 72.71 90.04" style={{animation:'logoIn .9s cubic-bezier(.34,1.2,.64,1) both'}}>
            <path fill="#22d3ee" d="M36.36,0C16.28,0,.6,16.3.01,36.36c-.64,21.77,29.31,48.22,35.31,53.29.61.52,1.48.52,2.08,0,5.96-4.98,35.31-30.65,35.31-53.31C72.71,16.27,56.43,0,36.36,0z" style={{opacity:0,animation:'fade .5s .4s forwards'}}/>
            <path fill="#fff" d="M25.11,17.28c0-1.61,1.3-2.91,2.91-2.91s2.91,1.3,2.91,2.91v12.86h13.77c1.61,0,2.91,1.3,2.91,2.91v14.3c0,1.6-1.3,2.91-2.91,2.91s-2.91-1.31-2.91-2.91v-11.4h-10.86v11.98c0,1.6-1.31,2.91-2.91,2.91s-2.91-1.31-2.91-2.91v-30.65z" style={{opacity:0,animation:'fade .4s .7s forwards'}}/>
            <path fill="#fff" d="M56.41,54.42c-3.84,7.64-11.53,12.39-20.07,12.39s-16.31-4.87-20.07-12.4c-.71-1.44-.12-3.18,1.31-3.9,1.44-.71,3.18-.12,3.9,1.31,2.77,5.57,8.61,9.18,14.86,9.18s12.02-3.52,14.87-9.19c.73-1.43,2.47-2.01,3.9-1.28,1.44.71,2.02,2.47,1.3,3.9z" style={{opacity:0,animation:'fade .4s .7s forwards'}}/>
          </svg>
        </div>
      )}

      {/* TOAST */}
      {toast && <div className="toast">{toast}</div>}

      {/* APP */}
      <div id="app" style={{opacity: appVisible ? 1 : 0, transition:'opacity .5s .15s'}}>

        {/* ══ MAIN ══ */}
        {screen === 'main' && (
          <div className="card" style={{position:'relative'}}>
            {/* Emergency icon */}
            <div className="ci-wrap">
              <div className="ci" onClick={() => go('urgent')} title="Urgent Help" style={{background:'rgba(239,68,68,.06)',borderColor:'rgba(239,68,68,.35)'}}>
                <div className="hand"><HandIcon/></div>
              </div>
            </div>

            {/* Venue header */}
            <div className="vh">
              <div className="ib">{venue?.name?.charAt(0) || 'H'}</div>
              <div className="vn">{venue?.name || 'Happy Bistro'}</div>
              <div className="vt">{asset?.label || 'T1'} · {asset?.zone || 'Dining Room'}</div>
            </div>

            {/* Service buttons */}
            <div className="bg">
              {svcLabels.map((label, i) => {
                const bs = btnStates[i]
                const cls = bs?.status === 'pending' ? 'sb pending' : bs?.status === 'accepted' ? 'sb accepted' : 'sb'
                return (
                  <button key={i} className={cls} onClick={() => handleSvcTap(i)}>
                    <div>{SvcIcons[svcIcons[i]]}</div>
                    <span className="sb-l">{label}</span>
                    <div className="sb-st">
                      {bs?.status === 'pending' && <><div className="spinner"/>{`Requested · ${fmtTime(bs.at)}`}</>}
                      {bs?.status === 'accepted' && <><div className="ck"><svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="10 3 5 9 2 6"/></svg></div>Accepted · On the Way</>}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Escalation */}
            <div className="esc">
              <button className="eb" onClick={() => go('allergy')}>
                <ShieldIcon size={16}/> Food Allergy
              </button>
            </div>

            {/* Sentiment */}
            <div className="sent">
              <div className="sent-q">How's Everything?</div>
              <div className="sr">
                <button className="fx pos" disabled={submitting} onClick={() => submitSentiment(3)}><Face type="ok" size={20}/><span className="fx-t">I'm Happy</span></button>
                <button className="fx neu" disabled={submitting} onClick={() => submitSentiment(2)}><Face type="warn" size={20}/><span className="fx-t">It Was Okay</span></button>
                <button className="fx neg" disabled={submitting} onClick={() => submitSentiment(1)}><Face type="danger" size={20}/><span className="fx-t">Disappointed</span></button>
              </div>
            </div>

            {submitError && <div style={{color:'#fca5a5',background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.25)',borderRadius:'8px',padding:'10px 13px',fontSize:'12px',textAlign:'center',margin:'8px 18px'}}>{submitError}</div>}
          </div>
        )}

        {/* ══ HAPPY ══ */}
        {screen === 'happy' && (
          <div className="sc on" style={{position:'relative'}}>
            <CloseX onClick={() => go('main')}/>
            <div className="ob">
              <div className="of" style={{filter:'drop-shadow(0 0 24px rgba(16,185,129,.35))'}}><Face type="ok" size={56}/></div>
              <div className="ot" style={{color:'var(--ok)'}}>Glad You're Enjoying It</div>
              <div className="os">A quick review helps other guests and supports our team.</div>
              <div className="ac" style={{textAlign:'center'}}>
                <button className="ac-btn" style={{background:'var(--ok)',color:'var(--bg)',padding:'14px',width:'100%',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'6px'}}>
                  ⭐⭐⭐⭐⭐ Leave a Review
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ OKAY ══ */}
        {screen === 'okay' && (
          <div className="sc on" style={{position:'relative'}}>
            <CloseX onClick={() => go('main')}/>
            <div className="ob">
              <div className="of" style={{filter:'drop-shadow(0 0 24px rgba(245,158,11,.35))'}}><Face type="warn" size={56}/></div>
              <div className="ot" style={{color:'#f59e0b'}}>We Can Make This Better</div>
              <div className="os">A server is coming by to help.</div>
              {!feedbackSent ? (
                <div className="ac" style={{borderColor:'rgba(245,158,11,.25)'}}>
                  <div className="ac-t">What Can We Fix Right Now?</div>
                  <div className="ac-s">Share a quick note so we can help faster.</div>
                  <textarea className="ac-ta" value={okayNote} onChange={e=>setOkayNote(e.target.value)} placeholder="What can we improve?"/>
                  <button className="ac-btn" style={{background:'#f59e0b',color:'var(--bg)',width:'100%',border:'none',borderRadius:'10px',padding:'13px',fontSize:'14px',fontWeight:700,cursor:notesSubmitting||!okayNote.trim()?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'7px',opacity:notesSubmitting||!okayNote.trim()?.6:1}} disabled={notesSubmitting||!okayNote.trim()} onClick={() => sendFeedback('okay')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    {notesSubmitting ? 'Sending…' : 'Send to Server'}
                  </button>
                </div>
              ) : (
                <div className="ac" style={{borderColor:'rgba(245,158,11,.25)'}}>
                  <div style={{textAlign:'center',marginBottom:'12px'}}>
                    <div style={{width:'40px',height:'40px',borderRadius:'50%',background:'rgba(245,158,11,.08)',border:'2px solid #f59e0b',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 8px'}}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div style={{color:'#f59e0b',fontSize:'16px',fontWeight:700}}>Sent to Your Server</div>
                  </div>
                  <div className="tst">
                    <div className="tsr"><div className={`td done`}/><div className="tl">Submitted</div><div className="tt done">{fmtClock(feedbackSent.submitTime)}</div></div>
                    <div className="tsr"><div className={`td ${feedbackSent.ackTime ? 'done' : 'prog'}`}/><div className="tl">Server Acknowledged</div><div className={`tt ${feedbackSent.ackTime ? 'done' : 'prog'}`}>{feedbackSent.ackTime ? fmtClock(feedbackSent.ackTime) : 'waiting…'}</div></div>
                    <div className="tsr"><div className={`td ${feedbackSent.resolveTime ? 'done' : feedbackSent.ackTime ? 'prog' : 'wait'}`}/><div className="tl">Resolved</div><div className={`tt ${feedbackSent.resolveTime ? 'done' : feedbackSent.ackTime ? 'prog' : 'wait'}`}>{feedbackSent.resolveTime ? fmtClock(feedbackSent.resolveTime) : feedbackSent.ackTime ? 'in progress…' : '—'}</div></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ SAD ══ */}
        {screen === 'sad' && (
          <div className="sc on" style={{position:'relative'}}>
            <CloseX onClick={() => go('main')}/>
            <div className="ob">
              <div className="of" style={{filter:'drop-shadow(0 0 24px rgba(239,68,68,.35))'}}><Face type="danger" size={56}/></div>
              <div className="ot" style={{color:'var(--danger)'}}>We're Sorry. Let's Make This Right.</div>
              <div className="os">A manager is on the way now.</div>
              {!feedbackSent ? (
                <div className="ac" style={{borderColor:'rgba(239,68,68,.25)'}}>
                  <div className="ac-t">Tell Us What Happened</div>
                  <div className="ac-s">This helps us resolve it quickly.</div>
                  <textarea className="ac-ta" value={sadNote} onChange={e=>setSadNote(e.target.value)} placeholder="What went wrong?"/>
                  <button className="ac-btn" style={{background:'var(--danger)',color:'#fff',width:'100%',border:'none',borderRadius:'10px',padding:'13px',fontSize:'14px',fontWeight:700,cursor:notesSubmitting||!sadNote.trim()?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'7px',opacity:notesSubmitting||!sadNote.trim()?.6:1}} disabled={notesSubmitting||!sadNote.trim()} onClick={() => sendFeedback('sad')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    {notesSubmitting ? 'Sending…' : 'Send to Manager'}
                  </button>
                </div>
              ) : (
                <div className="ac" style={{borderColor:'rgba(239,68,68,.25)'}}>
                  <div style={{textAlign:'center',marginBottom:'12px'}}>
                    <div style={{width:'40px',height:'40px',borderRadius:'50%',background:'rgba(239,68,68,.08)',border:'2px solid var(--danger)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 8px'}}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div style={{color:'var(--danger)',fontSize:'16px',fontWeight:700}}>Sent to Manager</div>
                  </div>
                  <div className="tst">
                    <div className="tsr"><div className="td done"/><div className="tl">Submitted</div><div className="tt done">{fmtClock(feedbackSent.submitTime)}</div></div>
                    <div className="tsr"><div className={`td ${feedbackSent.ackTime ? 'done' : 'prog'}`}/><div className="tl">Manager Acknowledged</div><div className={`tt ${feedbackSent.ackTime ? 'done' : 'prog'}`}>{feedbackSent.ackTime ? fmtClock(feedbackSent.ackTime) : 'waiting…'}</div></div>
                    <div className="tsr"><div className={`td ${feedbackSent.resolveTime ? 'done' : feedbackSent.ackTime ? 'prog' : 'wait'}`}/><div className="tl">Resolved</div><div className={`tt ${feedbackSent.resolveTime ? 'done' : feedbackSent.ackTime ? 'prog' : 'wait'}`}>{feedbackSent.resolveTime ? fmtClock(feedbackSent.resolveTime) : feedbackSent.ackTime ? 'in progress…' : '—'}</div></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ RESOLVED ══ */}
        {screen === 'resolve' && (
          <div className="sc on" style={{position:'relative'}}>
            <CloseX onClick={() => go('main')}/>
            <div className="ob">
              <div className="of" style={{filter:'drop-shadow(0 0 24px rgba(34,211,238,.3))'}}>
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              </div>
              <div className="ot">Did We Make It Right?</div>
              <div className="os">We hope your experience improved.</div>
              <div className="rbtns">
                <button style={{background:'var(--cyan)',color:'var(--bg)',border:'none'}} onClick={() => go('happy')}>Yes, All Good</button>
                <button style={{background:'transparent',color:'var(--t1)',border:'1px solid var(--b)'}} onClick={() => go('main')}>Not Yet</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ ALLERGY ══ */}
        {screen === 'allergy' && (
          <div className="sc on" style={{position:'relative'}}>
            <CloseX onClick={() => go('main')}/>
            <div className="scr" style={{paddingTop:'14px'}}>
              {/* Shield + Title */}
              <div style={{textAlign:'center',marginBottom:'6px'}}>
                <div style={{width:'56px',height:'56px',background:'rgba(245,158,11,.08)',border:'2px solid #f59e0b',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
                  <ShieldIcon size={24}/>
                </div>
                <div className="pt" style={{justifyContent:'center'}}>Tell Us About Your Allergies</div>
              </div>
              <div className="ps">Select any allergies or add your own.</div>

              {/* Declared allergens */}
              {decl.length > 0 && (
                <div className="dl" style={{margin:'0 18px 16px'}}>
                  <div className="sec" style={{padding:0,marginBottom:'8px'}}>Your Allergies</div>
                  {decl.map((d, i) => {
                    const sc = SEV_COLORS[d.risk] || '#94a3b8'
                    const sb = SEV_BGS[d.risk] || 'rgba(148,163,184,.1)'
                    const sl = SEV.find(s => s.v === d.risk)
                    return (
                      <div className="di" key={i}>
                        <div className="di-n">{d.name}</div>
                        <div className="di-b" style={{background:sb,border:`1px solid ${sc}`,color:sc}}>{sl?.l || '—'}</div>
                        {d.xc && <div className="di-xc">Cross-Contact</div>}
                        <button className="di-rm" onClick={() => removeDecl(i)}>✕</button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Search */}
              <div className="sec">Search Allergies</div>
              <div className="srw" ref={searchRef}>
                <svg className="sri" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input className="srb" type="text" placeholder="Search — butter, fish stock, gluten..." maxLength={60} autoComplete="off"
                  value={allergenSearch}
                  onChange={e => { setAllergenSearch(e.target.value); setShowSearchResults(true) }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && allergenSearch.trim()) {
                      const match = ALLERGEN_DB.find(a => a.n.toLowerCase() === allergenSearch.toLowerCase())
                      if (match) selectAllergen(match.n)
                      else { selectAllergen(allergenSearch.charAt(0).toUpperCase() + allergenSearch.slice(1)); showToast(`"${allergenSearch}" — will be reviewed for database`) }
                      setAllergenSearch(''); setShowSearchResults(false)
                    }
                  }}
                />
                {showSearchResults && allergenSearch.length > 0 && (
                  <div className="srl open">
                    {searchResults.map(m => (
                      <div className="srl-i" key={m.n} onClick={() => { selectAllergen(m.n); setAllergenSearch(''); setShowSearchResults(false) }}>
                        <span className="srl-n">{m.n}</span><span className="srl-c">{m.c}</span>
                      </div>
                    ))}
                    {!ALLERGEN_DB.some(a => a.n.toLowerCase() === allergenSearch.toLowerCase()) && allergenSearch.length > 1 && (
                      <div className="srl-new" onClick={() => {
                        const cap = allergenSearch.charAt(0).toUpperCase() + allergenSearch.slice(1)
                        selectAllergen(cap); setAllergenSearch(''); setShowSearchResults(false)
                        showToast(`"${cap}" — will be reviewed for database`)
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add "{allergenSearch.charAt(0).toUpperCase() + allergenSearch.slice(1)}" as custom
                      </div>
                    )}
                    {searchResults.length === 0 && ALLERGEN_DB.some(a => a.n.toLowerCase() === allergenSearch.toLowerCase()) === false && allergenSearch.length <= 1 && (
                      <div style={{padding:'11px 14px',fontSize:'13px',color:'var(--t2)'}}>Keep typing...</div>
                    )}
                  </div>
                )}
              </div>

              {/* Common chips */}
              <div className="sec">Select Common Allergies</div>
              <div className="chips" style={{padding:'0 18px',marginBottom:'16px'}}>
                {PRESETS.map(p => {
                  const added = decl.some(d => d.name === p)
                  return (
                    <button key={p} className={`chip${added ? ' added' : curAllergen === p ? ' on' : ''}`}
                      onClick={() => !added && selectAllergen(p)}>
                      {p}{added ? ' ✓' : ''}
                    </button>
                  )
                })}
              </div>

              {/* Severity config */}
              {curAllergen && (
                <div className="cfg" style={{margin:'0 18px 16px'}}>
                  <div className="cfg-t"><ShieldIcon size={16}/> {curAllergen}</div>
                  <div className="cfg-s">How Serious Is It? <span style={{fontWeight:400,textTransform:'none',letterSpacing:0,opacity:.7}}>(Select One)</span></div>
                  <div className="rg">
                    {SEV.map(r => (
                      <div key={r.v} className={`rk${curRisk === r.v ? ' on' : ''}`} data-v={r.v} onClick={() => setCurRisk(r.v)} style={{position:'relative',overflow:'hidden'}}>
                        <div style={{position:'absolute',left:0,top:0,bottom:0,width:'4px',borderRadius:'4px 0 0 4px',background:r.c}}/>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                          <div><div className="rk-n">{r.l}</div><div className="rk-d">{r.d}</div></div>
                          <div style={{color:r.c,fontSize:'10px',letterSpacing:'2px'}}>{r.dots}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className={`ccr${curXC ? ' on' : ''}`} onClick={() => setCurXC(!curXC)}>
                    <div className="cck">{curXC && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="10 3 5 9 2 6"/></svg>}</div>
                    <div><div style={{fontSize:'13px',fontWeight:700}}>Avoid Cross-Contact</div><div style={{color:'var(--t2)',fontSize:'12px',marginTop:'2px'}}>Separate surfaces, utensils, and prep.</div></div>
                  </div>
                  <div style={{display:'flex',justifyContent:'flex-end'}}>
                    <button className="cfg-a" disabled={!curRisk} onClick={addToDecl}>Add</button>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="sec">What Else Should We Know?</div>
              <textarea className="nta" placeholder="Example: severe if exposed to shared fryer oil, no cheese garnish." value={allergenNotes} onChange={e => setAllergenNotes(e.target.value)}/>

              {/* Submit */}
              {submitHint && <div style={{color:'#f59e0b',fontSize:'12px',textAlign:'center',padding:'6px'}}>Select at least one allergen above.</div>}
              {/* The failure message renders HERE, on the screen the guest is left on when
                  the INSERT fails. It previously rendered only on the main screen, which a
                  submitting guest had already navigated away from — so the error existed in
                  the DOM of a screen nobody was looking at. */}
              {submitError && <div style={{color:'#fca5a5',background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.25)',borderRadius:'8px',padding:'12px 14px',fontSize:'13px',lineHeight:1.5,textAlign:'center',margin:'0 0 10px'}}>{submitError}</div>}
              <button className="sbtn" onClick={trySubmit} disabled={submitting}>
                {/* "Notify Staff" overstated what submission does — no staff-facing allergy
                    surface exists in the product. The button sends a declaration; it says so. */}
                <ShieldIcon size={18} color="var(--bg)"/> {submitting ? 'Sending…' : 'Send Allergy Declaration'}
              </button>
            </div>
          </div>
        )}

        {/* ══ ALLERGY RECEIPT ══ */}
        {/* Reachable ONLY after a successful INSERT (see trySubmit). States exactly one
            fact: Happy Chair durably holds the declaration for this venue. It deliberately
            does NOT claim a server was notified, a kitchen display received it, or any
            venue employee has seen it — none of those events has occurred, and two of them
            have no implementation at all. The previous copy read "Your server has been
            notified" above a spinner reading "Waiting for confirmation…", which promised a
            state change that could never arrive: this app holds no realtime subscription
            and never re-reads the row. */}
        {screen === 'alwait' && (
          <div className="sc on" style={{position:'relative'}}>
            <CloseX onClick={() => go('main')}/>
            <div className="ob">
              <div className="wi"><ShieldIcon size={28}/></div>
              {/* Two provenance states, one screen. State 1 is proven by the INSERT; state 2
                  only by a database-persisted kitchen_ack_at. State 2 says REVIEW and nothing
                  more — no employee name (attribution is a device string until Track B), no
                  server notification, no preparation, no verification, no safety claim. */}
              <div className="ot" style={{color:'#f59e0b'}}>{reviewedAt ? 'Reviewed by Venue' : 'Declaration Received'}</div>
              <div className="os">{reviewedAt
                ? `${venue?.name ?? 'The venue'} has reviewed your allergy declaration.`
                : `Your allergy declaration was received by Happy Chair for ${venue?.name ?? 'this venue'}.`}</div>
              {/* Faithful echo of what the database accepted — the guest's own allergen
                  names and their own severity wording from the picker (SEV[].l). No new
                  safety vocabulary is introduced here. */}
              {receipt && (
                <div style={{marginTop:'18px',background:'var(--s1)',border:'1px solid var(--b)',borderRadius:'12px',padding:'14px 18px',maxWidth:'320px',width:'100%'}}>
                  <div style={{fontSize:'15px',fontWeight:600,color:'var(--t1)',textAlign:'center',lineHeight:1.5}}>
                    {receipt.allergens.join(', ')}
                    <span style={{color:'var(--t2)',margin:'0 6px'}}>·</span>
                    <span style={{color: SEV.find(x => x.v === receipt.severity)?.c ?? 'var(--t1)'}}>
                      {SEV.find(x => x.v === receipt.severity)?.l ?? receipt.severity}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ PROFILE ══ */}
        {screen === 'alack' && (
          <div className="sc on" style={{position:'relative'}}>
            <CloseX onClick={() => go('main')}/>
            <div className="ob">
              <div style={{width:'68px',height:'68px',background:'rgba(245,158,11,.08)',border:'2px solid #f59e0b',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:'18px',boxShadow:'0 0 30px rgba(245,158,11,.2)'}}>
                <ShieldCheck/>
              </div>
              <div className="ot" style={{color:'#f59e0b'}}>You're All Set</div>
              <div className="os">Your server and kitchen have been notified.</div>
              <div style={{width:'60px',height:'1px',background:'var(--b)',margin:'28px 0'}}/>
              <div style={{background:'var(--s1)',border:'1px solid var(--b)',borderRadius:'18px',padding:'28px 24px',maxWidth:'320px',width:'100%'}}>
                <div style={{textAlign:'center',marginBottom:'8px'}}>
                  <svg width="48" height="60" viewBox="0 0 72.71 90.04">
                    <path fill="#22d3ee" d="M36.36,0C16.28,0,.6,16.3.01,36.36c-.64,21.77,29.31,48.22,35.31,53.29.61.52,1.48.52,2.08,0,5.96-4.98,35.31-30.65,35.31-53.31C72.71,16.27,56.43,0,36.36,0z"/>
                    <path fill="#fff" d="M25.11,17.28c0-1.61,1.3-2.91,2.91-2.91s2.91,1.3,2.91,2.91v12.86h13.77c1.61,0,2.91,1.3,2.91,2.91v14.3c0,1.6-1.3,2.91-2.91,2.91s-2.91-1.31-2.91-2.91v-11.4h-10.86v11.98c0,1.6-1.31,2.91-2.91,2.91s-2.91-1.31-2.91-2.91v-30.65z"/>
                    <path fill="#fff" d="M56.41,54.42c-3.84,7.64-11.53,12.39-20.07,12.39s-16.31-4.87-20.07-12.4c-.71-1.44-.12-3.18,1.31-3.9,1.44-.71,3.18-.12,3.9,1.31,2.77,5.57,8.61,9.18,14.86,9.18s12.02-3.52,14.87-9.19c.73-1.43,2.47-2.01,3.9-1.28,1.44.71,2.02,2.47,1.3,3.9z"/>
                  </svg>
                </div>
                <div style={{color:'#f59e0b',fontSize:'15px',fontWeight:600,marginBottom:'18px',textAlign:'center'}}>Your allergy details, anywhere.</div>
                <div style={{color:'var(--t1)',fontSize:'14px',lineHeight:1.6,maxWidth:'260px',margin:'0 auto 24px',fontWeight:500,textAlign:'center'}}>One tap to share at any venue.<br/>You're always in control.</div>
                <button className="pb" style={{width:'100%'}}>Create Free Profile</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ URGENT ══ */}
        {screen === 'urgent' && (
          <div className="sc on" style={{position:'relative'}}>
            <CloseX onClick={() => { endHold(); go('main') }}/>
            <div className="ob">
              <div className="alert-icon"><HandIcon/></div>
              <div className="ot" style={{color:'var(--danger)'}}>Need Help Right Now?</div>
              <div className="os">This will alert staff right away.</div>
              <div style={{maxWidth:'320px',width:'100%',margin:'24px auto 0'}}>
                <div style={{position:'relative',marginBottom:'8px'}}>
                  <button className="hld" style={{background:'var(--danger)',color:'#fff'}}
                    onMouseDown={startHold} onMouseUp={endHold} onMouseLeave={endHold}
                    onTouchStart={startHold} onTouchEnd={endHold} onTouchCancel={endHold}>
                    <div className="hld-fill" style={{width:`${holdProgress*100}%`}}/>
                    <span style={{position:'relative',zIndex:1}}>
                      {holdPhase >= 3 ? 'Help Is On the Way' : holdPhase >= 2 ? 'Alerting staff…' : holdPhase >= 1 ? 'Keep holding…' : 'Press and Hold for Immediate Help'}
                    </span>
                  </button>
                  <div className="hld-progress"><div className="hld-bar" style={{width:`${holdProgress*100}%`}}/></div>
                </div>
                <div style={{color: holdPhase >= 2 ? 'var(--danger)' : holdPhase >= 1 ? 'var(--t1)' : 'var(--t2)', fontSize:'14px',textAlign:'center',fontWeight:500,minHeight:'20px',transition:'color .2s'}}>
                  {holdPhase >= 3 ? 'Help Is On the Way' : holdPhase >= 2 ? 'Alerting staff…' : holdPhase >= 1 ? 'Keep holding…' : 'Manager and nearest staff alerted instantly.'}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  )
}

export default App
