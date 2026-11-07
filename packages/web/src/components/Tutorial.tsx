import { useState } from 'react';

interface Props {
  onClose(): void;
}

const STEPS: Array<{ title: string; body: React.ReactNode }> = [
  {
    title: 'The goal',
    body: (
      <>
        <p>
          Every round, seven cards are dealt: one secret card to each of the four traders and three face-down community cards. At the end of
          the round all seven are flipped and added up. That total is <strong>the value</strong>.
        </p>
        <p>
          You only see your own card, so you have to <strong>guess the total</strong>. You make money by buying contracts when you think the
          total will be higher than the price, and selling when you think it will be lower.
        </p>
        <p className="muted small">
          Cards run from 1 to 15, plus a −10 and a −20. The total is always between −15 and 84, and on average lands around 37. Each hidden
          card is worth about 5 on average, so if your card is 12: 12 + 6 × 5 ≈ 42 is a fair first guess.
        </p>
      </>
    ),
  },
  {
    title: 'Step 1: post your two prices',
    body: (
      <>
        <p>
          A <strong>contract</strong> is a bet on the total. At the start of each cycle everyone secretly writes down two prices:
        </p>
        <ul>
          <li>
            <strong>Bid, “I buy at”</strong>: the most you will pay to buy one contract. Put it a bit <em>below</em> your guess.
          </li>
          <li>
            <strong>Ask, “I sell at”</strong>: the least you will accept to sell one contract. Put it a bit <em>above</em> your guess.
          </li>
        </ul>
        <p>
          Example: you guess 42, so you post bid 38 / ask 46. If someone sells to you at 38 and the total turns out to be 42, you make 4. If
          someone buys from you at 46, you make 4 the other way. The gap between your two prices (the <strong>spread</strong>) is your cushion
          for being wrong.
        </p>
        <p>You can post just one side, or nothing at all. Prices are hidden until everyone has locked in, then shown all at once.</p>
      </>
    ),
  },
  {
    title: 'Step 2: trade on your turn',
    body: (
      <>
        <p>Trading goes around the table. On your turn you do exactly one thing:</p>
        <ul>
          <li>
            <strong>Buy</strong>: take someone's ask. Good when their ask is <em>below</em> your guess.
          </li>
          <li>
            <strong>Sell</strong>: take someone's bid. Good when their bid is <em>above</em> your guess. You can sell without owning anything.
            That is called going <strong>short</strong>; you win if the total comes in low.
          </li>
          <li>
            <strong>Counter-offer</strong>: propose a better price. They get ten seconds to accept or decline.
          </li>
          <li>
            <strong>Pass</strong>: do nothing. Your posted prices stay live, so other players can still trade with you.
          </li>
        </ul>
        <p>
          After each cycle a community card is flipped and everyone posts fresh prices. Three cycles per round, ten rounds per match.
        </p>
      </>
    ),
  },
  {
    title: 'How you win or lose',
    body: (
      <>
        <p>
          Each contract pays one credit per point of difference. If you <strong>bought</strong> at 38 and the total is 45, you earn 7. If you{' '}
          <strong>sold</strong> at 46 and the total is 45, you earn 1. If you bought at 38 and sold at 46 you have locked in 8 no matter what the
          cards say.
        </p>
        <p>
          Your <strong>position</strong> is contracts bought minus contracts sold, and it can never go beyond +2 or −2. Your{' '}
          <strong>reserved risk</strong> is the most you could possibly lose on your current trades and posted prices. It can never exceed
          your balance, so you can never go into debt. Prices that would break that rule are blocked, and the game tells you why.
        </p>
        <p>Highest balance after ten rounds wins. Every round, the review screen shows what you knew when you traded and whether the price was sensible, separate from whether you got lucky.</p>
      </>
    ),
  },
  {
    title: 'Tips for your first game',
    body: (
      <ul>
        <li>Use the suggested prices to start, then widen or tighten them as you get comfortable.</li>
        <li>A high card (13 to 15) means the total is probably above average: lean towards buying. A −10 or −20 means the opposite: lean towards selling.</li>
        <li>Watch the face-up community cards; the “Possible value” range and your rough guess update as they appear.</li>
        <li>If other traders keep buying, they probably hold high cards. If they keep selling, the opposite.</li>
        <li>Passing is a perfectly good move when nothing looks cheap or expensive.</li>
        <li>Open the “Rules &amp; glossary” panel on the table any time you meet a word you do not know.</li>
      </ul>
    ),
  },
];

export function Tutorial({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <div className="modal stack tutorial" data-testid="tutorial">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted small">
            How to play · {step + 1} of {STEPS.length}
          </span>
          <button className="btn btn-sm" onClick={onClose} data-testid="tutorial-close" aria-label="Close tutorial">
            Skip
          </button>
        </div>
        <h2 id="tutorial-title">{STEPS[step].title}</h2>
        <div className="tutorial-body">{STEPS[step].body}</div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Back
          </button>
          <div className="dots" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className={i === step ? 'on' : ''} />
            ))}
          </div>
          {last ? (
            <button className="btn btn-primary" onClick={onClose} data-testid="tutorial-done">
              Let's play
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)} data-testid="tutorial-next">
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
