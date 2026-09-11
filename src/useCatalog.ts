import { useEffect, useRef, useState } from 'react';
import { parseCatalog, type Catalog } from '@billioncodes/learning';
import { request } from './api';
import { readDownload } from './learningStore';

export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [source, setSource] = useState<'live' | 'saved' | null>(null);
  const [savedAt, setSavedAt] = useState('');
  const [error, setError] = useState('');
  const active = useRef(false);
  async function reload() {
    if (active.current) return;
    active.current = true; setState('loading');
    try {
      const result = parseCatalog(await request<unknown>('/api/v1/catalog'));
      if (!result) throw new Error('The catalogue response could not be read.');
      setCatalog(result); setSource('live'); setError(''); setState('ready');
    } catch (error) {
      const saved = readDownload();
      setError(error instanceof Error ? error.message : 'The catalogue could not be loaded.');
      if (saved) { setCatalog(saved.catalog); setSavedAt(saved.savedAt); setSource('saved'); setState('ready'); }
      else { setCatalog(null); setSource(null); setState('error'); }
    } finally { active.current = false; }
  }
  useEffect(() => { void reload(); }, []);
  return { catalog, state, source, savedAt, error, reload };
}
export type CatalogState = ReturnType<typeof useCatalog>;
