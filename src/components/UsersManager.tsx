import React, { useState, useEffect } from 'react';
import { Plus, KeyRound, User, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export const UsersManager: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Forms states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', pass: '', role: 'user' });
  const [passwordData, setPasswordData] = useState({ email: '', oldPass: '', newPass: '' });
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Get logged in user email from JWT mock (for password change)
  const [currentUserEmail, setCurrentUserEmail] = useState('');

  const loadUsers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('http://localhost:3002/api/users', {
        headers: {
          'Authorization': session ? `Bearer ${session.access_token}` : ''
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar usuários');
      setUsers(data || []);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    // Decode email from local storage (mock for now, we just want to know who is logged in to change their own password)
    // For simplicity, we just prompt for the email in the change password form or assume admin.
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('http://localhost:3002/api/users', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': session ? `Bearer ${session.access_token}` : ''
        },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setSuccessMsg('Usuário criado com sucesso!');
      setShowAddModal(false);
      setFormData({ name: '', email: '', pass: '', role: 'user' });
      loadUsers();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      if (passwordData.oldPass !== passwordData.newPass) {
         // Supabase Auth handles password update if logged in
         const { error } = await supabase.auth.updateUser({
           password: passwordData.newPass
         });
         
         if (error) throw error;
      }

      setSuccessMsg('Senha atualizada com sucesso!');
      setShowPasswordModal(false);
      setPasswordData({ email: '', oldPass: '', newPass: '' });
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao atualizar senha.');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`http://localhost:3002/api/users/${id}`, { 
        method: 'DELETE',
        headers: {
          'Authorization': session ? `Bearer ${session.access_token}` : ''
        }
      });
      loadUsers();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="card">
      <div className="card__header" style={{ padding: '20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="card__title">Usuários do Sistema</h2>
          <p className="card__subtitle">Gerencie o acesso à Central de Inteligência</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn--secondary" onClick={() => setShowPasswordModal(true)}>
            <KeyRound size={16} /> Trocar Minha Senha
          </button>
          <button className="btn btn--primary" onClick={() => setShowAddModal(true)}>
            <Plus size={16} /> Novo Usuário
          </button>
        </div>
      </div>

      {successMsg && (
        <div style={{ margin: '0 16px 16px 16px', padding: '12px 16px', background: '#dcfce7', color: '#166534', borderRadius: 8 }}>
          {successMsg}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>Carregando...</div>
      ) : (
        <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 12 }}>
              <th style={{ padding: '12px 16px' }}>Nome</th>
              <th style={{ padding: '12px 16px' }}>E-mail</th>
              <th style={{ padding: '12px 16px' }}>Nível</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '12px 16px', fontWeight: 500 }}>{u.name}</td>
                <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>{u.email}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span className="badge badge--status-open">{u.role}</span>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <button onClick={() => handleDeleteUser(u.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="modal__header">
              <h2>Adicionar Usuário</h2>
              <button onClick={() => setShowAddModal(false)} className="modal-close" style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--color-text-muted)' }}>&times;</button>
            </div>
            
            <form onSubmit={handleAddUser} className="modal__body" style={{ gap: 16, display: 'flex', flexDirection: 'column' }}>
              {errorMsg && <div style={{ color: '#ef4444', fontSize: 13, padding: '8px 12px', background: '#fee2e2', borderRadius: 6 }}>{errorMsg}</div>}
              
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 }}>Nome Completo *</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 }}>E-mail *</label>
                <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 }}>Senha *</label>
                <input required type="password" placeholder="Mínimo 8 caracteres" minLength={8} value={formData.pass} onChange={e => setFormData({...formData, pass: e.target.value})} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 }}>Nível de Acesso *</label>
                <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)' }}>
                  <option value="user">Usuário Comum</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                <button type="button" className="btn btn--secondary" onClick={() => setShowAddModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn--primary">Salvar Usuário</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="modal__header">
              <h2>Trocar Minha Senha</h2>
              <button onClick={() => setShowPasswordModal(false)} className="modal-close" style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--color-text-muted)' }}>&times;</button>
            </div>
            
            <form onSubmit={handleUpdatePassword} className="modal__body" style={{ gap: 16, display: 'flex', flexDirection: 'column' }}>
              {errorMsg && <div style={{ color: '#ef4444', fontSize: 13, padding: '8px 12px', background: '#fee2e2', borderRadius: 6 }}>{errorMsg}</div>}
              
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 }}>Seu E-mail (Confirmação)</label>
                <input required type="email" value={passwordData.email} onChange={e => setPasswordData({...passwordData, email: e.target.value})} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 }}>Senha Atual</label>
                <input required type="password" value={passwordData.oldPass} onChange={e => setPasswordData({...passwordData, oldPass: e.target.value})} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500, fontSize: 13 }}>Nova Senha</label>
                <input required type="password" minLength={8} placeholder="Mínimo 8 caracteres" value={passwordData.newPass} onChange={e => setPasswordData({...passwordData, newPass: e.target.value})} style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 6 }} />
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                <button type="button" className="btn btn--secondary" onClick={() => setShowPasswordModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn--primary">Atualizar Senha</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
