import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User, deleteUser } from 'firebase/auth';
import { auth } from './firebase';

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/spreadsheets');

const ACCESS_TOKEN_KEY = 'eu_gerencio_google_token';
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

export const getAccessToken = async (): Promise<string | null> => {
  if (!cachedAccessToken && typeof window !== 'undefined') {
    cachedAccessToken = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  }
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
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
