import React from 'react';
import { AlertCircle, X } from 'lucide-react';

export default function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        padding: '0.75rem 1.25rem',
        background: 'var(--accent-danger-subtle)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: 'var(--radius-md)',
        color: '#f87171',
        fontSize: '0.9rem',
        marginBottom: '1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <AlertCircle size={18} />
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{ color: '#f87171', display: 'flex', alignItems: 'center', padding: '0.2rem' }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
