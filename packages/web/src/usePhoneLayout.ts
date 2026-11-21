import { useEffect, useState } from 'react';

/** The phone breakpoint, matching the `@media (max-width: 700px)` rules in styles.css. */
const PHONE_QUERY = '(max-width: 700px)';

/** Whether the screen is phone-sized, so the table renders its phone layout. Follows resizes and rotation. */
export function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return phone;
}
