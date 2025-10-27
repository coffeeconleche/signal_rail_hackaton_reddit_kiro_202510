import { useCallback, useEffect, useState } from 'react';
import type { ClearDispatchResponse, DispatchResponse, InitResponse, ResetCooldownResponse, SetSpeedResponse } from '../../shared/types/signal';

const fetchJson = async <T>(input: RequestInfo, init?: RequestInit): Promise<T> => {
  const res = await fetch(input, init);
  const text = await res.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && payload && 'message' in payload
        ? String((payload as { message: unknown }).message)
        : 'Request failed.';
    throw new Error(message);
  }
  return payload as T;
};

type AsyncState<T> = {
  loading: boolean;
  error: string | null;
  data: T | null;
};

export const useDispatcherInit = () => {
  const [state, setState] = useState<AsyncState<InitResponse>>({
    loading: true,
    error: null,
    data: null,
  });
  const [dispatching, setDispatching] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    setActionError(null);
    setActionMessage(null);
    try {
      const payload = await fetchJson<InitResponse>('/api/init');
      setState({ loading: false, error: null, data: payload });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load dispatcher state.';
      setState({ loading: false, error: message, data: null });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setDispatchSpeed = useCallback(async (multiplier: number) => {
    setDispatching(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const payload = await fetchJson<SetSpeedResponse>('/api/debug/set-speed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ multiplier }),
      });
      setActionMessage(`Dispatch speed set to ${payload.multiplier}x`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update dispatch speed.';
      setActionError(message);
    } finally {
      setDispatching(false);
    }
  }, []);

  const resetCooldown = useCallback(async () => {
    setDispatching(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const payload = await fetchJson<ResetCooldownResponse>('/api/debug/reset-cooldown', {
        method: 'POST',
      });
      setState((prev) =>
        prev.data
          ? {
              ...prev,
              data: {
                ...prev.data,
                dispatchLog: payload.dispatchLog,
                objectives: payload.objectives,
                events: payload.events,
              },
            }
          : prev
      );
      setActionMessage('Cooldown reset.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to reset cooldown. Please try again.';
      setActionError(message);
    } finally {
      setDispatching(false);
    }
  }, []);

  const clearDispatches = useCallback(async () => {
    setDispatching(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const payload = await fetchJson<ClearDispatchResponse>('/api/debug/clear-dispatches', {
        method: 'POST',
      });
      setState((prev) =>
        prev.data
          ? {
              ...prev,
              data: {
                ...prev.data,
                dispatchLog: payload.dispatchLog,
                objectives: payload.objectives,
                events: payload.events,
              },
            }
          : prev
      );
      setActionMessage('Dispatch log cleared.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to clear dispatches. Please try again.';
      setActionError(message);
    } finally {
      setDispatching(false);
    }
  }, []);

  const dispatchTrain = useCallback(
    async (from: string, to: string) => {
      setDispatching(true);
      setActionError(null);
      setActionMessage(null);
      try {
        const payload = await fetchJson<DispatchResponse>('/api/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to }),
        });
        setState((prev) =>
          prev.data
            ? {
                ...prev,
                data: {
                  ...prev.data,
                  dispatchLog: payload.dispatchLog,
                  objectives: payload.objectives,
                  events: payload.events,
                },
              }
            : prev
        );
        const etaMinutes = Math.max(1, Math.round(payload.dispatch.durationSeconds / 60));
        const rawSeconds = payload.dispatch.durationSeconds;
        const slowdown =
          payload.dispatch.congestionFactor > 1
            ? ` Load ${payload.dispatch.congestionFactor.toFixed(2)}x due to congestion.`
            : '';
        setActionMessage(
          `Train dispatched from ${payload.dispatch.from} to ${payload.dispatch.to}. ETA ≈ ${etaMinutes} min (${rawSeconds}s).${slowdown}`
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Dispatch failed. Please try again shortly.';
        setActionError(message);
      } finally {
        setDispatching(false);
      }
    },
    []
  );

  const clearActionFeedback = useCallback(() => {
    setActionError(null);
    setActionMessage(null);
  }, []);

  return {
    loading: state.loading,
    error: state.error,
    data: state.data,
    reload: load,
    dispatchTrain,
    dispatching,
    actionMessage,
    actionError,
    clearActionFeedback,
    clearDispatches,
    setDispatchSpeed,
    resetCooldown,
    load,
  } as const;
};
