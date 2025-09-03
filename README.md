# mercyhurstLacrosseUsage

Simple front-end demo that performs k-nearest neighbor regression (shots → goals) from a local CSV.

How to run locally:

1. Start a static server in the project folder (recommended: Python 3):

```bash
python3 -m http.server 8000
```

2. Open http://localhost:8000 in your browser and load `index.html`.

Files added:
- `index.html` — main UI
- `styles.css` — small styling
- `script.js` — loads CSV, draws scatter, implements k-NN regression in-browser