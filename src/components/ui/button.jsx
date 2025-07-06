export function Button({ children, className = '', ...props }) {
  return (
    <button className={\`transition-all px-4 py-2 rounded-md font-medium \${className}\`} {...props}>
      {children}
    </button>
  );
}