export function HelpPanel() {
  return (
    <details className="help panel">
      <summary>Rules &amp; glossary</summary>
      <dl>
        <dt>Settlement value</dt>
        <dd>The sum of all seven dealt cards: four private cards plus three community cards. Always between −15 and 84.</dd>
        <dt>Public range</dt>
        <dd>The lowest and highest settlement value still possible given only the face-up community cards.</dd>
        <dt>Fair estimate</dt>
        <dd>Your expected settlement value given your own private card and the face-up community cards.</dd>
        <dt>Bid</dt>
        <dd>“I buy at”. A binding price at which you will buy one contract from anyone who sells to you.</dd>
        <dt>Ask</dt>
        <dd>“I sell at”. A binding price at which you will sell one contract to anyone who buys from you.</dd>
        <dt>Spread</dt>
        <dd>Ask minus bid. A wide spread is safer but trades less; a tight spread attracts trades but leaves less margin for error.</dd>
        <dt>Long</dt>
        <dd>You bought more than you sold. You gain one credit per point the settlement value finishes above your average price.</dd>
        <dt>Short</dt>
        <dd>You sold more than you bought. You gain one credit per point the settlement value finishes below your price. Selling first is allowed.</dd>
        <dt>Position</dt>
        <dd>Bought minus sold. Must stay between −2 and +2.</dd>
        <dt>Reserved risk</dt>
        <dd>
          Your worst possible loss anywhere in the public range if every outstanding quote side were filled. It must never exceed your
          balance, so you can never owe more than you have.
        </dd>
        <dt>Counter-offer</dt>
        <dd>Instead of taking a quote, propose a better price. The other trader has 10 seconds to accept or decline.</dd>
        <dt>Settlement</dt>
        <dd>After the third cycle every card is revealed. Profit = sales − purchases + position × settlement value.</dd>
      </dl>
    </details>
  );
}
