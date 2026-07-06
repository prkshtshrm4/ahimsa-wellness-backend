import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';
import env from '../config/env.js';

// Firebase ID tokens are RS256 JWTs signed by Google. They can be verified using
// only the project id — no service-account file required — by checking the
// signature against Google's public JWK set and validating issuer/audience.
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

const issuer = `https://securetoken.google.com/${env.firebaseProjectId}`;

/**
 * Verify a real Firebase ID token. Returns a normalized identity claim set.
 */
export async function verifyFirebaseToken(idToken) {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer,
    audience: env.firebaseProjectId,
  });
  return {
    uid: payload.user_id || payload.sub,
    email: payload.email || null,
    phone: payload.phone_number || null,
    name: payload.name || null,
    firebase: payload.firebase || {},
  };
}

/**
 * Best-effort decode without verification — only used to surface a friendlier
 * message; never trusted for authorization.
 */
export function unsafeDecode(idToken) {
  try {
    return decodeJwt(idToken);
  } catch {
    return null;
  }
}
