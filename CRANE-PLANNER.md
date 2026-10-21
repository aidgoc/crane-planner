# DGOC Crane Planner

Two web crane-planning products built as plugins on [Chili3D](https://github.com/xiangechen/chili3d), an open-source browser CAD (OpenCascade compiled to WebAssembly, rendered with Three.js). This repository is a fork of Chili3D and stays under **AGPL-3.0**: it is public, and every deployed change is published here.

**Live:** https://craneplan.dgoc.in (deployed from `main` by GitHub Actions)
**Deadline:** deployed and demoed by Fri 20 Nov 2026.

> **Planning aid, not a certified lift plan.** This exact disclaimer must appear in the UI and on every report.

## Products

| Product | Team | Question it answers |
|---|---|---|
| Tower Crane Planner | Anjali, Puja, Namya | Which tower crane, and where, for this site and these lifts? |
| Mobile Crane Lift Planner | Rushikesh, Ajit, Sujal, Abhishek | Where does the mobile crane stand for this critical lift, and is it safe? Flagship scenario: erecting the tower team's crane. |

Both read one shared **site model**: the boundary, buildings, roads, power lines and no-go areas.

## Where code goes

All our work lives in plugins. Change Chili3D's own `packages/` only when a plugin can't do the job, and explain why in the PR.

| Plugin folder | Owner(s) |
|---|---|
| `plugins/site-model/` | Ajit (lead), whole mobile team |
| `plugins/tower-planner/` | Anjali (catalogue + selection), Puja (parametric crane + motion), Namya (placement, clearance, height) |
| `plugins/mobile-planner/` | Rushikesh (load chart + lift check, lead), Sujal (outriggers, ground bearing, stability), Abhishek (3D boom clearance) |

To ship a plugin in the deployed build, add it to `PLUGINS` in `scripts/build-plugins.mjs`, the same way `macro` and `visual-programming` are added. Use `plugins/helloworld-ts/` as the template.

## Sample site

`public/sample-site/` holds a synthetic test site (a DXF, a PNG underlay, and a JSON file of heights and picks). It is served at `https://craneplan.dgoc.in/sample-site/sample-site.dxf`. Read its README; note that ARC angles from `dxf-parser` are in radians.

**Units:** Chili3D models in **millimetres**, while the sample site and all crane data are in **metres**. Convert once at the plugin boundary (× 1000) and keep every calculation in metres. Hold one test that checks a known 40 m building edge comes out as 40,000 mm in the scene.

## Rules

1. **No fabricated numbers.** Every crane spec and load-chart row carries a source (brochure name + page). If there is no source, label it `INDICATIVE` in data and in the UI.
2. **Port your engines; don't rewrite them.** Tower: `capacityAt` (corner radius, wind derating labelled SIMULATED). Mobile: Cycle 3 `craneModel.js` KIT only, after your chart cell is fixed. Port the tests with the code.
3. **Your own name on your commits.** Run `git config user.name` / `user.email` with your own GitHub identity before your first commit. Commits from "Developer" or any shared identity don't count for anyone.
4. **No direct pushes to `main`.** Branch, then open a PR. At least one review from the other team is required, and CI must be green.
5. **No DGOC production code, live data, or client data.** Use the sample site.

## Local development

```bash
npm install
npm run dev        # http://localhost:8080; the OpenCascade wasm is prebuilt, no emscripten needed
npm run test
npm run check      # Biome lint, run before every commit
```

Keep upstream Chili3D changes flowing: `git fetch upstream && git merge upstream/main`. Only the tech lead (DGOC) does this.
