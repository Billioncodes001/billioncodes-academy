import { useEffect, type RefObject } from 'react';
import { finePointer, motionAllowed } from './preferences';

// Marketing-page motion: scroll reveals, Build Atlas scroll planes, pointer
// parallax and card tilt.
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
      const visual = scope.querySelector<HTMLElement>('.hx-visual');
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
      tiltCards('.hx-module');
      tiltCards('.founder-real');
    }

    // Scroll-linked kinetic type: the giant word row slides with the page,
    // only while it is on screen. No infinite animation is involved.
    const kinetic = scope.querySelector<HTMLElement>('.hx-kinetic');
    if (kinetic) {
      let frame = 0;
      const update = () => {
        frame = 0;
        const rect = kinetic.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, 1 - (rect.top + rect.height) / (window.innerHeight + rect.height)));
        kinetic.style.setProperty('--kinetic', progress.toFixed(4));
      };
      const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
      const watch = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) { window.addEventListener('scroll', onScroll, { passive: true }); update(); }
        else window.removeEventListener('scroll', onScroll);
      });
      watch.observe(kinetic);
      cleanups.push(() => { watch.disconnect(); window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame); });
    }

    // Build Atlas planes: each [data-atlas] section writes a 0–1 scroll
    // progress to --atlas, which CSS turns into structural 3D (frames tipping
    // back, plates settling flat, blueprint floors sliding). Only planes on
    // screen are measured, once per frame.
    //   exit  — 0 at rest, 1 once the element has scrolled out the top
    //   enter — 0 as the top crosses the viewport bottom, 1 at 25% from the top
    //   pass  — 0 entering at the bottom, 1 leaving at the top
    const planes = [...scope.querySelectorAll<HTMLElement>('[data-atlas]')];
    if (planes.length) {
      const live = new Set<HTMLElement>();
      let frame = 0;
      const clamp = (value: number) => Math.max(0, Math.min(1, value));
      const measure = (plane: HTMLElement) => {
        const rect = plane.getBoundingClientRect(), view = window.innerHeight;
        const mode = plane.dataset.atlas;
        const progress = mode === 'exit' ? clamp(-rect.top / Math.max(rect.height, 1))
          : mode === 'enter' ? clamp((view - rect.top) / (view * .75))
          : clamp((view - rect.top) / (view + rect.height));
        plane.style.setProperty('--atlas', progress.toFixed(4));
      };
      const update = () => { frame = 0; live.forEach(measure); };
      const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
      planes.forEach(measure);
      const watch = new IntersectionObserver(entries => {
        for (const entry of entries) {
          const plane = entry.target as HTMLElement;
          if (entry.isIntersecting) live.add(plane); else { live.delete(plane); measure(plane); }
        }
        onScroll();
      });
      planes.forEach(plane => watch.observe(plane));
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      cleanups.push(() => { watch.disconnect(); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame); planes.forEach(plane => plane.style.removeProperty('--atlas')); });
    }

    return () => cleanups.forEach(cleanup => cleanup());
  }, [root, reduced]);
}
