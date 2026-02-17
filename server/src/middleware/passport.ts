import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { OIDCStrategy } from 'passport-azure-ad'
import prisma from '../services/prisma.js'

export function configurePassport() {
  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/auth/google/callback',
    }, async (_accessToken, _refreshToken, profile, done) => {
      try {
        let user = await prisma.user.findUnique({
          where: { googleId: profile.id },
          include: {
            children: { include: { class: true } },
            school: true,
          },
        })

        if (!user) {
          const email = profile.emails?.[0]?.value
          if (email) {
            user = await prisma.user.findUnique({
              where: { email },
              include: {
                children: { include: { class: true } },
                school: true,
              },
            })

            if (user) {
              user = await prisma.user.update({
                where: { id: user.id },
                data: {
                  googleId: profile.id,
                  avatarUrl: profile.photos?.[0]?.value,
                },
                include: {
                  children: { include: { class: true } },
                  school: true,
                },
              })
            }
          }
        }

        if (!user) {
          return done(null, false, { message: 'User not registered. Please contact school admin.' })
        }

        done(null, user)
      } catch (err) {
        done(err as Error, undefined)
      }
    }))
  }

  // Microsoft OAuth Strategy
  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    passport.use(new OIDCStrategy({
      identityMetadata: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}/v2.0/.well-known/openid-configuration`,
      clientID: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      responseType: 'code',
      responseMode: 'query',
      redirectUrl: process.env.MICROSOFT_REDIRECT_URL || 'http://localhost:4000/auth/microsoft/callback',
      allowHttpForRedirectUrl: process.env.NODE_ENV !== 'production',
      scope: ['profile', 'email', 'openid'],
      passReqToCallback: false,
    }, async (_iss: string, _sub: string, profile: { oid?: string; emails?: string[]; displayName?: string }, _accessToken: string, _refreshToken: string, done: (err: Error | null, user?: Express.User | false) => void) => {
      try {
        const microsoftId = profile.oid
        const email = profile.emails?.[0]

        if (!microsoftId) {
          return done(null, false)
        }

        let user = await prisma.user.findUnique({
          where: { microsoftId },
          include: {
            children: { include: { class: true } },
            school: true,
          },
        })

        if (!user && email) {
          user = await prisma.user.findUnique({
            where: { email },
            include: {
              children: { include: { class: true } },
              school: true,
            },
          })

          if (user) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: { microsoftId },
              include: {
                children: { include: { class: true } },
                school: true,
              },
            })
          }
        }

        if (!user) {
          return done(null, false)
        }

        done(null, user)
      } catch (err) {
        done(err as Error)
      }
    }))
  }
}
