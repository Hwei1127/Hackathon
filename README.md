# AutoCore DMS

Dealer management system demo (React + Vite): vehicle inventory, sales pipeline, customers, workshop, spare parts, warranty, finance, reports and administration.

## Run it

Requires Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Build for production

```bash
npm run build     # outputs to dist/
npm run preview   # serve the built app locally
```

`dist/` is a static site and can be hosted on Netlify, Vercel, GitHub Pages or any web server.

## 360° vehicle viewer

Every vehicle shows the best imagery available, falling back automatically:

| Priority | Source | What you get | How to add it |
|---|---|---|---|
| 1 | **3D model (.glb)** | Full orbit, zoom, AR on phones | Vehicle → **360°** → upload, or host in `public/media/` |
| 1b | **AI 3D model** | Generated 3D car at the vehicle's real dimensions and paint colour | Automatic on the dashboard (see *AI identification* below) |
| 2 | **360° photos** (12–36 frames) | Drag / swipe / arrow-key spin | Vehicle → **360°** → upload, or host in `public/media/` |
| 3 | **IMAGIN.studio renders** | Photo-realistic render of the exact make, model, year and colour | Add your customer key in **Administration → Vehicle imagery** |
| 4 | **Illustration** | Sedan / SUV / hatchback / pickup / MPV / coupe picked from the model name | Automatic (override with *Body Type* on the vehicle) |

- **Uploads** are stored in the browser (IndexedDB), so they only appear on that device. Photos are resized to 1600px on upload.
- **Hosted files** in `public/media/<Stock ID>/` are shared with everyone once deployed. See `public/media/README.md`. A pattern like `/media/VH-2401/{01..36}.jpg` expands to 36 URLs.
- **IMAGIN.studio** is a paid service; request a customer key at imagin.studio. The app guesses each vehicle's model family from its name (e.g. *330i M Sport → 3-series*, *Corolla Cross Hybrid → corolla-cross*); if a render looks wrong, set *Model family for renders* in that vehicle's 360° panel. The angle codes used for the spin are set in Administration and depend on your IMAGIN plan.
- **3D models** are displayed with Google's `<model-viewer>`, loaded only when a vehicle has a .glb. Only use models you're licensed to use commercially (e.g. purchased from Sketchfab/TurboSquid or supplied by the brand).

## AI identification

The dashboard's **Latest Inventory** card identifies each vehicle automatically and shows a generated 3D model you can orbit 360°.

The AI runs locally with [Ollama](https://ollama.com): no API key, no cost per request, and no data leaves the computer.

1. Install Ollama and pull the vision model: `ollama pull qwen3-vl:4b`
2. Keep Ollama running, then open the dashboard. **Administration → Vehicle imagery → Test local AI** checks the connection. The address and model can be changed there.

- The model identifies make, model, generation, body type, paint colour and published dimensions from the stock record, or from the vehicle's first uploaded 360° photo if it has one. Each identification takes about 15–30 seconds, depending on your hardware.
- **Scan photo** identifies the car in any picture. The record isn't shown to the model, so it describes only what it sees; if the result doesn't match the record, a warning is shown.
- The result is saved on the vehicle (`ai` field), and `src/lib/car3d.js` builds a .glb from it with three.js. The model is stylised (body-type silhouette scaled to the real dimensions), not a manufacturer CAD model. An uploaded or hosted .glb always takes priority over it.
- If Ollama isn't running, the 3D model is estimated from the model name.
- Editing a vehicle's brand, model, year, colour or body type clears its AI result so it is identified again.
- A 4B model is small: expect its make/model to be right for common cars, but generation, dimensions and confidence to be approximate. A larger vision model (e.g. `qwen3-vl:8b`) is more accurate if your computer can run it.
- Ollama only accepts requests from pages on `localhost` by default. If you deploy the app to another address, start Ollama with `OLLAMA_ORIGINS` set to that address, and each user needs Ollama on their own computer (or point the address at a shared Ollama server).

## Project structure

```
autocore-dms/
├── index.html          # HTML entry
├── package.json
├── vite.config.js
├── public/
│   ├── favicon.svg
│   └── media/          # hosted 360° photos and 3D models (see README inside)
└── src/
    ├── main.jsx                    # mounts <App />, loads styles
    ├── App.jsx                     # pages, sample data, app state
    ├── styles.css                  # dark theme
    ├── components/
    │   ├── Vehicle360.jsx          # viewer: 3D → photos → renders → illustration
    │   ├── MediaManager.jsx        # per-vehicle upload / links panel
    │   ├── AiIdentify.jsx          # dashboard AI identification strip
    │   ├── CarArt.jsx              # body-type illustrations
    │   └── Icon.jsx                # icon set
    └── lib/
        ├── vehicleMedia.js         # body type, IMAGIN URLs, IndexedDB storage
        ├── carAI.js                # Claude vehicle identification
        └── car3d.js                # procedural 3D car → .glb
```

## Notes

- Uploaded 360° media can be removed in **Administration → Clear uploaded media**.
- Data is stored in the browser's localStorage (key `autocore-db-v1`). Use **Administration → Reset sample data** to restore the defaults.
- There is no backend, login or multi-user sync; this is a front-end demo.
- The Sora font loads from Google Fonts; without internet the app falls back to the system font.
