const { numRounds, generatePairings, pairBracket, canPair, absolutePref,
        greedyPair, limitedPermutations, assignColors,
        formatScore, esc, _setPlayers, _getPlayers } = require('./swiss64');

function makePlayer(overrides = {}) {
  return { id: 1, name: 'X', rating: 1500, score: 0, colorDiff: 0,
           lastColor: null, colorHistory: [], opponents: new Set(),
           results: {}, byeRounds: 0, ...overrides };
}

// Non-DOM version of submitRound's mutation logic
function applyResults(pairings, results) {
  pairings.forEach((pair, i) => {
    if (pair.black === null) {
      pair.white.score += 1;
      pair.white.byeRounds++;
      pair.white.colorHistory.push(null);
    } else {
      const w = pair.white, b = pair.black, res = results[i];
      w.opponents.add(b.id); b.opponents.add(w.id);
      w.colorHistory.push('W'); b.colorHistory.push('B');
      w.lastColor = 'W'; b.lastColor = 'B';
      w.colorDiff++; b.colorDiff--;
      const [ws, bs] = res === '1-0' ? [1,0] : res === '0-1' ? [0,1] : [0.5,0.5];
      w.score += ws; b.score += bs;
      w.results[b.id] = ws; b.results[w.id] = bs;
    }
  });
}

// ─── numRounds ────────────────────────────────────────────────────────────────
describe('numRounds', () => {
  test.each([
    [2, 1], [3, 2], [4, 2], [5, 3], [8, 3], [16, 4], [17, 5],
  ])('%i players → %i rounds', (n, expected) => {
    expect(numRounds(n)).toBe(expected);
  });
});

// ─── absolutePref ─────────────────────────────────────────────────────────────
describe('absolutePref', () => {
  test("['W','W'] → 'B'", () => {
    const p = makePlayer({ colorHistory: ['W', 'W'] });
    expect(absolutePref(p)).toBe('B');
  });

  test("['B','B'] → 'W'", () => {
    const p = makePlayer({ colorHistory: ['B', 'B'] });
    expect(absolutePref(p)).toBe('W');
  });

  test('mixed history → null', () => {
    const p = makePlayer({ colorHistory: ['W', 'B'] });
    expect(absolutePref(p)).toBeNull();
  });

  test('colorDiff -2 → W', () => {
    const p = makePlayer({ colorDiff: -2 });
    expect(absolutePref(p)).toBe('W');
  });

  test('colorDiff 2 → B', () => {
    const p = makePlayer({ colorDiff: 2 });
    expect(absolutePref(p)).toBe('B');
  });

  test('colorDiff 0 → null', () => {
    const p = makePlayer({ colorDiff: 0 });
    expect(absolutePref(p)).toBeNull();
  });
});

// ─── canPair ──────────────────────────────────────────────────────────────────
describe('canPair', () => {
  test('already played → false', () => {
    const a = makePlayer({ id: 1, opponents: new Set([2]) });
    const b = makePlayer({ id: 2, opponents: new Set([1]) });
    expect(canPair(a, b)).toBe(false);
  });

  test('both need same color (absolute) → false', () => {
    const a = makePlayer({ id: 1, colorHistory: ['W', 'W'] }); // needs B
    const b = makePlayer({ id: 2, colorHistory: ['W', 'W'] }); // needs B
    expect(canPair(a, b)).toBe(false);
  });

  test('opposite absolute needs → true', () => {
    const a = makePlayer({ id: 1, colorHistory: ['W', 'W'] }); // needs B
    const b = makePlayer({ id: 2, colorHistory: ['B', 'B'] }); // needs W
    expect(canPair(a, b)).toBe(true);
  });

  test('both null pref → true', () => {
    const a = makePlayer({ id: 1 });
    const b = makePlayer({ id: 2 });
    expect(canPair(a, b)).toBe(true);
  });
});

// ─── limitedPermutations ──────────────────────────────────────────────────────
describe('limitedPermutations', () => {
  test('length 1 returns 1 permutation', () => {
    expect(limitedPermutations([42], 500)).toHaveLength(1);
  });

  test('length 2 gives 2 permutations', () => {
    expect(limitedPermutations([1, 2], 500)).toHaveLength(2);
  });

  test('length 3 gives 6 permutations', () => {
    expect(limitedPermutations([1, 2, 3], 500)).toHaveLength(6);
  });

  test('maxCount=2 respected', () => {
    expect(limitedPermutations([1, 2, 3], 2)).toHaveLength(2);
  });

  test('large array capped at 500', () => {
    const arr = Array.from({ length: 8 }, (_, i) => i); // 8! = 40320
    expect(limitedPermutations(arr, 500)).toHaveLength(500);
  });
});

// ─── assignColors ─────────────────────────────────────────────────────────────
describe('assignColors', () => {
  test('absolute W vs absolute B', () => {
    const a = makePlayer({ id: 1, colorHistory: ['B', 'B'] }); // needs W
    const b = makePlayer({ id: 2, colorHistory: ['W', 'W'] }); // needs B
    const { white, black } = assignColors(a, b);
    expect(white.id).toBe(1);
    expect(black.id).toBe(2);
  });

  test('absolute W vs null pref', () => {
    const a = makePlayer({ id: 1, colorHistory: ['B', 'B'] }); // needs W
    const b = makePlayer({ id: 2 });
    const { white } = assignColors(a, b);
    expect(white.id).toBe(1);
  });

  test('lastColor alternation: a played W → b gets White', () => {
    const a = makePlayer({ id: 1, lastColor: 'W' });
    const b = makePlayer({ id: 2, lastColor: null });
    const { white } = assignColors(a, b);
    expect(white.id).toBe(2);
  });

  test('default rating tiebreak: higher rated gets White', () => {
    const a = makePlayer({ id: 1, rating: 2000 });
    const b = makePlayer({ id: 2, rating: 1500 });
    const { white } = assignColors(a, b);
    expect(white.id).toBe(1);
  });
});

// ─── pairBracket ──────────────────────────────────────────────────────────────
describe('pairBracket', () => {
  test('0 players', () => {
    const { pairs, leftover } = pairBracket([], []);
    expect(pairs).toHaveLength(0);
    expect(leftover).toHaveLength(0);
  });

  test('1 player → leftover', () => {
    const p = makePlayer({ id: 1 });
    const { pairs, leftover } = pairBracket([p], []);
    expect(pairs).toHaveLength(0);
    expect(leftover).toHaveLength(1);
  });

  test('2 compatible players → 1 pair', () => {
    const a = makePlayer({ id: 1 });
    const b = makePlayer({ id: 2 });
    const { pairs, leftover } = pairBracket([a, b], []);
    expect(pairs).toHaveLength(1);
    expect(leftover).toHaveLength(0);
  });

  test('2 incompatible (already played) → both leftover', () => {
    const a = makePlayer({ id: 1, opponents: new Set([2]) });
    const b = makePlayer({ id: 2, opponents: new Set([1]) });
    const { pairs, leftover } = pairBracket([a, b], []);
    expect(pairs).toHaveLength(0);
    expect(leftover).toHaveLength(2);
  });

  test('4 players → 2 pairs', () => {
    const players = [1,2,3,4].map(id => makePlayer({ id }));
    const { pairs, leftover } = pairBracket(players, []);
    expect(pairs).toHaveLength(2);
    expect(leftover).toHaveLength(0);
  });

  test('odd count (3) → 1 pair + 1 leftover', () => {
    const players = [1,2,3].map(id => makePlayer({ id }));
    const { pairs, leftover } = pairBracket(players, []);
    expect(pairs).toHaveLength(1);
    expect(leftover).toHaveLength(1);
  });
});

// ─── generatePairings ─────────────────────────────────────────────────────────
describe('generatePairings', () => {
  test('4 players round 1: 2 boards, all assigned', () => {
    const playerList = [1,2,3,4].map(id => makePlayer({ id, rating: 2000 - id * 100 }));
    _setPlayers(playerList);
    const pairings = generatePairings();
    const games = pairings.filter(p => p.black !== null);
    expect(games).toHaveLength(2);
    games.forEach(p => {
      expect(p.white).toBeDefined();
      expect(p.black).toBeDefined();
    });
  });

  test('5 players: 2 boards + bye', () => {
    const playerList = [1,2,3,4,5].map(id => makePlayer({ id, rating: 2000 - id * 100 }));
    _setPlayers(playerList);
    const pairings = generatePairings();
    const games = pairings.filter(p => p.black !== null);
    const byes = pairings.filter(p => p.black === null);
    expect(games).toHaveLength(2);
    expect(byes).toHaveLength(1);
  });

  test('respects C1 (no repeat pairings) after one round', () => {
    const playerList = [1,2,3,4].map(id => makePlayer({ id, rating: 2000 - id * 100 }));
    _setPlayers(playerList);
    const round1 = generatePairings();
    applyResults(round1, round1.map(p => p.black === null ? null : '1-0'));

    const round2 = generatePairings();
    const games = round2.filter(p => p.black !== null);
    games.forEach(({ white: w, black: b }) => {
      expect(w.opponents.has(b.id)).toBe(false);
      expect(b.opponents.has(w.id)).toBe(false);
    });
  });
});

// ─── formatScore ──────────────────────────────────────────────────────────────
describe('formatScore', () => {
  test.each([
    [0, '0'], [1, '1'], [0.5, '0½'], [1.5, '1½'], [3, '3'],
  ])('%s → %s', (s, expected) => {
    expect(formatScore(s)).toBe(expected);
  });
});

// ─── esc ──────────────────────────────────────────────────────────────────────
describe('esc', () => {
  test('escapes <', () => expect(esc('<')).toBe('&lt;'));
  test('escapes >', () => expect(esc('>')).toBe('&gt;'));
  test('escapes &', () => expect(esc('&')).toBe('&amp;'));
  test('escapes "', () => expect(esc('"')).toBe('&quot;'));
  test('clean string unchanged', () => expect(esc('hello world')).toBe('hello world'));
});

// ─── Stochastic: 1000 random tournaments ─────────────────────────────────────
describe('stochastic: 1000 random tournaments', () => {
  const RESULTS = ['1-0', '\u00BD-\u00BD', '0-1'];

  test('no C1 or 3-in-a-row color violations', () => {
    for (let t = 0; t < 1000; t++) {
      const count = 6 + Math.floor(Math.random() * 25); // 6–30
      const playerList = Array.from({ length: count }, (_, i) => ({
        id: i + 1, name: `P${i+1}`,
        rating: 800 + Math.floor(Math.random() * 2001),
        score: 0, colorDiff: 0, lastColor: null, colorHistory: [],
        opponents: new Set(), results: {}, byeRounds: 0,
      })).sort((a, b) => b.rating - a.rating)
         .map((p, i) => ({ ...p, id: i + 1 }));

      _setPlayers(playerList);
      const rounds = numRounds(count);

      for (let r = 0; r < rounds; r++) {
        const pairings = generatePairings();

        for (const pair of pairings) {
          if (pair.black === null) continue;
          const { white: w, black: b } = pair;

          // C1: must not have played before
          expect(w.opponents.has(b.id)).toBe(false);
          expect(b.opponents.has(w.id)).toBe(false);

          // Color: assigning White to w must not create 3 Whites in a row
          const wLast2 = w.colorHistory.filter(c => c !== null).slice(-2);
          if (wLast2.length === 2) {
            expect(wLast2[0] === 'W' && wLast2[1] === 'W').toBe(false);
          }

          // Color: assigning Black to b must not create 3 Blacks in a row
          const bLast2 = b.colorHistory.filter(c => c !== null).slice(-2);
          if (bLast2.length === 2) {
            expect(bLast2[0] === 'B' && bLast2[1] === 'B').toBe(false);
          }
        }

        const results = pairings.map(p => p.black === null ? null
          : RESULTS[Math.floor(Math.random() * 3)]);
        applyResults(pairings, results);
      }
    }
  });
});
