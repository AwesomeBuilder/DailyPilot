import React from 'react';

type TurnState = 'intro' | 'listening' | 'thinking' | 'speaking' | 'rest';

interface Props {
  state: TurnState;
}

export const TurnLogo: React.FC<Props> = ({ state }) => {
  return (
    <div className={`turn-logo turn-logo--${state}`} aria-hidden="true">
      <div className="turn-logo__stack">
        <img className="turn-logo__part turn-logo__brain" src="/turn-logo/brain.svg" alt="" />
        <img className="turn-logo__part turn-logo__half-bulb" src="/turn-logo/half-bulb.svg" alt="" />
        <div className="turn-logo__bulb-group">
          <img className="turn-logo__part turn-logo__calendar" src="/turn-logo/calendar.svg" alt="" />
          <img className="turn-logo__part turn-logo__detail" src="/turn-logo/bulb-detail.svg" alt="" />
          <img className="turn-logo__part turn-logo__sparkles" src="/turn-logo/sparkles.svg" alt="" />
        </div>
      </div>
    </div>
  );
};
