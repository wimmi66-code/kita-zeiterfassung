export default function Placeholder({ title, step }: { title: string; step: string }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="muted">Folgt in {step}.</p>
    </section>
  );
}
