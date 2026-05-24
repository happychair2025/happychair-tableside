export type RequestCategory = 'check_please' | 'water' | 'waiter' | 'clear' | 'allergen' | 'critical'
export type RequestStatus = 'pending' | 'accepted' | 'completed'
export type AllergenSeverity = 'mild' | 'moderate' | 'severe' | 'anaphylactic'
export type SentimentScore = 1 | 2 | 3

export interface Venue {
  id: string
  name: string
  logo_url: string | null
  google_review_url: string | null
}

export interface Asset {
  id: string
  venue_id: string
  label: string
  service_point_type: string
  zone: string | null
}

export interface RequestInsert {
  venue_id: string
  asset_id: string
  category: RequestCategory
  status: 'pending'
  notes?: string
}

export interface AllergenDeclarationInsert {
  venue_id: string
  asset_id: string
  allergens: string[]
  severity: AllergenSeverity
  notes?: string
  guest_session_id: string
  status: 'pending'
}

export interface SentimentRatingInsert {
  venue_id: string
  asset_id: string
  score: SentimentScore
  google_review_prompted: boolean
  manager_intervention_needed: boolean
  // Optional on insert. Notes are typically attached later via UPDATE when the
  // guest fills the textarea on the okay/sad screen.
  notes?: string
}
