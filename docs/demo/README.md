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

**Copy the recording out before running anything else.** `outputDir` is shared
by all three projects and Playwright empties it at the start of _every_ run, so
a later `npm run test:unit` deletes the video a passing `test:e2e` just made:

```bash
cp test-results/*/video.webm docs/demo/today-demo.webm
```

Optional - convert to something easier to attach to a pull request:

```bash
ffmpeg -i test-results/*/video.webm -vf "fps=10,scale=1280:-1" docs/demo/today.gif
```

`today-demo.webm` in this folder is a committed recording of a passing run. Other
recordings stay git-ignored, so only that one deliverable is versioned.
