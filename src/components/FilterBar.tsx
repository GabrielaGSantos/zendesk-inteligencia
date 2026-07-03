import React from 'react';
import { Search, X } from 'lucide-react';
import type { FilterOptions } from '../types';

interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  product: string;
  onProductChange: (value: string) => void;
  priority: string;
  onPriorityChange: (value: string) => void;
  assignee: string;
  onAssigneeChange: (value: string) => void;
  sortOrder: string;
  onSortOrderChange: (value: string) => void;
  filterOptions: FilterOptions;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  search,
  onSearchChange,
  status,
  onStatusChange,
  category,
  onCategoryChange,
  product,
  onProductChange,
  priority,
  onPriorityChange,
  assignee,
  onAssigneeChange,
  sortOrder,
  onSortOrderChange,
  filterOptions,
  onClearFilters,
  hasActiveFilters,
}) => {
  const statusLabels: Record<string, string> = {
    new: 'Novo',
    open: 'Aberto',
    pending: 'Pendente',
    hold: 'Em espera',
    solved: 'Resolvido',
    closed: 'Fechado',
  };

  const priorityLabels: Record<string, string> = {
    urgente: 'Urgente',
    alta: 'Alta',
    normal: 'Normal',
    baixa: 'Baixa',
  };

  return (
    <div className="filter-bar" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Linha 1: Zendesk Info */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', width: '100%', alignItems: 'center' }}>
        <div className="filter-bar__search">
          <Search size={16} className="filter-bar__search-icon" />
          <input
            type="text"
            className="filter-bar__search-input"
            placeholder="Buscar por nº do ticket, assunto, cliente, organização..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
          />
        </div>

        <select
          className="filter-bar__select"
          value={status}
          onChange={e => onStatusChange(e.target.value)}
        >
          <option value="">Status</option>
          {filterOptions.statuses.map(s => (
            <option key={s} value={s}>
              {statusLabels[s] || s}
            </option>
          ))}
        </select>

        <select
          className="filter-bar__select"
          value={assignee}
          onChange={e => onAssigneeChange(e.target.value)}
        >
          <option value="">Responsável</option>
          {filterOptions.assignees?.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select
          className="filter-bar__select"
          value={sortOrder}
          onChange={e => onSortOrderChange(e.target.value)}
        >
          <option value="created_desc">Mais recentes</option>
          <option value="created_asc">Mais antigos</option>
          <option value="updated_desc">Atualizados rec.</option>
          <option value="updated_asc">Atualizados ant.</option>
        </select>

        {hasActiveFilters && (
          <button className="btn btn--ghost btn--sm" onClick={onClearFilters}>
            <X size={14} />
            Limpar
          </button>
        )}
      </div>

      {/* Linha 2: AI Analysis Info */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', width: '100%' }}>
        <select
          className="filter-bar__select"
          value={category}
          onChange={e => onCategoryChange(e.target.value)}
        >
          <option value="">Categoria</option>
          {filterOptions.categories.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          className="filter-bar__select"
          value={product}
          onChange={e => onProductChange(e.target.value)}
        >
          <option value="">Produto</option>
          {filterOptions.products.map(p => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <select
          className="filter-bar__select"
          value={priority}
          onChange={e => onPriorityChange(e.target.value)}
        >
          <option value="">Prioridade IA</option>
          {Object.entries(priorityLabels).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>
    </div>
  );
};
