import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Plus, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';

export const TaxonomyManager = () => {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Formulário Produtos
  const [newProduct, setNewProduct] = useState('');

  // Formulário Categorias
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryGroup, setNewCategoryGroup] = useState('Operacional');

  useEffect(() => {
    loadTaxonomy();
  }, []);

  const loadTaxonomy = async () => {
    setLoading(true);
    try {
      const { data: pData } = await supabase.from('catalog_products').select('*').order('name');
      if (pData) setProducts(pData);

      const { data: cData } = await supabase.from('catalog_categories').select('*').order('group_type').order('name');
      if (cData) setCategories(cData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProduct = async () => {
    if (!newProduct.trim()) return;
    try {
      await supabase.from('catalog_products').insert([{ name: newProduct.trim(), is_active: true }]);
      setNewProduct('');
      loadTaxonomy();
    } catch (err) {
      alert('Erro ao adicionar produto');
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await supabase.from('catalog_categories').insert([{ name: newCategoryName.trim(), group_type: newCategoryGroup, is_active: true }]);
      setNewCategoryName('');
      loadTaxonomy();
    } catch (err) {
      alert('Erro ao adicionar categoria');
    }
  };

  const toggleProduct = async (id: number, currentStatus: boolean) => {
    await supabase.from('catalog_products').update({ is_active: !currentStatus }).eq('id', id);
    loadTaxonomy();
  };

  const toggleCategory = async (id: number, currentStatus: boolean) => {
    await supabase.from('catalog_categories').update({ is_active: !currentStatus }).eq('id', id);
    loadTaxonomy();
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Carregando taxonomia...</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      {/* Coluna Produtos */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--color-border)', paddingBottom: 12 }}>Produtos Oficiais</h3>
        
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input 
            type="text" 
            placeholder="Novo Produto..." 
            value={newProduct} 
            onChange={e => setNewProduct(e.target.value)}
            style={{ flex: 1, padding: '8px 12px', borderRadius: 4, border: '1px solid var(--color-border)' }}
          />
          <button className="btn btn--primary" onClick={handleAddProduct} style={{ padding: '8px 12px' }}>
            <Plus size={16} /> Adicionar
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {products.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--color-surface)', borderRadius: 6, border: '1px solid var(--color-border)', opacity: p.is_active ? 1 : 0.6 }}>
              <span style={{ fontWeight: 500, textDecoration: p.is_active ? 'none' : 'line-through' }}>{p.name}</span>
              <button 
                onClick={() => toggleProduct(p.id, p.is_active)}
                style={{ background: 'none', border: 'none', color: p.is_active ? 'var(--color-success)' : 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                title={p.is_active ? "Desativar" : "Ativar"}
              >
                {p.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                <span style={{ fontSize: 12 }}>{p.is_active ? 'Ativo' : 'Inativo'}</span>
              </button>
            </div>
          ))}
          {products.length === 0 && <p style={{ color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center' }}>Nenhum produto cadastrado. Crie as tabelas primeiro.</p>}
        </div>
      </div>

      {/* Coluna Categorias */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--color-border)', paddingBottom: 12 }}>Categorias Oficiais</h3>
        
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <select 
            value={newCategoryGroup}
            onChange={e => setNewCategoryGroup(e.target.value)}
            style={{ padding: '8px', borderRadius: 4, border: '1px solid var(--color-border)' }}
          >
            <option>Operacional</option>
            <option>Desenvolvimento</option>
            <option>Infraestrutura</option>
            <option>Atendimento</option>
            <option>Comercial</option>
          </select>
          <input 
            type="text" 
            placeholder="Nova Categoria..." 
            value={newCategoryName} 
            onChange={e => setNewCategoryName(e.target.value)}
            style={{ flex: 1, padding: '8px 12px', borderRadius: 4, border: '1px solid var(--color-border)' }}
          />
          <button className="btn btn--primary" onClick={handleAddCategory} style={{ padding: '8px 12px' }}>
            <Plus size={16} /> Adicionar
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {categories.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--color-surface)', borderRadius: 6, border: '1px solid var(--color-border)', opacity: c.is_active ? 1 : 0.6 }}>
              <div>
                <span style={{ fontSize: 11, background: 'var(--color-border)', padding: '2px 6px', borderRadius: 4, marginRight: 8 }}>{c.group_type}</span>
                <span style={{ fontWeight: 500, textDecoration: c.is_active ? 'none' : 'line-through' }}>{c.name}</span>
              </div>
              <button 
                onClick={() => toggleCategory(c.id, c.is_active)}
                style={{ background: 'none', border: 'none', color: c.is_active ? 'var(--color-success)' : 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                title={c.is_active ? "Desativar" : "Ativar"}
              >
                {c.is_active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
              </button>
            </div>
          ))}
          {categories.length === 0 && <p style={{ color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center' }}>Nenhuma categoria cadastrada. Crie as tabelas primeiro.</p>}
        </div>
      </div>
    </div>
  );
};
