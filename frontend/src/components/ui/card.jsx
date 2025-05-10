import React from 'react';

export function Card({ children, className = '', ...props }) {
  return (
    <div className={`border rounded-lg shadow-sm bg-white ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardContent({ children, className = '' }) {
  return (
    <div className={`p-4 ${className}`}>
      {children}
    </div>
  );
}