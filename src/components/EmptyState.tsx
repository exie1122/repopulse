interface Props {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}

export default function EmptyState({ title, body, action }: Props) {
  return (
    <div className="empty-state">
      <div className="empty-icon">◈</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action && (
        <button className="btn btn-primary" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
