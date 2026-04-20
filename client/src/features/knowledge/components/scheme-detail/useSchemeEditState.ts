import { useCallback, useState } from 'react';
import type { SessionPhase } from '@psynote/shared';
import type { EditData, EditSession } from './types';
import { emptySession } from './types';

/**
 * Encapsulates editData + all 3-level updaters (top-level / session /
 * phase). Each updater patches immutably; arrays spread along the way
 * to keep React's structural comparison effective.
 */
export function useSchemeEditState() {
  const [editData, setEditData] = useState<EditData | null>(null);

  const uf = useCallback(<K extends keyof EditData>(field: K, value: EditData[K]) => {
    setEditData((p) => (p ? { ...p, [field]: value } : p));
  }, []);

  const us = useCallback(
    (i: number, field: keyof EditSession, value: any) => {
      setEditData((p) => {
        if (!p) return p;
        const sessions = [...p.sessions];
        sessions[i] = { ...sessions[i], [field]: value };
        return { ...p, sessions };
      });
    },
    [],
  );

  const addSession = useCallback(() => {
    setEditData((p) => (p ? { ...p, sessions: [...p.sessions, emptySession()] } : p));
  }, []);

  const removeSession = useCallback((i: number) => {
    setEditData((p) => (p ? { ...p, sessions: p.sessions.filter((_, j) => j !== i) } : p));
  }, []);

  const addPhase = useCallback((si: number) => {
    setEditData((p) => {
      if (!p) return p;
      const sessions = [...p.sessions];
      sessions[si] = {
        ...sessions[si],
        phases: [...sessions[si].phases, { name: '', duration: '', description: '' }],
      };
      return { ...p, sessions };
    });
  }, []);

  const updatePhase = useCallback(
    (si: number, pi: number, field: keyof SessionPhase, value: string) => {
      setEditData((p) => {
        if (!p) return p;
        const sessions = [...p.sessions];
        const phases = [...sessions[si].phases];
        phases[pi] = { ...phases[pi], [field]: value };
        sessions[si] = { ...sessions[si], phases };
        return { ...p, sessions };
      });
    },
    [],
  );

  const removePhase = useCallback((si: number, pi: number) => {
    setEditData((p) => {
      if (!p) return p;
      const sessions = [...p.sessions];
      sessions[si] = { ...sessions[si], phases: sessions[si].phases.filter((_, j) => j !== pi) };
      return { ...p, sessions };
    });
  }, []);

  const patchSession = useCallback((index: number, patch: Partial<EditSession>) => {
    setEditData((p) => {
      if (!p) return p;
      const sessions = [...p.sessions];
      if (sessions[index]) sessions[index] = { ...sessions[index], ...patch };
      return { ...p, sessions };
    });
  }, []);

  return {
    editData,
    setEditData,
    uf,
    us,
    addSession,
    removeSession,
    addPhase,
    updatePhase,
    removePhase,
    patchSession,
  };
}
