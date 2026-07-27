import { SetupRoster, SetupSeatRow } from '../components/setup/GameSetup';
import type { MultiplayerRosterDisplay } from './multiplayerRoomRosterViewModel';

function StatusBadge({ children }: { children: string }) {
  return <span className="setup-status-badge">{children}</span>;
}

export function MultiplayerRoomRoster({
  roster,
  busy,
  waiting,
  ownSeatIndex,
  onClaim,
  onRelease,
}: {
  roster: MultiplayerRosterDisplay;
  busy: boolean;
  waiting: boolean;
  ownSeatIndex: number | null;
  onClaim: (seatIndex: number) => void;
  onRelease: () => void;
}) {
  const supplemental =
    roster.unseatedMembers.length > 0 ? (
      <section
        className="setup-unseated"
        aria-labelledby="setup-unseated-title"
      >
        <h3 id="setup-unseated-title">In room without a seat</h3>
        <ul>
          {roster.unseatedMembers.map((member) => (
            <li key={member.userId}>
              <span>{member.displayName}</span>
              <span className="setup-seat-badges">
                {member.isHost && <StatusBadge>Host</StatusBadge>}
                {member.isYou && <StatusBadge>You</StatusBadge>}
              </span>
            </li>
          ))}
        </ul>
      </section>
    ) : undefined;

  return (
    <SetupRoster title="Seats" supplemental={supplemental}>
      {roster.seats.map((seat) => {
        const claimed = seat.occupantUserId !== null;
        const owned = seat.seatIndex === ownSeatIndex;
        return (
          <SetupSeatRow
            key={seat.seatIndex}
            testId={`seat-${seat.seatIndex}`}
            seatNumber={seat.seatIndex + 1}
            colorLabel={seat.color.label}
            colorValue={seat.color.value}
            primaryLabel={seat.occupantName ?? 'Open'}
            secondaryStatus={claimed ? 'Claimed seat' : 'Available to claim'}
            flashColorMarker={!claimed}
            badges={
              <>
                {seat.isHost && <StatusBadge>Host</StatusBadge>}
                {seat.isYou && <StatusBadge>You</StatusBadge>}
              </>
            }
            controls={
              owned ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy || !waiting}
                  onClick={onRelease}
                  aria-label={`Release Seat ${seat.seatIndex + 1}`}
                >
                  Release
                </button>
              ) : !claimed ? (
                <button
                  type="button"
                  disabled={busy || !waiting || ownSeatIndex !== null}
                  onClick={() => onClaim(seat.seatIndex)}
                  aria-label={`Claim Seat ${seat.seatIndex + 1}`}
                >
                  Claim
                </button>
              ) : undefined
            }
          />
        );
      })}
    </SetupRoster>
  );
}
