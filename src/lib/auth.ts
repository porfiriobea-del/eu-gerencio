import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, onIdTokenChanged, User, deleteUser, reauthenticateWithPopup } from 'firebase/auth';
import { auth } from './firebase';
import { supabase } from './supabase';

// Realtime must use the same verified Firebase JWT as REST queries.
onIdTokenChanged(auth, user => {
  void (async () => {
    const token = user ? await user.getIdToken() : null;
    if (token) await supabase.realtime.setAuth(token);
    else await supabase.removeAllChannels();
  })().catch(error => console.warn('[Supabase realtime authentication]', error instanceof Error ? error.message : 'Authentication error'));
});

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/spreadsheets');

const ACCESS_TOKEN_KEY = 'eu_gerencio_google_token';
const TOKEN_OWNER_KEY = 'eu_gerencio_google_token_owner';
const TOKEN_EXPIRY_KEY = 'eu_gerencio_google_token_expires';
let sheetsAuthorization:Promise<string|null>|null=null;
let isSigningIn = false;
let cachedAccessToken: string | null = typeof window !== 'undefined' ? sessionStorage.getItem(ACCESS_TOKEN_KEY) : null;

export const initAuth = (
  onAuthSuccess?: (user: User, token?: string | null) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (!cachedAccessToken && typeof window !== 'undefined') {
        cachedAccessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
      }
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(ACCESS_TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
      }
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, credential.accessToken);
      sessionStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now()+50*60*1000));
      sessionStorage.setItem(TOKEN_OWNER_KEY,result.user.uid);
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
      console.log('Login cancelled by user.');
      throw error;
    }
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/** Called directly from the export click so browsers allow the authorization popup. */
export const getAccessToken = (): Promise<string | null> => {
  if (!auth.currentUser) return Promise.resolve(null);
  const expiry=Number(sessionStorage.getItem(TOKEN_EXPIRY_KEY)||0);
  if(cachedAccessToken && expiry>Date.now() && sessionStorage.getItem(TOKEN_OWNER_KEY)===auth.currentUser.uid)return Promise.resolve(cachedAccessToken);
  if(sheetsAuthorization)return sheetsAuthorization;
  const exportProvider=new GoogleAuthProvider();
  exportProvider.addScope('https://www.googleapis.com/auth/drive.file');
  exportProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
  exportProvider.setCustomParameters({prompt:'consent',login_hint:auth.currentUser.email||''});
  // Reauthentication prevents silently switching the active store to another Google account.
  sheetsAuthorization=reauthenticateWithPopup(auth.currentUser,exportProvider).then(result=>{
    const token=GoogleAuthProvider.credentialFromResult(result)?.accessToken;
    if(!token)throw new Error('GOOGLE_AUTH');
    cachedAccessToken=token;
    sessionStorage.setItem(ACCESS_TOKEN_KEY,token);
    sessionStorage.setItem(TOKEN_EXPIRY_KEY,String(Date.now()+50*60*1000));
    sessionStorage.setItem(TOKEN_OWNER_KEY,result.user.uid);
    return token;
  }).finally(()=>{sheetsAuthorization=null;});
  return sheetsAuthorization;
};

export function invalidateGoogleAccessToken(){
  cachedAccessToken=null;
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
  sessionStorage.removeItem(TOKEN_OWNER_KEY);
}

export const logout = async () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('auth-user-changed'));
  await supabase.removeAllChannels();
  await auth.signOut();
  cachedAccessToken = null;
  sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
  sessionStorage.removeItem(TOKEN_OWNER_KEY);
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  }
};

export const deleteUserAccountAuth = async () => {
  if (auth.currentUser) {
    try {
      await deleteUser(auth.currentUser);
    } catch (err: any) {
      if (err.code === 'auth/requires-recent-login') {
        console.warn('Re-auth required for auth deleteUser, falling back to signOut');
      } else {
        throw err;
      }
    }
  }
  await logout();
};
