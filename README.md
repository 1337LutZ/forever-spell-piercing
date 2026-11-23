# Forever Spell Piercing Calculator

A small static page for testing how Spell Piercing, target resistance and Curse of the Elements change spell damage in
World of Warcraft: Forever.

Set your level, school, damage per hit, hit type and Spell Piercing, and enter the target's resistances.
The page shows:

- the resistance left after debuffs and after piercing
- the chance of each damage step a hit can roll, and the damage each step deals
- the expected damage per hit and what the piercing adds
- how the average damage changes with Spell Piercing from 0 up

Settings are stored in the address, so a link brings them back.

## The rules

The math in `piercing.js` follows the live-realm resist rules in
[WoWSims Forever](https://github.com/wowsims/forever) (`sim/core/spell_resistances.go`):

- Debuffs lower the target's resistance, but not below 0.
- Spell Piercing comes off what's left. Past 0, the rest is bonus damage on hits and ticks at the full share.
- The average share is `R / (|R| + 8 × caster level + 19)`. Holy has no resistance.
- A bonus share under 1% pays nothing (6 piercing past the resistance at level 60 is the first that counts).
- Each hit rolls a whole 10% step around that average. No partial resist takes more than 75%: the 80, 90 and 100% steps
  land on 75%, so a spell that isn't binary is never fully resisted through the roll.
- Direct hits, channel ticks that aren't binary, and the ticks of Devouring Plague, Pyroblast and Starshards roll the
  full share and take the piercing bonus in full.
- Most DoT ticks (Shadow Word: Pain, Corruption, Flame Shock, Moonfire, Fireball's DoT) and Flamestrike's ground ticks
  roll a tenth of the share, and only when the target still resists, so they take no piercing bonus. The sim lets
  piercing still lower the target's resistance on them first; the logs haven't measured that yet.
- A magic damage spell is binary when it has, besides the damage, a debuff on the target, an interrupt, or a
  dummy, script, energize or area-trigger effect: Frostbolt, Frost Nova, Cone of Cold, Arcane Wrath, Flamestrike's cast,
  Immolate, Shadow Word: Death, Mind Flay, Earth Shock, Insect Swarm and others. It is fully resisted with the average as
  its chance, and one that lands takes no partial resist. Piercing lowers that chance down to 0, and past that a binary
  hit takes the bonus like any other (since build 71037). Of the binary ticks, Mind Flay's and Insect Swarm's take it at
  the full share; Hurricane's, Entangling Roots', Bane of Agony's and Drain Soul's take none.

`spells.js` lists which hits and ticks of each class's damage spells take the bonus; the page shows it as a table below
the calculator.

The `8 × level + 19` constant is fitted to combat logs from levels 20 to 50.

## Running it

Any static file server works. The page loads ES modules, so opening `index.html` straight from disk won't run it.

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Deploying

```bash
npm run build
```

This copies the four site files into `dist/`, which holds nothing else (no `.git`, tests or README). Upload that
folder to Cloudflare Pages.

`.github/workflows/deploy.yml` does this on every push to `main` (or by hand from the Actions tab): it runs the tests,
builds `dist/` and deploys it to the Cloudflare Pages project `forever-spell-piercing`, creating the project on the
first run. It needs two repository secrets:

- `CLOUDFLARE_API_TOKEN`: an API token with the Cloudflare Pages: Edit permission
- `CLOUDFLARE_ACCOUNT_ID`: the account the project lives in

## Tests

```bash
npm test
```

The tests run with Node's built-in test runner and need no install.
