# Bid Battle

A multiplayer card-based trading game that teaches market-making, bid/ask spreads, long and short positions and risk management. Traders estimate a hidden value, publish binding prices, trade with one another and settle when the cards are revealed.

## Table

**Seat**:
One of the four fixed, numbered places at the table for the whole match.

**Trader**:
Whoever occupies a seat in game terms; holds a private card, quotes, a position and a balance.
_Avoid_: Player (for the in-game role)

**Player**:
A human person connected to a room.
_Avoid_: Human, user

**Bot**:
A trader controlled by the server's decision code, with a difficulty fixed for the match.
_Avoid_: AI, computer player

**Takeover**:
The period during which a Normal bot plays a disconnected player's seat until the player reconnects.
_Avoid_: AI playing, stand-in

## Round structure

**Match**:
A full game of ten rounds; the highest final balance wins, and ties share the win.

**Round**:
One deal of the cards, three cycles of trading, then settlement and the round review.

**Cycle**:
One quote preparation followed by one trading pass around the table.

**Turn**:
A trader's single chance in a cycle to take one primary action: buy, sell, counter-offer or pass.

**Quote preparation**:
The simultaneous, private start of a cycle in which every trader prepares a sealed quote.

**Private card**:
The one card dealt face down to each trader, seen only by that trader until settlement.

**Community card**:
One of three cards dealt face down to the table and revealed one per cycle boundary.

**Unused cards**:
The ten cards left in the deck each round, which are never shown.

## Pricing

**Settlement value**:
The sum of the seven dealt cards (four private plus three community), revealed at settlement.
_Avoid_: Total, final total, true value, V (in prose)

**Public range**:
The lowest and highest settlement value still possible given only the revealed community cards.
_Avoid_: Bounds, possible range, possible value, limits

**Fair estimate**:
A trader's expected settlement value given their own private card and the revealed community cards.
_Avoid_: Rough guess, expected total, EV, fair value

**Contract**:
The single unit that is traded; buying at a price earns the settlement value minus that price.

**Bid**:
A price at which a trader will buy one contract.

**Ask**:
A price at which a trader will sell one contract.

**Spread**:
The gap between a trader's ask and bid.

**Quote**:
A trader's bid and/or ask, one contract each, for one cycle; it is sealed, then published, and each side ends filled, expired or risk-cancelled.
_Avoid_: Submission, order, offer

**Sealed quote**:
A quote during quote preparation: private, and changeable until it is confirmed.
_Avoid_: Locked quote

**Published quote**:
A quote revealed to everyone at the start of trading; it is binding and cannot be edited or withdrawn.

**Counter-offer**:
A proposal to trade at a better price than a published quote side, which the quote's owner accepts or declines.
_Avoid_: Counter (in prose)

**Pass**:
Taking no primary action on a turn.

## Risk

**Position**:
Contracts bought minus contracts sold in the current round; positive is long, negative is short.

**Position limit**:
The largest absolute position a trader may hold (two contracts).

**Cashflow**:
Sale prices received minus purchase prices paid in the current round, settled at round end.

**Balance**:
A trader's credits, which change only at settlement.

**Credits**:
The fictional currency of the game; the table's total is always 400.

**Worst loss**:
The most a trader's portfolio could lose anywhere in the public range. Raising a bid or lowering an ask raises it.

**Reserved risk**:
The largest worst loss across every way a trader's published quote could still be filled.

**Available credits**:
A trader's balance minus their reserved risk.

**Risk cancellation**:
The server removing a published quote side that would break a trader's risk limits after a trade.
_Avoid_: Trim, auto-cancel

**Settlement**:
The end of a round, when every card is revealed and each trader's cashflow plus position times settlement value is added to their balance.

## Review

**Round review**:
The post-settlement breakdown of each trader's trades, judged against the information they had at the time.

**Locked profit**:
Profit from matched buy-and-sell pairs that is the same whatever the settlement value.
_Avoid_: "locked" for anything else

**Exposure**:
The unmatched part of a position, whose outcome depends on the settlement value.

## Room

**Room**:
A private table identified by a five-letter code, where players gather and a match is played.

**Lobby**:
The room before the match starts, where players join and the host sets bot difficulties.

**Host**:
The player who can configure and start the match; the role moves to another player if the host leaves the lobby.
