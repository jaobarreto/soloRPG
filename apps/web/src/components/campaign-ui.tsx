'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest, errorMessage } from '@/lib/campaign-api';

export function useApiData<T>(path: string) {
  const [result, setResult] = useState<{ path: string; data: T } | null>(null);
  const [failure, setFailure] = useState<{
    path: string;
    message: string;
  } | null>(null);
  const refresh = useCallback(async () => {
    try {
      setResult({ path, data: await apiRequest<T>(path) });
      setFailure(null);
    } catch (error) {
      setFailure({ path, message: errorMessage(error) });
    }
  }, [path]);
  useEffect(() => {
    let active = true;
    apiRequest<T>(path)
      .then((value) => {
        if (active) {
          setResult({ path, data: value });
          setFailure(null);
        }
      })
      .catch((error) => {
        if (active) setFailure({ path, message: errorMessage(error) });
      });
    return () => {
      active = false;
    };
  }, [path]);
  return {
    data: result?.path === path ? result.data : null,
    error: failure?.path === path ? failure.message : '',
    refresh,
  };
}
export function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"
    >
      {message}
    </p>
  ) : null;
}
export function StatusBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-600">
      {label}
    </span>
  );
}
