import React, { useState } from 'react';
import { Mail, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMsg('Por favor, informe seu e-mail.');
      return;
    }
    if (!password) {
      setErrorMsg('Por favor, informe sua senha.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw error;
      }
      
      // On success, App.tsx's onAuthStateChange listener will automatically detect the login and render the dashboard.
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha na autenticação. Verifique e-mail e senha.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-layout">
      <div className="login-card">
        {/* Header */}
        <div className="login-card__header">
          <div className="login-card__logo">
            <img src="/logo-mpx.svg" alt="MPX Logo" />
          </div>
          <h2 className="login-card__title">Central de Inteligência</h2>
          <p className="login-card__subtitle">Painel Administrativo Zendesk</p>
        </div>

        {/* Welcome */}
        <div className="login-card__welcome">
          <p>Entre com suas credenciais para acessar o painel.</p>
        </div>

        {errorMsg && (
          <div className="login-card__alert">
            {errorMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="login-card__form">
          <div className="login-card__input-group">
            <label>E-mail</label>
            <div className="login-card__input-wrapper">
              <span className="login-card__icon">
                <Mail size={15} />
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@mpxbrasil.com.br"
              />
            </div>
          </div>

          <div className="login-card__input-group">
            <label>Senha</label>
            <div className="login-card__input-wrapper">
              <span className="login-card__icon">
                <KeyRound size={15} />
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="login-card__button"
          >
            {submitting ? (
              <><span className="spinner spinner--small" style={{ marginRight: 6 }}></span> Acessando...</>
            ) : (
              'Entrar'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
