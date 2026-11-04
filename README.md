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

The math in `piercing.js` follows the resist rules in
[WoWSims Forever](https://github.com/wowsims/forever) (`sim/core/spell_resistances.go`):

- Debuffs lower the target's resistance, but not below 0.
- Spell Piercing comes off what's left. Past 0, the rest is bonus damage.
- The average share is `R / (|R| + 9 × caster level)`. A DoT tick rolls a tenth of it. Holy has no resistance.
- Each hit rolls a whole 10% step around that average.
- A binary spell is fully resisted with the average as its chance, and one that lands rolls its damage.

The `9 × level` constant is fitted to combat logs from levels 20 to 30.

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
