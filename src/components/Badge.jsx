export default function Badge({ tone, children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
