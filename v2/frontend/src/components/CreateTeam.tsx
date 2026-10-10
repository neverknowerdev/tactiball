import { useEffect, useState } from 'react';
import { api, errorText, ok } from '../lib/backend';

interface Country {
  index: number;
  name: string;
  code: string;
}

export function CreateTeam({ onCreated }: { onCreated: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [country, setCountry] = useState(0);
  const [countries, setCountries] = useState<Country[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/countryList.json')
      .then((r) => r.json())
      .then(setCountries)
      .catch(() => setCountries([]));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      ok(await api().create_team(name, country));
      await onCreated();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Create your team</h2>
      <p className="muted">Team names are unique across every chain.</p>
      <form onSubmit={submit} className="form">
        <input placeholder="Team name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        <select value={country} onChange={(e) => setCountry(Number(e.target.value))}>
          <option value={0}>Country (optional)</option>
          {countries.map((c) => (
            <option key={c.index} value={c.index}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="primary" disabled={busy || name.trim().length < 3}>
          {busy ? 'Creating…' : 'Create team'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
