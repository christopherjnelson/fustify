import { BRAND } from '../branding';
import { AccountControl } from '../auth/AccountControl';

export function Home() {
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
              <h2>Local Game</h2>
              <p>
                Play with humans and deterministic bots. Supports solo play and
                local hot-seat games.
              </p>
            </div>
            <a className="mode-action" href="/local">
              Set up local game
            </a>
          </article>

          <article className="mode-card">
            <div>
              <span className="eyebrow">Play together online</span>
              <h2>Private Multiplayer</h2>
              <p>Create or join a private room for 2–5 human players.</p>
            </div>
            <a className="mode-action" href="/multiplayer">
              Play online
            </a>
          </article>
        </div>
      </section>
    </main>
  );
}
