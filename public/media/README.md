# Hosted vehicle media

Put files here to make them available to everyone who uses the app (after you deploy).
Use one folder per vehicle, named by its Stock ID:

```
public/media/
└── VH-2401/
    ├── model.glb        ← 3D model (optional)
    ├── 01.jpg           ← 360° photos, in order around the car
    ├── 02.jpg
    └── … 36.jpg
```

Then open the vehicle → **360°** → **Hosted files** and enter:

- 3D model URL: `/media/VH-2401/model.glb`
- 360° photo URLs: `/media/VH-2401/{01..36}.jpg`

## Shooting tips for 360° photos

- 24–36 photos give a smooth spin (every 10–15°). 12 is the minimum.
- Keep the camera at the same height and distance; walk around the car or use a turntable.
- Start at the same angle for every car (e.g. front-left) so all spins line up.
- Landscape orientation, same zoom, plain background if possible.
