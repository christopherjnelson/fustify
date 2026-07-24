import { BRAND } from '../branding';
import { AccountControl } from '../auth/AccountControl';
import type { MouseEvent } from 'react';

export function Home({ onNavigate }: { onNavigate?: (path: string) => void }) {
  const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      !onNavigate ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    onNavigate(event.currentTarget.pathname);
  };

  return (
    <main className="home-shell">
      <AccountControl />
      <section className="home-content" aria-labelledby="home-title">
        <div className="home-brand">
          <span className="eyebrow">{BRAND.shortDescription}</span>
          <h1 id="home-title">{BRAND.productName}</h1>
          <p>{BRAND.tagline}</p>
        </div>

        <div className="mode-grid">
          <article className="mode-card">
            <div>
              <span className="eyebrow">Play together here</span>
              <h2>Single Player</h2>
              <p>
                Play with humans and deterministic bots. Supports solo play and
                local hot-seat games.
              </p>
            </div>
            <a className="mode-action" href="/local" onClick={navigate}>
              Single Player
            </a>
          </article>

          <article className="mode-card">
            <div>
              <span className="eyebrow">Play together online</span>
              <h2>Multiplayer</h2>
              <p>Create or join a private room for 2–5 human players.</p>
            </div>
            <a className="mode-action" href="/multiplayer" onClick={navigate}>
              Multiplayer
            </a>
          </article>
        </div>
      </section>
    </main>
  );
}
