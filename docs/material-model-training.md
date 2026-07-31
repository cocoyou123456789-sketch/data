# Material prediction baseline

The browser model is a composition-only screening baseline. It replaces unsupported guesses with reproducible, versioned estimates and explicit test errors. It does not replace crystal-structure calculations or experiment.

## Current targets

- JARVIS OptB88vdW formation energy per atom.
- Metallic tendency and conditional non-metal band gap.
- Tc regression within compositions represented in a superconductivity database. This is not a probability that a new composition superconducts.

The deterministic split is 80/10/10 by canonical composition hash. Polymorphs or duplicate formulas therefore cannot leak from training into test data.

## Reproduce

```bash
python3 -m pip install -r scripts/material-model-requirements.txt
python3 scripts/download_material_training_data.py
python3 scripts/train_material_baseline.py
node tests/material-baseline.test.js
```

Raw downloads stay under `outputs/material-training/raw` and are not required by the public site. The trainer exports a compact tree ensemble to `github-pages/data/material_baseline_v1.js`, which the site loads only when a composition is analyzed.

## Data still required for the intended ARPES model

1. Crystal structure for every sample: CIF/POSCAR, phase, space group, lattice and atomic positions.
2. Raw ARPES intensity arrays, not screenshots: energy, momentum/angle axes, photon energy, polarization, temperature, geometry and resolution.
3. Processing provenance: background subtraction, normalization, symmetrization, cuts, masks and software version.
4. Sample conditions: doping, pressure, strain, thickness, substrate, cleavage, annealing and measured Tc.
5. Labels tied to raw data: Fermi surface, band dispersion, gap, orbital assignment and expert QC status.
6. Negative and out-of-domain examples. A paper absent from a superconductivity database is not a valid negative label.
7. Grouped train/validation/test splits by material family, sample and publication to prevent leakage.

A full forward model should use structure plus experimental conditions to predict a spectral function or band representation. The inverse model should infer candidate elements only as a ranked retrieval task with uncertainty and database verification.
