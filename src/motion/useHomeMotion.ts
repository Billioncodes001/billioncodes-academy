import { useEffect, type RefObject } from 'react';
import { finePointer, motionAllowed } from './preferences';

// Marketing-page motion: scroll reveals, pointer parallax and card tilt.
// Every effect writes transforms or CSS custom properties only, so text keeps
// full contrast and layout at all times. Nothing here runs on working pages.
export function useHomeMotion(root: RefObject<HTMLElement | null>, reduced: boolean) {
  useEffect(() => {
    const scope = root.current;
    if (!scope || !motionAllowed()) return;
    const cleanups: (() => void)[] = [];

    const targets = scope.querySelectorAll<HTMLElement>('[data-reveal]');
    const reveal = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.setAttribute('data-revealed', ''); reveal.unobserve(entry.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: .12 });
    targets.forEach(target => reveal.observe(target));
    cleanups.push(() => reveal.disconnect());

    if (finePointer()) {
      const visual = scope.querySelector<HTMLElement>('.bc-hero-visual');
      if (visual) {
        const move = (event: PointerEvent) => {
          const rect = visual.getBoundingClientRect();
          visual.style.setProperty('--px', (((event.clientX - rect.left) / rect.width) - .5).toFixed(3));
          visual.style.setProperty('--py', (((event.clientY - rect.top) / rect.height) - .5).toFixed(3));
        };
        const leave = () => { visual.style.setProperty('--px', '0'); visual.style.setProperty('--py', '0'); };
        visual.addEventListener('pointermove', move);
        visual.addEventListener('pointerleave', leave);
        cleanups.push(() => { visual.removeEventListener('pointermove', move); visual.removeEventListener('pointerleave', leave); });
      }

      const tiltCards = (selector: string) => scope.querySelectorAll<HTMLElement>(selector).forEach(card => {
        const move = (event: PointerEvent) => {
          const rect = card.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
          card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
          card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
          card.style.setProperty('--ry', `${((x - .5) * 7).toFixed(2)}deg`);
          card.style.setProperty('--rx', `${((.5 - y) * 6).toFixed(2)}deg`);
        };
        const leave = () => { card.style.removeProperty('--ry'); card.style.removeProperty('--rx'); };
        card.addEventListener('pointermove', move);
        card.addEventListener('pointerleave', leave);
        cleanups.push(() => { card.removeEventListener('pointermove', move); card.removeEventListener('pointerleave', leave); });
      });
      tiltCards('.bc-course-card');
      tiltCards('.founder-real');
    }

    // Scroll-linked depth for the finale monogram, only while it is on screen.
    const finale = scope.querySelector<HTMLElement>('.bc-finale');
    if (finale) {
      let frame = 0;
      const update = () => {
        frame = 0;
        const rect = finale.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, 1 - (rect.top + rect.height) / (window.innerHeight + rect.height)));
        finale.style.setProperty('--finale-progress', progress.toFixed(3));
      };
      const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
      const watch = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) { window.addEventListener('scroll', onScroll, { passive: true }); update(); }
        else window.removeEventListener('scroll', onScroll);
      });
      watch.observe(finale);
      cleanups.push(() => { watch.disconnect(); window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); });
    }

    return () => cleanups.forEach(cleanup => cleanup());
  }, [root, reduced]);
}
