# Demo recording

Video capture is switched on for the `excel-chrome` project (`video: 'on'` in
`playwright.config.ts`), so **every** end-to-end run leaves a recording behind:

```
test-results/<test-name>/video.webm
```

To produce the demo:

```bash
npm run test:e2e          # headless, still recorded
npm run test:headed       # or watch it happen
npm run report            # HTML report with the video embedded
```

Optional - convert to something easier to attach to a pull request:

```bash
ffmpeg -i test-results/*/video.webm -vf "fps=10,scale=1280:-1" docs/demo/today.gif
```

Recordings are git-ignored (see `.gitignore`); attach the file to the PR or a
release instead of committing it.
