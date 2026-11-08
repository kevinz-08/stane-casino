'use client';

import { DISPLAY_NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@casino/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { ApiError, loadBalance, login, register } from '@/lib/api';

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'E-mail o contraseña incorrectos.',
  EMAIL_TAKEN: 'Ya existe una cuenta con ese e-mail.',
  TOO_MANY_REQUESTS: 'Demasiados intentos. Espera un minuto y vuelve a probar.',
};

const input =
  'w-full rounded border border-white/15 bg-white/5 px-3 py-2 outline-none focus:border-emerald-500';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isRegister = mode === 'register';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    setPending(true);
    setError(null);
    try {
      if (isRegister) {
        await register({ email, password, displayName: String(form.get('displayName') ?? '') });
      } else {
        await login({ email, password });
      }
      await loadBalance();
      router.push('/account');
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (MESSAGES[e.body.code] ?? e.detail)
          : 'No se pudo conectar con el servidor.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        E-mail
        <input name="email" type="email" required autoComplete="email" className={input} />
      </label>

      {isRegister && (
        <label className="flex flex-col gap-1 text-sm">
          Nombre visible
          <input
            name="displayName"
            required
            minLength={2}
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            autoComplete="nickname"
            className={input}
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        Contraseña
        <input
          name="password"
          type="password"
          required
          minLength={isRegister ? PASSWORD_MIN_LENGTH : undefined}
          maxLength={PASSWORD_MAX_LENGTH}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          className={input}
        />
        {isRegister && (
          <span className="text-xs opacity-60">Mínimo {PASSWORD_MIN_LENGTH} caracteres.</span>
        )}
      </label>

      {error && (
        <p role="alert" className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-emerald-600 py-2 font-medium hover:bg-emerald-500 disabled:opacity-50"
      >
        {pending ? 'Un momento…' : isRegister ? 'Crear cuenta' : 'Entrar'}
      </button>

      <p className="text-center text-sm opacity-70">
        {isRegister ? (
          <>
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="underline">
              Entra
            </Link>
          </>
        ) : (
          <>
            ¿No tienes cuenta?{' '}
            <Link href="/register" className="underline">
              Crea una
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
