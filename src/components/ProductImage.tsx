import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
export function ProductImage({src, ...props}: ImgHTMLAttributes<HTMLImageElement>) {
  const ref = useRef<HTMLImageElement>(null);
  const [visible,setVisible] = useState(false);
  useEffect(() => {
    if (visible) return;
    if (typeof IntersectionObserver === 'undefined') {setVisible(true);return;}
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry=>entry.isIntersecting)) {setVisible(true);observer.disconnect();}
    },{rootMargin:'0px'});
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  },[visible]);
  return <img {...props} ref={ref} src={visible ? src : undefined} loading="lazy" decoding="async" />;
}
