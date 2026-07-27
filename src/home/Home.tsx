import type { MouseEvent } from 'react';
import { AccountControl } from '../auth/AccountControl';
import { FustifyLogo } from '../brand/FustifyLogo';
import { BRAND } from '../branding';
import { HomeWorldPreviewSlot } from './HomeWorldPreviewSlot';

type Navigate = (event: MouseEvent<HTMLAnchorElement>) => void;

const singlePlayerFeatures = [
  'Local hot-seat play',
  'Deterministic opponents',
  'Save and resume',
  'Configurable worlds',
];

const multiplayerFeatures = [
  'Public games and private codes',
  'Two to five players',
  'Realtime turns and Activity',
  'Refresh and reconnect support',
];

const currentFeatures = [
  'Procedural 3D globe',
  'Local and online play',
  'Deterministic opponents',
  'Save and resume',
  'Public and private multiplayer rooms',
  'Realtime Activity and reactions',
];

function HomeHeader() {
  return (
    <header className="home-header">
      <a className="home-wordmark" href="/" aria-label="Fustify home">
        <FustifyLogo decorative showDescriptor size={56} />
      </a>
      <AccountControl />
    </header>
  );
}

function ModeCard({
  eyebrow,
  title,
  description,
  detail,
  features,
  href,
  action,
  onNavigate,
  variant,
}: {
  eyebrow: string;
  title: string;
  description: string;
  detail: string;
  features: string[];
  href: string;
  action: string;
  onNavigate: Navigate;
  variant: 'local' | 'online';
}) {
  return (
    <article className={`mode-card mode-card-${variant}`}>
      <div className="mode-card-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
        <p className="mode-card-detail">{detail}</p>
      </div>
      <ul className="mode-features" aria-label={`${title} features`}>
        {features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <a className="mode-action" href={href} onClick={onNavigate}>
        {action}
        <span aria-hidden="true">→</span>
      </a>
    </article>
  );
}

function GameModeCards({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <div className="mode-grid" aria-label="Game modes">
      <ModeCard
        eyebrow="On this device"
        title="Single Player"
        description="Play locally against friends or deterministic computer opponents."
        detail="Generate a world, configure the match, and play at your own pace."
        features={singlePlayerFeatures}
        href="/local"
        action="Play Single Player"
        onNavigate={onNavigate}
        variant="local"
      />
      <ModeCard
        eyebrow="Online rooms"
        title="Multiplayer"
        description="Browse public games or create an authoritative online match with up to five registered players."
        detail="Join openly or share a private room code while every turn stays in sync."
        features={multiplayerFeatures}
        href="/multiplayer"
        action="Play Multiplayer"
        onNavigate={onNavigate}
        variant="online"
      />
    </div>
  );
}

function Hero({ onNavigate }: { onNavigate: Navigate }) {
  return (
    <section className="home-hero" aria-labelledby="home-title">
      <div className="home-hero-intro">
        <div className="home-hero-copy">
          <span className="eyebrow">
            Strategy on a different world every time
          </span>
          <h1 id="home-title">{BRAND.productName}</h1>
          <p className="home-lede">
            A strategy game played across procedurally generated spherical
            worlds.
          </p>
          <p className="home-supporting">
            Generate a unique globe, claim territories, build armies, and
            conquer continents in local or online multiplayer.
          </p>
        </div>
        <HomeWorldPreviewSlot />
      </div>
      <GameModeCards onNavigate={onNavigate} />
    </section>
  );
}

function GeneratedWorldsSection() {
  return (
    <section className="home-section generated-worlds">
      <div>
        <span className="eyebrow">Built from a seed</span>
        <h2>Every world is different</h2>
        <p>
          Fustify generates a deterministic globe with unique territories,
          continents, borders, and sea routes. Share the same setup and every
          player sees the same world.
        </p>
      </div>
      <ul className="world-traits">
        <li>
          <strong>Generated geography</strong>
          <span>Territories, continents, borders, and sea routes</span>
        </li>
        <li>
          <strong>Deterministic seeds</strong>
          <span>Reproduce and share a match setup reliably</span>
        </li>
        <li>
          <strong>Spherical strategy</strong>
          <span>Plan across a globe without a map-edge shortcut</span>
        </li>
      </ul>
    </section>
  );
}

function MatchFlowSection() {
  const steps = [
    ['01', 'Generate', 'Create a world and choose the match setup.'],
    ['02', 'Claim', 'Take control of territories and reinforce your position.'],
    ['03', 'Conquer', 'Attack, fortify, and eliminate your opponents.'],
  ];

  return (
    <section
      className="home-section match-flow"
      aria-labelledby="match-flow-title"
    >
      <div className="section-heading">
        <span className="eyebrow">The essentials</span>
        <h2 id="match-flow-title">How a match works</h2>
      </div>
      <ol className="match-steps">
        {steps.map(([number, title, description]) => (
          <li key={number}>
            <span className="step-number" aria-hidden="true">
              {number}
            </span>
            <div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FeatureStrip() {
  return (
    <section
      className="home-section feature-section"
      aria-labelledby="features-title"
    >
      <div className="section-heading">
        <span className="eyebrow">Ready to play</span>
        <h2 id="features-title">Current features</h2>
      </div>
      <ul className="feature-strip">
        {currentFeatures.map((feature) => (
          <li key={feature}>
            <span aria-hidden="true" />
            {feature}
          </li>
        ))}
      </ul>
    </section>
  );
}

function HomeFooter() {
  return (
    <footer className="home-footer">
      <strong>{BRAND.productName}</strong>
      <span>Independent browser strategy game</span>
    </footer>
  );
}

export function Home({ onNavigate }: { onNavigate?: (path: string) => void }) {
  const navigate: Navigate = (event) => {
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
    <div className="home-shell">
      <HomeHeader />
      <main className="home-main">
        <Hero onNavigate={navigate} />
        <GeneratedWorldsSection />
        <MatchFlowSection />
        <FeatureStrip />
      </main>
      <HomeFooter />
    </div>
  );
}
