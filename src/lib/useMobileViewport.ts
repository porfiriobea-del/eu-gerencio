import {useEffect,useState} from 'react';
export function useMobileViewport() {
  const [mobile,setMobile]=useState(()=>typeof window!=='undefined' && !!window.matchMedia?.('(max-width: 767px)').matches);
  const [keyboardOpen,setKeyboardOpen]=useState(false);
  useEffect(()=>{
    const query=window.matchMedia?.('(max-width: 767px)');
    let baseline=window.innerHeight;
    const refresh=()=>{
      setMobile(!!query?.matches);
      const viewport=window.visualViewport;
      const focused=document.activeElement;
      const editing=focused instanceof HTMLElement && (['INPUT','TEXTAREA','SELECT'].includes(focused.tagName)||focused.isContentEditable);
      const height=viewport?.height ?? window.innerHeight;
      if(!editing)baseline=Math.max(baseline,window.innerHeight,height);
      setKeyboardOpen(editing && (viewport?.scale ?? 1)===1 && baseline-height>140);
    };
    const orientation=()=>{baseline=window.innerHeight;refresh();};
    query?.addEventListener('change',refresh);
    window.visualViewport?.addEventListener('resize',refresh);
    window.addEventListener('resize',refresh);
    window.addEventListener('orientationchange',orientation);
    document.addEventListener('focusin',refresh);
    document.addEventListener('focusout',refresh);
    refresh();
    return()=>{
      query?.removeEventListener('change',refresh);
      window.visualViewport?.removeEventListener('resize',refresh);
      window.removeEventListener('resize',refresh);
      window.removeEventListener('orientationchange',orientation);
      document.removeEventListener('focusin',refresh);
      document.removeEventListener('focusout',refresh);
    };
  },[]);
  return {mobile,keyboardOpen};
}
