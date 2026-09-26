# HALF beamline exhibition

The left NSRL entrance now links to `photon-lab.html` from the facility catalog and Intelligent Beamlines category. The two old links in the right materials workbench were removed. Existing recipe, local analysis, atom-model, and glTF export functionality remains available in the same lab.

## Source and limits

- User-provided **HLS II和HALF表征方法.pptx**, slide 3: HALF phase I layout, BL01–BL10.
- Slide 4: Chinese station names, photon energy ranges in eV, specialties, characterization methods.
- Slides 1–2 describe **HLS II**, not HALF, and are not used for this catalog.
- English labels are translations. `github-pages/half-beamlines.js` is the single shared data source for scene geometry and catalog details.
- Beamline positions were visually traced from slide 3 and normalized around the ring. Geometry, instrument housings, magnets and dimensions are illustrative, not an engineering reconstruction or equipment-control interface.
- The existing independent ARPES demonstration remains an educational scene; it does not represent every selected HALF beamline.
- Export to Blender produces editable glTF. This does not establish a live Blender connection or update the earlier standalone museum `.blend` file.

## Verification

Run `node --test tests/half-beamlines.test.js tests/photon-lab.test.js tests/nsrl-catalog.test.js tests/login-balanced.test.js tests/workbench-interactivity.test.js`.

Browser checks: select all ten directory items, select markers after camera rotation, switch language, exercise a recipe and return to the ring, inspect desktop/mobile overflow, follow the left NSRL preview route into the exhibition.
