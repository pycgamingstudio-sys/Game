# NEON HORIZON

A browser-based 3D night-drive prototype built with Three.js, Vite and cannon-es.

## Requirements
- Node.js 22 or newer
- npm

## Local development
```bash
npm install
npm run dev
```

## Production build
```bash
npm run build
npm run preview
```

The production site is generated in dist/.

## Deployment
- Vercel: Framework preset Vite, build command `npm run build`, output directory `dist`.
- Netlify: build command `npm run build`, publish directory `dist`.

## Controls
- A / D or Left / Right: steer
- W / Up: accelerate
- S / Down: brake
- Space / Shift: nitro
- Escape: pause
- Touch: drag left/right to steer; on-screen pedals on touch devices

## Notes
The vehicle simulation uses a rigid chassis and raycast suspension. It is not a soft-body deformation simulator and does not claim BeamNG.drive parity. Third-party model and texture assets should only be added after their licenses are checked.
