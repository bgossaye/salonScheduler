export function Button({ children, className = '', variant = 'primary', ...props }) {
  const base =
    'px-4 py-2 rounded font-semibold transition-all duration-150';
  const styles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    outline: 'border border-gray-400 text-gray-700 hover:bg-gray-100',
    default: 'bg-gray-200 text-black hover:bg-gray-300'
  };

  return (
    <button
      className={`${base} ${styles[variant] || ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}