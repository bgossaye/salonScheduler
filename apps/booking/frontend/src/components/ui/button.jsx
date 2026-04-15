import React from 'react';

export function Button({ children, onClick, className = '', variant = 'default' }) {
  const baseStyle = 'px-4 py-2 rounded text-white';
  const variantStyles = {
    default: 'bg-blue-500 hover:bg-blue-600',
    destructive: 'bg-red-500 hover:bg-red-600',
  };
  return (
    <button onClick={onClick} className={`${baseStyle} ${variantStyles[variant] || ''} ${className}`}>
      {children}
    </button>
  );
}
