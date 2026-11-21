import { useEffect, useMemo, useState } from 'react';
import { applyBuy, applySell, applyRiskCancellation, checkPortfolio, evaluateQuote, type Command, type CommandResult, type PlayerView, type Side } from '@bid-battle/engine';
import { fmt } from '../format';

export type OnCommand = (cmd: Command) => Promise<CommandResult>;

type Mode = { kind: 'idle' } | { kind: 'buy'; target: number; price: number } | { kind: 'sell'; target: number; price: number } | { kind: 'counter' };

/** The trading actions' state and rules, shared by the desktop action panel and the phone action bar. */
export function useTradeActions(game: PlayerView, onCommand: OnCommand) {
  const me = game.seat!;
  const local = game.me!;
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [counterTarget, setCounterTarget] = useState<string>('');
  const [counterPrice, setCounterPrice] = useState<string>('');

  useEffect(() => {
    setMode({ kind: 'idle' });
  }, [game.phaseVersion]);

  const myQuote = game.seats[me].quote;
  const levels = useMemo(() => {
    const asks = game.seats.filter((s) => s.index !== me && s.quote.ask !== undefined).map((s) => ({ seat: s.index, price: s.quote.ask! }));
    const bids = game.seats.filter((s) => s.index !== me && s.quote.bid !== undefined).map((s) => ({ seat: s.index, price: s.quote.bid! }));
    asks.sort((a, b) => a.price - b.price || a.seat - b.seat);
    bids.sort((a, b) => b.price - a.price || a.seat - b.seat);
    return { asks, bids, bestAsk: asks[0] ?? null, bestBid: bids[0] ?? null };
  }, [game.seats, me]);

  // A counter-offer awaiting the player is answered in the counter-offer modal, not with these actions.
  const isMyTurn = game.phase === 'TRADING' && game.turnSeat === me && !game.pendingCounter;
  const waitingOn = game.pendingCounter
    ? game.pendingCounter.from === me
      ? `Waiting for ${game.seats[game.pendingCounter.target].name} to answer your counter-offer`
      : `Waiting for ${game.seats[game.pendingCounter.target].name} to answer a counter-offer`
    : game.turnSeat !== null && game.turnSeat !== me
      ? `Waiting for ${game.seats[game.turnSeat].name} to act`
      : null;

  const preview = (side: 'buy' | 'sell', price: number) => {
    const p = side === 'buy' ? applyBuy(local.portfolio, price) : applySell(local.portfolio, price);
    const check = checkPortfolio(p, game.publicRange, game.positionLimit);
    const afterCancellation = applyRiskCancellation(p, myQuote, game.publicRange, game.positionLimit);
    const ev = evaluateQuote(p, afterCancellation.quote, game.publicRange, game.positionLimit);
    return { ok: check.ok, reason: check.reason, portfolio: p, reserved: ev.reserved, cancellations: afterCancellation.cancellations };
  };

  const buyReason = !isMyTurn ? waitingOn ?? 'Not your turn' : !levels.bestAsk ? 'No one is offering to sell right now' : preview('buy', levels.bestAsk.price).ok ? null : `You cannot buy: ${preview('buy', levels.bestAsk.price).reason}`;
  const sellReason = !isMyTurn ? waitingOn ?? 'Not your turn' : !levels.bestBid ? 'No one is offering to buy right now' : preview('sell', levels.bestBid.price).ok ? null : `You cannot sell: ${preview('sell', levels.bestBid.price).reason}`;
  const counterReason = !isMyTurn ? waitingOn ?? 'Not your turn' : levels.asks.length + levels.bids.length === 0 ? 'No quotes to counter' : null;

  const run = async (cmd: Command) => {
    setBusy(true);
    const res = await onCommand(cmd);
    setBusy(false);
    if (res.ok) setMode({ kind: 'idle' });
  };

  const counterOptions = [
    ...levels.asks.map((a) => ({ key: `ask:${a.seat}`, side: 'ask' as Side, seat: a.seat, price: a.price, label: `Buy below ${game.seats[a.seat].name}'s ask ${fmt(a.price)}` })),
    ...levels.bids.map((b) => ({ key: `bid:${b.seat}`, side: 'bid' as Side, seat: b.seat, price: b.price, label: `Sell above ${game.seats[b.seat].name}'s bid ${fmt(b.price)}` })),
  ];
  const chosen = counterOptions.find((o) => o.key === counterTarget) ?? counterOptions[0] ?? null;
  const counterNum = Number(counterPrice);
  let counterProblem: string | null = null;
  if (chosen) {
    if (counterPrice.trim() === '' || !Number.isInteger(counterNum)) counterProblem = 'enter a whole-number price';
    else if (counterNum < game.publicRange.L || counterNum > game.publicRange.U) counterProblem = `price must be between ${fmt(game.publicRange.L)} and ${fmt(game.publicRange.U)}`;
    else if (chosen.side === 'ask' && counterNum >= chosen.price) counterProblem = `must be strictly below the ask of ${fmt(chosen.price)}`;
    else if (chosen.side === 'bid' && counterNum <= chosen.price) counterProblem = `must be strictly above the bid of ${fmt(chosen.price)}`;
    else {
      const pv = preview(chosen.side === 'ask' ? 'buy' : 'sell', counterNum);
      if (!pv.ok) counterProblem = pv.reason ?? 'risk limit';
    }
  }

  return {
    mode,
    busy,
    levels,
    isMyTurn,
    waitingOn,
    preview,
    buyReason,
    sellReason,
    counterReason,
    run,
    buy: () => levels.bestAsk && setMode({ kind: 'buy', target: levels.bestAsk.seat, price: levels.bestAsk.price }),
    sell: () => levels.bestBid && setMode({ kind: 'sell', target: levels.bestBid.seat, price: levels.bestBid.price }),
    counter: () => setMode({ kind: 'counter' }),
    cancel: () => setMode({ kind: 'idle' }),
    counterOptions,
    chosen,
    setCounterTarget,
    counterPrice,
    setCounterPrice,
    counterNum,
    counterProblem,
  };
}

export type TradeActions = ReturnType<typeof useTradeActions>;
export type TradePreview = ReturnType<TradeActions['preview']>;
