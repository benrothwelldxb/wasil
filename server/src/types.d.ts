declare module 'passport-azure-ad' {
  import { Strategy } from 'passport'

  export interface OIDCStrategyOptions {
    identityMetadata: string
    clientID: string
    clientSecret?: string
    responseType: string
    responseMode: string
    redirectUrl: string
    allowHttpForRedirectUrl?: boolean
    scope?: string[]
    passReqToCallback?: boolean
    loggingLevel?: 'info' | 'warn' | 'error'
    loggingNoPII?: boolean
  }

  export interface Profile {
    oid?: string
    upn?: string
    displayName?: string
    name?: {
      familyName?: string
      givenName?: string
    }
    emails?: string[]
    _json?: Record<string, unknown>
  }

  type VerifyCallback = (err: Error | null, user?: unknown, info?: unknown) => void

  type VerifyFunctionWithReq = (
    req: Express.Request,
    iss: string,
    sub: string,
    profile: Profile,
    accessToken: string,
    refreshToken: string,
    done: VerifyCallback
  ) => void

  type VerifyFunctionWithoutReq = (
    iss: string,
    sub: string,
    profile: Profile,
    accessToken: string,
    refreshToken: string,
    done: VerifyCallback
  ) => void

  export class OIDCStrategy extends Strategy {
    constructor(
      options: OIDCStrategyOptions & { passReqToCallback: true },
      verify: VerifyFunctionWithReq
    )
    constructor(
      options: OIDCStrategyOptions & { passReqToCallback?: false },
      verify: VerifyFunctionWithoutReq
    )
    constructor(
      options: OIDCStrategyOptions,
      verify: VerifyFunctionWithReq | VerifyFunctionWithoutReq
    )
    name: string
  }
}
