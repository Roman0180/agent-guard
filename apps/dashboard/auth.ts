// Auth.js (NextAuth v5) — Google sign-in, JWT session strategy.
//
// Data-minimization: `session: { strategy: "jwt" }` means we persist NO session
// rows and NO Google tokens server-side — the identity lives only in the user's
// encrypted cookie. We carry Google's opaque `sub` into the token and expose it
// on the session; everything the app stores is keyed off a hash of that sub,
// never the email or profile. No database adapter is configured on purpose.
import NextAuth, { type NextAuthResult } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

// Dev-only preview sign-in. Double-gated: never in production, and only when
// CLOUD_DEV_LOGIN is explicitly set. Lets you see the UI without a Google project.
export const devLoginEnabled = process.env.NODE_ENV !== "production" && !!process.env.CLOUD_DEV_LOGIN;

const result = NextAuth({
  providers: [
    Google,
    ...(devLoginEnabled
      ? [
          Credentials({
            id: "dev",
            name: "Dev preview",
            credentials: { sub: { label: "sub" } },
            authorize: (creds) => ({ id: (typeof creds?.sub === "string" && creds.sub) || "dev-user" }),
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "dev") return devLoginEnabled;
      // Only accept verified Gmail identities; pin to `sub`, not email.
      return Boolean(profile?.email_verified && profile?.sub);
    },
    async jwt({ token, profile, user }) {
      if (profile?.sub) token.sub = profile.sub;
      else if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      // Expose only the opaque subject id to the app — no email/name needed downstream.
      return { ...session, sub: typeof token.sub === "string" ? token.sub : undefined };
    },
  },
});

// Explicit annotations avoid TS2742 (inferred type not portable) for the re-exports.
export const handlers: NextAuthResult["handlers"] = result.handlers;
export const auth: NextAuthResult["auth"] = result.auth;
export const signIn: NextAuthResult["signIn"] = result.signIn;
export const signOut: NextAuthResult["signOut"] = result.signOut;
