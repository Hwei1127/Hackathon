# AutoCore DMS

Dealer management system demo (React + Vite, with an Express + MongoDB API): vehicle inventory, sales pipeline, customers, workshop, spare parts, warranty, finance, reports and administration.

## Run it

Requires Node.js 18 or newer and MongoDB (Community Server, running locally on the default port 27017).

```bash
npm install
npm run dev        # starts the API (port 4000) and the web app together
```

Open the URL Vite prints (usually http://localhost:5173). The chip at the top right shows the database connection.

## Database (MongoDB)

`server/index.js` is a small Express API over the `autocore` database. Each record type is its own collection:
`vehicles`, `customers`, `sales`, `jobs` (repair orders), `parts` and `warranties`. The record's `id` is its `_id`;
a vehicle's AI identification and damage map are stored on the vehicle document.

- On first start, an empty database is seeded with the sample records in `src/data/seed.js`.
- The app loads every collection at start-up and sends each change as it happens (only the records that changed), and reloads when you come back to the tab, so several browsers share the same data.
- If the API or MongoDB can't be reached, the chip shows **Offline** and changes are kept in the browser; they're sent the next time it connects.
- VINs and part numbers are unique (MongoDB indexes).

| Setting | Default |
|---|---|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` |
| `MONGODB_DB` | `autocore` |
| `PORT` (API) | `4000` |
| `VITE_API_URL` (web app, build time) | `/api` (proxied to port 4000 by Vite) |

API: `GET /api/health`, `GET /api/db` (everything), `GET /api/:collection`, `GET /api/:collection/:id`,
`PATCH /api/:collection` with `{ upsert: [records], delete: [ids], order: [ids] }`.

Vehicle media (uploaded 3D models and 360° photos) is stored in MongoDB GridFS (`media.files` / `media.chunks`), tagged with the vehicle's stock ID:
`GET /api/media/:stockId` (what is stored), `GET /api/media/file/:fileId` (the file), `PUT /api/media/:stockId/glb`, `PUT /api/media/:stockId/frames/:index`,
`DELETE /api/media/:stockId/glb`, `DELETE /api/media/:stockId/frames`, `POST /api/media/:stockId/move` with `{ to }`, `DELETE /api/media` (everything). Uploads are limited to 100 MB per file.

Run the parts separately with `npm run server` and `npm run web`.

## Build for production

```bash
npm run build     # outputs to dist/
npm run preview   # serve the built app locally
```

`dist/` is a static site; serve it alongside the API (`npm run server`) with `/api` routed to it, or build with `VITE_API_URL` pointing at the API.

## 360° vehicle viewer

Every vehicle shows the best imagery available, falling back automatically:

| Priority | Source | What you get | How to add it |
|---|---|---|---|
| 1 | **3D model (.glb)** | Full orbit, zoom, AR on phones | Vehicle → **360°** → upload, or host in `public/media/` |
| 1b | **AI 3D model** | Generated 3D car at the vehicle's real dimensions and paint colour | Automatic on the dashboard (see *AI identification* below) |
| 2 | **360° photos** (12–36 frames) | Drag / swipe / arrow-key spin | Vehicle → **360°** → upload, or host in `public/media/` |
| 3 | **IMAGIN.studio renders** | Photo-realistic render of the exact make, model, year and colour | Add your customer key in **Administration → Vehicle imagery** |
| 4 | **Illustration** | Sedan / SUV / hatchback / pickup / MPV / coupe picked from the model name | Automatic (override with *Body Type* on the vehicle) |

- **Uploads** are saved in the database (MongoDB GridFS), so every user and device loads the same 3D model and photos for a vehicle. If the database can't be reached, they wait in the browser (IndexedDB) and upload automatically once it can. Photos are resized to 1600px on upload.
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
├── vite.config.js      # also proxies /api to the API in development
├── server/
│   └── index.js        # Express + MongoDB API
├── public/
│   ├── favicon.svg
│   └── media/          # hosted 360° photos and 3D models (see README inside)
└── src/
    ├── main.jsx                    # mounts <App />, loads styles
    ├── App.jsx                     # pages, app state, database sync
    ├── data/seed.js                # sample records (database seed / offline fallback)
    ├── styles.css                  # dark theme
    ├── components/
    │   ├── Vehicle360.jsx          # viewer: 3D → photos → renders → illustration
    │   ├── MediaManager.jsx        # per-vehicle upload / links panel
    │   ├── AiIdentify.jsx          # dashboard AI identification strip
    │   ├── DamageInspector.jsx     # damage map on the 3D model
    │   ├── CarArt.jsx              # body-type illustrations
    │   └── Icon.jsx                # icon set
    └── lib/
        ├── vehicleMedia.js         # body type, IMAGIN URLs, browser (IndexedDB) storage
        ├── mediaStore.js           # vehicle media in the database, with the browser as fallback
        ├── api.js                  # API client + change diffing
        ├── damage.js               # damage parts, severities, offline text reader
        ├── carAI.js                # local-AI vehicle identification and damage assessment
        └── car3d.js                # procedural 3D car → .glb
```

## Notes

- Uploaded 3D models and 360° photos can be removed for everyone in **Administration → Clear uploaded media**.
- Records live in MongoDB, with a copy in the browser's localStorage (key `autocore-db-v1`). **Administration → Reset sample data** restores the defaults in the database too.
- There is no login or role enforcement on the API; don't expose it beyond your own machine or network.
- The Sora font loads from Google Fonts; without internet the app falls back to the system font.
