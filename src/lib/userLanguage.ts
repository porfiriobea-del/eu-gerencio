import {supabase} from './supabase';
import {normalizeLanguage,readDeviceLanguage,saveDeviceLanguage} from './language';

/** Independent of the active shop: every account owns its language preference. */
export function syncUserLanguage(userId: string): () => void {
  let active=true,revision=0;
  let queue=Promise.resolve();
  const dirtyKey='app_lang_pending:'+userId;
  const markPending=()=>{try{localStorage.setItem(dirtyKey,'true');}catch{}};
  const isPending=()=>{try{return localStorage.getItem(dirtyKey)==='true';}catch{return false;}};

  const apply=(value:unknown)=>{
    const language=normalizeLanguage(value);
    saveDeviceLanguage(language,userId);
    window.dispatchEvent(new CustomEvent('user-language-loaded',{detail:language}));
  };
  apply(readDeviceLanguage(userId));
  const save=(event:Event)=>{
    const language=normalizeLanguage((event as CustomEvent).detail);
    const savedRevision=++revision;
    markPending();
    saveDeviceLanguage(language,userId);
    queue=queue.then(async()=>{
      if(!active)return;
      const {error}=await supabase.from('eu_user_preferences').upsert({user_id:userId,language,updated_at:new Date().toISOString()},{onConflict:'user_id'});
      if(error)console.warn('[User language] Cloud save unavailable; device preference retained.');
      else if(revision===savedRevision){try{localStorage.removeItem(dirtyKey);}catch{}}

    }).catch(()=>console.warn('[User language] Cloud save unavailable; device preference retained.'));
  };
  window.addEventListener('user-language-change',save);
  const initialRevision=revision;
  void (async()=>{
    const {data,error}=await supabase.from('eu_user_preferences').select('language').eq('user_id',userId).maybeSingle();
    if(!active||revision!==initialRevision)return;
    if(error){console.warn('[User language] Cloud load unavailable; using device preference.');return;}
    if(data && !isPending())apply(data.language);
    else {
      // Migrate a previous explicit choice cached for this account, never a shop preference.
      const language=readDeviceLanguage(userId);
      save(new CustomEvent('user-language-change',{detail:language}));
    }
  })().catch(()=>{});
  return()=>{active=false;window.removeEventListener('user-language-change',save);};
}
