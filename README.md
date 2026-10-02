# Ojas Poem Recite

A local preparation desk and static reading page for narrated poems. You prepare the audio yourself, align it with the lyrics once, and then host the audio plus a small cue sheet.

## Run it

```bash
npm start
```

Then open [http://localhost:4173](http://localhost:4173).

## Prepare a poem

1. Run the app and open **Prepare timing**.
2. Select a local voice and paste the lyrics, keeping one spoken line per row.
3. Click **Create audio + sync lyrics**. The local macOS voice engine creates one segment per line and the app builds the cue timings automatically.
4. Preview the result and download the poem JSON.
5. The generated MP3 is already in `public/audio/`; add the downloaded poem object to `public/poems.json`.

The hosted reader uses the cue sheet to highlight and scroll the lyrics in sync with the audio. No OpenAI key or runtime API is involved.
