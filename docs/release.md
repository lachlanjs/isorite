# Releasing isorite to npm

Releases go through GitHub Actions (`.github/workflows/release.yml`), as rdstudio's do. Pushing a tag
`v<version>` runs the release:

1. **build** checks that the tag matches the version in `packages/server/package.json`, then runs every test and
   the type check. It builds the package (`npm run package`, into `.npm/isorite`), installs it from the tarball,
   and checks that it runs.
2. **npm** waits in the `release` environment for your approval. It then *stages* the version on npm with trusted
   publishing: npm checks a short-lived identity token from GitHub for this repository, workflow and environment,
   so no password or token is stored anywhere. A staged version goes live only when you approve it on npmjs.com
   with 2FA.
3. **executables** (M21), alongside: on each of five runners (Linux x64 and arm64, macOS arm64 and Intel, Windows
   x64), `npm run package:sea` builds isorite as one executable there, and runs it from an empty home: its version,
   `doctor`, and `serve` answering on the example base.
4. **github** makes the GitHub Release for the tag, with the package, the five executables, their `SHA256SUMS`,
   and `install.sh` and `install.ps1` attached, and notes from the commits.

## Once: the first version, by hand

npm lets you trust a workflow only from an existing package's settings. So 0.1.0 is published once from your
machine, and every later version goes through the workflow.

1. **An npm account with two-factor authentication.** Sign up at https://www.npmjs.com/signup if you have no
   account. Then go to Account, Two-Factor Authentication, and turn it on for authorization and writes.
2. **Log in from the terminal:**
   ```sh
   npm login        # opens the browser; `npm whoami` then prints your name
   ```
3. **Build, look, publish:**
   ```sh
   npm run package
   cd .npm/isorite
   npm pack --dry-run      # the files that will go: ~150, 17.7 MB unpacked
   npm publish             # asks for a 2FA code
   ```
4. **Check:** `npm view isorite version` says 0.1.0. In another terminal, `npm install -g isorite`, then
   `isorite --version`.

## Once: trust the workflow

1. **The release environment on GitHub.** Open github.com/lachlanjs/isorite, then Settings, Environments, New
   environment, and name it `release`. Tick Required reviewers and add yourself, so nothing publishes without your
   approval. Under Deployment branches and tags, choose Selected, and add a tag rule `v*`.
2. **The trusted publisher on npm.** Open npmjs.com/package/isorite, then Settings, Trusted Publisher, GitHub
   Actions, and fill in:
   - owner `lachlanjs`
   - repository `isorite`
   - workflow `release.yml`
   - environment `release` (lower case, as the workflow names it)

   Leave Allow npm publish unticked: the workflow only stages a version, and you approve it with 2FA. A new
   trusted publisher must be used within 2 days, so set it up when the next release is ready.
3. **Lock down publishing.** On the same settings page, under Publishing access, choose to require two-factor
   authentication and disallow tokens. Then only the workflow, and you with 2FA, can publish.

## Every release after that

1. **Set the version.** Every version can be published once only, so 0.1.0 is spent after the first release.
   ```sh
   node scripts/version.ts 0.1.1
   ```
   Commit the change.
2. **Merge to main.** Releases are made from `main`.
3. **Tag and push:**
   ```sh
   git tag v0.1.1 && git push origin main v0.1.1
   ```
4. **Approve the run.** Open Actions, then the Release run, and wait for build to pass. Then choose Review
   deployments, release, Approve and deploy.
5. **Approve the version on npm.** Open npmjs.com, isorite, the staged version, and choose Approve; it asks for your
   2FA code. Or from the terminal: `npm stage list isorite`, then `npm stage approve <id>`. A version nobody
   approves is never published.
6. **Check:**
   - `npm view isorite version`
   - `npx isorite@0.1.1 --version`
   - the release page lists `isorite-0.1.1.tgz`

## A pre-release

A version with a suffix, as `0.2.0-trial.1`, is published under a dist-tag named by the suffix's first word
(`trial`), not `latest`: it is installed with `npm install -g isorite@trial`, and `npm install -g isorite` still gives
the last plain version.

## When it goes wrong

- **The tests or the build fail:** nothing is published. Fix it, then move the tag and push again:
  `git tag -f v0.1.1 && git push -f origin v0.1.1`. The workflow is read from the tagged commit, so a fix to the
  workflow itself also needs the tag moved.
- **npm answers 404 (not 403):** the trusted publisher does not match the run. Check the owner, repository,
  workflow file name and environment on npmjs.com.
- **The npm job passed but the GitHub Release failed:** re-run only that job.

## The model package

`isorite-model-granite` (`packages/model`) holds the files for search by meaning, and is published apart from
isorite, by hand: `npm run model`, then `npm publish` in `packages/model`. See `docs/plan-embed.md`.
