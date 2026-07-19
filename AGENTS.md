# Project instructions

- After making any changes, always run `bun run ci` before handing work back.
- `bun run ci` must run the Ultracite-configured Biome checks automatically, followed by the TypeScript check and production build.
- Fix all reported issues rather than bypassing or disabling checks unless the project requirements explicitly demand an exception.
- Do not reference the AI name used (codex, openai, etc...) in any commits, pr's, issue titles or anywhere else.
- When the user says "add, commit", group all existing changes into logical sets, stage and commit each group, and repeat until every change is committed and the working tree is clean.
- At the start of every new work request, check the current Git branch before changing files. If the current branch is `main`, create and switch to a descriptively named task branch first.
- Never push work directly to `main`. If `main` already contains uncommitted changes or commits that have not been pushed, create the task branch from its current state so all of that work moves forward on the new branch, then continue the normal workflow there.
- When the user says "add, commit, push, pr, merge" or otherwise confirms that the work is ready, complete the delivery workflow in order: group and commit all changes until the tree is clean, push the task branch, open a pull request targeting `main`, wait for required checks to pass, and merge the pull request. If checks fail or the pull request cannot merge, fix the problem on the same task branch and repeat the relevant steps.
- Keep React component modules compatible with Vite Fast Refresh: export only React components from component files, and move non-component runtime exports such as constants, helpers, and metadata into separate modules to avoid incompatible-export invalidations.
- Record every new user-facing feature in the README as part of implementing it.
