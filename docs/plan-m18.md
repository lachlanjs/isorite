# Milestone 18: setting up the provider in the browser

Written 2026-10-26, for approval. Branch `m18-setup`, from `main` at `d12d9c2` (0.5.0). It was agreed after M14 as
the step after M15, and proposed again after the 0.5.0 release. Today a gateway is set up by hand in
`config.toml`, with `isorite doctor` run in a terminal to find what is wrong. M18 lets that be done from Iso's
settings, checked there, and taken into use without restarting.

## 1. What is there today

Found by reading `packages/server/src/{config,doctor,serve,gateway,http}.ts` and `IsoSettings.svelte` at `d12d9c2`.

- **Iso's settings** (`IsoSettings.svelte`, behind the icon at the right of Iso's pane head):
  - the provider's name;
  - the key: pasted, replaced or forgotten, never shown again; or "sign in at OpenRouter for a new key";
  - the monthly spend cap;
  - the three tiers' models, shown but not changeable;
  - AGENTS.md.
- **Everything else is in `~/.config/isorite/config.toml`**, by hand:
  - `[provider]`: `url`, `name`, `auth`, `key_header`, `headers`, `query`, `stream_usage`, `max_tokens`;
  - the certificate: `pfx` + `pfx_passphrase`, or `cert` + `cert_key`, and `ca`;
  - `[tiers]` and `[prices]`.
  - Values may be `"$NAME"`, read from the environment, so a second secret need not be written there.
- **The provider is read once, when the server starts** (`serve()` → `providerConfig`, `gatewayHttp`, `relay`).
  A change to `config.toml` needs a restart. So does a key, for the relay of a running `isorite term`.
- **`isorite doctor`** checks the configuration, Node's proxy and authorities, then asks the provider: its model
  list, one short reply from each tier's model, and one tool call. Its lines say what to change. `--report` gives
  the same as a block with the secrets hidden.
- **Who may change settings:** the API answers to this machine's names and a tailnet's (`hostOk`). The key can be
  set from a phone over the tailnet today.
- **`isorite guide`** chooses the finder or the real model when it starts (`hasModel`).

## 2. What M18 does

**1. The provider section of Iso's settings** becomes the whole setup.
- **A choice of two:** OpenRouter (as now: key or sign-in), or *a gateway of your own* (OpenAI-compatible).
- **For a gateway, in the order you usually need them:**
  - the address (`url`) and a name;
  - the key, and the header it goes in when not `Authorization: Bearer` (`key_header`);
  - extra headers and query values, as name/value rows;
  - the client certificate: the path to a `.pfx` and its password, or a certificate and key; and an authority
    (`ca`). Paths are typed, because a page can't give the server a file's path;
  - whether it reports usage when streaming (`stream_usage`), and `max_tokens`.
- **Secrets are written, never read back** (Q83): the key, the `.pfx` password and any header value whose name
  looks secret are shown only as "held". A `"$NAME"` value is shown as it is, since it names a variable.
- **Folded away:** everything past the address and key sits under a disclosure, so the common case is two fields.
- **The tiers:** each tier's model is chosen from the provider's own list (`GET /models`, asked through the
  server), or typed where the provider has no list.
- **Controls:** icon buttons with tooltips (check, keep, forget), no "[ text ]" buttons and no explanatory text
  around them. The two sentences under the key today become tooltips.

**2. Check before keeping.**
- **Check** runs doctor's provider steps on what the form holds, not yet saved: reached, the models listed, a reply
  from each tier's model, and a tool call. Each line shows ✓, ! or ✗ with doctor's own words of what to change.
- **The steps move into one function** (`checkProvider` in `doctor.ts`), used by `isorite doctor` and by the page,
  so the two can't drift apart.
- **It costs a few hundred tokens**, as doctor does. The tooltip says so.
- **Copy the report:** a button copies `isorite doctor --report`'s block, secrets hidden, to paste to an AI or a
  colleague helping.

**3. Keeping it, in use at once** (Q84).
- **Keep** writes `[provider]` and `[tiers]` to `config.toml` (0600, as now). The engine, the server's `Http` and
  the relay for the terminal take the new provider without a restart (`Engine.setProvider`, and the server holding
  the provider by reference).
- **The key stays with its address** (Q85). If the address changes and no new key is given, the old key is
  forgotten, so it's never sent somewhere it wasn't given for.
- **A running `isorite term`** keeps the models OpenCode was started with. Its requests go through the relay, which
  now uses the new address, key and certificate. A tooltip says the terminal takes new models when it is next
  started.
- **`isorite guide`** with the finder switches to the model once one is kept, and back to the finder if the setup
  is forgotten.
- **Comments in `config.toml` are lost** on writing, as with the key today. The tooltip on Keep says so, and
  isorite keeps the file as it was beside it as `config.toml.bak` once, the first time the page writes it.

**4. Only from this machine** (Q86).
- **The provider's setup** (address, headers, certificate, tiers) can only be changed when the page is at
  `localhost`. From a tailnet name it's shown and checkable, but not changeable. Otherwise anyone on the tailnet
  could point the key at an address of their own.
- **The key and the spend cap** stay changeable from the tailnet, as today.
- **The public site** (the guide in the browser) has no server, so the section isn't shown there.

## 3. Tests

- **Server, unit** (`packages/server/test/`):
  - the form's fields to `[provider]`/`[tiers]` and back, with `"$NAME"` kept and secrets never returned;
  - `checkProvider` against a scripted provider: each outcome, the same as doctor's;
  - a change of address forgets the key; a provider kept is used by the next turn and by the relay;
  - setup refused from a tailnet name, allowed from localhost.
- **Browser** (`app/tests/setup.spec.ts`, against the scripted provider on 4798):
  - choose a gateway, give an address, check: the lines appear; keep: Iso answers from it;
  - the model list fills the tier choices;
  - secrets are shown as held after reloading the page;
  - on the phone, the section folds and its fields fit.
- **The rest:** `npm test`, `npm run check` and every browser test pass. The svelte-autofixer is run on every
  changed `.svelte` file.
- **A real check, once:** on a temporary config, set up OpenRouter as if it were a gateway (address, key, tiers)
  from the page, check and keep, then one turn. About $0.01. Lachlan's own `config.toml` is not read or written:
  the server is started with `XDG_CONFIG_HOME` pointing at a temporary folder. Lachlan can then try it against the
  work gateway.

## 4. The boards

No board shows Iso's settings. The section follows `isorite.css`'s fields and buttons and the **Header-Context**
board's rows (a name, a faint detail, a switch or icon at the right) for the check's lines and the tiers. That is
a named departure: the layout is mine, to be judged from the screenshots.

## 5. Docs and the guide

- **`docs/setup.md` and `docs/setup-for-agents.md`:** the page first, `config.toml` as the other way, with the
  same field names.
- **The guide:** the note *Starting a base* (and the finder's `NOT_A_MODEL` line, which points at it) says where
  the setup is.

## 6. Order of work

1. `checkProvider` out of doctor, and the form's fields ↔ `config.toml` (server, with unit tests).
2. The provider held by reference: `Engine.setProvider`, the server's `Http` and relay rebuilt on keeping; the
   guide's finder switching. The API: `GET/PUT /api/settings/provider`, `POST /api/settings/provider/check`,
   `GET /api/settings/provider/models`, `GET /api/settings/report`, with the localhost rule.
3. The section in `IsoSettings.svelte`.
4. Browser tests, screenshots, the docs and the guide's note.
5. The real check, and the write-up as §8 here. Version 0.6.0.

## 7. Questions

- **Q83: may the page write the `.pfx` password and secret header values?** They're written into `config.toml`
  as the key is, readable only by you (0600), and never sent back to the page. *Recommended: yes*, with `"$NAME"`
  still there for those who'd rather keep them in the environment.
- **Q84: keep in use at once, or on the next start?** *Recommended: at once.* Needing a restart is the part of
  setting up by hand that M18 is meant to remove.
- **Q85: should changing the address forget the key?** *Recommended: yes*, unless a new key is given in the same
  keep. It costs pasting the key again, and it stops a key going where it wasn't meant to.
- **Q86: the setup only from localhost?** *Recommended: yes* for the address, headers, certificate and tiers. The
  key and cap stay changeable over the tailnet, as now.
- **From M13, still open:** Q54's header (which header the work gateway wants the key in) and Q55 (a long-lived
  key, or one from signing in that expires). M18's form takes either header. A key got by a command (`key_command`)
  waits on Q55's answer and isn't in M18.

## 8. What was built

Built 2026-10-26 on `m18-setup`, as planned, with Q83–Q86 as recommended. Version 0.6.0.

- **The form** (`packages/server/src/setup.ts`): `readSetup` turns `config.toml`'s `[provider]` and `[tiers]` into
  the form with its secrets held (the key, the `.pfx`'s password, a header or query value whose name looks secret,
  as doctor judges it). `applySetup` writes the form back: what is held is kept when sent back without a value,
  and fields the form doesn't hold (`spend_cap`, `cache_marks`, …) are left alone. The types are in
  `@isorite/engine` (`ProviderSetup`, `SetupDraft`, `SetupView`, `SetupCheck`).
- **The key stays with its address:** a new address, given no key, forgets the key and any secret header.
  The address compared is the one the key goes to, so OpenRouter written as a gateway at its own address keeps it.
- **The check:** doctor's provider steps are `checkProvider` in `doctor.ts`, used by `isorite doctor` and by
  the page. The page checks the draft as if kept (`providerFrom` and `gatewayTlsFrom` read a configuration not
  yet written), or the setup kept when the page isn't on this machine.
- **Kept into use at once:** `Engine.setProvider`. The server holds the provider by reference (`liveProvider`),
  so the relay for `isorite term` uses the new address, key and certificate at once. A key held or forgotten in
  the settings is taken into use the same way. `isorite guide` passes the finder always: it answers while there is
  no model, as a provider named `finder`, and the model answers once one is set up.
- **The routes:** `GET/PUT /api/settings/provider`, and `POST …/provider/check`, `…/provider/models` and
  `/api/settings/report`. The posts need the page's token, because they ask the provider, which costs. Changing the setup
  is refused (403) unless the Host is this machine's own name, and the connection is from this machine.
- **The section** (`ProviderSetup.svelte`, in `IsoSettings.svelte`): OpenRouter or a gateway, the address and
  key, with the rest under *what else it asks for*. The tiers are chosen from the provider's list (a datalist, asked
  when a tier is first chosen). There are three icon buttons: check, keep, and copy the report. The check's lines
  are shown as doctor's. The notes under the key and the cap are tooltips now. The engine in the page (the guide's
  site) has no setup and shows the key as before. "Behind the logo" in messages and guides is now "Iso's
  settings".
- **Docs:** `docs/setup.md`, `docs/setup-for-agents.md`, the npm README, and the guide's *Starting a base*.

**Tests.**
- Server: `test/setup.test.ts` (10). It covers the form both ways, the key forgotten or kept, refusals, a check
  and the model list against a gateway that wants `api-key`, keeping (0600, `.bak` once), and 403 from a
  tailnet's name. One more test in `guide.test.ts`: the finder until a model is set up.
- Browser: `app/tests/setup.spec.ts` (2 × 4 projects). A gateway is set up, checked (5 ✓), kept and asked; its
  secret header is held after a reload and not in the page; a change from a tailnet's name is refused. The test
  provider now lists models and answers doctor's ping.
- All pass: 194 browser tests (18 skipped), the 6 site tests, every package's unit tests, and the type checks. The
  svelte-autofixer found no issues.

**Real check** (≈ $0.01, Lachlan's `config.toml` neither read by me nor written). A server on a copy of the guide
was run with the real setup.
- The setup as kept was checked: 467 models listed, a reply from each tier, and the tool called.
- The same setup was checked as a draft, OpenRouter written as a gateway at its own address. It used the held key
  and was not kept.
- One Iso turn on the low tier: 7,173 tokens in and 192 out, $0.0081.

The page's own Keep button was tested only against the scripted provider, so your config stayed as it was.

**Found on the way.** The check showed that moving between OpenRouter and a gateway at OpenRouter's address
forgot the key. Addresses are now compared as the key sees them.

**Not done.**
- Signing in for an OpenRouter key from the guide while its finder answers: the finder has no sign-in page, so a
  key is pasted there.
- The page isn't tried against the work gateway: that is Lachlan's to do.
- Q54's header and Q55 (`key_command`) are still open.
