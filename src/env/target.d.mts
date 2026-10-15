export type Target = 'production' | 'staging'
export interface Classified { target: Target | null; problem: string | null }
export declare const PRODUCTION_REF: string
export declare const STAGING_REF: string
export declare const PRODUCTION_HOSTS: string[]
export declare const STAGING_HOSTS: string[]
export declare function keyRef(key: string): string | null
export declare function normalizeUrl(u: string | undefined | null): string
export declare function normalizeHost(h: string | undefined | null): string
export declare function project(url: string | undefined | null, key: string | undefined | null): Classified
export declare function buildProblem(vercelEnv: string, url: string | undefined | null, key: string | undefined | null, requireStaging?: boolean): string | null
export declare function classify(url: string | undefined | null, key: string | undefined | null, hostname: string, vercelEnv?: string): Classified
