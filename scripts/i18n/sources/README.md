# Translation batch inputs

The maintained translations live in `src/core/locales/{es,gl,fr,de}.ts`.
This directory is the workspace for new additive translation batches and the
fallback translation lock when dependencies are not installed.

Create `tr-<topic>.txt` (`English ||| Spanish ||| Galician`) and
`fdk-<topic>.txt` (`English ||| French ||| German`), one entry per line, then run:

```bash
python3 scripts/i18n/apply-translations.py tr-<topic>.txt fdk-<topic>.txt
npm run i18n:check
```

The helper adds missing keys without replacing existing translations. Remove
the batch files after applying and checking them. Previous development batches
are available in Git history; they are not required by the build or runtime.
